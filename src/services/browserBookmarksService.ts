// 浏览器书签服务：chrome.bookmarks 的薄封装
// 树加载/规范化、事件订阅、CRUD 透传、按路径确保文件夹、重复检测

import { getUrlKey } from '@/lib/utils';
import type {
  BrowserBookmarkNode,
  BrowserTreeNode,
  BrowserTreeSnapshot,
  BrowserDuplicateGroup,
} from '@/types';

// Chrome 书签树的固定根节点
export const ROOT_ID = '0';
export const BOOKMARK_BAR_ID = '1';
export const OTHER_BOOKMARKS_ID = '2';

// 浏览器书签事件（规范化后），任何事件都意味着树需要重载
export type BrowserBookmarkEvent =
  | { kind: 'created'; id: string }
  | { kind: 'removed'; id: string }
  | { kind: 'changed'; id: string }
  | { kind: 'moved'; id: string }
  | { kind: 'reordered'; id: string };

type EventLike<TArgs extends unknown[]> = {
  addListener: (callback: (...args: TArgs) => void) => void;
  removeListener: (callback: (...args: TArgs) => void) => void;
};

// chrome.bookmarks 的结构化子集，便于测试注入
export interface BookmarksApi {
  getTree: () => Promise<chrome.bookmarks.BookmarkTreeNode[]>;
  getChildren: (id: string) => Promise<chrome.bookmarks.BookmarkTreeNode[]>;
  create: (
    bookmark: chrome.bookmarks.BookmarkCreateArg
  ) => Promise<chrome.bookmarks.BookmarkTreeNode>;
  update: (
    id: string,
    changes: { title?: string; url?: string }
  ) => Promise<chrome.bookmarks.BookmarkTreeNode>;
  move: (
    id: string,
    destination: { parentId?: string; index?: number }
  ) => Promise<chrome.bookmarks.BookmarkTreeNode>;
  remove: (id: string) => Promise<void>;
  removeTree: (id: string) => Promise<void>;
  onCreated: EventLike<[string, chrome.bookmarks.BookmarkTreeNode]>;
  onRemoved: EventLike<[string, chrome.bookmarks.BookmarkRemoveInfo]>;
  onChanged: EventLike<[string, chrome.bookmarks.BookmarkChangeInfo]>;
  onMoved: EventLike<[string, chrome.bookmarks.BookmarkMoveInfo]>;
  onChildrenReordered: EventLike<[string, chrome.bookmarks.BookmarkReorderInfo]>;
}

export class BrowserBookmarksService {
  constructor(private readonly api: BookmarksApi) {}

  // 加载并规范化整棵书签树
  async loadTree(): Promise<BrowserTreeSnapshot> {
    const [root] = await this.api.getTree();
    if (!root) {
      return { tree: [], bookmarks: [], folders: [] };
    }

    const tree: BrowserTreeNode[] = [];
    const bookmarks: BrowserBookmarkNode[] = [];
    const folders: BrowserBookmarkNode[] = [];

    const buildFolder = (
      node: chrome.bookmarks.BookmarkTreeNode,
      parentPath: string
    ): BrowserTreeNode => {
      const treeNode: BrowserTreeNode = {
        id: node.id,
        parentId: node.parentId ?? '',
        title: node.title,
        index: node.index ?? 0,
        dateAdded: node.dateAdded,
        path: parentPath,
        children: [],
      };
      folders.push(treeNode);

      const currentPath = parentPath ? `${parentPath}/${node.title}` : node.title;
      for (const child of node.children ?? []) {
        if (child.url) {
          const bookmarkNode: BrowserTreeNode = {
            id: child.id,
            parentId: child.parentId ?? '',
            title: child.title,
            url: child.url,
            index: child.index ?? 0,
            dateAdded: child.dateAdded,
            path: currentPath,
            children: [],
          };
          treeNode.children.push(bookmarkNode);
          bookmarks.push(bookmarkNode);
        } else if (child.id !== ROOT_ID) {
          treeNode.children.push(buildFolder(child, currentPath));
        }
      }
      return treeNode;
    };

    // 根节点 '0' 是虚拟节点，只展开其子根（书签栏、其他书签）
    for (const child of root.children ?? []) {
      if (child.id !== ROOT_ID) {
        tree.push(buildFolder(child, ''));
      }
    }

    return { tree, bookmarks, folders };
  }

