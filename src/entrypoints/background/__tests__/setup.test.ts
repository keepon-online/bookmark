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

  it('registers the auto scan alarm dispatcher and syncs the schedule on startup', () => {
    const addListener = vi.fn();
    const syncAlarm = vi.fn().mockResolvedValue(undefined);

    setupAlarms({
      alarms: { create: vi.fn(), clear: vi.fn(), onAlarm: { addListener } },
      logger: { debug: vi.fn(), error: vi.fn() },
      syncAlarm,
    });

    expect(addListener).toHaveBeenCalledTimes(1);
    // 启动时对齐一次闹钟（开关/间隔以设置为准）
    expect(syncAlarm).toHaveBeenCalledTimes(1);
  });

  it('runs one auto scan slice when the periodic or continue alarm fires', async () => {
    let handleAlarm: ((alarm: chrome.alarms.Alarm) => void | Promise<void>) | undefined;
    const runTick = vi.fn().mockResolvedValue(undefined);

    setupAlarms({
      alarms: {
        create: vi.fn(),
        clear: vi.fn(),
        onAlarm: {
          addListener: vi.fn((listener) => {
            handleAlarm = listener;
          }),
        },
      },
      logger: { debug: vi.fn(), error: vi.fn() },
      runTick,
      syncAlarm: vi.fn().mockResolvedValue(undefined),
    });

    await handleAlarm?.({ name: 'link-health-check' } as chrome.alarms.Alarm);
    expect(runTick).toHaveBeenCalledWith('link-health-check');

    await handleAlarm?.({ name: 'link-health-check-continue' } as chrome.alarms.Alarm);
    expect(runTick).toHaveBeenCalledWith('link-health-check-continue');

    // 无关闹钟不触发扫描
    runTick.mockClear();
    await handleAlarm?.({ name: 'other-alarm' } as chrome.alarms.Alarm);
    expect(runTick).not.toHaveBeenCalled();
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
