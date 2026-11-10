// 链接健康服务 v2
// 输入浏览器书签节点（chrome.bookmarks 唯一数据源），
// 检查结果写入 aux（linkChecks 历史 + bookmarkMeta.linkStatus）。
// 手动触发、可停止、支持跳过近期已检查项。
//
// 判定策略（降低误报，同时保证死链能被检出）：
// - HEAD 疑似失效（404/5xx）时用 GET 复核确认——不少站点/WAF 对
//   HEAD 返回 404/5xx 但 GET 正常
// - 404/410 是明确失效，立即标死；其他 4xx/5xx 可能是瞬时故障，
//   需连续两轮都失效才标死（利用 linkChecks 历史）
// - CDN/WAF 防护码（520-526/530/412，如 CSDN 的 521）判"拦截"：
//   能拿到结构化响应说明站点活着，不判死；同域名连续多条命中
//   同一拦截码则整域豁免，剩余条目跳过请求
// - 网络层失败（超时/连接失败）不判死：连续多轮无法连接标
//   unreachable，其余保持原状态，但会更新检查时间（受跳过窗口保护）
// - 429 限流无法证实资源状态：保持原状态，并对该域名指数退避
// - 根路径书签（首页）直接用 GET 检查并做软 404 检测——域名过期/停放
//   时全站返回 200 的出售页
// - 同域名串行检查并保持间隔，遇到 429/503 自动放大间隔
// - 深度复核（deepVerify）：后台标签页真实导航终审，通过防护/JS 挑战
// - 人工"标记为正常"的链接（linkStatusManual）自动扫描不再改判

import { httpChecker, type CheckResult } from '@/lib/httpChecker';
import { auxDb, defaultMeta, type LinkCheckRecord } from '@/lib/auxDatabase';
import { generateId, getDomain, now, sleep } from '@/lib/utils';
import { createLogger } from '@/lib/logger';
import type { AuxBookmarkMeta, BrowserBookmarkNode } from '@/types';
import type { BatchCheckOptions, CheckProgress, LinkCheckResult, LinkHealthReport } from '@/types/linkHealth';

const logger = createLogger('LinkHealth');

const DEFAULT_CONCURRENCY = 5;// 同域名两次请求的最小间隔（毫秒）
const SAME_DOMAIN_INTERVAL_MS = 250;
// 同域名遇到限流时间隔的上限（毫秒）
const MAX_DOMAIN_INTERVAL_MS = 4000;
// 连续多少轮网络层失败后标记 unreachable
const UNREACHABLE_THRESHOLD = 3;
// 同域名连续多少条命中同一 WAF 拦截码后，认定该站点拒绝本工具，
// 剩余条目直接按防护拦截处理（不再发请求、不判死）
const WAF_DOMAIN_STRIKE = 3;

// 状态码 → 判定。401/403/405/408 视为"可达但拒绝/受限"，
// 不能判为死链（如 Cloudflare 拦截——能回应就说明活着）。
// 429 是限流：服务器活着但没给出资源状态的证据，判 unknown。
export type LinkVerdict = 'active' | 'broken' | 'unknown';

// CDN/WAF 防护层拦截码：520-526/530 是 Cloudflare 系边缘错误（如 CSDN
// 对裸请求回 521），412 是国内 WAF（百度系）安全验证。能拿到这些
// 结构化响应说明域名与防护层都活着，只是拒绝机器请求——不判死
export function isWafBlockCode(status: number): boolean {
  return (status >= 520 && status <= 526) || status === 530 || status === 412;
}

export function classifyLinkStatus(status: number): LinkVerdict {
  if (status >= 200 && status < 400) {
    return 'active';
  }
  if ([401, 403, 405, 408].includes(status)) {
    return 'active';
  }
  if (status === 429) {
    return 'unknown';
  }
  if (isWafBlockCode(status)) {
    return 'unknown'; // 防护拦截：资源状态证据不足
  }
  return 'broken';
}

// 同域名请求间隔的自适应调整：限流翻倍（封顶），成功减半（回落到基准）
export function nextDomainInterval(current: number, statusCode: number): number {
  if (statusCode === 429 || statusCode === 503) {
    return Math.min(current * 2, MAX_DOMAIN_INTERVAL_MS);
  }
  if (statusCode >= 200 && statusCode < 400) {
    return Math.max(SAME_DOMAIN_INTERVAL_MS, Math.floor(current / 2));
  }
  return current;
}