  // 订阅浏览器书签事件，返回取消订阅函数
  subscribe(onEvent: (event: BrowserBookmarkEvent) => void): () => void {
    const unsubscribers: Array<() => void> = [];

    const register = <TArgs extends unknown[]>(
      event: EventLike<TArgs>,
      map: (...args: TArgs) => BrowserBookmarkEvent
    ) => {
      const callback = (...args: TArgs) => onEvent(map(...args));
      event.addListener(callback);
      unsubscribers.push(() => event.removeListener(callback));
    };

    register(this.api.onCreated, (id) => ({ kind: 'created', id }));
    register(this.api.onRemoved, (id) => ({ kind: 'removed', id }));
    register(this.api.onChanged, (id) => ({ kind: 'changed', id }));
    register(this.api.onMoved, (id) => ({ kind: 'moved', id }));
    register(this.api.onChildrenReordered, (id) => ({ kind: 'reordered', id }));

    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  }

  // 创建书签（默认进书签栏）
  async createBookmark(input: {
    url: string;
    title?: string;
    parentId?: string;
  }): Promise<chrome.bookmarks.BookmarkTreeNode> {
    return this.api.create({
      url: input.url,
      title: input.title ?? input.url,
      parentId: input.parentId ?? BOOKMARK_BAR_ID,
    });
  }

  // 创建文件夹
  async createFolder(
    title: string,
    parentId: string = BOOKMARK_BAR_ID
  ): Promise<chrome.bookmarks.BookmarkTreeNode> {
    return this.api.create({ title, parentId });
  }

  // 更新书签标题/URL
  async updateBookmark(
    id: string,
    changes: { title?: string; url?: string }
  ): Promise<chrome.bookmarks.BookmarkTreeNode> {
    return this.api.update(id, changes);
  }

  // 移动书签或文件夹
  async moveBookmark(
    id: string,
    parentId: string,
    index?: number
  ): Promise<chrome.bookmarks.BookmarkTreeNode> {
    return this.api.move(id, index !== undefined ? { parentId, index } : { parentId });
  }

  // 删除书签（URL 节点用 remove，文件夹用 removeTree）
  async remove(id: string, isFolder: boolean): Promise<void> {
    if (isFolder) {
      return this.api.removeTree(id);
    }
    return this.api.remove(id);
  }

  // 按路径确保文件夹存在（逐级查找或创建），返回目标文件夹 id
  async ensureFolderPath(
    segments: string[],
    rootId: string = BOOKMARK_BAR_ID
  ): Promise<string> {
    let currentId = rootId;
    for (const segment of segments.filter(Boolean)) {
      const children = await this.api.getChildren(currentId);
      const existing = children.find((child) => !child.url && child.title === segment);
      if (existing) {
        currentId = existing.id;
      } else {
        const created = await this.api.create({ parentId: currentId, title: segment });
        currentId = created.id;
      }
    }
    return currentId;
  }

  // 按规范化 URL 分组检测重复书签（纯函数）
  static groupDuplicates(bookmarks: BrowserBookmarkNode[]): BrowserDuplicateGroup[] {
    const groups = new Map<string, BrowserBookmarkNode[]>();
    for (const bookmark of bookmarks) {
      if (!bookmark.url) continue;
      const urlKey = getUrlKey(bookmark.url);
      const existing = groups.get(urlKey) ?? [];
      existing.push(bookmark);
      groups.set(urlKey, existing);
    }

    const duplicates: BrowserDuplicateGroup[] = [];
    for (const [urlKey, nodes] of groups) {
      if (nodes.length < 2) continue;
      const sorted = [...nodes].sort((a, b) => (b.dateAdded ?? 0) - (a.dateAdded ?? 0));
      duplicates.push({
        urlKey,
        url: sorted[0].url!,
        bookmarks: sorted,
        keepId: sorted[0].id,
      });
    }
    return duplicates;
  }

  // 检测空文件夹（叶子文件夹优先返回）
  static findEmptyFolders(folders: BrowserBookmarkNode[], bookmarks: BrowserBookmarkNode[]): BrowserBookmarkNode[] {
    const foldersWithBookmarks = new Set(bookmarks.map((b) => b.parentId));
    const foldersWithChildren = new Set(folders.map((f) => f.parentId));
    return folders.filter(
      (folder) =>
        !foldersWithBookmarks.has(folder.id) && !foldersWithChildren.has(folder.id)
    );
  }
}

// 默认单例（绑定真实 chrome API；测试中可另行构造实例注入 mock）
export const browserBookmarks =
  typeof chrome !== 'undefined' && chrome.bookmarks
    ? new BrowserBookmarksService(chrome.bookmarks as unknown as BookmarksApi)
    : new BrowserBookmarksService({} as BookmarksApi);
