import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import {
  useBrowserBookmarkStore,
  resetBrowserBookmarkStoreForTesting,
  selectAllTags,
} from '@/stores/browserBookmarkStore';
import { auxDb } from '@/lib/auxDatabase';

// 浏览器书签树 mock 数据
const testTree = {
  id: '0',
  title: '',
  children: [
    {
      id: '1',
      parentId: '0',
      title: '书签栏',
      index: 0,
      children: [
        {
          id: '111',
          parentId: '1',
          title: 'TypeScript 文档',
          url: 'https://www.typescriptlang.org/docs/',
          index: 0,
          dateAdded: 300,
        },
        {
          id: '112',
          parentId: '1',
          title: 'Example',
          url: 'https://example.com',
          index: 1,
          dateAdded: 200,
        },
      ],
    },
  ],
} as unknown as chrome.bookmarks.BookmarkTreeNode;

describe('browserBookmarkStore', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetBrowserBookmarkStoreForTesting();
    await auxDb.delete();
    await auxDb.open();
    vi.mocked(chrome.bookmarks.getTree).mockResolvedValue([testTree]);
    vi.mocked(chrome.bookmarks.create).mockImplementation(async (arg: chrome.bookmarks.BookmarkCreateArg) => ({
      id: `created-${arg.title ?? arg.url}`,
      parentId: arg.parentId ?? '1',
      title: arg.title ?? '',
      url: arg.url,
      index: 0,
    } as chrome.bookmarks.BookmarkTreeNode));
  });

  it('init 加载树快照并订阅事件', async () => {
    const store = useBrowserBookmarkStore;

    await store.getState().init();

    expect(store.getState().isInitialized).toBe(true);
    expect(store.getState().bookmarks).toHaveLength(2);
    expect(store.getState().bookmarks[0].path).toBe('书签栏');
    // 5 类事件均已注册
    expect(chrome.bookmarks.onCreated.addListener).toHaveBeenCalled();
    expect(chrome.bookmarks.onRemoved.addListener).toHaveBeenCalled();
    expect(chrome.bookmarks.onMoved.addListener).toHaveBeenCalled();
    expect(chrome.bookmarks.onChanged.addListener).toHaveBeenCalled();
  });

  it('toggleFavorite 写入 aux 库并更新内存', async () => {
    const store = useBrowserBookmarkStore;
    await store.getState().init();

    await store.getState().toggleFavorite('111');

    const persisted = await auxDb.bookmarkMeta.get('111');
    expect(persisted?.isFavorite).toBe(true);
    expect(store.getState().meta['111']?.isFavorite).toBe(true);

    await store.getState().toggleFavorite('111');
    expect(await auxDb.bookmarkMeta.get('111')).toMatchObject({ isFavorite: false });
  });

  it('addTags 合并去重标签并派生标签统计', async () => {
    const store = useBrowserBookmarkStore;
    await store.getState().init();

    await store.getState().addTags(['111'], ['开发', '文档']);
    await store.getState().addTags(['111'], ['开发', '教程']);
    await store.getState().addTags(['112'], ['开发']);

    expect([...store.getState().meta['111']?.tags ?? []].sort()).toEqual(['开发', '教程', '文档']);

    const tags = selectAllTags(store.getState().meta);
    expect(tags[0]).toEqual({ name: '开发', count: 2 });
  });

  it('addBookmark 拒绝规范化后重复的 URL', async () => {
    const store = useBrowserBookmarkStore;
    await store.getState().init();

    await expect(
      store.getState().addBookmark({ url: 'http://example.com/' })
    ).rejects.toThrow('书签已存在');
    expect(chrome.bookmarks.create).not.toHaveBeenCalled();
  });

  it('removeBookmarks 走认领机制：同 URL 副本存活时元数据合并过去', async () => {
    // 两个同 urlKey 副本：111 带元数据，112 无
    const dupTree = {
      id: '0',
      title: '',
      children: [
        {
          id: '1',
          parentId: '0',
          title: '书签栏',
          index: 0,
          children: [
            { id: '111', parentId: '1', title: 'A', url: 'https://dup.example.com/page', index: 0, dateAdded: 300 },
            { id: '112', parentId: '1', title: 'B', url: 'https://dup.example.com/page', index: 1, dateAdded: 200 },
          ],
        },
      ],
    } as unknown as chrome.bookmarks.BookmarkTreeNode;
    vi.mocked(chrome.bookmarks.getTree).mockResolvedValue([dupTree]);

    const store = useBrowserBookmarkStore;
    await store.getState().init();
    await store.getState().addTags(['111'], ['开发']);
    // 刷新一次回填 urlKey（认领/合并都靠它匹配）
    await store.getState().refresh();

    // 删除 111：之后的树只剩 112（同 urlKey，无自己的元数据）
    const afterRemove = structuredClone(dupTree);
    const bar = afterRemove.children![0];
    bar.children = [bar.children![1]];
    vi.mocked(chrome.bookmarks.getTree).mockResolvedValue([afterRemove]);

    await store.getState().removeBookmarks(['111']);

    expect(chrome.bookmarks.remove).toHaveBeenCalledWith('111');
    // 111 的元数据被 112 认领（标签保留），而不是被直接删掉
    expect(await auxDb.bookmarkMeta.get('111')).toBeUndefined();
    const claimed = await auxDb.bookmarkMeta.get('112');
    expect(claimed?.tags).toEqual(['开发']);
  });

  it('removeBookmarks 无同 URL 副本时保留元数据等待认领窗口', async () => {
    const store = useBrowserBookmarkStore;
    await store.getState().init();
    await store.getState().addTags(['112'], ['孤立']);
    // 再刷新一次让 112 的行回填 urlKey（否则按旧数据处理直接清理）
    await store.getState().refresh();

    // 删除 112 后书签栏为空
    const emptyTree = structuredClone(testTree);
    emptyTree.children![0].children = [];
    vi.mocked(chrome.bookmarks.getTree).mockResolvedValue([emptyTree]);

    await store.getState().removeBookmarks(['112']);

    // 90 天认领窗口内元数据保留（带 orphanedAt），不直接删
    const orphan = await auxDb.bookmarkMeta.get('112');
    expect(orphan?.tags).toEqual(['孤立']);
    expect(orphan?.orphanedAt).toBeGreaterThan(0);
  });

  it('refresh 清理已不存在书签的孤儿元数据', async () => {
    await auxDb.bookmarkMeta.put({
      bookmarkId: 'gone-bookmark',
      tags: ['旧标签'],
      isFavorite: true,
      visitCount: 0,
    });

    await useBrowserBookmarkStore.getState().refresh();

    expect(await auxDb.bookmarkMeta.get('gone-bookmark')).toBeUndefined();
  });

  it('并发 refresh 单飞合并：执行期间的新请求完成后尾随补刷一次', async () => {
    let release!: (v: chrome.bookmarks.BookmarkTreeNode[]) => void;
    vi.mocked(chrome.bookmarks.getTree).mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve))
    );
    const store = useBrowserBookmarkStore;

    const p1 = store.getState().refresh();
    const p2 = store.getState().refresh();
    release([testTree]);
    await Promise.all([p1, p2]);

    // 共享执行 1 次 + 执行期间排队请求的尾随补刷 1 次（不会并发打两次）
    expect(chrome.bookmarks.getTree).toHaveBeenCalledTimes(2);
  });

  it('init 时首屏快照失败：错误可见且 loading 复位', async () => {
    vi.mocked(chrome.bookmarks.getTree).mockRejectedValueOnce(new Error('bookmarks api 不可用'));

    await useBrowserBookmarkStore.getState().init();

    // 注：refresh 内部吞错只写 error，不向外抛，因此 init 仍标记
    // isInitialized=true（视图层靠 error 展示失败并可手动重试）
    expect(useBrowserBookmarkStore.getState().error).toBe('bookmarks api 不可用');
    expect(useBrowserBookmarkStore.getState().isLoading).toBe(false);
  });

  it('书签事件去抖 150ms 后整树重载', async () => {
    vi.useFakeTimers();
    try {
      await useBrowserBookmarkStore.getState().init();
      vi.mocked(chrome.bookmarks.getTree).mockClear();

      const listener = vi.mocked(chrome.bookmarks.onCreated.addListener).mock.calls[0][0] as () => void;
      listener();
      listener();
      expect(chrome.bookmarks.getTree).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(151);
      expect(chrome.bookmarks.getTree).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('后台自动扫描完成（storage 变更带 lastFinishedAt）时自动刷新', async () => {
    const storage = chrome.storage as unknown as Record<string, unknown>;
    const onChanged = { addListener: vi.fn() };
    const original = storage.onChanged;
    storage.onChanged = onChanged;
    try {
      await useBrowserBookmarkStore.getState().init();
      vi.mocked(chrome.bookmarks.getTree).mockClear();

      const watcher = onChanged.addListener.mock.calls[0][0] as (
        changes: Record<string, { newValue?: unknown }>,
        area: string
      ) => void;
      watcher({ linkHealthAutoScanProgress: { newValue: { lastFinishedAt: Date.now() } } }, 'local');
      await vi.waitFor(() => expect(chrome.bookmarks.getTree).toHaveBeenCalled());

      // 非本次关心的键 / 非本地区域不触发
      vi.mocked(chrome.bookmarks.getTree).mockClear();
      watcher({ other_key: { newValue: { lastFinishedAt: 1 } } }, 'local');
      watcher({ linkHealthAutoScanProgress: { newValue: { lastFinishedAt: 2 } } }, 'sync');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(chrome.bookmarks.getTree).not.toHaveBeenCalled();
    } finally {
      storage.onChanged = original;
    }
  });
});

describe('browserBookmarkStore CRUD 与元数据透传', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetBrowserBookmarkStoreForTesting();
    await auxDb.delete();
    await auxDb.open();
    vi.mocked(chrome.bookmarks.getTree).mockResolvedValue([testTree]);
  });

  it('updateBookmark / moveBookmarks / createFolder / removeFolder 透传并刷新', async () => {
    const store = useBrowserBookmarkStore;
    await store.getState().init();
    vi.mocked(chrome.bookmarks.getTree).mockClear();

    await store.getState().updateBookmark('111', { title: 'TS 文档' });
    expect(chrome.bookmarks.update).toHaveBeenCalledWith('111', { title: 'TS 文档' });

    await store.getState().moveBookmarks(['111', '112'], '2');
    expect(chrome.bookmarks.move).toHaveBeenCalledTimes(2);

    await store.getState().createFolder('新文件夹', '1');
    expect(chrome.bookmarks.create).toHaveBeenCalledWith({ title: '新文件夹', parentId: '1' });

    await store.getState().removeFolder('1');
    expect(chrome.bookmarks.removeTree).toHaveBeenCalledWith('1');
    // 每个操作后各刷新一次
    expect(chrome.bookmarks.getTree).toHaveBeenCalledTimes(4);
  });

  it('removeBookmarks 清理选中集合', async () => {
    const store = useBrowserBookmarkStore;
    await store.getState().init();
    useBrowserBookmarkStore.setState({ selectedIds: new Set(['111', '112']) });

    await store.getState().removeBookmarks(['111']);

    expect(useBrowserBookmarkStore.getState().selectedIds.has('111')).toBe(false);
    expect(useBrowserBookmarkStore.getState().selectedIds.has('112')).toBe(true);
  });

  it('removeTag 只移除目标标签；setNotes 空串归一为 undefined', async () => {
    const store = useBrowserBookmarkStore;
    await store.getState().init();
    await store.getState().addTags(['111'], ['a', 'b']);

    await store.getState().removeTag('111', 'a');
    expect(store.getState().meta['111']?.tags).toEqual(['b']);

    await store.getState().setNotes('111', '');
    expect(store.getState().meta['111']?.notes).toBeUndefined();
    await store.getState().setNotes('111', '备注');
    expect(store.getState().meta['111']?.notes).toBe('备注');
  });

  it('recordVisit 计数递增并记录最近访问时间', async () => {
    const store = useBrowserBookmarkStore;
    await store.getState().init();

    await store.getState().recordVisit('111');
    await store.getState().recordVisit('111');

    const meta = store.getState().meta['111'];
    expect(meta?.visitCount).toBe(2);
    expect(meta?.lastVisited).toBeGreaterThan(0);
  });
});

