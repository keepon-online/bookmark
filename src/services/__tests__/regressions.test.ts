import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { auxDb } from '@/lib/auxDatabase';
import { httpChecker } from '@/lib/httpChecker';
import { linkHealthService, classifyLinkStatus, nextDomainInterval, selectCheckableNodes } from '@/services/linkHealthService';
import type { AuxBookmarkMeta, BrowserBookmarkNode } from '@/types';

function makeNode(id: string, url: string): BrowserBookmarkNode {
  return {
    id,
    parentId: '1',
    title: id,
    url,
    index: 0,
    dateAdded: 100,
    path: '书签栏',
  };
}

// 构造一条元数据记录，只覆盖关心的字段
function baseMeta(bookmarkId: string, overrides: Partial<AuxBookmarkMeta> = {}): AuxBookmarkMeta {
  return { bookmarkId, tags: [], isFavorite: false, visitCount: 0, ...overrides };
}

// 构造带正文的 200 响应（用于软 404 检测）
function htmlResponse(url: string, body: string) {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return { type: 'basic', ok: true, status: 200, url, body: stream };
}

describe('regressions', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
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

    const results = await linkHealthService.checkBookmarks([unreachableNode], { retries: 0 });

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

  it('HEAD 疑似失效时 GET 复核：HEAD 404 但 GET 200 判为正常', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'GET') {
        return { type: 'basic', ok: true, status: 200, url };
      }
      return { type: 'basic', ok: false, status: 404, url };
    });
    vi.stubGlobal('fetch', fetchMock);

    const node = {
      id: 'bookmark-head-404',
      parentId: '1',
      title: 'HEAD rejected',
      url: 'https://picky.example.com/page',
      index: 0,
      dateAdded: 100,
      path: '书签栏',
    };

    const results = await linkHealthService.checkBookmarks([node], { retries: 0 });

    // GET 复核拿到 200 → 不判失效
    expect(results[0].status).toBe(200);
    const meta = await auxDb.bookmarkMeta.get('bookmark-head-404');
    expect(meta?.linkStatus).toBe('active');
  });

  it('人工标记正常后自动扫描跳过，强制重查仍会检查', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      type: 'basic', ok: false, status: 404, url: 'https://marked.example.com/x',
    });
    vi.stubGlobal('fetch', fetchMock);

    const node = {
      id: 'bookmark-manual',
      parentId: '1',
      title: 'Manually OK',
      url: 'https://marked.example.com/x',
      index: 0,
      dateAdded: 100,
      path: '书签栏',
    };

    // 人工标记为正常
    await linkHealthService.markAsHealthy([node.id]);
    const marked = await auxDb.bookmarkMeta.get('bookmark-manual');
    expect(marked?.linkStatus).toBe('active');
    expect(marked?.linkStatusManual).toBe(true);

    // 普通扫描跳过（不发请求）
    fetchMock.mockClear();
    await linkHealthService.checkBookmarks([node]);
    expect(fetchMock).not.toHaveBeenCalled();

    // 强制重查仍会检查并按结果改判
    await linkHealthService.checkBookmarks([node], { retries: 0, force: true });
    expect(fetchMock).toHaveBeenCalled();
    const after = await auxDb.bookmarkMeta.get('bookmark-manual');
    expect(after?.linkStatus).toBe('broken');
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

  it('网络层失败按指数退避重试，第二次成功则判为可达', async () => {
    // 已授予主机权限的环境：连接失败属于瞬时故障，应当重试
    vi.stubGlobal('chrome', {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
    });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ type: 'basic', ok: true, status: 200, url: 'https://flaky.example.com' });
    vi.stubGlobal('fetch', fetchMock);

    const result = await httpChecker.check('https://flaky.example.com', {
      retries: 2,
      retryDelay: 1,
    });

    expect(result.status).toBe(200);
    expect(result.isAccessible).toBe(true);
    expect(result.networkError).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('无主机权限时网络失败不重试（重试必然同样结果）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    // 模拟未授予主机权限的扩展环境
    vi.stubGlobal('chrome', {
      permissions: {
        contains: vi.fn().mockResolvedValue(false),
      },
    });

    const result = await httpChecker.check('https://blocked.example.com', {
      retries: 2,
      retryDelay: 1,
    });

    expect(result.networkError).toBe(true);
    expect(result.errorKind).toBe('blocked');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('连续多轮超时后标记 unreachable，期间不判失效', async () => {
    const abortError = Object.assign(new Error('signal is aborted without reason'), { name: 'AbortError' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    const node = makeNode('bookmark-timeout', 'https://slow.example.com/page');

    // 前两轮：保持待检查
    await linkHealthService.checkBookmarks([node], { retries: 0 });
    expect((await auxDb.bookmarkMeta.get('bookmark-timeout'))?.linkStatus).toBeUndefined();
    await linkHealthService.checkBookmarks([node], { retries: 0 });
    expect((await auxDb.bookmarkMeta.get('bookmark-timeout'))?.linkStatus).toBeUndefined();

    // 第三轮：连续失败达到阈值，标为无法连接
    await linkHealthService.checkBookmarks([node], { retries: 0 });
    const meta = await auxDb.bookmarkMeta.get('bookmark-timeout');
    expect(meta?.linkStatus).toBe('unreachable');
    // 检查时间有更新（受跳过窗口保护，避免反复重查）
    expect(meta?.linkCheckedAt).toBeGreaterThan(0);

    // 恢复后重新检查 → 回到正常
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      type: 'basic', ok: true, status: 200, url: 'https://slow.example.com/page',
    }));
    await linkHealthService.checkBookmarks([node], { retries: 0, force: true });
    expect((await auxDb.bookmarkMeta.get('bookmark-timeout'))?.linkStatus).toBe('active');
  });

  it('5xx 瞬时故障需连续两轮确认：首轮保持待检查，第二轮才判失效', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      type: 'basic', ok: false, status: 503, url: 'https://deploying.example.com/page',
    }));

    const node = makeNode('bookmark-503', 'https://deploying.example.com/page');

    await linkHealthService.checkBookmarks([node], { retries: 0 });
    expect((await auxDb.bookmarkMeta.get('bookmark-503'))?.linkStatus).toBeUndefined();

    await linkHealthService.checkBookmarks([node], { retries: 0, skipRecentHours: 0 });
    expect((await auxDb.bookmarkMeta.get('bookmark-503'))?.linkStatus).toBe('broken');
  });

  it('429 限流不判为正常也不判失效，保持原状态', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      type: 'basic', ok: false, status: 429, url: 'https://limited.example.com/page',
    }));

    const node = makeNode('bookmark-429', 'https://limited.example.com/page');

    await linkHealthService.checkBookmarks([node], { retries: 0 });

    const meta = await auxDb.bookmarkMeta.get('bookmark-429');
    expect(meta?.linkStatus).toBeUndefined();
    expect(meta?.linkCheckedAt).toBeGreaterThan(0);

    const report = await linkHealthService.getHealthReport([node], {});
    expect(report.healthy).toBe(0);
    expect(report.broken).toBe(0);
    expect(report.pending).toBe(1);
  });

  it('根路径书签检测停放域名：200 但内容为域名出售页判失效', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      htmlResponse('https://parked.example.com/', '<html><title>Domain for Sale</title><body>buy this domain</body></html>')
    ));

    const node = makeNode('bookmark-parked', 'https://parked.example.com/');

    const results = await linkHealthService.checkBookmarks([node], { retries: 0 });

    expect(results[0].status).toBe(200);
    expect(results[0].isAccessible).toBe(false);
    const meta = await auxDb.bookmarkMeta.get('bookmark-parked');
    expect(meta?.linkStatus).toBe('broken');
  });

  it('正文超过阈值的正常页面不触发软 404 误判', async () => {
    const bigBody = '<html><body>' + 'x'.repeat(8192) + ' buy this domain </body></html>';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      htmlResponse('https://normal.example.com/', bigBody)
    ));

    const node = makeNode('bookmark-bigpage', 'https://normal.example.com/');

    await linkHealthService.checkBookmarks([node], { retries: 0 });

    expect((await auxDb.bookmarkMeta.get('bookmark-bigpage'))?.linkStatus).toBe('active');
  });

  it('白名单匹配子域名', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      type: 'basic', ok: true, status: 200, url: 'https://docs.example.com/x',
    });
    vi.stubGlobal('fetch', fetchMock);

    const node = makeNode('bookmark-subdomain', 'https://docs.example.com/x');

    const results = await linkHealthService.checkBookmarks([node], {
      whitelist: ['example.com'],
      retries: 0,
    });

    expect(results).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('无主机权限的失败不写检查时间：授权后不受跳过窗口限制', async () => {
    // 扩展未授予主机权限：fetch 因权限被浏览器拦截
    vi.stubGlobal('chrome', {
      permissions: { contains: vi.fn().mockResolvedValue(false) },
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const node = makeNode('bookmark-noperm', 'https://locked.example.com/page');

    await linkHealthService.checkBookmarks([node], { retries: 0, skipRecentHours: 24 });
    const meta = await auxDb.bookmarkMeta.get('bookmark-noperm');
    // 状态与检查时间都不写：这是一次无效检查
    expect(meta?.linkStatus).toBeUndefined();
    expect(meta?.linkCheckedAt).toBeUndefined();

    // 授权后（contains → true）同一链接在跳过窗口内仍会被重新检查
    vi.stubGlobal('chrome', {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      type: 'basic', ok: true, status: 200, url: 'https://locked.example.com/page',
    }));

    const results = await linkHealthService.checkBookmarks([node], { retries: 0, skipRecentHours: 24 });
    expect(results).toHaveLength(1);
    expect((await auxDb.bookmarkMeta.get('bookmark-noperm'))?.linkStatus).toBe('active');
  });

  it('网络层失败但已检查的链接受跳过窗口保护，避免反复重查', async () => {
    vi.stubGlobal('chrome', {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
    });
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const fetchMock = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal('fetch', fetchMock);

    const node = makeNode('bookmark-slow', 'https://slow2.example.com/page');

    // 第一轮：记录检查时间但保持待检查
    await linkHealthService.checkBookmarks([node], { retries: 0, skipRecentHours: 24 });
    expect((await auxDb.bookmarkMeta.get('bookmark-slow'))?.linkCheckedAt).toBeGreaterThan(0);

    // 24h 窗口内的第二轮：被跳过，不发请求
    fetchMock.mockClear();
    await linkHealthService.checkBookmarks([node], { retries: 0, skipRecentHours: 24 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('classifyLinkStatus 与 nextDomainInterval 的分级行为', () => {
    expect(classifyLinkStatus(200)).toBe('active');
    expect(classifyLinkStatus(301)).toBe('active');
    expect(classifyLinkStatus(401)).toBe('active');
    expect(classifyLinkStatus(403)).toBe('active');
    expect(classifyLinkStatus(408)).toBe('active');
    expect(classifyLinkStatus(429)).toBe('unknown');
    expect(classifyLinkStatus(404)).toBe('broken');
    expect(classifyLinkStatus(410)).toBe('broken');
    expect(classifyLinkStatus(503)).toBe('broken');

    // 限流翻倍封顶，成功减半回落
    expect(nextDomainInterval(250, 429)).toBe(500);
    expect(nextDomainInterval(250, 503)).toBe(500);
    expect(nextDomainInterval(3000, 429)).toBe(4000);
    expect(nextDomainInterval(4000, 429)).toBe(4000);
    expect(nextDomainInterval(1000, 200)).toBe(500);
    expect(nextDomainInterval(500, 200)).toBe(250);
    expect(nextDomainInterval(250, 200)).toBe(250);
    expect(nextDomainInterval(500, 404)).toBe(500);
  });

  it('非 http/https 协议书签（如 javascript:, chrome:// 等）自动跳过，不发网络请求也不误判', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const jsNode = makeNode('bm-js', 'javascript:alert(1)');
    const chromeNode = makeNode('bm-chrome', 'chrome://bookmarks/');
    const normalNode = makeNode('bm-http', 'https://normal.example.com');

    fetchMock.mockResolvedValueOnce({
      type: 'basic',
      ok: true,
      status: 200,
      url: 'https://normal.example.com',
    });

    const progressRef: { total: number; skipped: number; completed: number } = {
      total: 0,
      skipped: 0,
      completed: 0,
    };

    const results = await linkHealthService.checkBookmarks(
      [jsNode, chromeNode, normalNode],
      { retries: 0 },
      (p) => {
        progressRef.total = p.total;
        progressRef.skipped = p.skipped;
        progressRef.completed = p.completed;
      }
    );

    // 只有正常的 http 书签被检查
    expect(results).toHaveLength(1);
    expect(results[0].bookmarkId).toBe('bm-http');
    // fetch 只被正常书签调用，非 http 协议完全跳过
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://normal.example.com', expect.anything());

    // progress 记录正确的 skipped 数量
    expect(progressRef.skipped).toBe(2);
    expect(progressRef.total).toBe(1);

    // 非 http 书签的 meta 不会被写入 broken 或 unreachable
    const jsMeta = await auxDb.bookmarkMeta.get('bm-js');
    expect(jsMeta?.linkStatus).toBeUndefined();
    const chromeMeta = await auxDb.bookmarkMeta.get('bm-chrome');
    expect(chromeMeta?.linkStatus).toBeUndefined();
  });

  it('多域名并发队列在不同域名交替时工作线程不提前退出，全部书签完整检查', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve({
        type: 'basic',
        ok: true,
        status: 200,
        url,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    // 构造 3 个域名，其中 domain1 只有 1 项，domain2 有 3 项，domain3 有 2 项
    const nodes = [
      makeNode('d1-1', 'https://d1.com/page1'),
      makeNode('d2-1', 'https://d2.com/page1'),
      makeNode('d2-2', 'https://d2.com/page2'),
      makeNode('d2-3', 'https://d2.com/page3'),
      makeNode('d3-1', 'https://d3.com/page1'),
      makeNode('d3-2', 'https://d3.com/page2'),
    ];

    const results = await linkHealthService.checkBookmarks(nodes, {
      concurrency: 4,
      retries: 0,
    });

    // 确认所有 6 个书签全部被成功检查，没有 worker 提前退出导致遗漏
    expect(results).toHaveLength(6);
    expect(results.map((r) => r.bookmarkId).sort()).toEqual(nodes.map((n) => n.id).sort());
  });

  it('getHealthReport 只按 meta.linkStatus 聚合，pending 取差值', async () => {
    const nodes = [
      makeNode('1', 'https://a.com'),
      makeNode('2', 'https://b.com'),
      makeNode('3', 'https://c.com'),
      makeNode('4', 'https://d.com'),
    ];
    const meta: Record<string, AuxBookmarkMeta> = {
      '1': baseMeta('1', { linkStatus: 'active' }),
      '2': baseMeta('2', { linkStatus: 'broken' }),
      '3': baseMeta('3', { linkStatus: 'unreachable' }),
      // '4' 没有任何记录 → 计入 pending
    };

    const report = await linkHealthService.getHealthReport(nodes, meta);

    expect(report).toMatchObject({ total: 4, healthy: 1, broken: 1, unreachable: 1, pending: 1 });
    expect(report.byStatus).toEqual({ unknown: 1, healthy: 1, broken: 1, timeout: 1, error: 0 });
  });

  it('getHealthReport 的响应时间与最后检查时间读 meta 冗余字段，不查 linkChecks 历史表', async () => {
    const nodes = [
      makeNode('1', 'https://a.com'),
      makeNode('2', 'https://b.com'),
      makeNode('3', 'https://c.com'),
    ];
    const meta: Record<string, AuxBookmarkMeta> = {
      '1': baseMeta('1', { linkStatus: 'active', linkCheckedAt: 1000, lastResponseTime: 100 }),
      '2': baseMeta('2', { linkStatus: 'broken', linkCheckedAt: 3000, lastResponseTime: 300 }),
      // 检查过但没拿到有效响应时间（0）→ 不参与平均
      '3': baseMeta('3', { linkStatus: 'active', linkCheckedAt: 2000, lastResponseTime: 0 }),
    };

    // 历史表里放一条极端记录：如果报告改成查 linkChecks，这两个断言就会失败
    await auxDb.linkChecks.put({
      id: 'stale-record',
      bookmarkId: '1',
      status: 200,
      isAccessible: true,
      responseTime: 9999,
      checkedAt: 5000,
    });

    const report = await linkHealthService.getHealthReport(nodes, meta);

    expect(report.avgResponseTime).toBe(200); // (100 + 300) / 2
    expect(report.lastCheckedAt).toBe(3000); // 取 meta 里的最大值，而不是历史表的 5000
  });

  it('resetCheckResults 清掉全部检查结果字段，但保留标签、备注与收藏', async () => {    await auxDb.bookmarkMeta.put(
      baseMeta('1', {
        tags: ['前端'],
        notes: '备注',
        isFavorite: true,
        visitCount: 3,
        linkStatus: 'broken',
        linkCheckedAt: 100,
        lastStatusCode: 404,
        lastErrorMessage: '404',
        lastResponseTime: 50,
        linkStatusManual: true,
      })
    );
    await auxDb.linkChecks.put({
      id: 'r1',
      bookmarkId: '1',
      status: 404,
      isAccessible: false,
      responseTime: 50,
      checkedAt: 100,
    });

    await linkHealthService.resetCheckResults();

    const after = await auxDb.bookmarkMeta.get('1');
    expect(after?.tags).toEqual(['前端']);
    expect(after?.notes).toBe('备注');
    expect(after?.isFavorite).toBe(true);
    expect(after?.visitCount).toBe(3);
    // 检查结果相关的字段全部抹掉
    expect(after?.linkStatus).toBeUndefined();
    expect(after?.linkCheckedAt).toBeUndefined();
    expect(after?.lastStatusCode).toBeUndefined();
    expect(after?.lastErrorMessage).toBeUndefined();
    expect(after?.lastResponseTime).toBeUndefined();
    expect(after?.linkStatusManual).toBeUndefined();
    expect(await auxDb.linkChecks.count()).toBe(0);
  });

  it('selectCheckableNodes 按可检测性 / 白名单 / 人工标记 / 跳过窗口筛选候选', () => {
    const nodes = [
      makeNode('1', 'https://a.com/x'),
      makeNode('2', 'javascript:void(0)'),
      makeNode('3', 'https://skip.com/x'),
      makeNode('4', 'https://manual.com/x'),
      makeNode('5', 'https://recent.com/x'),
    ];
    const nowTs = 10_000_000;
    const meta: Record<string, AuxBookmarkMeta> = {
      // 人工标记为正常：自动扫描不应改判
      '4': baseMeta('4', { linkStatusManual: true }),
      // 1 分钟前刚检查过，落在 1 小时跳过窗口内
      '5': baseMeta('5', { linkCheckedAt: nowTs - 60_000 }),
    };

    const picked = selectCheckableNodes(
      nodes,
      meta,
      { whitelist: ['skip.com'], skipRecentHours: 1 },
      nowTs
    );
    expect(picked.map((node) => node.id)).toEqual(['1']);

    // force 只忽略跳过窗口与人工标记，白名单与非 http(s) 依然被过滤
    const forced = selectCheckableNodes(
      nodes,
      meta,
      { whitelist: ['skip.com'], skipRecentHours: 1, force: true },
      nowTs
    );
    expect(forced.map((node) => node.id)).toEqual(['1', '4', '5']);
  });
});
