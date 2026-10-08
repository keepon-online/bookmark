import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SCAN_SETTINGS, type ScanSettings } from '@/lib/scanSettings';
import {
  AUTO_SCAN_BATCH_SIZE,
  AUTO_SCAN_STALE_MS,
  runAutoScanTick,
  type AutoScanProgress,
} from '@/services/linkHealthAutoScan';
import type { AuxBookmarkMeta, BrowserBookmarkNode } from '@/types';

const NOW = 1_000_000;

function node(id: string, url: string): BrowserBookmarkNode {
  return { id, parentId: '1', title: id, url, index: 0, dateAdded: 1, path: '书签栏' };
}

function settings(overrides: Partial<ScanSettings> = {}): ScanSettings {
  return { ...DEFAULT_SCAN_SETTINGS, autoScanEnabled: true, ...overrides };
}

// 内存版进度存储
function makeStore(initial?: AutoScanProgress) {
  let current = initial;
  return {
    read: async () => current,
    write: async (progress?: AutoScanProgress) => {
      current = progress;
    },
    get: () => current,
  };
}

function makeDeps(
  nodes: BrowserBookmarkNode[],
  meta: Record<string, AuxBookmarkMeta> = {},
  options: { store?: ReturnType<typeof makeStore>; settings?: ScanSettings } = {}
) {
  const store = options.store ?? makeStore();
  const check = vi.fn().mockResolvedValue([]);
  const scheduleContinue = vi.fn().mockResolvedValue(undefined);
  const clearContinue = vi.fn().mockResolvedValue(undefined);

  return {
    store,
    check,
    scheduleContinue,
    clearContinue,
    deps: {
      loadSettings: async () => options.settings ?? settings(),
      loadNodes: async () => nodes,
      loadMeta: async () => meta,
      check,
      readProgress: store.read,
      writeProgress: store.write,
      scheduleContinue,
      clearContinue,
      now: () => NOW,
    },
  };
}

describe('runAutoScanTick', () => {
  it('未开启自动检查时直接跳过，不读书签也不发请求', async () => {
    const { deps, check, store } = makeDeps([node('1', 'https://a.com/')], {}, {
      settings: settings({ autoScanEnabled: false }),
    });

    const result = await runAutoScanTick(deps);

    expect(result).toEqual({ skipped: 'disabled', checked: 0, remaining: 0, finished: false });
    expect(check).not.toHaveBeenCalled();
    expect(store.get()).toBeUndefined();
  });

  it('没有候选（例如刚手动扫过）时本轮结束，并记录完成时间', async () => {
    const meta: Record<string, AuxBookmarkMeta> = {
      // 1 分钟前刚检查过，落在默认 24 小时跳过窗口内
      '1': { bookmarkId: '1', tags: [], isFavorite: false, visitCount: 0, linkCheckedAt: NOW - 60_000 },
    };
    const { deps, check, clearContinue, store } = makeDeps([node('1', 'https://a.com/')], meta);

    const result = await runAutoScanTick(deps);

    expect(result).toMatchObject({ checked: 0, remaining: 0, finished: true });
    expect(check).not.toHaveBeenCalled();
    expect(clearContinue).toHaveBeenCalledTimes(1);
    expect(store.get()?.lastFinishedAt).toBe(NOW);
  });

  it('一次只检查一批，还有剩余就安排续跑', async () => {
    const nodes = Array.from({ length: AUTO_SCAN_BATCH_SIZE + 10 }, (_, i) =>
      node(`n${i}`, `https://a${i}.com/`)
    );
    const { deps, check, scheduleContinue, store } = makeDeps(nodes);

    const result = await runAutoScanTick(deps);

    expect(result).toMatchObject({
      checked: AUTO_SCAN_BATCH_SIZE,
      remaining: 10,
      finished: false,
    });
    expect(check).toHaveBeenCalledTimes(1);
    expect((check.mock.calls[0][0] as BrowserBookmarkNode[]).length).toBe(AUTO_SCAN_BATCH_SIZE);
    expect(scheduleContinue).toHaveBeenCalledTimes(1);
    // 进度落盘：已检查条数累加，且不再带"正在进行"标记
    expect(store.get()?.checked).toBe(AUTO_SCAN_BATCH_SIZE);
    expect(store.get()?.runningSince).toBeUndefined();
  });

  it('上一批仍在进行时让开，不重复发起检查', async () => {
    const store = makeStore({ runningSince: NOW - 1_000, startedAt: NOW - 1_000, checked: 5 });
    const { deps, check } = makeDeps([node('1', 'https://a.com/')], {}, { store });

    const result = await runAutoScanTick(deps);

    expect(result).toEqual({ skipped: 'running', checked: 0, remaining: 0, finished: false });
    expect(check).not.toHaveBeenCalled();
  });

  it('runningSince 已过期（上次运行被 SW 杀掉）时继续跑并累加进度', async () => {
    const store = makeStore({
      runningSince: NOW - AUTO_SCAN_STALE_MS - 1,
      startedAt: NOW - AUTO_SCAN_STALE_MS - 1,
      checked: 7,
    });
    const { deps, check } = makeDeps([node('1', 'https://a.com/')], {}, { store });

    const result = await runAutoScanTick(deps);

    expect(result).toMatchObject({ checked: 1, remaining: 0, finished: true });
    expect(check).toHaveBeenCalledTimes(1);
    expect(store.get()?.checked).toBe(8);
  });

  it('最后一批跑完：清掉续跑闹钟并写完成时间', async () => {
    const { deps, clearContinue, store } = makeDeps([
      node('1', 'https://a.com/'),
      node('2', 'https://b.com/'),
    ]);

    const result = await runAutoScanTick(deps);

    expect(result).toMatchObject({ checked: 2, remaining: 0, finished: true });
    expect(clearContinue).toHaveBeenCalledTimes(1);
    const progress = store.get();
    expect(progress?.lastFinishedAt).toBe(NOW);
    expect(progress?.runningSince).toBeUndefined();
    expect(progress?.lastError).toBeUndefined();
  });

  it('整批抛错（如权限被撤）时记录 lastError，不把进度丢掉', async () => {
    const store = makeStore({ startedAt: NOW - 5_000, checked: 3 });
    const { deps, check } = makeDeps([node('1', 'https://a.com/')], {}, { store });
    check.mockRejectedValueOnce(new Error('已有检查正在进行中'));

    const result = await runAutoScanTick(deps);

    expect(result.finished).toBe(true);
    expect(store.get()?.lastError).toBe('已有检查正在进行中');
    expect(store.get()?.checked).toBe(4);
  });
});
