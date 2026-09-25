// Background Service Worker - WXT 格式

import { initDatabase } from '@/lib/database';
import { onMessage, getCurrentPageInfo } from '@/lib/messaging';
import type { Message, MessageResponse } from '@/types';
import { bookmarkService, tagService, organizerService } from '@/services';
import { setupAlarms } from './setup/alarms';
import { setupBookmarkListeners } from './setup/bookmarkListeners';
import { setupCommands } from './setup/commands';
import { setupContextMenu } from './setup/contextMenus';

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

  // 处理消息：仅保留后台专属能力（读取当前页面信息）
  onMessage(async (message: Message, _sender: chrome.runtime.MessageSender): Promise<MessageResponse> => {
    console.log('[Background] Received message:', message.type);
    if (message.type === 'GET_CURRENT_TAB') {
      const pageInfo = await getCurrentPageInfo();
      return {
        success: true,
        data: pageInfo,
        requestId: message.requestId,
      };
    }
    return {
      success: false,
      error: `Unknown message type: ${message.type}`,
      requestId: message.requestId,
    };
  });

  // 启动
  initialize();
});
