import { describe, expect, it, vi } from 'vitest';
import type { Message } from '@/types';
import {
  createBackgroundMessageHandler,
  createCommandHandler,
} from '../handlers';

describe('background handlers', () => {
  it('routes BOOKMARK_CREATE and invalidates the search cache', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'bookmark-1', title: 'Example' });
    const invalidateCache = vi.fn();
    const handler = createBackgroundMessageHandler({
      bookmarkService: {
        create,
      },
      folderService: {},
      tagService: {},
      searchService: {
        invalidateCache,
      },
      getCurrentPageInfo: vi.fn(),
    });

    const response = await handler({
      type: 'BOOKMARK_CREATE',
      payload: { url: 'https://example.com', title: 'Example' },
      requestId: 'req-create',
    } as Message, {} as chrome.runtime.MessageSender);

    expect(create).toHaveBeenCalledWith({ url: 'https://example.com', title: 'Example' });
    expect(invalidateCache).toHaveBeenCalledTimes(1);
    expect(response).toEqual({
      success: true,
      data: { id: 'bookmark-1', title: 'Example' },
      requestId: 'req-create',
    });
  });

  it('routes BOOKMARK_UPDATE and invalidates the search cache', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'bookmark-1', title: 'Updated' });
    const invalidateCache = vi.fn();
    const handler = createBackgroundMessageHandler({
      bookmarkService: {
        update,
      },
      folderService: {},
      tagService: {},
      searchService: {
        invalidateCache,
      },
      getCurrentPageInfo: vi.fn(),
    });

    const response = await handler({
      type: 'BOOKMARK_UPDATE',
      payload: { id: 'bookmark-1', title: 'Updated' },
      requestId: 'req-1',
    } as Message, {} as chrome.runtime.MessageSender);

    expect(update).toHaveBeenCalledWith('bookmark-1', { title: 'Updated' });
    expect(invalidateCache).toHaveBeenCalledTimes(1);
    expect(response).toEqual({
      success: true,
      data: { id: 'bookmark-1', title: 'Updated' },
      requestId: 'req-1',
    });
  });

  it('routes BOOKMARK_SEARCH to searchService.search', async () => {
    const search = vi.fn().mockResolvedValue([{ id: 'bookmark-1', title: 'Example' }]);
    const handler = createBackgroundMessageHandler({
      bookmarkService: {},
      folderService: {},
      tagService: {},
      searchService: {
        invalidateCache: vi.fn(),
        search,
      },
      getCurrentPageInfo: vi.fn(),
    });

    const response = await handler({
      type: 'BOOKMARK_SEARCH',
      payload: 'example',
      requestId: 'req-search',
    } as Message, {} as chrome.runtime.MessageSender);

    expect(search).toHaveBeenCalledWith('example');
    expect(response).toEqual({
      success: true,
      data: [{ id: 'bookmark-1', title: 'Example' }],
      requestId: 'req-search',
    });
  });

  it('routes TAG_UPDATE to tagService.update', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'tag-1', name: 'docs' });
    const handler = createBackgroundMessageHandler({
      bookmarkService: {},
      folderService: {},
      tagService: {
        update,
      },
      searchService: {
        invalidateCache: vi.fn(),
      },
      getCurrentPageInfo: vi.fn(),
    });

    const response = await handler({
      type: 'TAG_UPDATE',
      payload: { id: 'tag-1', name: 'docs' },
      requestId: 'req-2',
    } as Message, {} as chrome.runtime.MessageSender);

    expect(update).toHaveBeenCalledWith('tag-1', { name: 'docs' });
    expect(response).toEqual({
      success: true,
      data: { id: 'tag-1', name: 'docs' },
      requestId: 'req-2',
    });
  });

  it('returns a structured error for unknown message types', async () => {
    const handler = createBackgroundMessageHandler({
      bookmarkService: {},
      folderService: {},
      tagService: {},
      searchService: {
        invalidateCache: vi.fn(),
      },
      getCurrentPageInfo: vi.fn(),
    });

    const response = await handler({
      type: 'ERROR',
      requestId: 'req-3',
    } as Message, {} as chrome.runtime.MessageSender);

    expect(response).toEqual({
      success: false,
      error: 'Unknown message type: ERROR',
      requestId: 'req-3',
    });
  });

  it('routes FOLDER_DELETE with move target', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const handler = createBackgroundMessageHandler({
      bookmarkService: {},
      folderService: {
        delete: remove,
      },
      tagService: {},
      searchService: {
        invalidateCache: vi.fn(),
      },
      getCurrentPageInfo: vi.fn(),
    });

    const response = await handler({
      type: 'FOLDER_DELETE',
      payload: { id: 'folder-1', moveBookmarksTo: 'folder-2' },
      requestId: 'req-folder-delete',
    } as Message, {} as chrome.runtime.MessageSender);

    expect(remove).toHaveBeenCalledWith('folder-1', 'folder-2');
    expect(response).toEqual({
      success: true,
      data: undefined,
      requestId: 'req-folder-delete',
    });
  });

  it('routes GET_CURRENT_TAB to injected page info resolver', async () => {
    const getCurrentPageInfo = vi.fn().mockResolvedValue({
      url: 'https://example.com/current',
      title: 'Current',
    });
    const handler = createBackgroundMessageHandler({
      bookmarkService: {},
      folderService: {},
      tagService: {},
      searchService: {
        invalidateCache: vi.fn(),
      },
      getCurrentPageInfo,
    });

    const response = await handler({
      type: 'GET_CURRENT_TAB',
      requestId: 'req-tab',
    } as Message, {} as chrome.runtime.MessageSender);

    expect(getCurrentPageInfo).toHaveBeenCalledTimes(1);
    expect(response).toEqual({
      success: true,
      data: {
        url: 'https://example.com/current',
        title: 'Current',
      },
      requestId: 'req-tab',
    });
  });

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
