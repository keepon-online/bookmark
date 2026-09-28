// 链接健康服务 v2
// 输入浏览器书签节点（chrome.bookmarks 唯一数据源），
// 检查结果写入 aux（linkChecks 历史 + bookmarkMeta.linkStatus）。
// 手动触发、可停止、支持跳过近期已检查项。
//
// 判定策略（降低误报）：
// - HEAD 疑似失效（404/5xx）时用 GET 复核确认——不少站点/WAF 对
//   HEAD 返回 404/5xx 但 GET 正常
// - 同域名串行检查并保持间隔，避免并发触发站点限流/风控
// - 人工"标记为正常"的链接（linkStatusManual）自动扫描不再改判

import { httpChecker } from '@/lib/httpChecker';
import { auxDb, defaultMeta, type LinkCheckRecord } from '@/lib/auxDatabase';
import { generateId, getDomain, now, sleep } from '@/lib/utils';
import type { AuxBookmarkMeta, BrowserBookmarkNode } from '@/types';
import type { BatchCheckOptions, CheckProgress, LinkCheckResult, LinkHealthReport } from '@/types/linkHealth';

const DEFAULT_CONCURRENCY = 5;
// 同域名两次请求的最小间隔（毫秒）
const SAME_DOMAIN_INTERVAL_MS = 250;

// 状态码 → 链接状态。401/403/405/408/429 视为"可达但拒绝/受限"，
// 不能判为死链（如 Cloudflare 拦截、服务器超时抱怨——能回应就说明活着）。
export function classifyLinkStatus(status: number): 'active' | 'broken' {
  if (status >= 200 && status < 400) {
    return 'active';
  }
  if ([401, 403, 405, 408, 429].includes(status)) {
    return 'active';
  }
  return 'broken';
}

interface DomainQueue {
  domain: string;
  items: Array<{ node: BrowserBookmarkNode; meta?: AuxBookmarkMeta }>;
  next: number;
  busy: boolean;
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

