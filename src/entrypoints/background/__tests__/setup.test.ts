import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupAlarms } from '../setup/alarms';
import { setupBookmarkListeners } from '../setup/bookmarkListeners';
import { setupCommands } from '../setup/commands';
import { setupContextMenu } from '../setup/contextMenus';

describe('background setup helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers context menu entries and creates a bookmark from the clicked page', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    let handleClick: ((info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => Promise<void>) | undefined;

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
      bookmarkService: { create },
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
        favIconUrl: 'https://example.com/favicon.ico',
      } as chrome.tabs.Tab
    );

    expect(create).toHaveBeenCalledWith({
      url: 'https://example.com/page',
      title: 'Example Page',
      favicon: 'https://example.com/favicon.ico',
    });
  });

  it('registers alarms and runs cleanup-tags via tagService', async () => {
    const cleanupUnused = vi.fn().mockResolvedValue(3);
    let handleAlarm: ((alarm: chrome.alarms.Alarm) => Promise<void>) | undefined;
    const create = vi.fn();

    setupAlarms({
      alarms: {
        create,
        onAlarm: {
          addListener: vi.fn((listener) => {
            handleAlarm = listener;
          }),
        },
      },
      storage: {
        get: vi.fn().mockResolvedValue({}),
      },
      tagService: { cleanupUnused },
      organizerService: {
        organizeAll: vi.fn(),
      },
      browserSyncService: {
        syncToBrowser: vi.fn(),
      },
      logger: { log: vi.fn(), error: vi.fn() },
    });

    expect(create).toHaveBeenCalledTimes(3);
    expect(handleAlarm).toBeTypeOf('function');

    await handleAlarm?.({ name: 'cleanup-tags', scheduledTime: Date.now() } as chrome.alarms.Alarm);

    expect(cleanupUnused).toHaveBeenCalledTimes(1);
  });

  it('auto-organize alarm uses stored config and syncs to browser when enabled', async () => {
    let handleAlarm: ((alarm: chrome.alarms.Alarm) => Promise<void>) | undefined;
    const organizeAll = vi.fn().mockResolvedValue({ organized: 2 });
    const syncToBrowser = vi.fn().mockResolvedValue({ synced: 2 });

    setupAlarms({
      alarms: {
        create: vi.fn(),
        onAlarm: {
          addListener: vi.fn((listener) => {
            handleAlarm = listener;
          }),
        },
      },
      storage: {
        get: vi.fn().mockResolvedValue({
          autoOrganizeConfig: {
            enabled: true,
            strategy: 'smart',
            minConfidence: 0.9,
          },
        }),
      },
      tagService: { cleanupUnused: vi.fn() },
      organizerService: { organizeAll },
      browserSyncService: { syncToBrowser },
      logger: { log: vi.fn(), error: vi.fn() },
    });

    await handleAlarm?.({ name: 'auto-organize', scheduledTime: Date.now() } as chrome.alarms.Alarm);

    expect(organizeAll).toHaveBeenCalledWith({
      strategy: 'smart',
      createNewFolders: true,
      applyTags: true,
      moveBookmarks: false,
      removeDuplicates: false,
      minConfidence: 0.9,
      archiveUncategorized: false,
      handleBroken: 'ignore',
    });
    expect(syncToBrowser).toHaveBeenCalledWith({
      moveBookmarks: false,
      applyTags: true,
    });
  });

  it('registers bookmark creation and removal listeners', () => {
    const onCreated = { addListener: vi.fn() };
    const onRemoved = { addListener: vi.fn() };

    setupBookmarkListeners({
      bookmarks: {
        onCreated,
        onRemoved,
      },
      logger: { log: vi.fn() },
    });

    expect(onCreated.addListener).toHaveBeenCalledTimes(1);
    expect(onRemoved.addListener).toHaveBeenCalledTimes(1);
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
        bookmarkService: {
          create: vi.fn(),
          getAll: vi.fn(),
          toggleFavorite: vi.fn(),
        },
      },
      logger: { log: vi.fn() },
    });

    expect(createCommandHandler).toHaveBeenCalledTimes(1);
    expect(listener).toBeTypeOf('function');

    await listener?.('quick-add');

    expect(handleCommand).toHaveBeenCalledWith('quick-add');
  });
});
