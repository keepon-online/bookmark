// 消息通信工具

import type { Message, MessageResponse, MessageType } from '@/types';

// 发送消息到 background service worker
export async function sendMessage<T = unknown, R = unknown>(
  type: MessageType,
  payload?: T
): Promise<R> {
  const requestId = crypto.randomUUID();
  const message: Message<T> = { type, payload, requestId };

  try {
    const response = await chrome.runtime.sendMessage<Message<T>, MessageResponse<R>>(message);

    if (!response) {
      throw new Error('No response from background');
    }

    if (!response.success) {
      throw new Error(response.error || 'Unknown error');
    }

    return response.data as R;
  } catch (error) {
    console.error(`[Messaging] Error sending message ${type}:`, error);
    throw error;
  }
}

// 监听消息（用于 background）
export function onMessage<T = unknown, R = unknown>(
  handler: (
    message: Message<T>,
    sender: chrome.runtime.MessageSender
  ) => Promise<MessageResponse<R>> | MessageResponse<R>
): void {
  chrome.runtime.onMessage.addListener(
    (
      message: Message<T>,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: MessageResponse<R>) => void
    ) => {
      // 处理消息并发送响应
      const result = handler(message, sender);

      if (result instanceof Promise) {
        result.then(sendResponse).catch((error) => {
          sendResponse({
            success: false,
            error: error.message || 'Unknown error',
            requestId: message.requestId,
          });
        });
        return true; // 保持消息通道开放
      } else {
        sendResponse(result);
        return false;
      }
    }
  );
}

// 广播消息到所有页面
export async function broadcastMessage<T = unknown>(
  type: MessageType,
  payload?: T
): Promise<void> {
  const message: Message<T> = { type, payload };

  // 发送到所有扩展页面
  try {
    await chrome.runtime.sendMessage(message);
  } catch {
    // 忽略没有监听器的错误
  }

  // 发送到所有标签页的 content scripts
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, message);
      } catch {
        // 忽略没有 content script 的标签页
      }
    }
  }
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