export const HOST_ORIGINS = ['http://*/*', 'https://*/*'];

// 申请网站访问权限（需在用户手势中调用，如按钮点击）。
// 未授权时 fetch 受 CORS 限制，大多数站点将无法检测。
export async function ensureHostPermissions(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.permissions) {
    return true; // 测试环境
  }
  try {
    const already = await chrome.permissions.contains({ origins: HOST_ORIGINS });
    if (already) {
      return true;
    }
    return await chrome.permissions.request({ origins: HOST_ORIGINS });
  } catch {
    return false;
  }
}

// 仅 http / https 链接可通过网络检查，跳过 chrome://, javascript:, file:// 等内部/本地协议
export function isCheckableUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// 白名单匹配：精确域名或其子域名（example.com 覆盖 docs.example.com）
function isWhitelisted(url: string, whitelist: Set<string>): boolean {
  const host = getDomain(url).toLowerCase();
  if (whitelist.has(host)) {
    return true;
  }
  for (const entry of whitelist) {
    if (host.endsWith(entry.startsWith('.') ? entry : `.${entry}`)) {
      return true;
    }
  }
  return false;
}

// 根路径（首页）书签：域名停放检测的目标场景
function isRootUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname === '/' || parsed.pathname === '';
  } catch {
    return false;
  }
}

// 深度复核结论：ok 页面真实加载成功；dead 浏览器报错页；unknown 超时/环境不支持
export type DeepVerifyOutcome = 'ok' | 'dead' | 'unknown';

// 本上下文仍开着的复核标签页：popup/sidepanel 在导航中途被关闭时
// 页面上下文直接销毁，靠 pagehide 兜底关闭，避免后台标签页永久残留
const activeVerifyTabs = new Set<number>();
let verifyTabsCleanupBound = false;

function closeActiveVerifyTabs(): void {
  for (const tabId of activeVerifyTabs) {
    chrome.tabs.remove(tabId).catch(() => {});
  }
  activeVerifyTabs.clear();
}

function bindVerifyTabsCleanup(): void {
  if (verifyTabsCleanupBound || typeof window === 'undefined') {
    return;
  }
  window.addEventListener('pagehide', closeActiveVerifyTabs);
  verifyTabsCleanupBound = true;
}

// 后台真实导航复核：用 chrome.tabs 开不可见标签页真实加载 URL。
// 完整浏览器上下文（Cookie、TLS 指纹、JS 挑战）是扩展内 fetch 无法
// 复制的——WAF 拦截的站点 fetch 拿 52x，真实导航通常正常打开。
// 加载完成即关标签页；浏览器报错页（chrome-error://）判 dead。
export async function deepVerifyUrl(url: string, timeoutMs = 15000): Promise<DeepVerifyOutcome> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.create || !chrome.tabs.onUpdated) {
    return 'unknown';
  }
  bindVerifyTabsCleanup();
  return new Promise((resolve) => {
    let tabId: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let done = false;

    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId !== tabId || done || changeInfo.status !== 'complete') {
        return;
      }
      // 完成后读最终地址：Chrome 加载失败时标签页停在 chrome-error:// 错误页
      chrome.tabs
        .get(updatedTabId)
        .then((tab) => {
          finish((tab.url ?? '').startsWith('chrome-error') ? 'dead' : 'ok');
        })
        .catch(() => finish('ok'));
    };

    const cleanup = () => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      chrome.tabs.onUpdated.removeListener(listener);
      if (tabId !== undefined) {
        activeVerifyTabs.delete(tabId);
        chrome.tabs.remove(tabId).catch(() => {});
      }
    };

    const finish = (outcome: DeepVerifyOutcome) => {
      if (done) {
        return;
      }
      done = true;
      cleanup();
      resolve(outcome);
    };

    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs
      .create({ url, active: false })
      .then((tab) => {
        if (!tab?.id) {
          finish('unknown');
          return;
        }
        tabId = tab.id;
        activeVerifyTabs.add(tabId);
        timer = setTimeout(() => finish('unknown'), timeoutMs);
      })
      .catch(() => finish('unknown'));
  });
}

export interface SelectCheckableOptions {
  // 跳过最近检查过的窗口（小时）
  skipRecentHours?: number;
  // 白名单域名（含子域名）
  whitelist?: string[];
  // 忽略跳过窗口与人工标记（单条/所选重查用）
  force?: boolean;
}

