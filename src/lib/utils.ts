// 工具函数

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// 合并 Tailwind CSS 类名
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 生成 UUID
export function generateId(): string {
  return crypto.randomUUID();
}

// 获取当前时间戳
export function now(): number {
  return Date.now();
}

// 相对时间格式化器缓存：Intl 构造开销大，避免列表渲染时每卡片重建
const relativeTimeFormatters = new Map<string, Intl.RelativeTimeFormat>();

function getRelativeTimeFormatter(locale: string): Intl.RelativeTimeFormat {
  let rtf = relativeTimeFormatters.get(locale);
  if (!rtf) {
    rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    relativeTimeFormatters.set(locale, rtf);
  }
  return rtf;
}

// 格式化相对时间
export function formatRelativeTime(timestamp: number, locale = 'zh-CN'): string {
  const now = Date.now();
  const diff = now - timestamp;
  // 未来时间戳（时钟回拨/导入自超前设备的备份）：输出"3600秒后"式
  // 怪文案，钳位为"刚刚"
  if (diff < 0) {
    return '刚刚';
  }

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  const rtf = getRelativeTimeFormatter(locale);

  if (years > 0) return rtf.format(-years, 'year');
  if (months > 0) return rtf.format(-months, 'month');
  if (weeks > 0) return rtf.format(-weeks, 'week');
  if (days > 0) return rtf.format(-days, 'day');
  if (hours > 0) return rtf.format(-hours, 'hour');
  if (minutes > 0) return rtf.format(-minutes, 'minute');
  return rtf.format(-seconds, 'second');
}

// 解析 URL
export function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

// 获取域名
export function getDomain(url: string): string {
  const parsed = parseUrl(url);
  return parsed?.hostname || url;
}

// 书签 URL 是外部可控数据（账号同步/导入备份）：只有 http/ https/
// 才允许进入 window.open 与 <a href>，javascript: 等协议直接拒开
export function isHttpUrl(url: string | undefined): boolean {
  if (!url) return false;
  return /^https?:\/\//i.test(url.trim());
}

// 扩展环境且 manifest 声明了 favicon 权限时，_favicon 端点才可用。
// Firefox 也有 runtime.getURL 但没有该端点，仅凭 API 存在性会误判
function hasLocalFaviconEndpoint(): boolean {
  if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) {
    return false;
  }
  try {
    const manifest = chrome.runtime.getManifest();
    return (manifest.permissions ?? []).includes('favicon');
  } catch {
    return false;
  }
}

// 获取 favicon URL。
// 本地端点取图——把每个书签的域名发给 Google favicon 服务等于
// 打开侧栏就上报整个书签库的域名集合。非支持环境（测试/Firefox）
// 退回 Google 源
export function getFaviconUrl(url: string, size = 32): string {
  if (hasLocalFaviconEndpoint()) {
    return `${chrome.runtime.getURL('/_favicon/')}?pageUrl=${encodeURIComponent(url)}&sz=${size}`;
  }
  const domain = getDomain(url);
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
}

// 截断文本
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

// 休眠
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 验证 URL
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// 计算 URL 去重键：去协议与 www 前缀、去尾斜杠与 hash、host 小写。
// 路径与查询参数**保持原大小写**——它们在现实中大小写敏感（YouTube
// 视频 ID、S3/Unix 路径），整体 toLowerCase 会把不同页面判成同页，
// 查重面板会预选删除"伪重复"书签
export function getUrlKey(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  // 非网页协议（chrome:/javascript: 等 origin 为 'null'）与空 host：
  // 构造不出稳定键，原样返回，避免跨协议碰撞成同一个垃圾键
  if (!parsed.hostname || parsed.origin === 'null') {
    return url;
  }
  const host = (parsed.hostname + (parsed.port ? `:${parsed.port}` : ''))
    .replace(/^www\./, '');
  const path = parsed.pathname.replace(/\/$/, '');
  return `${host}${path}${parsed.search}`;
}

// 提取关键词（简单实现）
export function extractKeywords(text: string): string[] {
  // 移除标点符号
  const cleaned = text.toLowerCase().replace(/[^\w\s\u4e00-\u9fa5]/g, ' ');
  // 分词
  const words = cleaned.split(/\s+/).filter((w) => w.length > 1);
  // 去重
  return [...new Set(words)];
}