describe('browserBookmarkStore 视图状态', () => {
  beforeEach(() => {
    resetBrowserBookmarkStoreForTesting();
  });

  it('快速过滤与文件夹视图互斥，clearFilters 全部复位', () => {
    const store = useBrowserBookmarkStore;

    store.getState().setCurrentFolder('1');
    expect(store.getState().currentFolderId).toBe('1');

    // 切快速视图即退出文件夹
    store.getState().setFilter('favorites', '开发');
    expect(store.getState().filter).toBe('favorites');
    expect(store.getState().selectedTag).toBe('开发');
    expect(store.getState().currentFolderId).toBeUndefined();

    // 进文件夹则退出快速视图
    store.getState().setCurrentFolder('2');
    expect(store.getState().filter).toBe('all');
    expect(store.getState().selectedTag).toBeUndefined();

    store.getState().setSearchQuery('关键词');
    store.getState().clearFilters();
    expect(store.getState().searchQuery).toBe('');
    expect(store.getState().currentFolderId).toBeUndefined();
    expect(store.getState().filter).toBe('all');
  });

  it('toggleSelect 切换与 clearSelection 清空', () => {
    const store = useBrowserBookmarkStore;

    store.getState().toggleSelect('111');
    expect(store.getState().selectedIds.has('111')).toBe(true);
    store.getState().toggleSelect('111');
    expect(store.getState().selectedIds.has('111')).toBe(false);

    store.getState().toggleSelect('112');
    store.getState().clearSelection();
    expect(store.getState().selectedIds.size).toBe(0);
  });
});
