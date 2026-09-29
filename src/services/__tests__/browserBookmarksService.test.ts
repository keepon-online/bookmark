import { describe, expect, it, vi } from 'vitest';
import {
  BrowserBookmarksService,
  type BookmarksApi,
} from '@/services/browserBookmarksService';
import type { BrowserBookmarkNode } from '@/types';

// 构造测试用的浏览器书签树
function buildTestTree(): chrome.bookmarks.BookmarkTreeNode {
  const urlNode = (
    id: string,
    parentId: string,
    title: string,
    url: string,
    index: number,
    dateAdded: number
  ): chrome.bookmarks.BookmarkTreeNode => ({
    id,
    parentId,
    title,
    url,
    index,
    dateAdded,
  });

  return {
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
            id: '11',
            parentId: '1',
            title: '开发',
            index: 0,
            children: [
              urlNode('111', '11', 'TypeScript 文档', 'https://www.typescriptlang.org/docs/', 0, 300),
            ],
          },
          urlNode('112', '1', 'Example', 'https://example.com', 1, 200),
        ],
      },
      {
        id: '2',
        parentId: '0',
        title: '其他书签',
        index: 1,
        children: [urlNode('21', '2', 'Other', 'https://other.example.com', 0, 100)],
      },
    ],
  } as chrome.bookmarks.BookmarkTreeNode;
}

function nodeById(root: chrome.bookmarks.BookmarkTreeNode, id: string): chrome.bookmarks.BookmarkTreeNode | undefined {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = nodeById(child, id);
    if (found) return found;
  }
  return undefined;
}

type FakeCallback = (...args: never[]) => void;

function createFakeApi(root: chrome.bookmarks.BookmarkTreeNode): BookmarksApi & {
  createMock: ReturnType<typeof vi.fn>;
  removeMock: ReturnType<typeof vi.fn>;
  listenerBuckets: Record<string, Set<FakeCallback>>;
} {
  const listenerBuckets: Record<string, Set<FakeCallback>> = {
    created: new Set(),
    removed: new Set(),
    changed: new Set(),
    moved: new Set(),
    reordered: new Set(),
  };

  const makeEvent = (bucket: keyof typeof listenerBuckets) => ({
    addListener: (callback: FakeCallback) => listenerBuckets[bucket].add(callback),
    removeListener: (callback: FakeCallback) => listenerBuckets[bucket].delete(callback),
  });

  const createMock = vi.fn(async (arg: chrome.bookmarks.BookmarkCreateArg) => ({
    id: `new-${arg.title ?? arg.url}`,
    parentId: arg.parentId,
    title: arg.title ?? '',
    url: arg.url,
    index: 0,
  } as chrome.bookmarks.BookmarkTreeNode));

  const removeMock = vi.fn(async () => undefined);

  return {
    getTree: async () => [root],
    getChildren: async (id: string) => nodeById(root, id)?.children ?? [],
    create: createMock,
    update: async (id, changes) => ({ id, ...changes } as chrome.bookmarks.BookmarkTreeNode),
    move: async (id, destination) => ({ id, ...destination } as chrome.bookmarks.BookmarkTreeNode),
    remove: removeMock,
    removeTree: removeMock,
    onCreated: makeEvent('created'),
    onRemoved: makeEvent('removed'),
    onChanged: makeEvent('changed'),
    onMoved: makeEvent('moved'),
    onChildrenReordered: makeEvent('reordered'),
    createMock,
    removeMock,
    listenerBuckets,
  };
}

