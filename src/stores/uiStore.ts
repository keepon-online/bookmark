// UI 状态管理

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ViewMode = 'list' | 'grid';
export type Theme = 'light' | 'dark' | 'system';
export type PrimaryColor = 'blue' | 'purple' | 'emerald' | 'orange' | 'rose';

export interface PrimaryColorOption {
  id: PrimaryColor;
  label: string;
  hex: string;
  lightHsl: string;
  darkHsl: string;
}

export const PRIMARY_COLOR_OPTIONS: PrimaryColorOption[] = [
  {
    id: 'blue',
    label: '科技蓝',
    hex: '#2563eb',
    lightHsl: '221.2 83.2% 53.3%',
    darkHsl: '217.2 91.2% 59.8%',
  },
  {
    id: 'purple',
    label: '经典紫',
    hex: '#7c3aed',
    lightHsl: '262.1 83.3% 57.8%',
    darkHsl: '263.4 70% 50.4%',
  },
  {
    id: 'emerald',
    label: '翡翠绿',
    hex: '#059669',
    lightHsl: '142.1 76.2% 36.3%',
    darkHsl: '142.1 70.6% 45.3%',
  },
  {
    id: 'orange',
    label: '活力橙',
    hex: '#ea580c',
    lightHsl: '24.6 95% 53.1%',
    darkHsl: '20.5 90.2% 48.2%',
  },
  {
    id: 'rose',
    label: '玫瑰红',
    hex: '#e11d48',
    lightHsl: '346.8 77.2% 49.8%',
    darkHsl: '349.7 89.2% 60.2%',
  },
];

// 将主题和主色调应用到 DOM
export function applyTheme(theme: Theme, primaryColor: PrimaryColor = 'blue') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)')?.matches);

  root.classList.toggle('dark', Boolean(isDark));

  const colorOpt =
    PRIMARY_COLOR_OPTIONS.find((c) => c.id === primaryColor) ?? PRIMARY_COLOR_OPTIONS[0];
  const hsl = isDark ? colorOpt.darkHsl : colorOpt.lightHsl;
  root.style.setProperty('--primary', hsl);
  root.style.setProperty('--ring', hsl);
}

export interface UIState {
  // 视图设置
  viewMode: ViewMode;
  theme: Theme;
  primaryColor: PrimaryColor;
  sidebarCollapsed: boolean;

  // 对话框状态
  isAddBookmarkOpen: boolean;
  isSettingsOpen: boolean;
  editingBookmarkId: string | null;

  // 操作
  setViewMode: (mode: ViewMode) => void;
  setTheme: (theme: Theme) => void;
  setPrimaryColor: (color: PrimaryColor) => void;
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
    (set, get) => ({
      // 初始状态
      viewMode: 'list',
      theme: 'system',
      primaryColor: 'blue',
      sidebarCollapsed: false,

      isAddBookmarkOpen: false,
      isSettingsOpen: false,
      editingBookmarkId: null,

      // 设置视图模式
      setViewMode: (mode) => set({ viewMode: mode }),

      // 设置主题
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme, get().primaryColor ?? 'blue');
      },

      // 设置主色调
      setPrimaryColor: (primaryColor) => {
        set({ primaryColor });
        applyTheme(get().theme, primaryColor);
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
        primaryColor: state.primaryColor,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);

// 初始化主题并建立跨窗口同步
export function initializeTheme() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  const state = useUIStore.getState();
  applyTheme(state.theme, state.primaryColor ?? 'blue');

  // 监听系统主题变化
  const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
  const handleMediaChange = () => {
    const current = useUIStore.getState();
    if (current.theme === 'system') {
      applyTheme('system', current.primaryColor ?? 'blue');
    }
  };
  mediaQuery?.addEventListener?.('change', handleMediaChange);

  // 跨窗口/跨扩展页面实时同步主题与主题色
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === 'smart-bookmark-ui' && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        if (parsed?.state) {
          const nextTheme: Theme = parsed.state.theme ?? 'system';
          const nextPrimary: PrimaryColor = parsed.state.primaryColor ?? 'blue';
          useUIStore.setState({
            theme: nextTheme,
            primaryColor: nextPrimary,
          });
          applyTheme(nextTheme, nextPrimary);
        }
      } catch {
        // ignore parse error
      }
    }
  };
  window.addEventListener('storage', handleStorageChange);

  return () => {
    mediaQuery?.removeEventListener?.('change', handleMediaChange);
    window.removeEventListener('storage', handleStorageChange);
  };
}