  // 批量检查书签节点：结果写 aux 并返回
  async checkBookmarks(
    nodes: BrowserBookmarkNode[],
    options: BatchCheckOptions = {},
    onProgress?: (progress: CheckProgress) => void
  ): Promise<LinkCheckResult[]> {
    if (this.running) {
      return [];
    }
    this.running = true;
    this.stopRequested = false;

    try {
      const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
      const skipRecentMs = (options.skipRecentHours ?? 0) * 3600_000;
      const whitelist = new Set((options.whitelist ?? []).map((domain) => domain.toLowerCase()));
      // force：忽略跳过窗口与人工标记（用于单条/所选重查）
      const force = options.force ?? false;

      // 预取元数据以判断跳过项
      const metas = await auxDb.bookmarkMeta.bulkGet(nodes.map((node) => node.id));
      const pending: Array<{ node: BrowserBookmarkNode; meta?: AuxBookmarkMeta }> = [];
      let skipped = 0;
      nodes.forEach((node, index) => {
        if (!node.url) return;
        // 白名单域名跳过检查
        if (node.url && whitelist.has(getDomain(node.url).toLowerCase())) {
          skipped++;
          return;
        }
        const meta = metas[index];
        // 人工标记为正常的链接不再自动改判
        if (!force && meta?.linkStatusManual) {
          skipped++;
          return;
        }
        if (
          !force &&
          skipRecentMs > 0 &&
          meta?.linkCheckedAt &&
          now() - meta.linkCheckedAt < skipRecentMs
        ) {
          skipped++;
          return;
        }
        pending.push({ node, meta });
      });

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
      }));
      let domainCursor = 0;

      const results: LinkCheckResult[] = [];
      const startTime = now();
      let completed = 0;
      let success = 0;
      let failed = 0;

      const pickDomain = (): DomainQueue | undefined => {
        for (let i = 0; i < domainQueues.length; i++) {
          const queue = domainQueues[(domainCursor + i) % domainQueues.length];
          if (queue.next < queue.items.length && !queue.busy) {
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
            return; // 全部完成
          }
          domainQueue.busy = true;
          try {
            const item = domainQueue.items[domainQueue.next++];

            let check = await httpChecker.check(item.node.url!, {
              timeout: options.timeout,
              retries: options.retries,
            });
            // HEAD 疑似失效 → GET 复核，避免 HEAD 被服务器特殊对待导致误判
            if (!check.networkError && classifyLinkStatus(check.status) === 'broken') {
              const verified = await httpChecker.check(item.node.url!, {
                timeout: options.timeout,
                retries: options.retries,
                method: 'GET',
              });
              if (!verified.networkError) {
                check = verified;
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
            };
            await auxDb.linkChecks.add(record);

            // 网络层失败（CORS/断网/超时，未获得 HTTP 响应）不判定失效：
            // 保持原状态，下次检查可重试，避免把健康链接误标为死链
            const gotResponse = !check.networkError;
            if (gotResponse) {
              const base = item.meta ?? defaultMeta(item.node.id);
              await auxDb.bookmarkMeta.put({
                ...base,
                linkStatus: classifyLinkStatus(check.status),
                linkCheckedAt: check.checkedAt,
                lastStatusCode: check.status,
              });
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
            // 进度计数与最终分类一致：网络层失败计入 skipped（未检测）
            if (!gotResponse) {
              skipped++;
            } else if (classifyLinkStatus(check.status) === 'active') {
              success++;
            } else {
              failed++;
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

            // 同域名请求间隔
            await sleep(SAME_DOMAIN_INTERVAL_MS);
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
    }
  }

  // 人工标记为正常：后续自动扫描不再改判（force 重查除外）
  async markAsHealthy(bookmarkIds: string[]): Promise<void> {
    const metas = await auxDb.bookmarkMeta.bulkGet(bookmarkIds);
    const updates: AuxBookmarkMeta[] = [];
    bookmarkIds.forEach((bookmarkId, index) => {
      const base = metas[index] ?? defaultMeta(bookmarkId);
      updates.push({
        ...base,
        linkStatus: 'active',
        linkStatusManual: true,
      });
    });
    await auxDb.bookmarkMeta.bulkPut(updates);
  }

  // 汇总健康报告（基于内存快照 + aux）
  async getHealthReport(
    nodes: BrowserBookmarkNode[],
    meta: Record<string, AuxBookmarkMeta>
  ): Promise<LinkHealthReport> {
    let healthy = 0;
    let broken = 0;
    const checkedIds: string[] = [];

    for (const node of nodes) {
      const status = meta[node.id]?.linkStatus;
      if (status === 'active') {
        healthy++;
        checkedIds.push(node.id);
      } else if (status === 'broken') {
        broken++;
        checkedIds.push(node.id);
      }
    }

    // 最新一次检查的平均响应时间与时间戳
    let responseTimeSum = 0;
    let responseTimeCount = 0;
    let lastCheckedAt = 0;
    if (checkedIds.length > 0) {
      const records = await auxDb.linkChecks.where('bookmarkId').anyOf(checkedIds).toArray();
      const latestByBookmark = new Map<string, LinkCheckRecord>();
      for (const record of records) {
        const existing = latestByBookmark.get(record.bookmarkId);
        if (!existing || record.checkedAt > existing.checkedAt) {
          latestByBookmark.set(record.bookmarkId, record);
        }
      }
      for (const record of latestByBookmark.values()) {
        responseTimeSum += record.responseTime;
        responseTimeCount++;
        if (record.checkedAt > lastCheckedAt) {
          lastCheckedAt = record.checkedAt;
        }
      }
    }

    return {
      total: nodes.length,
      healthy,
      broken,
      pending: nodes.length - healthy - broken,
      avgResponseTime: responseTimeCount > 0 ? responseTimeSum / responseTimeCount : 0,
      lastCheckedAt,
      byStatus: {
        unknown: nodes.length - healthy - broken,
        healthy,
        broken,
        timeout: 0,
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
  // 用于纠正历史误判数据；标签/收藏/备注等其他元数据保留
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
