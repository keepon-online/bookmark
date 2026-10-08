import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepSeekAPIError, DeepSeekClient } from '@/lib/deepseekClient';

// 客户端只用到 ok / status / json 三个成员，构造最小响应对象即可，
// 避免依赖测试环境是否提供真正的 Response 实现
function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function errorResponse(status: number, message = 'boom'): Response {
  return { ok: false, status, json: async () => ({ error: { message } }) } as unknown as Response;
}

const SUCCESS_BODY = {
  id: 'chat-1',
  object: 'chat.completion',
  created: 0,
  model: 'deepseek-chat',
  choices: [{ index: 0, message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
};

const PARAMS = {
  model: 'deepseek-chat' as const,
  messages: [{ role: 'user' as const, content: 'hi' }],
};

function makeClient(maxRetries: number): DeepSeekClient {
  return new DeepSeekClient({ apiKey: 'test-key', maxRetries, timeout: 5000 });
}

describe('DeepSeekClient 重试策略', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('正常响应直接返回解析结果，不重试', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(SUCCESS_BODY));
    vi.stubGlobal('fetch', fetchMock);

    const result = await makeClient(3).chatCompletions(PARAMS);

    expect(result).toMatchObject({ id: 'chat-1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('网络层失败按退避重试，第二次成功即返回', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(okResponse(SUCCESS_BODY));
    vi.stubGlobal('fetch', fetchMock);

    const promise = makeClient(3).chatCompletions(PARAMS);
    const assertion = expect(promise).resolves.toMatchObject({ id: 'chat-1' });
    await vi.runAllTimersAsync();
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('429 与 5xx 属瞬时故障，会重试', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(429, 'rate limited'))
      .mockResolvedValueOnce(errorResponse(503, 'unavailable'))
      .mockResolvedValueOnce(okResponse(SUCCESS_BODY));
    vi.stubGlobal('fetch', fetchMock);

    const promise = makeClient(3).chatCompletions(PARAMS);
    const assertion = expect(promise).resolves.toMatchObject({ id: 'chat-1' });
    await vi.runAllTimersAsync();
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('4xx（如 401 密钥错误）重试结果一样，只请求一次', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(401, 'Invalid API key'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(makeClient(3).chatCompletions(PARAMS)).rejects.toThrow('Invalid API key');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('重试次数耗尽后抛出最后一次错误，且保留状态码', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(500, 'server error'));
    vi.stubGlobal('fetch', fetchMock);

    const promise = makeClient(2).chatCompletions(PARAMS);
    const assertion = expect(promise).rejects.toBeInstanceOf(DeepSeekAPIError);
    await vi.runAllTimersAsync();
    await assertion;

    await expect(promise).rejects.toMatchObject({ statusCode: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
