import { getCurrentPageInfo, getCurrentTab } from '@/lib/messaging';
import type { CreateBookmarkDTO } from '@/types';

type TabInfo = Awaited<ReturnType<typeof getCurrentTab>>;

type BookmarkServiceLike = {
  create?: (payload: CreateBookmarkDTO) => Promise<unknown>;
  getAll?: (options?: { limit?: number }) => Promise<Array<{ id: string; url: string }>>;
  toggleFavorite?: (id: string) => Promise<unknown>;
};

export interface CommandHandlerDeps {
  bookmarkService: Pick<BookmarkServiceLike, 'create' | 'getAll' | 'toggleFavorite'>;
  getCurrentPageInfo: typeof getCurrentPageInfo;
  queryActiveTab: (queryInfo: chrome.tabs.QueryInfo) => Promise<TabInfo[]>;
  openSidePanel: (options: { windowId: number }) => Promise<void>;
}

export function createCommandHandler({
  bookmarkService,
  getCurrentPageInfo: resolveCurrentPageInfo,
  queryActiveTab,
  openSidePanel,
}: CommandHandlerDeps) {
  return async (command: string): Promise<void> => {
    switch (command) {
      case 'open-sidepanel':
      case 'search-bookmarks': {
        const [tab] = await queryActiveTab({ active: true, currentWindow: true });
        if (tab?.windowId !== undefined) {
          await openSidePanel({ windowId: tab.windowId });
        }
        return;
      }

      case 'quick-add': {
        const pageInfo = await resolveCurrentPageInfo();
        if (!pageInfo) {
          return;
        }

        await bookmarkService.create?.({
          url: pageInfo.url,
          title: pageInfo.title,
          favicon: pageInfo.favicon,
        });
        return;
      }

      case 'toggle-favorite': {
        const pageInfo = await resolveCurrentPageInfo();
        if (!pageInfo?.url) {
          return;
        }

        const bookmarks = (await bookmarkService.getAll?.({ limit: 1000 })) ?? [];
        const existing = bookmarks.find((bookmark) => bookmark.url === pageInfo.url);
        if (existing) {
          await bookmarkService.toggleFavorite?.(existing.id);
        }
        return;
      }

      default:
        return;
    }
  };
}

export function createDefaultCommandHandler(
  deps: Pick<CommandHandlerDeps, 'bookmarkService'> &
    Partial<Pick<CommandHandlerDeps, 'getCurrentPageInfo' | 'queryActiveTab' | 'openSidePanel'>>
) {
  return createCommandHandler({
    bookmarkService: deps.bookmarkService,
    getCurrentPageInfo: deps.getCurrentPageInfo ?? getCurrentPageInfo,
    queryActiveTab: deps.queryActiveTab ?? ((queryInfo) => chrome.tabs.query(queryInfo)),
    openSidePanel:
      deps.openSidePanel ??
      (async ({ windowId }) => {
        if (chrome.sidePanel) {
          await chrome.sidePanel.open({ windowId });
        }
      }),
  });
}
