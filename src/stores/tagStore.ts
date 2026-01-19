// 标签状态管理

import { create } from 'zustand';
import { tagService } from '@/services';
import type { Tag, CreateTagDTO, UpdateTagDTO } from '@/types';

interface TagState {
  // 状态
  tags: Tag[];
  popularTags: Tag[];
  isLoading: boolean;
  error: string | null;

  // 操作
  loadTags: () => Promise<void>;
  createTag: (dto: CreateTagDTO) => Promise<Tag>;
  updateTag: (id: string, dto: UpdateTagDTO) => Promise<Tag>;
  deleteTag: (id: string) => Promise<void>;
  searchTags: (query: string) => Promise<Tag[]>;
  mergeTags: (sourceId: string, targetId: string) => Promise<void>;
  cleanupUnused: () => Promise<number>;

  // 刷新
  refresh: () => Promise<void>;
}

export const useTagStore = create<TagState>((set, get) => ({
  // 初始状态
  tags: [],
  popularTags: [],
  isLoading: false,
  error: null,

  // 加载标签
  loadTags: async () => {
    set({ isLoading: true, error: null });
    try {
      const [tags, popularTags] = await Promise.all([
        tagService.getAll({ sortBy: 'name', sortOrder: 'asc' }),
        tagService.getPopular(10),
      ]);
      set({ tags, popularTags, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  // 创建标签
  createTag: async (dto) => {
    try {
      const tag = await tagService.create(dto);
      await get().loadTags();
      return tag;
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // 更新标签
  updateTag: async (id, dto) => {
    try {
      const tag = await tagService.update(id, dto);
      await get().loadTags();
      return tag;
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // 删除标签
  deleteTag: async (id) => {
    try {
      await tagService.delete(id);
      await get().loadTags();
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // 搜索标签
  searchTags: async (query) => {
    try {
      return await tagService.search(query);
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // 合并标签
  mergeTags: async (sourceId, targetId) => {
    try {
      await tagService.merge(sourceId, targetId);
      await get().loadTags();
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // 清理未使用的标签
  cleanupUnused: async () => {
    try {
      const count = await tagService.cleanupUnused();
      await get().loadTags();
      return count;
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // 刷新
  refresh: async () => {
    await get().loadTags();
  },
}));
