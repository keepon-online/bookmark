// Background Service Worker - WXT 格式
// v0.6：chrome.bookmarks 唯一数据源。后台职责收缩为：
// 快捷键、右键菜单、孤儿元数据清理、定时死链检查（阶段 3）、GET_CURRENT_TAB

import { onMessage, getCurrentPageInfo } from '@/lib/messaging';
import { browserBookmarks, BOOKMARK_BAR_ID } from '@/services/browserBookmarksService';
import { auxDb, defaultMeta, sweepOrphanMeta } from '@/lib/auxDatabase';
import { getUrlKey } from '@/lib/utils';
import type { Message, MessageResponse } from '@/types';
import { setupAlarms } from './setup/alarms';
import { setupBookmarkListeners } from './setup/bookmarkListeners';
import { setupCommands } from './setup/commands';
import { setupContextMenu } from './setup/contextMenus';
import { createLogger } from '@/lib/logger';

const logger = createLogger('Background');

export default defineBackground(() => {
  logger.info('Service Worker started');

  // 将页面加入浏览器书签栏
  async function addBookmarkToBar(input: { url: string; title: string }): Promise<unknown> {
    return chrome.bookmarks.create({
      parentId: BOOKMARK_BAR_ID,
      url: input.url,
      title: input.title,
    });
  }

  // 按当前页 URL 切换收藏（写 aux 元数据）
  async function toggleFavoriteByUrl(url: string): Promise<boolean> {
    const snapshot = await browserBookmarks.loadTree();
    const urlKey = getUrlKey(url);
    const node = snapshot.bookmarks.find(
      (bookmark) => bookmark.url && getUrlKey(bookmark.url) === urlKey
    );
    if (!node) {
      return false;
    }
    const meta = (await auxDb.bookmarkMeta.get(node.id)) ?? defaultMeta(node.id);
    const next = { ...meta, isFavorite: !meta.isFavorite };
    await auxDb.bookmarkMeta.put(next);
    return next.isFavorite;
  }

  // 对比当前书签树，清理已删除书签的元数据
  async function cleanOrphanMeta(): Promise<number> {
    const snapshot = await browserBookmarks.loadTree();
    return sweepOrphanMeta(new Set(snapshot.bookmarks.map((bookmark) => bookmark.id)));
  }

  // 初始化
  async function initialize() {
    logger.info('Initializing...');
    try {
      await auxDb.open();
      setupContextMenu({
        contextMenus: typeof chrome !== 'undefined' ? chrome.contextMenus : undefined,
        createBookmark: addBookmarkToBar,
      });
      setupAlarms({
        alarms: typeof chrome !== 'undefined' ? chrome.alarms : undefined,
      });
      setupCommands({
        commands: typeof chrome !== 'undefined' ? chrome.commands : undefined,
        commandDeps: {
          addBookmarkToBar,
          toggleFavoriteByUrl,
          getCurrentPageInfo,
        },
      });
      setupBookmarkListeners({
        bookmarks: typeof chrome !== 'undefined' ? chrome.bookmarks : undefined,
        cleanOrphanMeta,
      });
      logger.info('Ready');
    } catch (error) {
      logger.error('Initialization failed', error);
    }
  }

  // 处理消息：仅保留后台专属能力（读取当前页面信息）
  onMessage(
    async (message: Message, _sender: chrome.runtime.MessageSender): Promise<MessageResponse> => {
      logger.debug('Received message', message.type);
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
    }
  );

  // 启动
  initialize();
});
