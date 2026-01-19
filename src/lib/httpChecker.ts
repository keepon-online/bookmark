// HTTP 检查器

import { sleep } from '@/lib/utils';

export interface CheckOptions {
  // HTTP 方法
  method?: 'HEAD' | 'GET';
  // 超时时间 (毫秒)
  timeout?: number;
  // 最大重定向次数
  maxRedirects?: number;
  // 重试次数
  retries?: number;
  // 重试延迟 (毫秒)
  retryDelay?: number;
}

export interface CheckResult {
  // URL
  url: string;
  // HTTP 状态码
  status: number;
  // 是否可访问
  isAccessible: boolean;
  // 响应时间 (毫秒)
  responseTime: number;
  // 最终 URL (重定向后)
  finalUrl?: string;
  // 错误信息
  errorMessage?: string;
  // 检查时间
  checkedAt: number;
}

const DEFAULT_OPTIONS: Required<CheckOptions> = {
  method: 'HEAD',
  timeout: 5000,
  maxRedirects: 3,
  retries: 2,
  retryDelay: 1000,
};

export class HttpChecker {
  /**
   * 检查单个 URL
   */
  async check(url: string, options: CheckOptions = {}): Promise<CheckResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= opts.retries; attempt++) {
      try {
        const result = await this.performCheck(url, opts);
        return result;
      } catch (error) {
        lastError = error as Error;

        // 如果是最后一次尝试，不再重试
        if (attempt < opts.retries) {
          // 指数退避
          const delay = opts.retryDelay * Math.pow(2, attempt);
          await sleep(delay);
        }
      }
    }

    // 所有重试都失败
    return {
      url,
      status: 0,
      isAccessible: false,
      responseTime: 0,
      errorMessage: lastError?.message || 'Unknown error',
      checkedAt: Date.now(),
    };
  }

  /**
   * 批量检查多个 URL
   */
  async checkBatch(
    urls: string[],
    options: CheckOptions & { concurrency?: number } = {}
  ): Promise<CheckResult[]> {
    const { concurrency = 5, ...checkOptions } = options;
    const results: CheckResult[] = [];
    const queue = [...urls];

    const workers = Array(Math.min(concurrency, urls.length))
      .fill(null)
      .map(async () => {
        while (queue.length > 0) {
          const url = queue.shift();
          if (url) {
            const result = await this.check(url, checkOptions);
            results.push(result);
          }
        }
      });

    await Promise.all(workers);
    return results;
  }

  /**
   * 执行单次检查
   */
  private async performCheck(url: string, options: Required<CheckOptions>): Promise<CheckResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout);

    const startTime = performance.now();

    try {
      const response = await fetch(url, {
        method: options.method,
        redirect: 'follow',
        signal: controller.signal,
        // 添加请求头以模拟浏览器
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      clearTimeout(timeoutId);

      const responseTime = Math.round(performance.now() - startTime);

      return {
        url,
        status: response.status,
        isAccessible: response.ok,
        responseTime,
        finalUrl: response.url !== url ? response.url : undefined,
        checkedAt: Date.now(),
      };
    } catch (error) {
      clearTimeout(timeoutId);

      const responseTime = Math.round(performance.now() - startTime);
      const err = error as Error;

      // 判断错误类型
      let errorMessage = err.message;
      let status = 0;

      if (err.name === 'AbortError') {
        errorMessage = 'Request timeout';
        status = 408; // Request Timeout
      } else if (err.message.includes('NetworkError') || err.message.includes('Failed to fetch')) {
        errorMessage = 'Network error';
        status = 0;
      } else if (err.message.includes('SSL') || err.message.includes('certificate')) {
        errorMessage = 'SSL certificate error';
        status = 495; // SSL Certificate Error
      }

      return {
        url,
        status,
        isAccessible: false,
        responseTime,
        errorMessage,
        checkedAt: Date.now(),
      };
    }
  }

  /**
   * 检查 URL 是否有效（语法检查）
   */
  isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  /**
   * 获取状态描述
   */
  getStatusDescription(status: number): string {
    const descriptions: Record<number, string> = {
      0: '无法连接',
      200: '正常',
      201: '已创建',
      204: '无内容',
      301: '永久重定向',
      302: '临时重定向',
      304: '未修改',
      400: '请求错误',
      401: '未授权',
      403: '禁止访问',
      404: '未找到',
      408: '请求超时',
      410: '已删除',
      429: '请求过多',
      495: 'SSL 错误',
      500: '服务器错误',
      502: '网关错误',
      503: '服务不可用',
      504: '网关超时',
    };

    return descriptions[status] || `HTTP ${status}`;
  }

  /**
   * 判断状态是否正常
   */
  isHealthyStatus(status: number): boolean {
    return status >= 200 && status < 400;
  }
}

// 单例导出
export const httpChecker = new HttpChecker();
