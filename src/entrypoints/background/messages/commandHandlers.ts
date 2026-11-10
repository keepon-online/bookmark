// 快捷键命令处理
// v0.6：quick-add 直写 chrome.bookmarks；toggle-favorite 通过
// URL 匹配书签后写 aux 元数据

import { getCurrentPageInfo, getCurrentTab, openSidePanel as openSidePanelHelper } from '@/lib/messaging';

type TabInfo = Awaited<ReturnType<typeof getCurrentTab>>;

export interface CommandHandlerDeps {
  // 将当前页加入浏览器书签栏
  addBookmarkToBar: (input: { url: string; title: string }) => Promise<unknown>;
  // 按当前页 URL 切换书签收藏（aux 元数据），返回切换后的收藏状态
  toggleFavoriteByUrl: (url: string) => Promise<boolean>;
  getCurrentPageInfo: typeof getCurrentPageInfo;
  queryActiveTab: (queryInfo: chrome.tabs.QueryInfo) => Promise<TabInfo[]>;
  openSidePanel: (options: { windowId?: number }) => Promise<void>;
}

export function createCommandHandler({
  addBookmarkToBar,
  toggleFavoriteByUrl,
  getCurrentPageInfo: resolveCurrentPageInfo,
  queryActiveTab,
  openSidePanel,
}: CommandHandlerDeps) {
  return async (command: string): Promise<void> => {
    switch (command) {
      case 'open-sidepanel':
      case 'search-bookmarks': {
        // 查不到标签（全部窗口最小化等）也要尽力打开
        const [tab] = await queryActiveTab({ active: true, currentWindow: true }).catch(
          () => [] as TabInfo[]
        );
        await openSidePanel({ windowId: tab?.windowId });
        return;
      }

      case 'quick-add': {
        const pageInfo = await resolveCurrentPageInfo();
        if (!pageInfo) {
          return;
        }
        await addBookmarkToBar({ url: pageInfo.url, title: pageInfo.title });
        return;
      }

      case 'toggle-favorite': {
        const pageInfo = await resolveCurrentPageInfo();
        if (!pageInfo?.url) {
          return;
        }
        await toggleFavoriteByUrl(pageInfo.url);
        return;
      }

      default:
        return;
    }
  };
}

export function createDefaultCommandHandler(
  deps: Pick<CommandHandlerDeps, 'addBookmarkToBar' | 'toggleFavoriteByUrl'> &
    Partial<
      Pick<CommandHandlerDeps, 'getCurrentPageInfo' | 'queryActiveTab' | 'openSidePanel'>
    >
) {
  return createCommandHandler({
    addBookmarkToBar: deps.addBookmarkToBar,
    toggleFavoriteByUrl: deps.toggleFavoriteByUrl,
    getCurrentPageInfo: deps.getCurrentPageInfo ?? getCurrentPageInfo,
    queryActiveTab: deps.queryActiveTab ?? ((queryInfo) => chrome.tabs.query(queryInfo)),
    openSidePanel:
      deps.openSidePanel ??
      (async ({ windowId }) => {
        // 上游没拿到 windowId 时（如全部窗口最小化）取当前窗口兜底；
        // 兜底失败也不能让命令成为 unhandled rejection
        let realId = windowId;
        if (realId === undefined) {
          try {
            realId = (await chrome.windows.getCurrent())?.id;
          } catch {
            // windows API 不可用（上下文失效），不带 windowId 尽力打开
          }
        }
        await openSidePanelHelper(realId);
      }),
  });
}
