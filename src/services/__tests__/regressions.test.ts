import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { auxDb } from '@/lib/auxDatabase';
import { httpChecker } from '@/lib/httpChecker';
import { linkHealthService } from '@/services/linkHealthService';

describe('regressions', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    await auxDb.delete();
    await auxDb.open();
  });

  it('opaque fetch responses are not treated as healthy links', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      type: 'opaque',
      ok: false,
      status: 0,
      url: 'https://example.com',
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await httpChecker.check('https://example.com');

    expect(result.isAccessible).toBe(false);
    expect(result.status).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com',
      expect.not.objectContaining({ mode: 'no-cors' })
    );
  });

  it('HTTP 404 标记为失效，网络层失败不误判', async () => {
    // 404 → 拿到了 HTTP 响应，判定失效
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      type: 'basic',
      ok: false,
      status: 404,
      url: 'https://gone.example.com',
    }));

    const brokenNode = {
      id: 'bookmark-404',
      parentId: '1',
      title: 'Gone',
      url: 'https://gone.example.com',
      index: 0,
      dateAdded: 100,
      path: '书签栏',
    };

    const brokenResults = await linkHealthService.checkBookmarks([brokenNode]);
    expect(brokenResults[0].isAccessible).toBe(false);
    const brokenMeta = await auxDb.bookmarkMeta.get('bookmark-404');
    expect(brokenMeta?.linkStatus).toBe('broken');

    // CORS/网络失败（fetch 抛错，未获得任何响应）→ 不写失效状态，保持待检查
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const unreachableNode = {
      id: 'bookmark-cors',
      parentId: '1',
      title: 'CORS Blocked',
      url: 'https://alive.example.com',
      index: 0,
      dateAdded: 100,
      path: '书签栏',
    };

    const results = await linkHealthService.checkBookmarks([unreachableNode]);

    expect(results[0].isAccessible).toBe(false);

    const meta = await auxDb.bookmarkMeta.get('bookmark-cors');
    expect(meta?.linkStatus).toBeUndefined();

    // 报告中仍算"待检查"，不进入失效统计
    const report = await linkHealthService.getHealthReport([unreachableNode], {});
    expect(report.broken).toBe(0);
    expect(report.pending).toBe(1);
  });

  it('HEAD 被拒（405）时回退 GET 重试', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        return { type: 'basic', ok: false, status: 405, url: _url };
      }
      return { type: 'basic', ok: true, status: 200, url: _url };
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await httpChecker.check('https://headless.example.com', { retries: 0 });

    expect(result.status).toBe(200);
    expect(result.isAccessible).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('白名单域名跳过检查，resetCheckResults 清除状态但保留其他元数据', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      type: 'basic', ok: true, status: 200, url: 'https://github.com/x',
    }));

    const whitelistNode = {
      id: 'bookmark-whitelisted',
      parentId: '1',
      title: 'Skipped',
      url: 'https://trusted.example.com/page',
      index: 0, dateAdded: 100, path: '书签栏',
    };
    const normalNode = {
      id: 'bookmark-normal',
      parentId: '1',
      title: 'Checked',
      url: 'https://github.com/x',
      index: 0, dateAdded: 100, path: '书签栏',
    };

    // 预置一条带标签 + 失效状态的元数据
    await auxDb.bookmarkMeta.put({
      bookmarkId: 'bookmark-whitelisted',
      tags: ['重要'],
      isFavorite: true,
      visitCount: 2,
      linkStatus: 'broken',
      linkCheckedAt: Date.now(),
    });

    const progressRef: { skipped: number } = { skipped: -1 };
    const results = await linkHealthService.checkBookmarks(
      [whitelistNode, normalNode],
      { whitelist: ['trusted.example.com'], retries: 0 },
      (p) => { progressRef.skipped = p.skipped; }
    );

    // 白名单被跳过（不发请求、无结果），普通链接被检查
    expect(results.map((r) => r.bookmarkId)).toEqual(['bookmark-normal']);
    expect(progressRef.skipped).toBe(1);

    // reset：linkStatus/linkCheckedAt 清除，标签/收藏/访问数保留
    await linkHealthService.resetCheckResults();
    const resetMeta = await auxDb.bookmarkMeta.get('bookmark-whitelisted');
    expect(resetMeta?.linkStatus).toBeUndefined();
    expect(resetMeta?.linkCheckedAt).toBeUndefined();
    expect(resetMeta?.tags).toEqual(['重要']);
    expect(resetMeta?.isFavorite).toBe(true);
    expect(resetMeta?.visitCount).toBe(2);
    expect(await auxDb.linkChecks.count()).toBe(0);
  });
});
