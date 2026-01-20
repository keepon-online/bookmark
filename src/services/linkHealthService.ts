// 链接健康检查服务

import { db, type LinkCheck } from '@/lib/database';
import { httpChecker } from '@/lib/httpChecker';
import { generateId, now } from '@/lib/utils';
import type {
  Bookmark,
  LinkCheckResult,
  LinkHealthReport,
  BatchCheckOptions,
  CheckProgress,
} from '@/types';

export class LinkHealthService {
  private isRunning = false;
  private currentProgress: CheckProgress | null = null;
  private abortController: AbortController | null = null;

  /**
   * 检查单个链接
   */
  async checkLink(url: string): Promise<LinkCheckResult> {
    const result = await httpChecker.check(url);
    return {
      bookmarkId: '',
      ...result,
    };
  }

  /**
   * 检查单个书签
   */
  async checkBookmark(bookmarkId: string): Promise<LinkCheckResult | null> {
    const bookmark = await db.bookmarks.get(bookmarkId);
    if (!bookmark) return null;

    const result = await httpChecker.check(bookmark.url);

    const checkResult: LinkCheckResult = {
      bookmarkId,
      ...result,
    };

    // 保存检查记录
    await this.saveCheckResult(checkResult);

    // 更新书签状态
    await this.updateBookmarkStatus(bookmarkId, result.isAccessible);

    return checkResult;
  }

  /**
   * 批量检查书签
   */
  async checkBatch(
    bookmarkIds: string[],
    options: BatchCheckOptions = {},
    onProgress?: (progress: CheckProgress) => void
  ): Promise<LinkCheckResult[]> {
    const {
      batchSize = 10,
      concurrency = 5,
      timeout = 5000,
      retries = 2,
      skipRecentHours = 24,
    } = options;

    if (this.isRunning) {
      throw new Error('A check is already running');
    }

    this.isRunning = true;
    this.abortController = new AbortController();

    const results: LinkCheckResult[] = [];
    const startTime = Date.now();

    // 获取书签
    let bookmarks = await db.bookmarks.where('id').anyOf(bookmarkIds).toArray();

    // 过滤最近检查过的
    if (skipRecentHours > 0) {
      const cutoffTime = Date.now() - skipRecentHours * 60 * 60 * 1000;
      const allChecks = await db.linkChecks.toArray();
      const recentChecks = allChecks.filter(c => c.checkedAt && c.checkedAt > cutoffTime);
      const recentBookmarkIds = new Set(recentChecks.map((c) => c.bookmarkId));
      bookmarks = bookmarks.filter((b) => !recentBookmarkIds.has(b.id));
    }

    const total = bookmarks.length;
    let completed = 0;
    let success = 0;
    let failed = 0;
    const skipped = bookmarkIds.length - total;

    this.currentProgress = {
      total,
      completed,
      current: '',
      success,
      failed,
      skipped,
      startTime,
    };

    try {
      // 分批处理
      for (let i = 0; i < bookmarks.length; i += batchSize) {
        if (this.abortController.signal.aborted) {
          break;
        }

        const batch = bookmarks.slice(i, i + batchSize);
        const urls = batch.map((b) => b.url);

        // 并发检查
        const checkResults = await httpChecker.checkBatch(urls, {
          concurrency,
          timeout,
          retries,
        });

        // 处理结果
        for (let j = 0; j < batch.length; j++) {
          const bookmark = batch[j];
          const checkResult = checkResults[j];

          const result: LinkCheckResult = {
            bookmarkId: bookmark.id,
            ...checkResult,
          };

          results.push(result);

          // 保存检查记录
          await this.saveCheckResult(result);

          // 更新书签状态
          await this.updateBookmarkStatus(bookmark.id, checkResult.isAccessible);

          completed++;
          if (checkResult.isAccessible) {
            success++;
          } else {
            failed++;
          }

          // 更新进度
          this.currentProgress = {
            total,
            completed,
            current: bookmark.url,
            success,
            failed,
            skipped,
            startTime,
            estimatedRemaining: this.estimateRemaining(startTime, completed, total),
          };

          onProgress?.(this.currentProgress);
        }
      }
    } finally {
      this.isRunning = false;
      this.abortController = null;
      this.currentProgress = null;
    }

    return results;
  }

  /**
   * 检查所有书签
   */
  async checkAllBookmarks(
    options: BatchCheckOptions = {},
    onProgress?: (progress: CheckProgress) => void
  ): Promise<LinkHealthReport> {
    const allBookmarks = await db.bookmarks.toArray();
    const bookmarks = allBookmarks.filter(b => !b.isArchived);
    const bookmarkIds = bookmarks.map((b) => b.id);

    const results = await this.checkBatch(bookmarkIds, options, onProgress);

    return this.generateReport(results);
  }

