// 消息通信工具

import type { Message, MessageResponse, MessageType } from '@/types';

// 监听消息（用于 background）
export function onMessage<TType extends MessageType = MessageType, R = unknown>(
  handler: (
    message: Message<TType>,
    sender: chrome.runtime.MessageSender
  ) => Promise<MessageResponse<R>> | MessageResponse<R>
): void {
  chrome.runtime.onMessage.addListener(
    (
      message: Message<TType>,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: MessageResponse<R>) => void
    ) => {
      Promise.resolve(handler(message, sender))
        .then(sendResponse)
        .catch((error) => {
          sendResponse({
            success: false,
            error: error.message || 'Unknown error',
            requestId: message.requestId,
          });
        });
      return true;
    }
  );
}

// 获取当前标签页信息
export async function getCurrentTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

// 获取当前页面信息
export async function getCurrentPageInfo(): Promise<{
  url: string;
  title: string;
  favicon?: string;
} | null> {
  const tab = await getCurrentTab();
  if (!tab || !tab.url) return null;

  return {
    url: tab.url,
    title: tab.title || tab.url,
    favicon: tab.favIconUrl,
  };
}

// 打开扩展侧边栏：Chrome 用 sidePanel API（MV3），Firefox 用
// sidebarAction.open（MV2，且只能由用户手势上下文触发）。
// 两者都不可用时静默失败（无侧栏能力的环境）
export async function openSidePanel(windowId?: number): Promise<void> {
  const chromeAny = chrome as unknown as {
    sidePanel?: { open: (options: { windowId?: number }) => Promise<void> };
    sidebarAction?: { open: () => Promise<void> };
  };
  try {
    if (chromeAny.sidePanel?.open) {
      await chromeAny.sidePanel.open({ windowId });
      return;
    }
    if (chromeAny.sidebarAction?.open) {
      await chromeAny.sidebarAction.open();
    }
  } catch {
    // Firefox sidebarAction 在非用户手势上下文会抛错，静默即可
  }
}
