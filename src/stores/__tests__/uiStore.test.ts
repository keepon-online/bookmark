import { beforeEach, describe, expect, it } from 'vitest';
import {
  useUIStore,
  initializeTheme,
  applyTheme,
  PRIMARY_COLOR_OPTIONS,
} from '@/stores/uiStore';

describe('uiStore & theme', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    document.documentElement.removeAttribute('style');
    localStorage.clear();
    useUIStore.setState({
      theme: 'light',
      primaryColor: 'blue',
      sidebarCollapsed: false,
    });
  });

  it('applyTheme 正确设置深浅模式及主色调变量', () => {
    // 浅色 + 科技蓝
    applyTheme('light', 'blue');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe(
      PRIMARY_COLOR_OPTIONS[0].lightHsl
    );

    // 深色 + 科技蓝
    applyTheme('dark', 'blue');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe(
      PRIMARY_COLOR_OPTIONS[0].darkHsl
    );

    // 深色 + 经典紫
    applyTheme('dark', 'purple');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    const purple = PRIMARY_COLOR_OPTIONS.find((c) => c.id === 'purple')!;
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe(purple.darkHsl);
    expect(document.documentElement.style.getPropertyValue('--ring')).toBe(purple.darkHsl);
  });

  it('setTheme 与 setPrimaryColor 更新 store 并作用到 DOM', () => {
    const store = useUIStore.getState();

    store.setTheme('dark');
    expect(useUIStore.getState().theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    store.setPrimaryColor('emerald');
    expect(useUIStore.getState().primaryColor).toBe('emerald');
    const emerald = PRIMARY_COLOR_OPTIONS.find((c) => c.id === 'emerald')!;
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe(emerald.darkHsl);
  });

  it('initializeTheme 跨窗口 storage 事件能够即时同步更新 DOM', () => {
    const cleanup = initializeTheme();

    const emerald = PRIMARY_COLOR_OPTIONS.find((c) => c.id === 'emerald')!;
    const storageEvent = new StorageEvent('storage', {
      key: 'smart-bookmark-ui',
      newValue: JSON.stringify({
        state: {
          theme: 'dark',
          primaryColor: 'emerald',
        },
      }),
    });

    window.dispatchEvent(storageEvent);

    expect(useUIStore.getState().theme).toBe('dark');
    expect(useUIStore.getState().primaryColor).toBe('emerald');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe(emerald.darkHsl);

    cleanup();
  });
});