/**
 * 挑出本轮真正需要检查的书签：过滤非 http(s) 链接、白名单域名、
 * 人工标记为正常的，以及仍落在跳过窗口内的。
 *
 * 抽成纯函数是为了让后台的定时自动扫描能在**不发起检查**的前提下先算出候选集，
 * 进而按批分片、被杀后可续跑；手动扫描走同一套规则，避免两处判断漂移。
 */
export function selectCheckableNodes(
  nodes: BrowserBookmarkNode[],
  meta: Record<string, AuxBookmarkMeta>,
  options: SelectCheckableOptions = {},
  nowTs: number = now()
): BrowserBookmarkNode[] {
  const skipRecentMs = (options.skipRecentHours ?? 0) * 3600_000;
  const whitelist = new Set((options.whitelist ?? []).map((domain) => domain.toLowerCase()));
  const force = options.force ?? false;

  return nodes.filter((node) => {
    // 过滤非网络可检测链接（如 javascript: bookmarklet, chrome:// 等）
    if (!node.url || !isCheckableUrl(node.url)) {
      return false;
    }
    // 白名单域名（含子域名）跳过检查
    if (isWhitelisted(node.url, whitelist)) {
      return false;
    }
    const record = meta[node.id];
    // 人工标记为正常的链接不再自动改判
    if (!force && record?.linkStatusManual) {
      return false;
    }
    if (
      !force &&
      skipRecentMs > 0 &&
      record?.linkCheckedAt &&
      nowTs - record.linkCheckedAt < skipRecentMs
    ) {
      return false;
    }
    return true;
  });
}

interface DomainQueue {
  domain: string;
  items: Array<{ node: BrowserBookmarkNode; meta?: AuxBookmarkMeta }>;
  next: number;
  busy: boolean;
  intervalMs: number;
  nextAvailableTime: number;
  // 同域名连续命中同一 WAF 拦截码的计数
  wafStrikeCode: number;
  wafStrikeCount: number;
  // 达到阈值后置为拦截码：该域名剩余条目跳过实际请求
  wafBlockedCode: number;
}

export class LinkHealthService {
  private stopRequested = false;
  private running = false;

  stopCheck(): void {
    this.stopRequested = true;
  }

  isCheckRunning(): boolean {
    return this.running;
  }

  // 某书签在指定记录之前最近的若干条检查记录（新在前）。
  // 按记录排除而非时间戳截断，避免同毫秒写入时漏掉上一轮结果
  private async recentRecords(
    bookmarkId: string,
    current: LinkCheckRecord,
    limit: number
  ): Promise<LinkCheckRecord[]> {
    const records = await auxDb.linkChecks.where('bookmarkId').equals(bookmarkId).toArray();
    return records
      .filter(
        (record) =>
          record.checkedAt < current.checkedAt ||
          (record.checkedAt === current.checkedAt && record.id !== current.id)
      )
      .sort((a, b) => b.checkedAt - a.checkedAt)
      .slice(0, limit);
  }