describe('browserBookmarksService', () => {
  it('loadTree 规范化树结构并计算路径', async () => {
    const service = new BrowserBookmarksService(createFakeApi(buildTestTree()));

    const snapshot = await service.loadTree();

    // 顶层根：书签栏 + 其他书签（虚拟根 '0' 不出现）
    expect(snapshot.tree.map((node) => node.id)).toEqual(['1', '2']);
    expect(snapshot.folders.map((folder) => folder.id)).toEqual(['1', '11', '2']);
    expect(snapshot.bookmarks.map((bookmark) => bookmark.id)).toEqual(['111', '112', '21']);

    const byId = new Map(snapshot.bookmarks.map((b) => [b.id, b]));
    expect(byId.get('111')?.path).toBe('书签栏/开发');
    expect(byId.get('112')?.path).toBe('书签栏');
    expect(byId.get('21')?.path).toBe('其他书签');

    const devFolder = snapshot.folders.find((folder) => folder.id === '11');
    expect(devFolder?.path).toBe('书签栏');
  });

  it('ensureFolderPath 复用已有文件夹并按需创建缺失层级', async () => {
    const api = createFakeApi(buildTestTree());
    const service = new BrowserBookmarksService(api);

    // 书签栏下的 "开发" 已存在，直接复用
    const existingId = await service.ensureFolderPath(['开发']);
    expect(existingId).toBe('11');
    expect(api.createMock).not.toHaveBeenCalled();

    // "设计" 不存在，需要创建
    const createdId = await service.ensureFolderPath(['设计']);
    expect(api.createMock).toHaveBeenCalledWith({ parentId: '1', title: '设计' });
    expect(createdId).toBe('new-设计');
  });

  it('groupDuplicates 按规范化 URL 分组并建议保留最新添加', () => {
    const node = (id: string, url: string, dateAdded: number): BrowserBookmarkNode => ({
      id,
      parentId: '1',
      title: id,
      url,
      index: 0,
      dateAdded,
      path: '书签栏',
    });

    const groups = BrowserBookmarksService.groupDuplicates([
      node('a', 'https://example.com/page/', 100),
      node('b', 'http://www.example.com/page', 300),
      node('c', 'https://example.com/page', 200),
      node('d', 'https://unique.com', 50),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].keepId).toBe('b');
    expect(groups[0].bookmarks.map((bookmark) => bookmark.id)).toEqual(['b', 'c', 'a']);
  });

  it('groupDuplicates 智能保留策略优先保留被收藏或带标签的书签', () => {
    const node = (id: string, url: string, dateAdded: number, path = '书签栏'): BrowserBookmarkNode => ({
      id,
      parentId: '1',
      title: id,
      url,
      index: 0,
      dateAdded,
      path,
    });

    const meta: Record<string, any> = {
      a: { bookmarkId: 'a', tags: ['工作', '必看'], isFavorite: false, visitCount: 5 },
      b: { bookmarkId: 'b', tags: [], isFavorite: false, visitCount: 0 },
      c: { bookmarkId: 'c', tags: [], isFavorite: true, visitCount: 1 },
    };

    // 虽然 b 最新 (300)，但是 c 是收藏项 (+1000)，a 有2个标签 (+200)
    const groups = BrowserBookmarksService.groupDuplicates(
      [
        node('a', 'https://example.com/test', 100, '书签栏/项目'),
        node('b', 'https://example.com/test', 300, '书签栏'),
        node('c', 'https://example.com/test', 200, '书签栏'),
      ],
      meta,
      'smart'
    );

    expect(groups[0].keepId).toBe('c');
    expect(groups[0].bookmarks.map((b) => b.id)).toEqual(['c', 'a', 'b']);

    // 当指定 'oldest' 策略时，应当保留最早添加的 'a' (dateAdded: 100)
    const oldestGroups = BrowserBookmarksService.groupDuplicates(
      [
        node('a', 'https://example.com/test', 100),
        node('b', 'https://example.com/test', 300),
        node('c', 'https://example.com/test', 200),
      ],
      meta,
      'oldest'
    );
    expect(oldestGroups[0].keepId).toBe('a');
  });

  it('findEmptyFolders 只返回既无书签也无子文件夹的叶子文件夹', () => {
    const folder = (id: string, parentId: string): BrowserBookmarkNode => ({
      id,
      parentId,
      title: id,
      index: 0,
      path: '',
    });
    const bookmark = (id: string, parentId: string): BrowserBookmarkNode => ({
      id,
      parentId,
      title: id,
      url: `https://${id}.com`,
      index: 0,
      path: '',
    });

    const folders = [folder('1', '0'), folder('11', '1'), folder('12', '1'), folder('2', '0')];
    const bookmarks = [bookmark('112', '11')]; // '11' 有书签，'12' 与 '2' 为空

    const empty = BrowserBookmarksService.findEmptyFolders(folders, bookmarks);
    // '12' 是叶子空文件夹；'2' 无子无书签；'1' 有子文件夹，不算空
    expect(empty.map((folderNode) => folderNode.id).sort()).toEqual(['12', '2']);
  });

  it('subscribe 注册全部事件监听，取消订阅后全部移除', () => {
    const api = createFakeApi(buildTestTree());
    const service = new BrowserBookmarksService(api);
    const onEvent = vi.fn();

    const unsubscribe = service.subscribe(onEvent);

    for (const bucket of Object.values(api.listenerBuckets)) {
      expect(bucket.size).toBe(1);
    }

    unsubscribe();

    for (const bucket of Object.values(api.listenerBuckets)) {
      expect(bucket.size).toBe(0);
    }
  });
});
