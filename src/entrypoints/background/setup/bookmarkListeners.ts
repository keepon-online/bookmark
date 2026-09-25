// 浏览器书签事件监听
// 书签被删除后清理 aux 元数据（孤儿清扫），保证增强数据不残留

type BookmarksApi = {
  onRemoved: {
    addListener: (callback: (id: string, removeInfo: unknown) => void) => void;
  };
};

type LoggerLike = Pick<Console, 'log' | 'error'>;

interface BookmarkListenerDeps {
  bookmarks?: BookmarksApi;
  // 对比当前书签树并删除孤儿元数据
  cleanOrphanMeta: () => Promise<number>;
  logger?: LoggerLike;
}

export function setupBookmarkListeners({
  bookmarks,
  cleanOrphanMeta,
  logger = console,
}: BookmarkListenerDeps): void {
  if (!bookmarks) {
    return;
  }

  bookmarks.onRemoved.addListener((id) => {
    logger.log('[Background] Browser bookmark removed:', id);
    // 删除可能涉及整棵子树，统一用孤儿清扫兜底
    cleanOrphanMeta().catch((error) => {
      logger.error('[Background] Failed to clean orphan meta:', error);
    });
  });
}
