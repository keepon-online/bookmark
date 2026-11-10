// 浏览器书签状态管理
// v0.6 核心：chrome.bookmarks 是唯一数据源，本 store 持有整树快照，
// 靠浏览器书签事件（去抖重载）保持同步；增强元数据（标签/收藏/备注）存 aux 库。

import { create } from 'zustand';
import { browserBookmarks } from '@/services/browserBookmarksService';
import { auxDb, defaultMeta, reconcileMeta } from '@/lib/auxDatabase';
import { getUrlKey, now } from '@/lib/utils';
import type {
  AuxBookmarkMeta,
  BrowserBookmarkFilter,
  BrowserBookmarkNode,
  BrowserTreeNode,
} from '@/types';

interface BrowserBookmarkState {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;

  tree: BrowserTreeNode[];
  bookmarks: BrowserBookmarkNode[];
  folders: BrowserBookmarkNode[];
  meta: Record<string, AuxBookmarkMeta>;

  // 视图状态
  searchQuery: string;
  currentFolderId?: string;
  filter: BrowserBookmarkFilter;
  selectedTag?: string;
  selectedIds: Set<string>;

  // 生命周期
  init: () => Promise<void>;
  refresh: () => Promise<void>;

  // 视图操作
  setSearchQuery: (query: string) => void;
  setCurrentFolder: (folderId?: string) => void;
  setFilter: (filter: BrowserBookmarkFilter, tag?: string) => void;
  clearFilters: () => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;

  // 书签操作（直写 chrome.bookmarks）
  addBookmark: (input: { url: string; title?: string; parentId?: string }) => Promise<void>;
  updateBookmark: (id: string, changes: { title?: string; url?: string }) => Promise<void>;
  moveBookmarks: (ids: string[], parentId: string) => Promise<void>;
  removeBookmarks: (ids: string[]) => Promise<void>;
  removeFolder: (folderId: string) => Promise<void>;
  createFolder: (title: string, parentId?: string) => Promise<void>;

  // 元数据操作（写 aux 库）
  toggleFavorite: (id: string) => Promise<void>;
  addTags: (ids: string[], tags: string[]) => Promise<void>;
  removeTag: (id: string, tag: string) => Promise<void>;
  setNotes: (id: string, notes: string) => Promise<void>;
  recordVisit: (id: string) => Promise<void>;
}

// 模块级订阅句柄：多个入口 init 只订阅一次
let unsubscribeEvents: (() => void) | null = null;
let reloadTimer: ReturnType<typeof setTimeout> | null = null;

const EVENT_RELOAD_DEBOUNCE_MS = 150;

async function loadMetaMap(): Promise<Record<string, AuxBookmarkMeta>> {
  const rows = await auxDb.bookmarkMeta.toArray();
  const map: Record<string, AuxBookmarkMeta> = {};
  for (const row of rows) {
    map[row.bookmarkId] = row;
  }
  return map;
}

// 事务内读-改-写元数据：多个上下文（popup/sidepanel/后台/整理）并发写
// 同一行时不再用各自的内存快照整行覆盖——那会把别的写入者刚提交的
// 字段回滚掉。标签合并、计数递增这类需要读到最新值的操作必须走这里
async function mutateMeta(
  id: string,
  mutate: (meta: AuxBookmarkMeta) => AuxBookmarkMeta
): Promise<AuxBookmarkMeta> {
  return auxDb.transaction('rw', auxDb.bookmarkMeta, async () => {
    const current = (await auxDb.bookmarkMeta.get(id)) ?? defaultMeta(id);
    const next = mutate(current);
    await auxDb.bookmarkMeta.put(next);
    return next;
  });
}

