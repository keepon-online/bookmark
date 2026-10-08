// 定时自动死链检查
//
// 跑在 Service Worker 里。MV3 的 SW 随时可能被杀，所以**不能**一口气检查完
// 整个书签库：每次闹钟只检查一批（AUTO_SCAN_BATCH_SIZE 条），进度写
// chrome.storage.local；还有剩余就安排 1 分钟后的续跑闹钟，全部检查完才清掉
// 进度。某次运行中途被杀时 runningSince 会留下痕迹，超过 AUTO_SCAN_STALE_MS
// 视为那次运行已死并允许继续，避免永久卡住。
//
// 与手动扫描的关系：两者共用 selectCheckableNodes 的跳过规则，而"跳过最近检查
// 过的"窗口（默认 24 小时）天然让刚手动扫过的书签不会被自动扫描重复检查。
// 极端情况下（手动扫描进行中恰好有闹钟触发）可能重叠少量重复请求，结果一致，
// 不做额外的跨上下文加锁。

import { auxDb } from '@/lib/auxDatabase';
import { createLogger } from '@/lib/logger';
import { loadScanSettings, toBatchCheckOptions, type ScanSettings } from '@/lib/scanSettings';
import type { AuxBookmarkMeta, BrowserBookmarkNode, LinkCheckResult } from '@/types';
import type { BatchCheckOptions } from '@/types/linkHealth';
import { browserBookmarks } from './browserBookmarksService';
import { linkHealthService, selectCheckableNodes } from './linkHealthService';

const logger = createLogger('LinkHealthAutoScan');

// 周期闹钟与续跑闹钟名（周期闹钟名沿用历史值）
export const AUTO_SCAN_ALARM = 'link-health-check';
export const AUTO_SCAN_CONTINUE_ALARM = 'link-health-check-continue';
// 进度记录所在的 storage key
export const AUTO_SCAN_PROGRESS_KEY = 'linkHealthAutoScanProgress';
// 每次闹钟最多检查多少条（决定单次运行时长，太大就有被 SW 杀掉的风险）
export const AUTO_SCAN_BATCH_SIZE = 40;
// 上一次运行的"仍在进行"标记超过这个时长即视为已死，允许重新开始
export const AUTO_SCAN_STALE_MS = 5 * 60_000;
// 间隔下限（小时）
export const AUTO_SCAN_MIN_INTERVAL_HOURS = 1;

export interface AutoScanProgress {
  // 仅在某批正在检查时写入；空闲或已完成时不带该字段
  runningSince?: number;
  // 本轮开始时间
  startedAt: number;
  // 本轮已检查条数
  checked: number;
  // 最近一次跑完全部候选的时间
  lastFinishedAt?: number;
  // 最近一次失败原因（如权限不足导致整批抛错）
  lastError?: string;
}

export type AutoScanSkipReason = 'disabled' | 'running';

export interface AutoScanTickResult {
  skipped?: AutoScanSkipReason;
  // 本次真正发起检查的条数
  checked: number;
  // 本次结束后还剩多少候选
  remaining: number;
  // 本轮是否已经跑完全部候选
  finished: boolean;
}

// 依赖注入：默认接真实实现（浏览器书签 / aux / linkHealthService /
// chrome.storage / chrome.alarms），测试可逐项替换
export interface AutoScanDeps {
  loadSettings: () => Promise<ScanSettings>;
  loadNodes: () => Promise<BrowserBookmarkNode[]>;
  loadMeta: () => Promise<Record<string, AuxBookmarkMeta>>;
  check: (nodes: BrowserBookmarkNode[], options: BatchCheckOptions) => Promise<LinkCheckResult[]>;
  readProgress: () => Promise<AutoScanProgress | undefined>;
  writeProgress: (progress: AutoScanProgress | undefined) => Promise<void>;
  scheduleContinue: () => Promise<void>;
  clearContinue: () => Promise<void>;
  now: () => number;
}

const defaultDeps: AutoScanDeps = {
  loadSettings: loadScanSettings,
  loadNodes: async () => (await browserBookmarks.loadTree()).bookmarks,
  loadMeta: async () => {
    const rows = await auxDb.bookmarkMeta.toArray();
    const map: Record<string, AuxBookmarkMeta> = {};
    for (const row of rows) {
      map[row.bookmarkId] = row;
    }
    return map;
  },
  check: (nodes, options) => linkHealthService.checkBookmarks(nodes, options),
  readProgress: async () => {
    const stored = await chrome.storage.local.get(AUTO_SCAN_PROGRESS_KEY);
    return (stored?.[AUTO_SCAN_PROGRESS_KEY] as AutoScanProgress | undefined) ?? undefined;
  },
  writeProgress: async (progress) => {
    if (progress) {
      await chrome.storage.local.set({ [AUTO_SCAN_PROGRESS_KEY]: progress });
    } else {
      await chrome.storage.local.remove(AUTO_SCAN_PROGRESS_KEY);
    }
  },
  scheduleContinue: async () => {
    await chrome.alarms.create(AUTO_SCAN_CONTINUE_ALARM, { delayInMinutes: 1 });
  },
  clearContinue: async () => {
    await chrome.alarms.clear(AUTO_SCAN_CONTINUE_ALARM);
  },
  now: () => Date.now(),
};

