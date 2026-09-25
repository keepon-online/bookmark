import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupAlarms } from '../setup/alarms';
import { setupBookmarkListeners } from '../setup/bookmarkListeners';
import { setupCommands } from '../setup/commands';
import { setupContextMenu } from '../setup/contextMenus';

describe('background setup helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers context menu entry and creates a browser bookmark on click', async () => {
    const createBookmark = vi.fn().mockResolvedValue(undefined);
    let handleClick:
      | ((info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => Promise<void>)
      | undefined;

    setupContextMenu({
      contextMenus: {
        removeAll: vi.fn((callback: () => void) => callback()),
        create: vi.fn(),
        onClicked: {
          addListener: vi.fn((listener) => {
            handleClick = listener;
          }),
        },
      },
      createBookmark,
      logger: { log: vi.fn(), error: vi.fn() },
    });

    expect(handleClick).toBeTypeOf('function');

    await handleClick?.(
      {
        menuItemId: 'add-bookmark',
        pageUrl: 'https://example.com/page',
      } as chrome.contextMenus.OnClickData,
      {
        url: 'https://example.com/page',
        title: 'Example Page',
      } as chrome.tabs.Tab
    );

    expect(createBookmark).toHaveBeenCalledWith({
      url: 'https://example.com/page',
      title: 'Example Page',
    });
  });

  it('registers the link-health-check alarm', () => {
    const create = vi.fn();

    setupAlarms({
      alarms: {
        create,
        onAlarm: {
          addListener: vi.fn(),
        },
      },
      logger: { log: vi.fn() },
    });

    expect(create).toHaveBeenCalledWith('link-health-check', { periodInMinutes: 60 * 24 });
  });

  it('cleans orphan meta when a browser bookmark is removed', async () => {
    const cleanOrphanMeta = vi.fn().mockResolvedValue(1);
    let handleRemoved: ((id: string, removeInfo: unknown) => void) | undefined;

    setupBookmarkListeners({
      bookmarks: {
        onRemoved: {
          addListener: vi.fn((listener) => {
            handleRemoved = listener;
          }),
        },
      },
      cleanOrphanMeta,
      logger: { log: vi.fn(), error: vi.fn() },
    });

    expect(handleRemoved).toBeTypeOf('function');
    handleRemoved?.('bookmark-1', { parentId: '1', index: 0 });

    // 异步清理被触发
    await vi.waitFor(() => {
      expect(cleanOrphanMeta).toHaveBeenCalledTimes(1);
    });
  });

  it('registers command listener and forwards the command to the handler', async () => {
    const handleCommand = vi.fn().mockResolvedValue(undefined);
    const createCommandHandler = vi.fn().mockReturnValue(handleCommand);
    let listener: ((command: string) => Promise<void>) | undefined;

    setupCommands({
      commands: {
        onCommand: {
          addListener: vi.fn((registeredListener) => {
            listener = registeredListener;
          }),
        },
      },
      createCommandHandler,
      commandDeps: {
        addBookmarkToBar: vi.fn(),
        toggleFavoriteByUrl: vi.fn(),
      },
      logger: { log: vi.fn() },
    });

    expect(createCommandHandler).toHaveBeenCalledTimes(1);
    expect(listener).toBeTypeOf('function');

    await listener?.('quick-add');

    expect(handleCommand).toHaveBeenCalledWith('quick-add');
  });
});
