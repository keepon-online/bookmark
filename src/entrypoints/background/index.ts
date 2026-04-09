// Background Service Worker - WXT 格式

import { initDatabase } from '@/lib/database';
import { onMessage, getCurrentPageInfo } from '@/lib/messaging';
import { bookmarkService, folderService, tagService, searchService, organizerService, browserSyncService } from '@/services';
import { setupAlarms } from './setup/alarms';
import { setupBookmarkListeners } from './setup/bookmarkListeners';
import { setupCommands } from './setup/commands';
import { setupContextMenu } from './setup/contextMenus';
import { createBackgroundMessageHandler } from './handlers';

export default defineBackground(() => {
  console.log('[Background] Service Worker started');

  // 初始化
  async function initialize() {
    console.log('[Background] Initializing...');
    try {
      await initDatabase();
      console.log('[Background] Database initialized');
      setupContextMenu({
        contextMenus: typeof chrome !== 'undefined' ? chrome.contextMenus : undefined,
        bookmarkService,
      });
      setupAlarms({
        alarms: typeof chrome !== 'undefined' ? chrome.alarms : undefined,
        storage:
          typeof chrome !== 'undefined'
            ? chrome.storage.local
            : {
                get: async () => ({}),
              },
        tagService,
        organizerService,
        browserSyncService,
      });
      setupCommands({
        commands: typeof chrome !== 'undefined' ? chrome.commands : undefined,
        commandDeps: {
          bookmarkService,
          getCurrentPageInfo,
        },
      });
      setupBookmarkListeners({
        bookmarks: typeof chrome !== 'undefined' ? chrome.bookmarks : undefined,
      });
      console.log('[Background] Ready');
    } catch (error) {
      console.error('[Background] Initialization failed:', error);
    }
  }

  // 处理消息
  const handleMessage = createBackgroundMessageHandler({
    bookmarkService,
    folderService,
    tagService,
    searchService,
    getCurrentPageInfo,
  });

  onMessage(async (message, sender) => {
    console.log('[Background] Received message:', message.type);
    return handleMessage(message, sender);
  });

  // 启动
  initialize();
});
