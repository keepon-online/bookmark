// 链接健康相关类型定义

import type { Bookmark } from './bookmark';

// 链接状态
export type LinkStatus = 'unknown' | 'healthy' | 'broken' | 'timeout' | 'error';

// 检查结果
export interface LinkCheckResult {
  // 书签 ID
  bookmarkId: string;
  // URL
  url: string;
  // HTTP 状态码
  status: number;
  // 是否可访问
  isAccessible: boolean;
  // 响应时间 (毫秒)
  responseTime: number;
  // 最终 URL (处理重定向后)
  finalUrl?: string;
  // 错误信息
  errorMessage?: string;
  // 检查时间
  checkedAt: number;
}

// 健康报告
export interface LinkHealthReport {
  // 总数
  total: number;
  // 健康数量
  healthy: number;
  // 失效数量
  broken: number;
  // 待检查数量
  pending: number;
  // 平均响应时间
  avgResponseTime: number;
  // 最后检查时间
  lastCheckedAt: number;
  // 按状态分组
  byStatus: Record<LinkStatus, number>;
}

// 批量检查选项
export interface BatchCheckOptions {
  // 批次大小
  batchSize?: number;
  // 并发数
  concurrency?: number;
  // 超时时间 (毫秒)
  timeout?: number;
  // 重试次数
  retries?: number;
  // 只检查未检查过的
  onlyNew?: boolean;
  // 是否跳过最近检查过的
  skipRecentHours?: number;
}

// 检查进度
export interface CheckProgress {
  // 总数
  total: number;
  // 已完成
  completed: number;
  // 当前状态
  current: string;
  // 成功数量
  success: number;
  // 失败数量
  failed: number;
  // 跳过数量
  skipped: number;
  // 开始时间
  startTime: number;
  // 预计剩余时间 (毫秒)
  estimatedRemaining?: number;
}

// 检查配置
export interface LinkHealthConfig {
  // 是否启用
  enabled: boolean;
  // 自动检查间隔 (小时)
  checkInterval: number;
  // 默认超时 (毫秒)
  defaultTimeout: number;
  // 默认重试次数
  defaultRetries: number;
  // 并发数
  concurrency: number;
  // 批次大小
  batchSize: number;
  // 跳过最近检查过的 (小时)
  skipRecentHours: number;
}

// 链接历史记录
export interface LinkCheckHistory {
  id: string;
  bookmarkId: string;
  checks: Array<{
    status: number;
    isAccessible: boolean;
    responseTime: number;
    checkedAt: number;
  }>;
  lastCheckedAt: number;
  // 健康度 (0-1)
  healthScore: number;
  // 变化趋势
  trend: 'improving' | 'declining' | 'stable';
}
