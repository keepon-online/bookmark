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

// 网络层失败的具体类别
export type NetworkErrorKind =
  | 'timeout' // 请求超时（服务器未在时限内响应）
  | 'network' // 连接失败（DNS/断网/连接被拒等）
  | 'ssl' // 证书错误（主机可达但 TLS 异常）
  | 'blocked'; // 环境限制（无主机权限/CORS 拦截/opaque 响应）

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
  // 网络层失败（未获得任何 HTTP 响应），不能据此判断链接失效
  networkError?: boolean;
  // 网络层失败的具体类别
  errorKind?: NetworkErrorKind;
  // 疑似停放域名/软 404（状态 200 但内容是域名出售页）
  soft404?: boolean;
}

const DEFAULT_OPTIONS: Required<CheckOptions> = {
  method: 'HEAD',
  timeout: 5000,
  maxRedirects: 3,
  retries: 2,
  retryDelay: 1000,
};

// 合并选项：过滤掉显式传入的 undefined，避免覆盖默认值
// （setTimeout(fn, undefined) 会立即触发 abort，retries: undefined 会跳过重试）
function mergeOptions(options: CheckOptions): Required<CheckOptions> {
  const defined = Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined)
  ) as CheckOptions;
  return { ...DEFAULT_OPTIONS, ...defined };
}

// 是否有扩展主机权限：无权限时跨源 fetch 必然失败，重试没有意义
async function hasFetchPermission(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.permissions?.contains) {
    return true; // 测试/非扩展环境
  }
  try {
    return await chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] });
  } catch {
    return true;
  }
}

// 释放未消费的响应体，避免批量检查时连接悬挂
async function releaseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // body 可能已消费或不支持 cancel
  }
}

// 停放域名/软 404 页面特征
const PARKED_SIGNATURES: RegExp[] = [
  /buy this domain/i,
  /domain (?:is )?(?:for sale|parked)/i,
  /域名(出售|交易|停放|到期|过期|被注册)/,
  /该域名.{0,12}(出售|转让|续费|过期)/,
];
// 最多读取的正文字节数
const SOFT404_MAX_SNIPPET_BYTES = 64 * 1024;
// 停放页通常极小，超过该体积视为正常页面
const SOFT404_MAX_PAGE_BYTES = 4 * 1024;

export class HttpChecker {
  /**
   * 检查单个 URL。
   * 网络层失败中可重试的类别（超时/连接失败）按指数退避重试；
   * 无权限/证书错误重试必然同样结果，直接返回。
   */
  async check(url: string, options: CheckOptions = {}): Promise<CheckResult> {
    const opts = mergeOptions(options);

    for (let attempt = 0; ; attempt++) {
      const result = await this.performCheck(url, opts);
      // 部分服务器不接受 HEAD（405/501），回退 GET 重试一次
      if (
        opts.method === 'HEAD' &&
        !result.networkError &&
        (result.status === 405 || result.status === 501)
      ) {
        return this.performCheck(url, { ...opts, method: 'GET' });
      }
      const retryable =
        result.networkError && (result.errorKind === 'timeout' || result.errorKind === 'network');
      if (!retryable || attempt >= opts.retries) {
        return result;
      }
      // 指数退避
      await sleep(opts.retryDelay * Math.pow(2, attempt));
    }
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
        cache: 'no-cache',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      clearTimeout(timeoutId);

      const responseTime = Math.round(performance.now() - startTime);

      if (response.type === 'opaque') {
        await releaseBody(response);
        return {
          url,
          status: 0,
          isAccessible: false,
          responseTime,
          errorMessage: 'Opaque response',
          checkedAt: Date.now(),
          networkError: true,
          errorKind: 'blocked',
        };
      }

      // GET 请求顺带做软 404 检测（读取少量正文判断是否停放页）
      let soft404 = false;
      if (options.method === 'GET' && response.status === 200) {
        soft404 = await this.sniffSoft404(response);
      } else {
        await releaseBody(response);
      }

      return {
        url,
        status: response.status,
        isAccessible: response.ok && !soft404,
        responseTime,
        finalUrl: response.url !== url ? response.url : undefined,
        errorMessage: response.ok ? undefined : this.getStatusDescription(response.status),
        checkedAt: Date.now(),
        soft404: soft404 || undefined,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      const responseTime = Math.round(performance.now() - startTime);
      const err = error as Error;

      let errorKind: NetworkErrorKind = 'network';
      let errorMessage = err.message || 'Network error';

      if (err.name === 'AbortError') {
        errorKind = 'timeout';
        errorMessage = 'Request timeout';
      } else if (err.message.includes('SSL') || err.message.includes('certificate')) {
        errorKind = 'ssl';
        errorMessage = 'SSL certificate error';
      } else if (!(await hasFetchPermission())) {
        errorKind = 'blocked';
        errorMessage = 'Host permission not granted';
      }

      return {
        url,
        status: 0,
        isAccessible: false,
        responseTime,
        errorMessage,
        checkedAt: Date.now(),
        networkError: true,
        errorKind,
      };
    }
  }

  /**
   * 读取少量正文判断是否停放域名/软 404 页面。
   * 停放页体积极小且含出售特征词，二者同时满足才判定，
   * 避免把恰好包含关键词的正常页面误杀。
   */
  private async sniffSoft404(response: Response): Promise<boolean> {
    try {
      const reader = response.body?.getReader();
      if (!reader) {
        return false;
      }
      const decoder = new TextDecoder();
      let text = '';
      let received = 0;
      while (received < SOFT404_MAX_SNIPPET_BYTES) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        received += value.byteLength;
        text += decoder.decode(value, { stream: true });
        if (received > SOFT404_MAX_PAGE_BYTES) {
          break;
        }
      }
      await reader.cancel().catch(() => {});
      if (received === 0 || received > SOFT404_MAX_PAGE_BYTES) {
        return false;
      }
      return PARKED_SIGNATURES.some((re) => re.test(text));
    } catch {
      return false;
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
