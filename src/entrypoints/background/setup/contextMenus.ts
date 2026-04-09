import type { CreateBookmarkDTO } from '@/types';

type ContextMenusApi = {
  removeAll: (callback: () => void) => void;
  create: (createProperties: chrome.contextMenus.CreateProperties) => void;
  onClicked: {
    addListener: (
      callback: (
        info: chrome.contextMenus.OnClickData,
        tab?: chrome.tabs.Tab
      ) => void | Promise<void>
    ) => void;
  };
};

type BookmarkServiceLike = {
  create: (payload: CreateBookmarkDTO) => Promise<unknown>;
};

type LoggerLike = Pick<Console, 'log' | 'error'>;

interface ContextMenuDeps {
  contextMenus?: ContextMenusApi;
  bookmarkService: BookmarkServiceLike;
  logger?: LoggerLike;
}

export function setupContextMenu({
  contextMenus,
  bookmarkService,
  logger = console,
}: ContextMenuDeps): void {
  if (!contextMenus) {
    return;
  }

  contextMenus.removeAll(() => {
    contextMenus.create({
      id: 'add-bookmark',
      title: '添加到智能书签',
      contexts: ['page', 'link'],
    });

    contextMenus.create({
      id: 'add-bookmark-with-tags',
      title: '添加书签并设置标签...',
      contexts: ['page', 'link'],
    });

    contextMenus.onClicked.addListener(async (info, tab) => {
      if (!tab?.url) {
        return;
      }

      const url = info.linkUrl || info.pageUrl || tab.url;
      const title = tab.title || url;

      try {
        if (info.menuItemId === 'add-bookmark' || info.menuItemId === 'add-bookmark-with-tags') {
          await bookmarkService.create({
            url,
            title,
            favicon: tab.favIconUrl,
          });

          if (info.menuItemId === 'add-bookmark') {
            logger.log('[Background] Bookmark added:', url);
          }
        }
      } catch (error) {
        logger.error('[Background] Failed to add bookmark:', error);
      }
    });
  });
}
