// 书签状态管理

import { create } from 'zustand';
import { bookmarkService, searchService } from '@/services';
import type { Bookmark, CreateBookmarkDTO, UpdateBookmarkDTO } from '@/types';

interface BookmarkState {
  // 状态
  bookmarks: Bookmark[];
  selectedIds: Set<string>;
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  currentFolderId: string | undefined;

  // 过滤器
  filters: {
    isFavorite?: boolean;
    isArchived?: boolean;
    status?: string;
  };

  // 操作
  loadBookmarks: () => Promise<void>;
  createBookmark: (dto: CreateBookmarkDTO) => Promise<Bookmark>;
  updateBookmark: (id: string, dto: UpdateBookmarkDTO) => Promise<Bookmark>;
  deleteBookmark: (id: string) => Promise<void>;
  deleteSelected: () => Promise<void>;

  // 选择
  toggleSelect: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // 收藏和归档
  toggleFavorite: (id: string) => Promise<void>;
  archiveSelected: () => Promise<void>;
  unarchiveSelected: () => Promise<void>;

  // 搜索和过滤
  search: (query: string) => Promise<void>;
  setCurrentFolder: (folderId: string | undefined) => void;
  setFilters: (filters: Partial<BookmarkState['filters']>) => void;
  clearFilters: () => void;

  // 批量操作
  moveToFolder: (folderId: string | undefined) => Promise<void>;
  addTagsToSelected: (tags: string[]) => Promise<void>;

  // 刷新
  refresh: () => Promise<void>;
}

export const useBookmarkStore = create<BookmarkState>((set, get) => ({
  // 初始状态
  bookmarks: [],
  selectedIds: new Set(),
  isLoading: false,
  error: null,
  searchQuery: '',
  currentFolderId: undefined,
  filters: {},

  // 加载书签
  loadBookmarks: async () => {
    set({ isLoading: true, error: null });
    try {
      const { currentFolderId, filters, searchQuery } = get();

      let bookmarks: Bookmark[];

      if (searchQuery) {
        const result = await searchService.search(searchQuery);
        bookmarks = result.items;
      } else {
        bookmarks = await bookmarkService.getAll({
          folderId: currentFolderId,
          ...filters,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        });
      }

      set({ bookmarks, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  // 创建书签
  createBookmark: async (dto) => {
    try {
      const bookmark = await bookmarkService.create(dto);
      searchService.invalidateCache();
      await get().loadBookmarks();
      return bookmark;
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // 更新书签
  updateBookmark: async (id, dto) => {
    try {
      const bookmark = await bookmarkService.update(id, dto);
      searchService.invalidateCache();
      set((state) => ({
        bookmarks: state.bookmarks.map((b) => (b.id === id ? bookmark : b)),
      }));
      return bookmark;
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // 删除书签
  deleteBookmark: async (id) => {
    try {
      await bookmarkService.delete(id);
      searchService.invalidateCache();
      set((state) => ({
        bookmarks: state.bookmarks.filter((b) => b.id !== id),
        selectedIds: new Set([...state.selectedIds].filter((i) => i !== id)),
      }));
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // 删除选中
  deleteSelected: async () => {
    const { selectedIds } = get();
    if (selectedIds.size === 0) return;

    try {
      await bookmarkService.deleteMany([...selectedIds]);
      searchService.invalidateCache();
      set((state) => ({
        bookmarks: state.bookmarks.filter((b) => !selectedIds.has(b.id)),
        selectedIds: new Set(),
      }));
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // 切换选择
  toggleSelect: (id) => {
    set((state) => {
      const newSelected = new Set(state.selectedIds);
      if (newSelected.has(id)) {
        newSelected.delete(id);
      } else {
        newSelected.add(id);
      }
      return { selectedIds: newSelected };
    });
  },

  // 全选
  selectAll: () => {
    set((state) => ({
      selectedIds: new Set(state.bookmarks.map((b) => b.id)),
    }));
  },

  // 清除选择
  clearSelection: () => {
    set({ selectedIds: new Set() });
  },

  // 切换收藏
  toggleFavorite: async (id) => {
    try {
      const bookmark = await bookmarkService.toggleFavorite(id);
      set((state) => ({
        bookmarks: state.bookmarks.map((b) => (b.id === id ? bookmark : b)),
      }));
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // 归档选中
  archiveSelected: async () => {
    const { selectedIds } = get();
    if (selectedIds.size === 0) return;

    try {
      await bookmarkService.archive([...selectedIds]);
      await get().loadBookmarks();
      set({ selectedIds: new Set() });
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // 取消归档选中
  unarchiveSelected: async () => {
    const { selectedIds } = get();
    if (selectedIds.size === 0) return;

    try {
      await bookmarkService.unarchive([...selectedIds]);
      await get().loadBookmarks();
      set({ selectedIds: new Set() });
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // 搜索
  search: async (query) => {
    set({ searchQuery: query });
    await get().loadBookmarks();
  },

  // 设置当前文件夹
  setCurrentFolder: (folderId) => {
    set({ currentFolderId: folderId, searchQuery: '' });
    get().loadBookmarks();
  },

  // 设置过滤器
  setFilters: (filters) => {
    set((state) => ({ filters: { ...state.filters, ...filters } }));
    get().loadBookmarks();
  },

  // 清除过滤器
  clearFilters: () => {
    set({ filters: {}, searchQuery: '' });
    get().loadBookmarks();
  },

  // 移动到文件夹
  moveToFolder: async (folderId) => {
    const { selectedIds } = get();
    if (selectedIds.size === 0) return;

    try {
      await bookmarkService.moveToFolder([...selectedIds], folderId);
      await get().loadBookmarks();
      set({ selectedIds: new Set() });
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // 添加标签到选中
  addTagsToSelected: async (tags) => {
    const { selectedIds } = get();
    if (selectedIds.size === 0) return;

    try {
      for (const id of selectedIds) {
        await bookmarkService.addTags(id, tags);
      }
      searchService.invalidateCache();
      await get().loadBookmarks();
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // 刷新
  refresh: async () => {
    searchService.invalidateCache();
    await get().loadBookmarks();
  },
}));
