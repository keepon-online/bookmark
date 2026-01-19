// DeepSeek API 客户端

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
   * 发起 HTTP 请求
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.baseURL}${endpoint}`;
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
              console.error('Failed to parse SSE data:', error);
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

  /**
   * 获取使用统计（从响应中）
   */
  getLastUsage(): { promptTokens: number; completionTokens: number; totalTokens: number } | null {
    // TODO: 实现使用统计跟踪
    return null;
  }
}

/**
 * 创建 DeepSeek 客户端实例
 */
export function createDeepSeekClient(config: DeepSeekConfig): DeepSeekClient {
  return new DeepSeekClient(config);
}
