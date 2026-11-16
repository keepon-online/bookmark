// messaging.ts 单元测试：onMessage 包装、当前标签页/页面信息、侧栏打开三端兼容

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { onMessage, getCurrentTab, getCurrentPageInfo, openSidePanel } from '../messaging';

const listenerCalls = () => (chrome.runtime.onMessage.addListener as ReturnType<typeof vi.fn>).mock.calls;

describe('onMessage', () => {
  beforeEach(() => {
    vi.mocked(chrome.runtime.onMessage.addListener).mockClear();
  });

  it('注册监听器并对同步 handler 的结果调用 sendResponse', () => {
    const handler = vi.fn(() => ({ success: true, data: 42 }));
    onMessage(handler);

    const listener = listenerCalls()[0][0] as any;
    const sendResponse = vi.fn();
    const ret = listener({ type: 'PING', requestId: 'r1' }, {} as chrome.runtime.MessageSender, sendResponse);

    expect(ret).toBe(true);
    expect(handler).toHaveBeenCalledWith({ type: 'PING', requestId: 'r1' }, {});
    // handler 返回非 Promise 也要被 Promise.resolve 归一化
    return Promise.resolve().then(() => {
      expect(sendResponse).toHaveBeenCalledWith({ success: true, data: 42 });
    });
  });

  it('异步 handler 成功时透传响应', async () => {
    const handler = vi.fn(async () => ({ success: true }));
    onMessage(handler);

    const listener = listenerCalls()[0][0] as any;
    const sendResponse = vi.fn();
    listener({ type: 'PING' }, {} as chrome.runtime.MessageSender, sendResponse);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ success: true }));
  });

  it('handler 抛错时返回 success:false 且带 requestId 与错误信息', async () => {
    const handler = vi.fn(async () => {
      throw new Error('boom');
    });
    onMessage(handler);

    const listener = listenerCalls()[0][0] as any;
    const sendResponse = vi.fn();
    listener({ type: 'PING', requestId: 'req-9' }, {} as chrome.runtime.MessageSender, sendResponse);
    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'boom',
        requestId: 'req-9',
      })
    );
  });

  it('非 Error 抛出值时兜底为 Unknown error', async () => {
    const handler = vi.fn(() => Promise.reject('裸字符串'));
    onMessage(handler);

    const listener = listenerCalls()[0][0] as any;
    const sendResponse = vi.fn();
    listener({ type: 'PING' }, {} as chrome.runtime.MessageSender, sendResponse);
    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Unknown error' })
      )
    );
  });
});

describe('getCurrentTab', () => {
  it('无激活标签页时返回 null', async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValueOnce([]);
    expect(await getCurrentTab()).toBeNull();
  });

  it('返回当前窗口的激活标签页', async () => {
    const tab = { id: 7, url: 'https://a.dev' } as chrome.tabs.Tab;
    vi.mocked(chrome.tabs.query).mockResolvedValueOnce([tab]);
    expect(await getCurrentTab()).toBe(tab);
    expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
  });
});

describe('getCurrentPageInfo', () => {
  it('无标签页时返回 null', async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValueOnce([]);
    expect(await getCurrentPageInfo()).toBeNull();
  });

  it('标签页无 url 时返回 null', async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValueOnce([{ id: 1 } as chrome.tabs.Tab]);
    expect(await getCurrentPageInfo()).toBeNull();
  });

  it('返回 url/title/favicon；title 缺失时回退为 url', async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValueOnce([
      { id: 1, url: 'https://a.dev', favIconUrl: 'https://a.dev/f.png' } as chrome.tabs.Tab,
    ]);
    expect(await getCurrentPageInfo()).toEqual({
      url: 'https://a.dev',
      title: 'https://a.dev',
      favicon: 'https://a.dev/f.png',
    });
  });

  it('完整标签页信息原样映射', async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValueOnce([
      { id: 2, url: 'https://b.dev/x', title: '页面标题' } as chrome.tabs.Tab,
    ]);
    expect(await getCurrentPageInfo()).toEqual({
      url: 'https://b.dev/x',
      title: '页面标题',
      favicon: undefined,
    });
  });
});

describe('openSidePanel', () => {
  const withChrome = async (extra: Record<string, unknown>, fn: () => Promise<unknown>) => {
    const original = (global as any).chrome;
    (global as any).chrome = { ...original, ...extra };
    try {
      return await fn();
    } finally {
      (global as any).chrome = original;
    }
  };

  it('Chrome 环境优先 sidePanel.open 并透传 windowId', async () => {
    const open = vi.fn(async () => {});
    await withChrome({ sidePanel: { open } }, () => openSidePanel(123));
    expect(open).toHaveBeenCalledWith({ windowId: 123 });
  });

  it('无 sidePanel 时回退 Firefox sidebarAction.open', async () => {
    const open = vi.fn(async () => {});
    await withChrome({ sidePanel: undefined, sidebarAction: { open } }, () => openSidePanel());
    expect(open).toHaveBeenCalled();
  });

  it('两者都不可用时静默不抛错', async () => {
    await withChrome({ sidePanel: undefined, sidebarAction: undefined }, () =>
      expect(openSidePanel()).resolves.toBeUndefined()
    );
  });

  it('sidePanel.open 抛错时吞掉（非用户手势上下文）', async () => {
    const open = vi.fn(() => Promise.reject(new Error('no gesture')));
    await withChrome({ sidePanel: { open } }, () =>
      expect(openSidePanel()).resolves.toBeUndefined()
    );
  });
});
