// Background Service Worker - WXT 格式
// v0.6：chrome.bookmarks 唯一数据源。后台职责收缩为：
// 快捷键、右键菜单、孤儿元数据清理、定时死链检查（阶段 3）、GET_CURRENT_TAB

import { onMessage, getCurrentPageInfo } from '@/lib/messaging';
import { browserBookmarks, BOOKMARK_BAR_ID } from '@/services/browserBookmarksService';
import { auxDb, defaultMeta, reconcileMeta } from '@/lib/auxDatabase';
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

  // —— 异步业务处理器（可安全等待，不影响下方监听器注册；Dexie 惰性打开） ——

  // 将页面加入浏览器书签栏（先按 urlKey 查重，与 UI 添加路径行为一致：
  // 否则扩展自己就能制造出查重清理要处理的重复项）
  async function addBookmarkToBar(input: { url: string; title: string }): Promise<unknown> {
    const urlKey = getUrlKey(input.url);
    const snapshot = await browserBookmarks.loadTree();
    const exists = snapshot.bookmarks.some(
      (bookmark) => bookmark.url && getUrlKey(bookmark.url) === urlKey
    );
    if (exists) {
      logger.info('Bookmark already exists, skip quick-add:', input.url);
      return null;
    }
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

  // 对比当前书签树：认领可回收的元数据（书签被重加/换设备同步）并清理真正的孤儿
  async function cleanOrphanMeta(): Promise<number> {
    const snapshot = await browserBookmarks.loadTree();
    const { removed } = await reconcileMeta(snapshot.bookmarks);
    return removed;
  }

  // —— MV3 关键约束：唤醒事件的监听器必须在 SW 顶层同步注册 ——
  // 若放在任何 await 之后，SW 冷启动被闹钟/快捷键/书签事件唤醒时，
  // 事件在监听器注册前已分发完毕，直接丢失（自动扫描、快捷键间歇失效）
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
});