/**
 * 跑一次自动扫描的"一片"。可重复调用：每次处理一批，直到 `finished` 为真。
 */
export async function runAutoScanTick(
  overrides: Partial<AutoScanDeps> = {}
): Promise<AutoScanTickResult> {
  const deps: AutoScanDeps = { ...defaultDeps, ...overrides };

  const settings = await deps.loadSettings();
  if (!settings.autoScanEnabled) {
    return { skipped: 'disabled', checked: 0, remaining: 0, finished: false };
  }

  const nowTs = deps.now();
  const progress = await deps.readProgress();

  // 上一批还在进行（或刚被杀不久）：让开，等下一次闹钟
  if (
    progress?.runningSince &&
    nowTs - progress.runningSince < AUTO_SCAN_STALE_MS
  ) {
    return { skipped: 'running', checked: 0, remaining: 0, finished: false };
  }

  const [nodes, meta] = await Promise.all([deps.loadNodes(), deps.loadMeta()]);
  const options = toBatchCheckOptions(settings);
  const candidates = selectCheckableNodes(nodes, meta, options, nowTs);

  // 没有候选：本轮结束（默认 24 小时的跳过窗口会让刚扫过的书签落到这里）
  if (candidates.length === 0) {
    await deps.clearContinue();
    if (progress && !progress.lastFinishedAt) {
      await deps.writeProgress({ ...progress, runningSince: undefined, lastFinishedAt: nowTs });
    } else if (!progress) {
      await deps.writeProgress({ startedAt: nowTs, checked: 0, lastFinishedAt: nowTs });
    }
    return { checked: 0, remaining: 0, finished: true };
  }

  const batch = candidates.slice(0, AUTO_SCAN_BATCH_SIZE);
  const startedAt = progress?.startedAt ?? nowTs;
  const alreadyChecked = progress?.checked ?? 0;

  // 标记"正在进行"，供下一次闹钟判断是否需要让开
  await deps.writeProgress({ runningSince: nowTs, startedAt, checked: alreadyChecked });

  let lastError: string | undefined;
  try {
    await deps.check(batch, options);
  } catch (error) {
    lastError = (error as Error).message;
    logger.error('Auto scan batch failed', error);
  }

  const remaining = candidates.length - batch.length;
  const checked = alreadyChecked + batch.length;

  if (remaining > 0) {
    // 还有剩：记进度并安排 1 分钟后的续跑
    await deps.writeProgress({ startedAt, checked, lastError });
    await deps.scheduleContinue();
    return { checked: batch.length, remaining, finished: false };
  }

  // 本轮跑完
  await deps.clearContinue();
  await deps.writeProgress({ startedAt, checked, lastFinishedAt: deps.now(), lastError });
  return { checked: batch.length, remaining: 0, finished: true };
}

/**
 * 读设置并同步闹钟（后台启动时调一次）
 */
export async function ensureAutoScanAlarm(): Promise<void> {
  await syncAutoScanAlarm(await loadScanSettings());
}

/**
 * 让周期闹钟与设置保持一致：关掉就清掉闹钟，开着就按间隔重建。
 * 设置页保存后与后台启动时各调一次。
 */
export async function syncAutoScanAlarm(settings: ScanSettings): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.alarms) {
    return;
  }
  try {
    if (!settings.autoScanEnabled) {
      await chrome.alarms.clear(AUTO_SCAN_ALARM);
      await chrome.alarms.clear(AUTO_SCAN_CONTINUE_ALARM);
      return;
    }
    const intervalMinutes = Math.max(
      AUTO_SCAN_MIN_INTERVAL_HOURS * 60,
      Math.round(settings.autoScanIntervalHours * 60)
    );
    // 同名 create 会覆盖旧的；首轮也等一个间隔再跑，避免开扩展就突发请求
    await chrome.alarms.create(AUTO_SCAN_ALARM, {
      periodInMinutes: intervalMinutes,
      delayInMinutes: intervalMinutes,
    });
  } catch (error) {
    logger.error('Failed to sync auto scan alarm', error);
  }
}
