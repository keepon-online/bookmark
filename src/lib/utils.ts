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

// 获取 favicon URL
export function getFaviconUrl(url: string, size = 32): string {
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

// 标准化 URL
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // 移除尾部斜杠
    let normalized = parsed.origin + parsed.pathname.replace(/\/$/, '');
    // 保留查询参数
    if (parsed.search) {
      normalized += parsed.search;
    }
    return normalized;
  } catch {
    return url;
  }
}

// 计算 URL 去重键：标准化后去除协议与 www 前缀并小写
// 写入 bookmarks.urlKey 索引，用于 O(log n) 查重
export function getUrlKey(url: string): string {
  return normalizeUrl(url)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '');
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