export const useBrowserBookmarkStore = create<BrowserBookmarkState>((set, get) => ({
  isInitialized: false,
  isLoading: false,
  error: null,

  tree: [],
  bookmarks: [],
  folders: [],
  meta: {},

  searchQuery: '',
  filter: 'all',
  selectedIds: new Set<string>(),

  init: async () => {
    set({ isLoading: true });
    try {
      await get().refresh();
      // 订阅浏览器书签事件：任何变化去抖后整树重载（getTree 毫秒级，可靠性优先）
      if (!unsubscribeEvents) {
        unsubscribeEvents = browserBookmarks.subscribe(() => {
          if (reloadTimer) {
            clearTimeout(reloadTimer);
          }
          reloadTimer = setTimeout(() => {
            void get().refresh();
          }, EVENT_RELOAD_DEBOUNCE_MS);
        });
      }
      set({ isInitialized: true });
    } catch (error) {
      set({ error: (error as Error).message });
    } finally {
      set({ isLoading: false });
    }
  },

  refresh: async () => {
    try {
      const snapshot = await browserBookmarks.loadTree();

      // 先把元数据与书签树对账：认领可回收的（书签被重加/换设备同步）、
      // 补齐 urlKey、清理真正失效的孤儿；然后再读成 map，避免读到刚被清理的行
      await reconcileMeta(snapshot.bookmarks);
      const meta = await loadMetaMap();

      set({
        tree: snapshot.tree,
        bookmarks: snapshot.bookmarks,
        folders: snapshot.folders,
        meta,
        error: null,
      });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
  setCurrentFolder: (folderId) => set({ currentFolderId: folderId, filter: 'all', selectedTag: undefined }),
  // 快速过滤与文件夹视图互斥：切快速视图即退出文件夹，
  // 否则 currentFolderId 仍限定列表，"全部书签"按钮表现为无效点击
  setFilter: (filter, tag) => set({ filter, selectedTag: tag, currentFolderId: undefined }),
  clearFilters: () =>
    set({ searchQuery: '', currentFolderId: undefined, filter: 'all', selectedTag: undefined }),

  toggleSelect: (id) => {
    const selectedIds = new Set(get().selectedIds);
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
    } else {
      selectedIds.add(id);
    }
    set({ selectedIds });
  },
  clearSelection: () => set({ selectedIds: new Set<string>() }),

  addBookmark: async (input) => {
    const urlKey = getUrlKey(input.url);
    const existing = get().bookmarks.find(
      (bookmark) => bookmark.url && getUrlKey(bookmark.url) === urlKey
    );
    if (existing) {
      throw new Error('书签已存在');
    }
    await browserBookmarks.createBookmark(input);
    await get().refresh();
  },

  updateBookmark: async (id, changes) => {
    await browserBookmarks.updateBookmark(id, changes);
    await get().refresh();
  },

  moveBookmarks: async (ids, parentId) => {
    for (const id of ids) {
      await browserBookmarks.moveBookmark(id, parentId);
    }
    await get().refresh();
  },

  removeBookmarks: async (ids) => {
    const folderIds = new Set(get().folders.map((folder) => folder.id));
    for (const id of ids) {
      await browserBookmarks.remove(id, folderIds.has(id));
    }
    // 不直接删元数据：refresh 内的 reconcileMeta 会按 urlKey 处理——
    // 同链接副本仍存活时合并标签/收藏到存活方，无副本则留 90 天认领窗口。
    // 直接 bulkDelete 会把查重清理场景下要保留的元数据一起删掉
    await get().refresh();
    set((state) => {
      const selectedIds = new Set(state.selectedIds);
      ids.forEach((id) => selectedIds.delete(id));
      return { selectedIds };
    });
  },

  removeFolder: async (folderId) => {
    await browserBookmarks.remove(folderId, true);
    await get().refresh();
  },

  createFolder: async (title, parentId) => {
    await browserBookmarks.createFolder(title, parentId);
    await get().refresh();
  },

  toggleFavorite: async (id) => {
    const next = await mutateMeta(id, (current) => ({
      ...current,
      isFavorite: !current.isFavorite,
    }));
    set({ meta: { ...get().meta, [id]: next } });
  },

  addTags: async (ids, tags) => {
    const meta = { ...get().meta };
    for (const id of ids) {
      meta[id] = await mutateMeta(id, (current) => ({
        ...current,
        tags: [...new Set([...current.tags, ...tags])],
      }));
    }
    set({ meta });
  },

  removeTag: async (id, tag) => {
    const next = await mutateMeta(id, (current) => ({
      ...current,
      tags: current.tags.filter((t) => t !== tag),
    }));
    set({ meta: { ...get().meta, [id]: next } });
  },

  setNotes: async (id, notes) => {
    const next = await mutateMeta(id, (current) => ({
      ...current,
      notes: notes || undefined,
    }));
    set({ meta: { ...get().meta, [id]: next } });
  },

  recordVisit: async (id) => {
    const next = await mutateMeta(id, (current) => ({
      ...current,
      visitCount: current.visitCount + 1,
      lastVisited: now(),
    }));
    set({ meta: { ...get().meta, [id]: next } });
  },
}));

// 派生：全部标签及使用次数（按次数降序）
export function selectAllTags(meta: Record<string, AuxBookmarkMeta>): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const record of Object.values(meta)) {
    for (const tag of record.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

// 仅测试使用：重置状态并取消事件订阅
export function resetBrowserBookmarkStoreForTesting(): void {
  if (reloadTimer) {
    clearTimeout(reloadTimer);
    reloadTimer = null;
  }
  if (unsubscribeEvents) {
    unsubscribeEvents();
    unsubscribeEvents = null;
  }
  useBrowserBookmarkStore.setState({
    isInitialized: false,
    isLoading: false,
    error: null,
    tree: [],
    bookmarks: [],
    folders: [],
    meta: {},
    searchQuery: '',
    currentFolderId: undefined,
    filter: 'all',
    selectedTag: undefined,
    selectedIds: new Set<string>(),
  });
}
