// Background Service Worker - WXT 格式

import { initDatabase } from '@/lib/database';
import { onMessage, getCurrentPageInfo } from '@/lib/messaging';
import { bookmarkService, folderService, tagService, searchService } from '@/services';
import type { Message, MessageResponse, CreateBookmarkDTO, UpdateBookmarkDTO } from '@/types';

export default defineBackground(() => {
  console.log('[Background] Service Worker started');

  // 初始化
  async function initialize() {
    console.log('[Background] Initializing...');
    try {
      await initDatabase();
      console.log('[Background] Database initialized');
      setupContextMenu();
      setupAlarms();
      console.log('[Background] Ready');
    } catch (error) {
      console.error('[Background] Initialization failed:', error);
    }
  }

  // 设置右键菜单
  function setupContextMenu() {
    browser.contextMenus.removeAll().then(() => {
      browser.contextMenus.create({
        id: 'add-bookmark',
        title: '添加到智能书签',
        contexts: ['page', 'link'],
      });

      browser.contextMenus.create({
        id: 'add-bookmark-with-tags',
        title: '添加书签并设置标签...',
        contexts: ['page', 'link'],
      });
    });
  }

  // 设置定时任务
  function setupAlarms() {
    // 链接健康检查 - 每 24 小时
    browser.alarms.create('link-health-check', {
      periodInMinutes: 60 * 24,
    });

    // 清理未使用标签 - 每周
    browser.alarms.create('cleanup-tags', {
      periodInMinutes: 60 * 24 * 7,
    });
  }

  // 处理右键菜单点击
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab?.url) return;

    const url = info.linkUrl || info.pageUrl || tab.url;
    const title = tab.title || url;

    try {
      if (info.menuItemId === 'add-bookmark') {
        await bookmarkService.create({
          url,
          title,
          favicon: tab.favIconUrl,
        });
        console.log('[Background] Bookmark added:', url);
      } else if (info.menuItemId === 'add-bookmark-with-tags') {
        await bookmarkService.create({
          url,
          title,
          favicon: tab.favIconUrl,
        });
      }
    } catch (error) {
      console.error('[Background] Failed to add bookmark:', error);
    }
  });

  // 处理定时任务
  browser.alarms.onAlarm.addListener(async (alarm) => {
    console.log('[Background] Alarm triggered:', alarm.name);

    switch (alarm.name) {
      case 'link-health-check':
        console.log('[Background] Running link health check...');
        break;

      case 'cleanup-tags':
        try {
          const count = await tagService.cleanupUnused();
          console.log('[Background] Cleaned up', count, 'unused tags');
        } catch (error) {
          console.error('[Background] Failed to cleanup tags:', error);
        }
        break;
    }
  });

  // 处理消息
  onMessage(async (message: Message, _sender): Promise<MessageResponse> => {
    console.log('[Background] Received message:', message.type);

    try {
      switch (message.type) {
        // 书签操作
        case 'BOOKMARK_CREATE': {
          const bookmark = await bookmarkService.create(message.payload as CreateBookmarkDTO);
          searchService.invalidateCache();
          return { success: true, data: bookmark, requestId: message.requestId };
        }

        case 'BOOKMARK_UPDATE': {
          const { id, ...dto } = message.payload as { id: string } & UpdateBookmarkDTO;
          const bookmark = await bookmarkService.update(id, dto);
          searchService.invalidateCache();
          return { success: true, data: bookmark, requestId: message.requestId };
        }

        case 'BOOKMARK_DELETE': {
          await bookmarkService.delete(message.payload as string);
          searchService.invalidateCache();
          return { success: true, requestId: message.requestId };
        }

        case 'BOOKMARK_BATCH_DELETE': {
          await bookmarkService.deleteMany(message.payload as string[]);
          searchService.invalidateCache();
          return { success: true, requestId: message.requestId };
        }

        case 'BOOKMARK_GET_ALL': {
          const bookmarks = await bookmarkService.getAll(message.payload);
          return { success: true, data: bookmarks, requestId: message.requestId };
        }

        case 'BOOKMARK_SEARCH': {
          const result = await searchService.search(message.payload as string);
          return { success: true, data: result, requestId: message.requestId };
        }

        case 'BOOKMARK_IMPORT': {
          const result = await bookmarkService.importFromBrowser();
          searchService.invalidateCache();
          return { success: true, data: result, requestId: message.requestId };
        }

        // 文件夹操作
        case 'FOLDER_CREATE': {
          const folder = await folderService.create(message.payload);
          return { success: true, data: folder, requestId: message.requestId };
        }

        case 'FOLDER_UPDATE': {
          const { id, ...dto } = message.payload as { id: string };
          const folder = await folderService.update(id, dto);
          return { success: true, data: folder, requestId: message.requestId };
        }

        case 'FOLDER_DELETE': {
          const { id, moveBookmarksTo } = message.payload as { id: string; moveBookmarksTo?: string };
          await folderService.delete(id, moveBookmarksTo);
          return { success: true, requestId: message.requestId };
        }

        case 'FOLDER_GET_ALL': {
          const tree = await folderService.getTree();
          return { success: true, data: tree, requestId: message.requestId };
        }

        // 标签操作
        case 'TAG_GET_ALL': {
          const tags = await tagService.getAll();
          return { success: true, data: tags, requestId: message.requestId };
        }

        case 'TAG_CREATE': {
          const tag = await tagService.create(message.payload);
          return { success: true, data: tag, requestId: message.requestId };
        }

        case 'TAG_DELETE': {
          await tagService.delete(message.payload as string);
          return { success: true, requestId: message.requestId };
        }

        // 当前标签页
        case 'GET_CURRENT_TAB': {
          const pageInfo = await getCurrentPageInfo();
          return { success: true, data: pageInfo, requestId: message.requestId };
        }

        default:
          return {
            success: false,
            error: `Unknown message type: ${message.type}`,
            requestId: message.requestId,
          };
      }
    } catch (error) {
      console.error('[Background] Error handling message:', error);
      return {
        success: false,
        error: (error as Error).message,
        requestId: message.requestId,
      };
    }
  });

  // 监听浏览器书签变化
  browser.bookmarks.onCreated.addListener((id, bookmark) => {
    console.log('[Background] Browser bookmark created:', bookmark.url);
  });

  browser.bookmarks.onRemoved.addListener((id, _removeInfo) => {
    console.log('[Background] Browser bookmark removed:', id);
  });

  // 启动初始化
  initialize();
});
