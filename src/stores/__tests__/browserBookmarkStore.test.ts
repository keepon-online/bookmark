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
    ).rejects.toThrow('Bookmark already exists');
    expect(chrome.bookmarks.create).not.toHaveBeenCalled();
  });

  it('removeBookmarks 调用浏览器删除并清理 aux 元数据', async () => {
    const store = useBrowserBookmarkStore;
    await store.getState().init();
    await store.getState().addTags(['111'], ['开发']);

    await store.getState().removeBookmarks(['111']);

    expect(chrome.bookmarks.remove).toHaveBeenCalledWith('111');
    expect(await auxDb.bookmarkMeta.get('111')).toBeUndefined();
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
