import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { auxDb, ORPHAN_META_TTL_MS, reconcileMeta, importAuxData } from '@/lib/auxDatabase';
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

    expect(result).toEqual({ rebound: 0, backfilled: 1, removed: 0, pending: 0, merged: 0 });
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

    expect(first).toEqual({ rebound: 0, backfilled: 0, removed: 0, pending: 1, merged: 0 });
    const row = await auxDb.bookmarkMeta.get('gone');
    expect(row?.orphanedAt).toBe(nowTs);
    expect(row?.tags).toEqual(['X']);

    // 距 TTL 还差 1 毫秒 → 仍然保留
    const second = await reconcileMeta([], nowTs + ORPHAN_META_TTL_MS - 1);
    expect(second).toEqual({ rebound: 0, backfilled: 0, removed: 0, pending: 1, merged: 0 });
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

  it('同链接节点已有元数据时合并：取并集而不是覆盖或丢弃', async () => {
    await auxDb.bookmarkMeta.put(
      meta('new', {
        tags: ['新标签'],
        notes: '新节点上的备注',
        isFavorite: false,
        visitCount: 2,
        linkStatus: 'active',
        linkCheckedAt: 500,
        lastResponseTime: 120,
      })
    );
    await auxDb.bookmarkMeta.put(
      meta('old', {
        urlKey: getUrlKey('https://example.com/a'),
        tags: ['旧标签', '新标签'],
        notes: '旧节点上的备注',
        isFavorite: true,
        visitCount: 3,
        aiGenerated: true,
        lastVisited: 9_000,
        linkStatus: 'broken',
        linkCheckedAt: 100,
        lastStatusCode: 404,
      })
    );

    const result = await reconcileMeta([node('new', 'https://example.com/a')], 1_000_000);

    expect(result).toMatchObject({ rebound: 0, merged: 1, pending: 0 });
    // 孤儿行被并掉
    expect(await auxDb.bookmarkMeta.get('old')).toBeUndefined();

    const merged = await auxDb.bookmarkMeta.get('new');
    // 标签取并集且去重
    expect(merged?.tags).toEqual(['新标签', '旧标签']);
    // 备注以目标节点自己的为准（用户在新节点写过）
    expect(merged?.notes).toBe('新节点上的备注');
    // 收藏取或、访问次数相加、最近访问取较晚
    expect(merged?.isFavorite).toBe(true);
    expect(merged?.visitCount).toBe(5);
    expect(merged?.lastVisited).toBe(9_000);
    // 死链状态取检查时间较新的那份（新节点 linkCheckedAt=500）
    expect(merged?.linkStatus).toBe('active');
    expect(merged?.lastStatusCode).toBeUndefined();
    expect(merged?.lastResponseTime).toBe(120);
    // aiGenerated 取或
    expect(merged?.aiGenerated).toBe(true);
    expect(merged?.orphanedAt).toBeUndefined();
  });

  it('同一 urlKey 的多个孤儿依次并进同一份元数据', async () => {
    await auxDb.bookmarkMeta.put(meta('new', { tags: ['保留'], visitCount: 1 }));
    await auxDb.bookmarkMeta.put(
      meta('o1', { urlKey: getUrlKey('https://example.com/a'), tags: ['A'], visitCount: 2 })
    );
    await auxDb.bookmarkMeta.put(
      meta('o2', { urlKey: getUrlKey('https://example.com/a'), tags: ['B'], visitCount: 4 })
    );

    const result = await reconcileMeta([node('new', 'https://example.com/a')], 1_000_000);

    expect(result).toMatchObject({ merged: 2, removed: 0, pending: 0 });
    const merged = await auxDb.bookmarkMeta.get('new');
    expect([...(merged?.tags ?? [])].sort()).toEqual(['A', 'B', '保留']);
    expect(merged?.visitCount).toBe(7);
    expect(await auxDb.bookmarkMeta.count()).toBe(1);
  });

  it('空库直接返回零计数', async () => {
    await expect(reconcileMeta([node('1', 'https://a.com')])).resolves.toEqual({
      rebound: 0,
      backfilled: 0,
      removed: 0,
      pending: 0,
      merged: 0,
    });
  });
});

describe('reconcileMeta 写入去重（回归）', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await auxDb.delete();
    await auxDb.open();
  });

  it('合并结果不被同主键的 urlKey 回填覆盖（孤儿主键在前）', async () => {
    const liveUrl = 'https://same.example.com/page';
    const key = getUrlKey(liveUrl);
    // 孤儿行主键字典序在前（删除的通常是老节点）；存活行树上 URL
    // 已改成同 urlKey，但存储的 urlKey 还是旧值（待回填）——两行都会
    // 产生同主键（z-live）的写入，后写不得覆盖合并结果
    await auxDb.bookmarkMeta.bulkPut([
      meta('a-orphan', { tags: ['孤儿标签'], isFavorite: true, visitCount: 3, urlKey: key }),
      meta('z-live', { tags: ['存活标签'], visitCount: 1, urlKey: 'old.example.com/other' }),
    ]);

    const { merged } = await reconcileMeta([node('z-live', liveUrl)]);

    expect(merged).toBe(1);
    const row = await auxDb.bookmarkMeta.get('z-live');
    expect(row?.tags).toEqual(['存活标签', '孤儿标签']);
    expect(row?.isFavorite).toBe(true);
    expect(row?.visitCount).toBe(4);
    expect(row?.urlKey).toBe(key);
    expect(await auxDb.bookmarkMeta.get('a-orphan')).toBeUndefined();
  });

  it('rebound 认领后，同 urlKey 的后续孤儿继续链式合并', async () => {
    const url = 'https://chain.example.com/a';
    const key = getUrlKey(url);
    await auxDb.bookmarkMeta.bulkPut([
      meta('a1', { tags: ['A'], urlKey: key }),
      meta('a2', { tags: ['B'], urlKey: key }),
    ]);

    // 存活书签无元数据：第一个孤儿认领，第二个应并进同一份结果
    // （认领结果不回写索引时，第二个会落入 pending、90 天后被清掉）
    const { rebound, merged } = await reconcileMeta([node('n-live', url)]);

    expect(rebound).toBe(1);
    expect(merged).toBe(1);
    const row = await auxDb.bookmarkMeta.get('n-live');
    expect(row?.tags).toEqual(['A', 'B']);
    expect(await auxDb.bookmarkMeta.get('a1')).toBeUndefined();
    expect(await auxDb.bookmarkMeta.get('a2')).toBeUndefined();
  });

  it('importAuxData 对脏行做字段规范化，无主键行丢弃', async () => {
    await importAuxData({
      version: 1,
      exportedAt: 0,
      bookmarkMeta: [
        { bookmarkId: 'ok', tags: ['合法'], isFavorite: true, visitCount: 2 },
        { bookmarkId: 'dirty', isFavorite: true },
        { tags: ['无主键'] },
      ] as AuxBookmarkMeta[],
      linkChecks: [],
      organizeHistory: [],
    });

    expect((await auxDb.bookmarkMeta.get('ok'))?.tags).toEqual(['合法']);
    // 缺 tags 的脏行补默认形状，不再让渲染路径抛 TypeError
    const dirty = await auxDb.bookmarkMeta.get('dirty');
    expect(dirty?.tags).toEqual([]);
    expect(dirty?.isFavorite).toBe(true);
    expect(dirty?.visitCount).toBe(0);
    expect(await auxDb.bookmarkMeta.count()).toBe(2);
  });
});
