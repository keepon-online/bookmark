// UI 状态管理

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ViewMode, Theme } from '@/types';

interface UIState {
  // 视图设置
  viewMode: ViewMode;
  theme: Theme;
  sidebarCollapsed: boolean;

  // 对话框状态
  isAddBookmarkOpen: boolean;
  isSettingsOpen: boolean;
  editingBookmarkId: string | null;

  // 操作
  setViewMode: (mode: ViewMode) => void;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;

  // 对话框操作
  openAddBookmark: () => void;
  closeAddBookmark: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  openEditBookmark: (id: string) => void;
  closeEditBookmark: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // 初始状态
      viewMode: 'list',
      theme: 'system',
      sidebarCollapsed: false,

      isAddBookmarkOpen: false,
      isSettingsOpen: false,
      editingBookmarkId: null,

      // 设置视图模式
      setViewMode: (mode) => set({ viewMode: mode }),

      // 设置主题
      setTheme: (theme) => {
        set({ theme });
        // 应用主题到 DOM
        const root = document.documentElement;
        if (theme === 'dark') {
          root.classList.add('dark');
        } else if (theme === 'light') {
          root.classList.remove('dark');
        } else {
          // 系统主题
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          root.classList.toggle('dark', prefersDark);
        }
      },

      // 切换侧边栏
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      // 添加书签对话框
      openAddBookmark: () => set({ isAddBookmarkOpen: true }),
      closeAddBookmark: () => set({ isAddBookmarkOpen: false }),

      // 设置对话框
      openSettings: () => set({ isSettingsOpen: true }),
      closeSettings: () => set({ isSettingsOpen: false }),

      // 编辑书签对话框
      openEditBookmark: (id) => set({ editingBookmarkId: id }),
      closeEditBookmark: () => set({ editingBookmarkId: null }),
    }),
    {
      name: 'smart-bookmark-ui',
      partialize: (state) => ({
        viewMode: state.viewMode,
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);

// 初始化主题
export function initializeTheme() {
  const state = useUIStore.getState();
  state.setTheme(state.theme);

  // 监听系统主题变化
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const currentTheme = useUIStore.getState().theme;
    if (currentTheme === 'system') {
      document.documentElement.classList.toggle('dark', e.matches);
    }
  });
}
