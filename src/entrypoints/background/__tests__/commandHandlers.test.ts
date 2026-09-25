import { describe, expect, it, vi } from 'vitest';
import { createCommandHandler } from '../messages/commandHandlers';

describe('command handlers', () => {
  it('quick-add creates a bookmark from the current page info', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const getCurrentPageInfo = vi.fn().mockResolvedValue({
      url: 'https://example.com',
      title: 'Example',
      favicon: 'https://example.com/favicon.ico',
    });

    const handler = createCommandHandler({
      bookmarkService: {
        create,
        getAll: vi.fn(),
        toggleFavorite: vi.fn(),
      },
      getCurrentPageInfo,
      queryActiveTab: vi.fn(),
      openSidePanel: vi.fn(),
    });

    await handler('quick-add');

    expect(create).toHaveBeenCalledWith({
      url: 'https://example.com',
      title: 'Example',
      favicon: 'https://example.com/favicon.ico',
    });
  });

  it('toggle-favorite toggles the bookmark matching the current page URL', async () => {
    const toggleFavorite = vi.fn().mockResolvedValue(undefined);
    const getAll = vi.fn().mockResolvedValue([
      { id: 'bookmark-1', url: 'https://example.com' },
      { id: 'bookmark-2', url: 'https://another.com' },
    ]);

    const handler = createCommandHandler({
      bookmarkService: {
        create: vi.fn(),
        getAll,
        toggleFavorite,
      },
      getCurrentPageInfo: vi.fn().mockResolvedValue({
        url: 'https://example.com',
        title: 'Example',
      }),
      queryActiveTab: vi.fn(),
      openSidePanel: vi.fn(),
    });

    await handler('toggle-favorite');

    expect(getAll).toHaveBeenCalledWith({ limit: 1000 });
    expect(toggleFavorite).toHaveBeenCalledWith('bookmark-1');
  });

  it('search-bookmarks opens the side panel for the active window', async () => {
    const queryActiveTab = vi.fn().mockResolvedValue([{ id: 1, windowId: 99 }]);
    const openSidePanel = vi.fn().mockResolvedValue(undefined);

    const handler = createCommandHandler({
      bookmarkService: {
        create: vi.fn(),
        getAll: vi.fn(),
        toggleFavorite: vi.fn(),
      },
      getCurrentPageInfo: vi.fn(),
      queryActiveTab,
      openSidePanel,
    });

    await handler('search-bookmarks');

    expect(queryActiveTab).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(openSidePanel).toHaveBeenCalledWith({ windowId: 99 });
  });
});