  /**
   * 停止正在进行的检查
   */
  stopCheck(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * 获取当前进度
   */
  getProgress(): CheckProgress | null {
    return this.currentProgress;
  }

  /**
   * 是否正在运行
   */
  isCheckRunning(): boolean {
    return this.isRunning;
  }

  /**
   * 获取健康报告
   */
  async getHealthReport(): Promise<LinkHealthReport> {
    const bookmarks = await db.bookmarks.toArray();
    const total = bookmarks.length;

    const healthy = bookmarks.filter((b) => b.status === 'active').length;
    const broken = bookmarks.filter((b) => b.status === 'broken').length;
    const pending = bookmarks.filter((b) => b.status === 'pending').length;

    // 获取最近的检查记录计算平均响应时间
    const recentChecks = await db.linkChecks
      .orderBy('checkedAt')
      .reverse()
      .limit(100)
      .toArray();

    const responseTimes = recentChecks
      .filter((c) => c.responseTime > 0)
      .map((c) => c.responseTime);

    const avgResponseTime =
      responseTimes.length > 0
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : 0;

    const lastCheck = recentChecks[0];

    return {
      total,
      healthy,
      broken,
      pending,
      avgResponseTime,
      lastCheckedAt: lastCheck?.checkedAt || 0,
      byStatus: {
        unknown: pending,
        healthy,
        broken,
        timeout: 0,
        error: 0,
      },
    };
  }

  /**
   * 获取失效链接
   */
  async getBrokenLinks(limit = 50): Promise<Bookmark[]> {
    return db.bookmarks.where('status').equals('broken').limit(limit).toArray();
  }

  /**
   * 更新 URL
   */
  async updateUrl(bookmarkId: string, newUrl: string): Promise<void> {
    await db.bookmarks.update(bookmarkId, {
      url: newUrl,
      status: 'pending',
      updatedAt: now(),
    });
  }

  /**
   * 标记为已修复
   */
  async markAsFixed(bookmarkId: string): Promise<void> {
    await db.bookmarks.update(bookmarkId, {
      status: 'active',
      updatedAt: now(),
    });
  }

  /**
   * 获取书签的检查历史
   */
  async getCheckHistory(bookmarkId: string, limit = 10): Promise<LinkCheck[]> {
    return db.linkChecks
      .where('bookmarkId')
      .equals(bookmarkId)
      .reverse()
      .limit(limit)
      .toArray();
  }

  /**
   * 清理旧的检查记录
   */
  async cleanupOldRecords(daysToKeep = 30): Promise<number> {
    const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
    const allRecords = await db.linkChecks.toArray();
    const oldRecords = allRecords.filter(r => r.checkedAt && r.checkedAt < cutoffTime);
    const ids = oldRecords.map((r) => r.id);
    await db.linkChecks.bulkDelete(ids);
    return ids.length;
  }

  /**
   * 保存检查结果
   */
  private async saveCheckResult(result: LinkCheckResult): Promise<void> {
    const check: LinkCheck = {
      id: generateId(),
      bookmarkId: result.bookmarkId,
      status: result.status,
      isAccessible: result.isAccessible,
      responseTime: result.responseTime,
      errorMessage: result.errorMessage,
      checkedAt: result.checkedAt,
    };

    await db.linkChecks.add(check);
  }

  /**
   * 更新书签状态
   */
  private async updateBookmarkStatus(bookmarkId: string, isAccessible: boolean): Promise<void> {
    await db.bookmarks.update(bookmarkId, {
      status: isAccessible ? 'active' : 'broken',
      updatedAt: now(),
    });
  }

  /**
   * 生成报告
   */
  private generateReport(results: LinkCheckResult[]): LinkHealthReport {
    const total = results.length;
    const healthy = results.filter((r) => r.isAccessible).length;
    const broken = results.filter((r) => !r.isAccessible).length;

    const responseTimes = results.filter((r) => r.responseTime > 0).map((r) => r.responseTime);
    const avgResponseTime =
      responseTimes.length > 0
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : 0;

    return {
      total,
      healthy,
      broken,
      pending: 0,
      avgResponseTime,
      lastCheckedAt: Date.now(),
      byStatus: {
        unknown: 0,
        healthy,
        broken,
        timeout: results.filter((r) => r.status === 408).length,
        error: results.filter((r) => r.status === 0).length,
      },
    };
  }

  /**
   * 估算剩余时间
   */
  private estimateRemaining(startTime: number, completed: number, total: number): number {
    if (completed === 0) return 0;

    const elapsed = Date.now() - startTime;
    const avgTimePerItem = elapsed / completed;
    const remaining = total - completed;

    return Math.round(avgTimePerItem * remaining);
  }
}

// 单例导出
export const linkHealthService = new LinkHealthService();
