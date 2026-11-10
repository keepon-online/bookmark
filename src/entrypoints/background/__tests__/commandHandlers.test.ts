import { describe, expect, it, vi } from 'vitest';
import { createCommandHandler, createDefaultCommandHandler } from '../messages/commandHandlers';

function createDeps() {
  return {
    addBookmarkToBar: vi.fn().mockResolvedValue(undefined),
    toggleFavoriteByUrl: vi.fn().mockResolvedValue(true),
    getCurrentPageInfo: vi.fn(),
    queryActiveTab: vi.fn(),
    openSidePanel: vi.fn().mockResolvedValue(undefined),
  };
}

describe('command handlers', () => {
  it('quick-add 将当前页写入浏览器书签栏', async () => {
    const deps = createDeps();
    deps.getCurrentPageInfo.mockResolvedValue({
      url: 'https://example.com',
      title: 'Example',
      favicon: 'https://example.com/favicon.ico',
    });

    const handler = createCommandHandler(deps);
    await handler('quick-add');

    expect(deps.addBookmarkToBar).toHaveBeenCalledWith({
      url: 'https://example.com',
      title: 'Example',
    });
  });

  it('toggle-favorite 按当前页 URL 切换收藏', async () => {
    const deps = createDeps();
    deps.getCurrentPageInfo.mockResolvedValue({
      url: 'https://example.com',
      title: 'Example',
    });

    const handler = createCommandHandler(deps);
    await handler('toggle-favorite');

    expect(deps.toggleFavoriteByUrl).toHaveBeenCalledWith('https://example.com');
  });

  it('search-bookmarks 为当前窗口打开侧边栏', async () => {
    const deps = createDeps();
    deps.queryActiveTab.mockResolvedValue([{ id: 1, windowId: 99 }]);

    const handler = createCommandHandler(deps);
    await handler('search-bookmarks');

    expect(deps.queryActiveTab).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(deps.openSidePanel).toHaveBeenCalledWith({ windowId: 99 });
  });

  it('open-sidepanel 查标签失败仍走兜底且不抛（默认 handler）', async () => {
    // 覆盖默认 openSidePanel 的 windows.getCurrent 兜底：
    // 查不到标签 + getCurrent 抛错 → 不带 windowId 尽力打开，绝不 reject
    vi.stubGlobal('chrome', {
      ...(global.chrome as object),
      windows: { getCurrent: vi.fn().mockRejectedValue(new Error('context invalidated')) },
      permissions: (global.chrome as { permissions?: object }).permissions,
      storage: (global.chrome as { storage?: object }).storage,
    });

    const handler = createDefaultCommandHandler({
      addBookmarkToBar: vi.fn().mockResolvedValue(undefined),
      toggleFavoriteByUrl: vi.fn().mockResolvedValue(true),
      queryActiveTab: vi.fn().mockResolvedValue([]),
    });

    await expect(handler('open-sidepanel')).resolves.toBeUndefined();

    vi.unstubAllGlobals();
  });
});
