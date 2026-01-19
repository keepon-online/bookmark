// 文件夹状态管理

import { create } from 'zustand';
import { folderService } from '@/services';
import type { Folder, CreateFolderDTO, UpdateFolderDTO, FolderTreeNode } from '@/types';

interface FolderState {
  // 状态
  folders: Folder[];
  folderTree: FolderTreeNode[];
  isLoading: boolean;
  error: string | null;

  // 操作
  loadFolders: () => Promise<void>;
  createFolder: (dto: CreateFolderDTO) => Promise<Folder>;
  updateFolder: (id: string, dto: UpdateFolderDTO) => Promise<Folder>;
  deleteFolder: (id: string, moveBookmarksTo?: string) => Promise<void>;
  moveFolder: (id: string, newParentId?: string, newOrder?: number) => Promise<void>;

  // 辅助
  getFolderPath: (id: string) => Promise<Folder[]>;
  refresh: () => Promise<void>;
}

export const useFolderStore = create<FolderState>((set, get) => ({
  // 初始状态
  folders: [],
  folderTree: [],
  isLoading: false,
  error: null,

  // 加载文件夹
  loadFolders: async () => {
    set({ isLoading: true, error: null });
    try {
      const [folders, folderTree] = await Promise.all([
        folderService.getAll(),
        folderService.getTree(),
      ]);
      set({ folders, folderTree, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  // 创建文件夹
  createFolder: async (dto) => {
    try {
      const folder = await folderService.create(dto);
      await get().loadFolders();
      return folder;
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // 更新文件夹
  updateFolder: async (id, dto) => {
    try {
      const folder = await folderService.update(id, dto);
      await get().loadFolders();
      return folder;
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // 删除文件夹
  deleteFolder: async (id, moveBookmarksTo) => {
    try {
      await folderService.delete(id, moveBookmarksTo);
      await get().loadFolders();
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // 移动文件夹
  moveFolder: async (id, newParentId, newOrder) => {
    try {
      await folderService.move(id, newParentId, newOrder);
      await get().loadFolders();
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // 获取文件夹路径
  getFolderPath: async (id) => {
    return folderService.getPath(id);
  },

  // 刷新
  refresh: async () => {
    await get().loadFolders();
  },
}));
