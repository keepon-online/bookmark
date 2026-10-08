import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { auxDb, ORPHAN_META_TTL_MS, reconcileMeta } from '@/lib/auxDatabase';
import { getUrlKey } from '@/lib/utils';
import type { AuxBookmarkMeta, BrowserBookmarkNode } from '@/types';

function node(id: string, url: string): BrowserBookmarkNode {
  return { id, parentId: '1', title: id, url, index: 0, dateAdded: 1, path: '书签栏' };
}

function meta(bookmarkId: string, extra: Partial<AuxBookmarkMeta> = {}): AuxBookmarkMeta {
  return { bookmarkId, tags: [], isFavorite: false, visitCount: 0, ...extra };
}

describe('reconcileMeta', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await auxDb.delete();
    await auxDb.open();
  });

  it('书签还在：补齐缺失的 urlKey，其余字段原样保留', async () => {
    await auxDb.bookmarkMeta.put(meta('1', { tags: ['前端'], notes: '备注' }));

    const result = await reconcileMeta([node('1', 'https://example.com/a')]);

    expect(result).toEqual({ rebound: 0, backfilled: 1, removed: 0, pending: 0 });
    const row = await auxDb.bookmarkMeta.get('1');
    expect(row?.urlKey).toBe(getUrlKey('https://example.com/a'));
    expect(row?.tags).toEqual(['前端']);
    expect(row?.notes).toBe('备注');
  });

  it('删除后重新添加同一链接：元数据被新节点认领，标签与备注跟着走', async () => {
    // 旧节点 id=old 已消失；新节点 id=new 是同一个链接（大小写/www/尾斜杠差异不影响）
    await auxDb.bookmarkMeta.put(
      meta('old', { urlKey: getUrlKey('https://www.example.com/a/'), tags: ['前端'], notes: '备注' })
    );

    const result = await reconcileMeta([node('new', 'https://example.com/a')]);

    expect(result.rebound).toBe(1);
    expect(result.removed).toBe(0);
    expect(await auxDb.bookmarkMeta.get('old')).toBeUndefined();
    const moved = await auxDb.bookmarkMeta.get('new');
    expect(moved?.tags).toEqual(['前端']);
    expect(moved?.notes).toEqual('备注');
    expect(moved?.bookmarkId).toBe('new');
    expect(moved?.orphanedAt).toBeUndefined();
  });

  it('暂时无人认领：写入 orphanedAt 并保留，TTL 内不清理', async () => {
    const nowTs = 1_000_000;
    await auxDb.bookmarkMeta.put(meta('gone', { urlKey: 'example.com/a', tags: ['X'] }));

    const first = await reconcileMeta([], nowTs);

    expect(first).toEqual({ rebound: 0, backfilled: 0, removed: 0, pending: 1 });
    const row = await auxDb.bookmarkMeta.get('gone');
    expect(row?.orphanedAt).toBe(nowTs);
    expect(row?.tags).toEqual(['X']);

    // 距 TTL 还差 1 毫秒 → 仍然保留
    const second = await reconcileMeta([], nowTs + ORPHAN_META_TTL_MS - 1);
    expect(second).toEqual({ rebound: 0, backfilled: 0, removed: 0, pending: 1 });
    expect(await auxDb.bookmarkMeta.get('gone')).toBeDefined();
  });

  it('超过 TTL 仍无人认领：清理掉孤儿', async () => {
    const nowTs = 1_000_000;
    await auxDb.bookmarkMeta.put(meta('gone', { urlKey: 'example.com/a', orphanedAt: nowTs }));

    const result = await reconcileMeta([], nowTs + ORPHAN_META_TTL_MS + 1);

    expect(result.removed).toBe(1);
    expect(result.pending).toBe(0);
    expect(await auxDb.bookmarkMeta.get('gone')).toBeUndefined();
  });

  it('没有 urlKey 的旧数据无从认领，直接清理且不会污染新书签', async () => {
    await auxDb.bookmarkMeta.put(meta('legacy', { tags: ['旧'] }));

    const result = await reconcileMeta([node('new', 'https://example.com/a')]);

    expect(result.removed).toBe(1);
    expect(result.rebound).toBe(0);
    expect(await auxDb.bookmarkMeta.get('legacy')).toBeUndefined();
    expect(await auxDb.bookmarkMeta.get('new')).toBeUndefined();
  });

  it('已有元数据的书签不会被另一个同链接孤儿覆盖', async () => {
    await auxDb.bookmarkMeta.put(meta('new', { tags: ['新'] }));
    await auxDb.bookmarkMeta.put(meta('old', { urlKey: getUrlKey('https://example.com/a'), tags: ['旧'] }));

    const result = await reconcileMeta([node('new', 'https://example.com/a')], 1_000_000);

    // new 已有自己的元数据 → 不参与认领；old 继续等待
    expect(result.rebound).toBe(0);
    expect(result.pending).toBe(1);
    expect((await auxDb.bookmarkMeta.get('new'))?.tags).toEqual(['新']);
    expect((await auxDb.bookmarkMeta.get('old'))?.tags).toEqual(['旧']);
  });

  it('空库直接返回零计数', async () => {
    await expect(reconcileMeta([node('1', 'https://a.com')])).resolves.toEqual({
      rebound: 0,
      backfilled: 0,
      removed: 0,
      pending: 0,
    });
  });
});
