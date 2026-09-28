// 链接健康服务 v2
// 输入浏览器书签节点（chrome.bookmarks 唯一数据源），
// 检查结果写入 aux（linkChecks 历史 + bookmarkMeta.linkStatus）。
// 手动触发、可停止、支持跳过近期已检查项。

import { httpChecker } from '@/lib/httpChecker';
import { auxDb, defaultMeta, type LinkCheckRecord } from '@/lib/auxDatabase';
import { generateId, getDomain, now } from '@/lib/utils';
import type { AuxBookmarkMeta, BrowserBookmarkNode } from '@/types';
import type { BatchCheckOptions, CheckProgress, LinkCheckResult, LinkHealthReport } from '@/types/linkHealth';

const DEFAULT_CONCURRENCY = 5;

// 状态码 → 链接状态。401/403/405/408/429 视为"可达但拒绝/受限"，
// 不能判为死链（如 Cloudflare 拦截、服务器超时抱怨——能回应就说明活着）。
export function classifyLinkStatus(status: number): 'active' | 'broken' {
  if (status >= 200 && status < 400) {
    return 'active';
  }
  if ([401, 403, 405, 408, 429].includes(status)) {
    return 'active';
  }
  return 'broken';
}

export class LinkHealthService {
  private stopRequested = false;
  private running = false;

  stopCheck(): void {
    this.stopRequested = true;
  }

  isCheckRunning(): boolean {
    return this.running;
  }

  // 批量检查书签节点：结果写 aux 并返回
  async checkBookmarks(
    nodes: BrowserBookmarkNode[],
    options: BatchCheckOptions = {},
    onProgress?: (progress: CheckProgress) => void
  ): Promise<LinkCheckResult[]> {
    if (this.running) {
      return [];
    }
    this.running = true;
    this.stopRequested = false;

    try {
      const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
      const skipRecentMs = (options.skipRecentHours ?? 0) * 3600_000;
      const whitelist = new Set((options.whitelist ?? []).map((domain) => domain.toLowerCase()));

      // 预取元数据以判断跳过项
      const metas = await auxDb.bookmarkMeta.bulkGet(nodes.map((node) => node.id));
      const pending: Array<{ node: BrowserBookmarkNode; meta?: AuxBookmarkMeta }> = [];
      let skipped = 0;
      nodes.forEach((node, index) => {
        if (!node.url) return;
        // 白名单域名跳过检查
        if (node.url && whitelist.has(getDomain(node.url).toLowerCase())) {
          skipped++;
          return;
        }
        const meta = metas[index];
        if (skipRecentMs > 0 && meta?.linkCheckedAt && now() - meta.linkCheckedAt < skipRecentMs) {
          skipped++;
          return;
        }
        pending.push({ node, meta });
      });

      const results: LinkCheckResult[] = [];
      const startTime = now();
      const queue = [...pending];
      let completed = 0;
      let success = 0;
      let failed = 0;

      const worker = async () => {
        while (queue.length > 0 && !this.stopRequested) {
          const item = queue.shift();
          if (!item) break;

          const check = await httpChecker.check(item.node.url!, {
            timeout: options.timeout,
            retries: options.retries,
          });

          const record: LinkCheckRecord = {
            id: generateId(),
            bookmarkId: item.node.id,
            status: check.status,
            isAccessible: check.isAccessible,
            responseTime: check.responseTime,
            errorMessage: check.errorMessage,
            checkedAt: check.checkedAt,
          };
          await auxDb.linkChecks.add(record);

          // 网络层失败（CORS/断网/超时，未获得 HTTP 响应）不判定失效：
          // 保持原状态，下次检查可重试，避免把健康链接误标为死链
          const gotResponse = !check.networkError;
          if (gotResponse) {
            const base = item.meta ?? defaultMeta(item.node.id);
            await auxDb.bookmarkMeta.put({
              ...base,
              linkStatus: classifyLinkStatus(check.status),
              linkCheckedAt: check.checkedAt,
            });
          }

          results.push({
            bookmarkId: item.node.id,
            url: check.url,
            status: check.status,
            isAccessible: check.isAccessible,
            responseTime: check.responseTime,
            errorMessage: check.errorMessage,
            checkedAt: check.checkedAt,
          });

          completed++;
          // 进度计数与最终分类一致：网络层失败计入 skipped（未检测）
          if (!gotResponse) {
            skipped++;
          } else if (classifyLinkStatus(check.status) === 'active') {
            success++;
          } else {
            failed++;
          }

          onProgress?.({
            total: pending.length,
            completed,
            current: item.node.title || item.node.url!,
            success,
            failed,
            skipped,
            startTime,
            estimatedRemaining:
              completed > 0
                ? ((now() - startTime) / completed) * (pending.length - completed)
                : undefined,
          });
        }
      };

      await Promise.all(
        Array(Math.min(concurrency, Math.max(pending.length, 1)))
          .fill(0)
          .map(() => worker())
      );

      return results;
    } finally {
      this.running = false;
      this.stopRequested = false;
    }
  }

