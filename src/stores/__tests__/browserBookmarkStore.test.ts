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
});
