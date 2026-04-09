type BookmarksApi = {
  onCreated: {
    addListener: (callback: (id: string, bookmark: chrome.bookmarks.BookmarkTreeNode) => void) => void;
  };
  onRemoved: {
    addListener: (callback: (id: string, removeInfo: unknown) => void) => void;
  };
};

type LoggerLike = Pick<Console, 'log'>;

interface BookmarkListenerDeps {
  bookmarks?: BookmarksApi;
  logger?: LoggerLike;
}

export function setupBookmarkListeners({
  bookmarks,
  logger = console,
}: BookmarkListenerDeps): void {
  if (!bookmarks) {
    return;
  }

  bookmarks.onCreated.addListener((_id, bookmark) => {
    logger.log('[Background] Browser bookmark created:', bookmark.url);
  });

  bookmarks.onRemoved.addListener((id, _removeInfo) => {
    logger.log('[Background] Browser bookmark removed:', id);
  });
}