  // 汇总健康报告（基于内存快照 + aux）
  async getHealthReport(
    nodes: BrowserBookmarkNode[],
    meta: Record<string, AuxBookmarkMeta>
  ): Promise<LinkHealthReport> {
    let healthy = 0;
    let broken = 0;
    const checkedIds: string[] = [];

    for (const node of nodes) {
      const status = meta[node.id]?.linkStatus;
      if (status === 'active') {
        healthy++;
        checkedIds.push(node.id);
      } else if (status === 'broken') {
        broken++;
        checkedIds.push(node.id);
      }
    }

    // 最新一次检查的平均响应时间与时间戳
    let responseTimeSum = 0;
    let responseTimeCount = 0;
    let lastCheckedAt = 0;
    if (checkedIds.length > 0) {
      const records = await auxDb.linkChecks.where('bookmarkId').anyOf(checkedIds).toArray();
      const latestByBookmark = new Map<string, LinkCheckRecord>();
      for (const record of records) {
        const existing = latestByBookmark.get(record.bookmarkId);
        if (!existing || record.checkedAt > existing.checkedAt) {
          latestByBookmark.set(record.bookmarkId, record);
        }
      }
      for (const record of latestByBookmark.values()) {
        responseTimeSum += record.responseTime;
        responseTimeCount++;
        if (record.checkedAt > lastCheckedAt) {
          lastCheckedAt = record.checkedAt;
        }
      }
    }

    return {
      total: nodes.length,
      healthy,
      broken,
      pending: nodes.length - healthy - broken,
      avgResponseTime: responseTimeCount > 0 ? responseTimeSum / responseTimeCount : 0,
      lastCheckedAt,
      byStatus: {
        unknown: nodes.length - healthy - broken,
        healthy,
        broken,
        timeout: 0,
        error: 0,
      },
    };
  }

  // 单个书签的检查历史（新记录在前）
  async getCheckHistory(bookmarkId: string, limit = 10): Promise<LinkCheckRecord[]> {
    const records = await auxDb.linkChecks.where('bookmarkId').equals(bookmarkId).toArray();
    return records.sort((a, b) => b.checkedAt - a.checkedAt).slice(0, limit);
  }

  // 清除全部检查结果（历史记录 + 元数据上的 linkStatus/linkCheckedAt），
  // 用于纠正历史误判数据；标签/收藏/备注等其他元数据保留
  async resetCheckResults(): Promise<void> {
    if (this.running) {
      throw new Error('A check is running');
    }
    await auxDb.linkChecks.clear();
    const metas = await auxDb.bookmarkMeta.toArray();
    await auxDb.bookmarkMeta.bulkPut(
      metas.map((meta) => ({
        bookmarkId: meta.bookmarkId,
        tags: meta.tags,
        notes: meta.notes,
        isFavorite: meta.isFavorite,
        visitCount: meta.visitCount,
        lastVisited: meta.lastVisited,
        aiGenerated: meta.aiGenerated,
      }))
    );
  }

  // 清理超过保留天数的检查记录
  async cleanupOldRecords(daysToKeep = 30): Promise<number> {
    const cutoff = now() - daysToKeep * 24 * 3600_000;
    return auxDb.linkChecks.where('checkedAt').below(cutoff).delete();
  }
}

// 单例导出
export const linkHealthService = new LinkHealthService();
