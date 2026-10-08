// DeepSeek API 客户端

import { sleep } from './utils';
import { createLogger } from './logger';

// 重试的指数退避基数（毫秒）：500 / 1000 / 2000 ...
const RETRY_BASE_DELAY_MS = 500;

const logger = createLogger('DeepSeekClient');

/**
 * DeepSeek API 配置
 */
export interface DeepSeekConfig {
  apiKey: string;
  baseURL?: string;
  timeout?: number;
  maxRetries?: number;
}

/**
 * Chat 消息
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Chat 请求参数
 */
export interface ChatCompletionParams {
  model: 'deepseek-chat' | 'deepseek-coder';
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
}

/**
 * Chat 响应
 */
export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * 流式响应块
 */
export interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }>;
}

/**
 * API 错误
 */
export class DeepSeekAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'DeepSeekAPIError';
  }
}

/**
 * DeepSeek API 客户端
 */
export class DeepSeekClient {
  private config: Required<DeepSeekConfig>;
  private defaultBaseURL = 'https://api.deepseek.com/v1';

  constructor(config: DeepSeekConfig) {
    this.config = {
      apiKey: config.apiKey,
      baseURL: config.baseURL || this.defaultBaseURL,
      timeout: config.timeout || 30000,
      maxRetries: config.maxRetries || 3,
    };
  }

  /**
   * 发起 HTTP 请求。
   * 网络层失败/超时、429 与 5xx 会按 maxRetries 指数退避重试；
   * 其余 4xx 重试结果一样，直接抛出。
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.baseURL}${endpoint}`;
    const maxAttempts = Math.max(1, this.config.maxRetries);
    let lastError = new DeepSeekAPIError('Unknown error occurred');

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await this.requestOnce<T>(url, options);
      } catch (error) {
        lastError =
          error instanceof DeepSeekAPIError ? error : new DeepSeekAPIError('Unknown error occurred');

        // 无状态码 = 网络层失败或超时；429 与 5xx 属瞬时故障
        const retryable =
          lastError.statusCode === undefined ||
          lastError.statusCode === 429 ||
          lastError.statusCode >= 500;
        if (!retryable || attempt === maxAttempts - 1) {
          throw lastError;
        }
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
      }
    }

    throw lastError;
  }

  /**
   * 单次请求（带超时与错误归一化）
   */
  private async requestOnce<T>(url: string, options: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new DeepSeekAPIError(
          error.error?.message || `HTTP ${response.status}`,
          response.status,
          error
        );
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof DeepSeekAPIError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new DeepSeekAPIError('Request timeout');
        }
        throw new DeepSeekAPIError(error.message);
      }

      throw new DeepSeekAPIError('Unknown error occurred');
    }
  }

  /**
   * Chat Completions API
   */
  async chatCompletions(
    params: ChatCompletionParams
  ): Promise<ChatCompletionResponse> {
    return this.request<ChatCompletionResponse>('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.max_tokens ?? 2000,
        top_p: params.top_p ?? 1.0,
        stream: false,
      }),
    });
  }

  /**
   * 流式 Chat Completions API
   */
  async *streamChatCompletions(
    params: ChatCompletionParams
  ): AsyncGenerator<ChatCompletionChunk> {
    const response = await fetch(`${this.config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.max_tokens ?? 2000,
        top_p: params.top_p ?? 1.0,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new DeepSeekAPIError(
        error.error?.message || `HTTP ${response.status}`,
        response.status,
        error
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new DeepSeekAPIError('Response body is null');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;

          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6)) as ChatCompletionChunk;
              yield data;
            } catch (error) {
              logger.error('Failed to parse SSE data', error);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 测试 API 连接
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.chatCompletions({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 5,
      });
      return !!response.choices?.[0]?.message?.content;
    } catch {
      return false;
    }
  }
}

/**
 * 创建 DeepSeek 客户端实例
 */
export function createDeepSeekClient(config: DeepSeekConfig): DeepSeekClient {
  return new DeepSeekClient(config);
}