  // 批量检查书签节点：结果写 aux 并返回
  async checkBookmarks(
    nodes: BrowserBookmarkNode[],
    options: BatchCheckOptions = {},
    onProgress?: (progress: CheckProgress) => void
  ): Promise<LinkCheckResult[]> {
    if (this.running) {
      throw new Error('已有检查正在进行中，请先停止或等待完成');
    }
    this.running = true;
    this.stopRequested = false;

    try {
      const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);

      // 预取元数据，再交给与定时自动扫描共用的筛选函数决定哪些真的要检查
      const metas = await auxDb.bookmarkMeta.bulkGet(nodes.map((node) => node.id));
      const metaById: Record<string, AuxBookmarkMeta> = {};
      metas.forEach((meta, index) => {
        if (meta) {
          metaById[nodes[index].id] = meta;
        }
      });
      const checkable = selectCheckableNodes(nodes, metaById, options);
      const pending = checkable.map((node) => ({ node, meta: metaById[node.id] }));
      // 检查过程中还会把"没得出结论"的（网络层失败/待确认/限流）计入 skipped，故用 let
      let skipped = nodes.length - checkable.length;

      if (pending.length === 0) {
        onProgress?.({
          total: 0,
          completed: 0,
          current: '',
          success: 0,
          failed: 0,
          skipped,
          startTime: now(),
        });
        return [];
      }

      // 按域名分组：同域名串行 + 间隔，不同域名并行
      const queuesByDomain = new Map<string, typeof pending>();
      for (const item of pending) {
        const domain = getDomain(item.node.url!).toLowerCase();
        const list = queuesByDomain.get(domain) ?? [];
        list.push(item);
        queuesByDomain.set(domain, list);
      }
      const domainQueues: DomainQueue[] = [...queuesByDomain.entries()].map(([domain, items]) => ({
        domain,
        items,
        next: 0,
        busy: false,
        intervalMs: SAME_DOMAIN_INTERVAL_MS,
        nextAvailableTime: 0,
        wafStrikeCode: 0,
        wafStrikeCount: 0,
        wafBlockedCode: 0,
      }));
      let domainCursor = 0;

      const results: LinkCheckResult[] = [];
      const startTime = now();
      let completed = 0;
      let success = 0;
      let failed = 0;

      const pickDomain = (): DomainQueue | undefined => {
        const currentTime = now();
        for (let i = 0; i < domainQueues.length; i++) {
          const queue = domainQueues[(domainCursor + i) % domainQueues.length];
          if (
            queue.next < queue.items.length &&
            !queue.busy &&
            currentTime >= queue.nextAvailableTime
          ) {
            domainCursor = (domainCursor + i + 1) % domainQueues.length;
            return queue;
          }
        }
        return undefined;
      };

      const worker = async () => {
        while (!this.stopRequested) {
          const domainQueue = pickDomain();
          if (!domainQueue) {
            const hasMore = domainQueues.some((q) => q.next < q.items.length);
            if (!hasMore) {
              return; // 全部完成
            }
            // 仍有未处理书签（相关域名在冷却中或其它 worker 正忙），稍候重试
            await sleep(25);
            continue;
          }
          domainQueue.busy = true;
          let item: { node: BrowserBookmarkNode; meta?: AuxBookmarkMeta } | undefined;
          try {
            item = domainQueue.items[domainQueue.next++];

            // 同域名连续多条命中同一 WAF 拦截码 → 该站拒绝本工具，
            // 剩余条目不再发请求，直接按防护拦截处理（不判死、不耗请求）
            let check: CheckResult;
            let domainSkipped = false;
            if (domainQueue.wafBlockedCode) {
              domainSkipped = true;
              check = {
                url: item.node.url!,
                status: domainQueue.wafBlockedCode,
                isAccessible: false,
                responseTime: 0,
                errorMessage: '站点防护拦截（同域名连续被拒），跳过请求',
                checkedAt: now(),
              };
            } else {
              // 首页书签直接 GET（顺带做域名停放检测），其余用 HEAD
              const rootCheck = isRootUrl(item.node.url!);
              check = await httpChecker.check(item.node.url!, {
                timeout: options.timeout,
                retries: options.retries,
                method: rootCheck ? 'GET' : 'HEAD',
              });
              // HEAD 疑似失效 → GET 复核，避免 HEAD 被服务器特殊对待导致误判。
              // 复核前遵守同域名最小间隔——背靠背双请求恰是 WAF 敏感站
              // 最容易被限流/拦截的请求模式
              if (
                !rootCheck &&
                !check.networkError &&
                classifyLinkStatus(check.status) === 'broken'
              ) {
                await sleep(Math.max(domainQueue.intervalMs, SAME_DOMAIN_INTERVAL_MS));
                if (this.stopRequested) {
                  // 停止请求：条目放回队列（busy 由 finally 释放），
                  // 外层循环随即退出，不补发 GET
                  domainQueue.next--;
                  return;
                }
                const verified = await httpChecker.check(item.node.url!, {
                  timeout: options.timeout,
                  retries: options.retries,
                  method: 'GET',
                });
                if (!verified.networkError) {
                  check = verified;
                }
              }

              // WAF 拦截码连击计数：同码**连续**达标即整域豁免。
              // 任何非 WAF 的 HTTP 响应（含 404/5xx——证明该站并非整站拒绝）
              // 都打断连击，避免混合状态域名被误豁免
              if (!check.networkError) {
                if (isWafBlockCode(check.status)) {
                  if (domainQueue.wafStrikeCode === check.status) {
                    domainQueue.wafStrikeCount++;
                  } else {
                    domainQueue.wafStrikeCode = check.status;
                    domainQueue.wafStrikeCount = 1;
                  }
                  if (domainQueue.wafStrikeCount >= WAF_DOMAIN_STRIKE) {
                    domainQueue.wafBlockedCode = check.status;
                  }
                } else {
                  domainQueue.wafStrikeCode = 0;
                  domainQueue.wafStrikeCount = 0;
                }
              }
            }

            const record: LinkCheckRecord = {
              id: generateId(),
              bookmarkId: item.node.id,
              status: check.status,
              isAccessible: check.isAccessible,
              responseTime: check.responseTime,
              errorMessage: check.errorMessage,
              checkedAt: check.checkedAt,
              networkError: check.networkError || undefined,
              errorKind: check.networkError ? check.errorKind : undefined,
            };
            await auxDb.linkChecks.add(record);

            // 状态判定。keepStatus = 本次证据不足以改判，保持原状态，
            // 但仍更新检查时间（享受跳过窗口，避免反复重查同一批链接）
            let newStatus: AuxBookmarkMeta['linkStatus'] | undefined;
            let keepStatus = false;

            if (check.networkError) {
              const errorKind = check.errorKind ?? 'network';
              if (errorKind === 'timeout' || errorKind === 'network') {
                // 连续多轮无法连接才标 unreachable。只有同类失败计数：
                // blocked（无权限）/ssl（证书）是环境问题，不计入连击；
                // 旧记录无 errorKind 时不计（宁可多查一轮也不误标）
                const history = await this.recentRecords(item.node.id, record, UNREACHABLE_THRESHOLD);
                const countsToward = (r: LinkCheckRecord) =>
                  r.networkError && (r.errorKind === 'timeout' || r.errorKind === 'network');
                const consecutive = history.filter(
                  (r, i) => countsToward(r) && (i === 0 || countsToward(history[i - 1]))
                ).length;
                if (1 + consecutive >= UNREACHABLE_THRESHOLD) {
                  newStatus = 'unreachable';
                } else {
                  keepStatus = true;
                }
              } else {
                // blocked/ssl 是环境问题，不动状态
                keepStatus = true;
              }
            } else if (check.soft404) {
              newStatus = 'broken';
            } else {
              const verdict = classifyLinkStatus(check.status);
              if (verdict === 'active') {
                newStatus = 'active';
              } else if (verdict === 'unknown') {
                // 429 限流 / WAF 防护拦截：无法证实资源状态，保持原状态
                if (
                  item.meta?.linkStatus === 'broken' &&
                  typeof item.meta?.lastStatusCode === 'number' &&
                  isWafBlockCode(item.meta.lastStatusCode)
                ) {
                  // 存量纠偏：历史上被 52x/412 误判为失效的，降级回待检查
                  newStatus = 'pending';
                } else {
                  keepStatus = true;
                }
              } else {
                // 404/410 明确失效；其他 4xx/5xx 可能是瞬时故障，
                // 需要上一轮也是失效才写死
                const definitive = check.status === 404 || check.status === 410;
                if (definitive) {
                  newStatus = 'broken';
                } else {
                  const [prev] = await this.recentRecords(item.node.id, record, 1);
                  const prevAlsoBroken =
                    !!prev && !prev.networkError && classifyLinkStatus(prev.status) === 'broken';
                  if (prevAlsoBroken) {
                    newStatus = 'broken';
                  } else {
                    keepStatus = true;
                  }
                }
              }
            }

            // 无主机权限的失败是无效检查：不写 meta、不占跳过窗口，
            // 授权后下一次"检查全部/重查待检查"即可重新覆盖。
            // 字段级原子写（update 只合并检查相关字段）：不整行覆盖，
            // 长扫描期间用户打的标签/收藏/人工标记不会被启动时的快照回滚
            if (!(check.networkError && check.errorKind === 'blocked')) {
              const changes = {
                ...(keepStatus ? {} : { linkStatus: newStatus }),
                linkCheckedAt: check.checkedAt,
                lastStatusCode: check.status,
                lastErrorMessage: check.errorMessage,
                lastResponseTime: check.responseTime,
              };
              const updatedCount = await auxDb.bookmarkMeta.update(item.node.id, changes);
              if (updatedCount === 0) {
                await auxDb.bookmarkMeta.put({ ...defaultMeta(item.node.id), ...changes });
              }
            }

            results.push({
              bookmarkId: item.node.id,
              url: check.url,
              status: check.status,
              isAccessible: check.isAccessible,
              responseTime: check.responseTime,
              errorMessage: check.errorMessage,
              checkedAt: check.checkedAt,
            });

            completed++;
            if (newStatus === 'active') {
              success++;
            } else if (newStatus === 'broken' || newStatus === 'unreachable') {
              failed++;
            } else {
              // 网络层失败/待确认/限流：计入 skipped（未得出结论）
              skipped++;
            }

            onProgress?.({
              total: pending.length,
              completed,
              current: item.node.title || item.node.url!,
              success,
              failed,
              skipped,
              startTime,
              estimatedRemaining:
                completed > 0
                  ? ((now() - startTime) / completed) * (pending.length - completed)
                  : undefined,
            });

            // 同域名请求冷却（遇限流自动放大），设置该域名的下次可用时间戳，
            // 当前 worker 即可立即转去处理其它可用域名，无需闲置等待。
            // 域名豁免跳过的条目没有发请求，不占用冷却
            if (!domainSkipped) {
              domainQueue.intervalMs = nextDomainInterval(domainQueue.intervalMs, check.status);
              domainQueue.nextAvailableTime = now() + domainQueue.intervalMs;
            }
          } catch (error) {
            // 单条失败（如 IndexedDB 写入异常）不让 worker 抛出：
            // 抛出会使 Promise.all 提前 reject 并复位 stopRequested，
            // 其余 worker 变成僵尸继续消费旧队列，且 running=false 期间
            // 可再启新一轮造成两轮并发。记录后让本 worker 干净退出
            logger.error('Check item failed', item?.node.url ?? '', error);
            if (item) {
              // 该条按跳过计数并推进进度，保证进度条最终闭合
              completed++;
              skipped++;
              onProgress?.({
                total: pending.length,
                completed,
                current: item.node.title || item.node.url!,
                success,
                failed,
                skipped,
                startTime,
                estimatedRemaining:
                  completed > 0
                    ? ((now() - startTime) / completed) * (pending.length - completed)
                    : undefined,
              });
            }
            return;
          } finally {
            domainQueue.busy = false;
          }
        }
      };

      await Promise.all(
        Array(Math.min(concurrency, Math.max(domainQueues.length, 1)))
          .fill(0)
          .map(() => worker())
      );

      return results;
    } finally {
      this.running = false;
      this.stopRequested = false;
      // 历史记录滚动清理（保留 30 天）：每次扫描收尾顺带执行，
      // 避免 linkChecks 无限增长拖慢历史查询与逼近存储配额
      try {
        await this.cleanupOldRecords(30);
      } catch (error) {
        logger.error('Cleanup old check records failed', error);
      }
    }
  }

  // 人工标记为正常：后续自动扫描不再改判（force 重查除外）
  async markAsHealthy(bookmarkIds: string[]): Promise<void> {
    // 字段级原子写，避免整行覆盖并发写入的其他元数据
    for (const bookmarkId of bookmarkIds) {
      const changes = { linkStatus: 'active' as const, linkStatusManual: true };
      const updatedCount = await auxDb.bookmarkMeta.update(bookmarkId, changes);
      if (updatedCount === 0) {
        await auxDb.bookmarkMeta.put({ ...defaultMeta(bookmarkId), ...changes });
      }
    }
  }

  // 深度复核指定书签：逐条用后台真实导航终审（可被 stopCheck 打断）。
  // 结论写回 meta：ok → active，dead → broken，unknown（超时/不支持）不动状态。
  // 与 checkBookmarks 共享 running 互斥：两者并发会对同一书签
  // 互相覆盖结论，且共享的 stopRequested 会互相打断
  async deepVerify(
    nodes: BrowserBookmarkNode[],
    onProgress?: (done: number, total: number, current: string) => void
  ): Promise<void> {
    if (this.running) {
      throw new Error('已有检查正在进行中，请先停止或等待完成');
    }
    this.running = true;
    this.stopRequested = false;
    try {
      for (let i = 0; i < nodes.length; i++) {
        if (this.stopRequested) {
          break;
        }
        const node = nodes[i];
        onProgress?.(i, nodes.length, node.title || node.url || '');
        if (!node.url || !isCheckableUrl(node.url)) {
          continue;
        }

        const outcome = await deepVerifyUrl(node.url);
        if (outcome === 'unknown') {
          continue;
        }

        // 字段级原子写：只写检查相关字段，不整行覆盖
        const changes = {
          linkStatus: outcome === 'ok' ? ('active' as const) : ('broken' as const),
          linkCheckedAt: now(),
          lastStatusCode: outcome === 'ok' ? 200 : 0,
          lastErrorMessage:
            outcome === 'ok' ? '深度复核：真实页面可打开' : '深度复核：真实导航也无法打开',
          lastResponseTime: 0,
        };
        const updatedCount = await auxDb.bookmarkMeta.update(node.id, changes);
        if (updatedCount === 0) {
          await auxDb.bookmarkMeta.put({ ...defaultMeta(node.id), ...changes });
        }
      }
      onProgress?.(nodes.length, nodes.length, '');
    } finally {
      this.running = false;
      this.stopRequested = false;
    }
  }

  // 汇总健康报告（基于内存快照 + aux）
  async getHealthReport(
    nodes: BrowserBookmarkNode[],
    meta: Record<string, AuxBookmarkMeta>
  ): Promise<LinkHealthReport> {
    let healthy = 0;
    let broken = 0;
    let unreachable = 0;
    // 聚合指标直接读 meta 冗余字段（检查时写入），不再查 linkChecks 全表
    let responseTimeSum = 0;
    let responseTimeCount = 0;
    let lastCheckedAt = 0;

    for (const node of nodes) {
      const record = meta[node.id];
      const status = record?.linkStatus;
      if (status === 'active' || status === 'broken' || status === 'unreachable') {
        if (status === 'active') {
          healthy++;
        } else if (status === 'broken') {
          broken++;
        } else {
          unreachable++;
        }
        if (record.linkCheckedAt && record.linkCheckedAt > lastCheckedAt) {
          lastCheckedAt = record.linkCheckedAt;
        }
        if (typeof record.lastResponseTime === 'number' && record.lastResponseTime > 0) {
          responseTimeSum += record.lastResponseTime;
          responseTimeCount++;
        }
      }
    }

    const pending = nodes.length - healthy - broken - unreachable;
    return {
      total: nodes.length,
      healthy,
      broken,
      unreachable,
      pending,
      avgResponseTime: responseTimeCount > 0 ? responseTimeSum / responseTimeCount : 0,
      lastCheckedAt,
      byStatus: {
        unknown: pending,
        healthy,
        broken,
        timeout: unreachable,
        error: 0,
      },
    };
  }

  // 单个书签的检查历史（新记录在前）
  async getCheckHistory(bookmarkId: string, limit = 10): Promise<LinkCheckRecord[]> {
    const records = await auxDb.linkChecks.where('bookmarkId').equals(bookmarkId).toArray();
    return records.sort((a, b) => b.checkedAt - a.checkedAt).slice(0, limit);
  }

  // 清除全部检查结果（历史记录 + 元数据上的 linkStatus/linkCheckedAt），
  // 用于纠正历史误判数据；标签/收藏/备注等其他元数据保留。
  // urlKey/orphanedAt 必须保留：孤儿元数据靠它们走 90 天认领/TTL 流程，
  // 抹掉后 refresh 的对账会把等待认领的元数据当作旧数据直接删除
  async resetCheckResults(): Promise<void> {
    if (this.running) {
      throw new Error('A check is running');
    }
    await auxDb.linkChecks.clear();
    const metas = await auxDb.bookmarkMeta.toArray();
    await auxDb.bookmarkMeta.bulkPut(
      metas.map((meta) => ({
        bookmarkId: meta.bookmarkId,
        tags: meta.tags,
        notes: meta.notes,
        isFavorite: meta.isFavorite,
        visitCount: meta.visitCount,
        lastVisited: meta.lastVisited,
        aiGenerated: meta.aiGenerated,
        urlKey: meta.urlKey,
        orphanedAt: meta.orphanedAt,
      }))
    );
  }

  // 清理超过保留天数的检查记录
  async cleanupOldRecords(daysToKeep = 30): Promise<number> {
    const cutoff = now() - daysToKeep * 24 * 3600_000;
    return auxDb.linkChecks.where('checkedAt').below(cutoff).delete();
  }
}

// 单例导出
export const linkHealthService = new LinkHealthService();
