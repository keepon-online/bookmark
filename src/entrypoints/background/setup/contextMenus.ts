// 右键菜单：直接把页面/链接加入浏览器书签栏

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

type CreateBookmarkFn = (input: { url: string; title: string }) => Promise<unknown>;

type LoggerLike = Pick<Console, 'log' | 'error'>;

interface ContextMenuDeps {
  contextMenus?: ContextMenusApi;
  createBookmark: CreateBookmarkFn;
  logger?: LoggerLike;
}

export function setupContextMenu({
  contextMenus,
  createBookmark,
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

    contextMenus.onClicked.addListener(async (info, tab) => {
      if (info.menuItemId !== 'add-bookmark') {
        return;
      }

      const url = info.linkUrl || info.pageUrl || tab?.url;
      if (!url) {
        return;
      }

      try {
        await createBookmark({ url, title: tab?.title || url });
        logger.log('[Background] Bookmark added:', url);
      } catch (error) {
        logger.error('[Background] Failed to add bookmark:', error);
      }
    });
  });
}
