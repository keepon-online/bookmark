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
