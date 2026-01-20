// 统计分析服务

import { db } from '@/lib/database';
import { bookmarkService, tagService, folderService } from '@/services';
import type {
  OverallStats,
  TimePeriod,
  TimeTrend,
  TagStats,
  FolderStats,
  DomainStats,
  ActivityStats,
  ClassificationStats,
  BookmarkHealth,
  UsagePatterns,
  StatsReport,
  StatsCache,
  ChartData,
  ContentTypeDistribution,
} from '@/types';

const CACHE_TTL = 5 * 60 * 1000; // 5 分钟缓存

export class StatsService {
  private cache: Map<string, StatsCache> = new Map();

  /**
   * 获取整体统计
   */
  async getOverallStats(useCache = true): Promise<OverallStats> {
    const cacheKey = 'overall';

    if (useCache) {
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached.data as OverallStats;
    }

    // 先获取基础数据
    const [totalBookmarks, totalFolders, bookmarks, folders] = await Promise.all([
      db.bookmarks.count(),
      db.folders.count(),
      db.bookmarks.toArray(),
      db.folders.toArray(),
    ]);

    // 统计标签数（从 bookmarks.tags 字段）
    const tagSet = new Set<string>();
    bookmarks.forEach(b => b.tags.forEach(tag => tagSet.add(tag)));
    const totalTags = tagSet.size;

    // 统计其他数据
    const [favorites, archived, broken] = await Promise.all([
      db.bookmarks.where('isFavorite').equals(1).count(),
      db.bookmarks.where('isArchived').equals(1).count(),
      db.bookmarks.where('status').equals('broken').count(),
    ]);

    // uncategorized 需要单独用 filter 处理
    const uncategorized = bookmarks.filter(b => !b.folderId || b.folderId === '' || b.folderId === 'null' || b.folderId === 'undefined').length;

    // 计算重复书签数
    const urlMap = new Map<string, number>();
    for (const bm of bookmarks) {
      urlMap.set(bm.url, (urlMap.get(bm.url) || 0) + 1);
    }
    const duplicates = Array.from(urlMap.values()).filter((c) => c > 1).length;

    // 计算最近7天新增
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentAdditions = bookmarks.filter((b) => b.createdAt >= sevenDaysAgo).length;

    // 计算平均每个文件夹的书签数
    const avgBookmarksPerFolder = totalFolders > 0 ? totalBookmarks / totalFolders : 0;

    // 找到最大的文件夹
    const folderCounts = new Map<string, number>();
    for (const bm of bookmarks) {
      if (bm.folderId) {
        folderCounts.set(bm.folderId, (folderCounts.get(bm.folderId) || 0) + 1);
      }
    }

    let largestFolder = { name: '无', count: 0 };
    for (const [folderId, count] of folderCounts) {
      if (count > largestFolder.count) {
        const folder = await db.folders.get(folderId);
        if (folder) {
          largestFolder = { name: folder.name, count };
        }
      }
    }

    const stats: OverallStats = {
      totalBookmarks,
      totalFolders,
      totalTags,
      favorites,
      archived,
      broken,
      uncategorized,
      duplicates,
      recentAdditions,
      avgBookmarksPerFolder: Math.round(avgBookmarksPerFolder * 10) / 10,
      largestFolder,
    };

    this.setCache(cacheKey, stats);

    return stats;
  }

  /**
   * 获取时间趋势
   */
  async getTimeTrends(period: TimePeriod): Promise<TimeTrend[]> {
    const cacheKey = `trends-${period.start.getTime()}-${period.end.getTime()}`;

    const cached = this.getFromCache(cacheKey);
    if (cached) return cached.data as TimeTrend[];

    const bookmarks = await db.bookmarks.toArray();

    // 按时间间隔分组
    const trendMap = new Map<string, TimeTrend>();

    const currentDate = new Date(period.start);
    while (currentDate <= period.end) {
      const dateKey = this.formatDateKey(currentDate, period.interval);
      trendMap.set(dateKey, {
        date: dateKey,
        added: 0,
        visited: 0,
        modified: 0,
        deleted: 0,
      });

      // 下一个日期
      if (period.interval === 'day') {
        currentDate.setDate(currentDate.getDate() + 1);
      } else if (period.interval === 'week') {
        currentDate.setDate(currentDate.getDate() + 7);
      } else if (period.interval === 'month') {
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
    }

    // 统计
    for (const bookmark of bookmarks) {
      const dateKey = this.formatDateKey(
        new Date(bookmark.createdAt),
        period.interval
      );
      if (trendMap.has(dateKey)) {
        const trend = trendMap.get(dateKey)!;
        trend.added++;
      }

      if (bookmark.lastVisited) {
        const visitKey = this.formatDateKey(
          new Date(bookmark.lastVisited),
          period.interval
        );
        if (trendMap.has(visitKey)) {
          const trend = trendMap.get(visitKey)!;
          trend.visited++;
        }
      }

      const updateKey = this.formatDateKey(
        new Date(bookmark.updatedAt),
        period.interval
      );
      if (trendMap.has(updateKey)) {
        const trend = trendMap.get(updateKey)!;
        trend.modified++;
      }
    }

    const trends = Array.from(trendMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    this.setCache(cacheKey, trends);

    return trends;
  }

  /**
   * 获取热门标签
   */
  async getPopularTags(limit = 20): Promise<TagStats[]> {
    const cacheKey = `popular-tags-${limit}`;

    const cached = this.getFromCache(cacheKey);
    if (cached) return cached.data as TagStats[];

    const tags = await tagService.getAll();
    const bookmarks = await db.bookmarks.toArray();

    // 计算标签统计
    const tagStats = new Map<string, TagStats>();

    // 初始化
    for (const tag of tags) {
      tagStats.set(tag.name, {
        tag: tag.name,
        count: tag.usageCount,
        trend: 'stable',
        lastUsed: 0,
        avgUsage: 0,
        relatedTags: [],
      });
    }

    // 统计最后使用时间和相关标签
    for (const bookmark of bookmarks) {
      for (let i = 0; i < bookmark.tags.length; i++) {
        const tagName = bookmark.tags[i];
        if (tagStats.has(tagName)) {
          const stats = tagStats.get(tagName)!;
          stats.lastUsed = Math.max(stats.lastUsed, bookmark.updatedAt);

          // 找相关标签（同一书签中的其他标签）
          const related = bookmark.tags.filter((t) => t !== tagName);
          for (const rel of related) {
            if (!stats.relatedTags.includes(rel)) {
              stats.relatedTags.push(rel);
            }
          }
        }
      }
    }

    // 计算平均使用频率
    const now = Date.now();
    const daysSinceEpoch = now / (24 * 60 * 60 * 1000);

    for (const stats of tagStats.values()) {
      const daysSinceCreation = (now - stats.lastUsed) / (24 * 60 * 60 * 1000);
      stats.avgUsage = stats.count / Math.max(1, daysSinceCreation);
    }

    // 排序并限制数量
    const sorted = Array.from(tagStats.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    this.setCache(cacheKey, sorted);

    return sorted;
  }

  /**
   * 获取文件夹统计
   */
  async getFolderStats(): Promise<FolderStats[]> {
    const cacheKey = 'folder-stats';

    const cached = this.getFromCache(cacheKey);
    if (cached) return cached.data as FolderStats[];

    const folderTree = await folderService.getTree();
    const bookmarks = await db.bookmarks.toArray();

    console.log('📂 调试文件夹统计:', {
      foldersCount: folderTree.length,
      bookmarksCount: bookmarks.length,
      sampleBookmarks: bookmarks.slice(0, 3).map(b => ({ id: b.id, title: b.title, folderId: b.folderId })),
      sampleFolders: folderTree.slice(0, 3).map(f => ({ id: f.id, name: f.name })),
    });

    // 将树形结构扁平化
    const flattenFolders = (nodes: any[]): any[] => {
      const result: any[] = [];
      for (const node of nodes) {
        result.push(node);
        if (node.children && node.children.length > 0) {
          result.push(...flattenFolders(node.children));
        }
      }
      return result;
    };

    const allFolders = flattenFolders(folderTree);

    console.log('📂 扁平化后的文件夹:', {
      count: allFolders.length,
      folders: allFolders.map(f => ({ id: f.id, name: f.name, parentId: f.parentId })),
    });

    const stats: FolderStats[] = [];

    for (const folder of allFolders) {
      const folderBookmarks = bookmarks.filter((b) => b.folderId === folder.id);

      // 计算子文件夹数
      const subfolderCount = allFolders.filter((f) => f.parentId === folder.id).length;

      // 计算平均访问次数
      const totalVisits = folderBookmarks.reduce((sum, b) => sum + b.visitCount, 0);
      const avgVisits = folderBookmarks.length > 0 ? totalVisits / folderBookmarks.length : 0;

      // 计算最后活动时间
      const lastActivity = folderBookmarks.reduce(
        (max, b) => Math.max(max, b.updatedAt),
        0
      );

      // 计算深度
      const depth = this.calculateFolderDepth(folder.id, allFolders);

      // 计算增长率（简化：基于最近30天新增）
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const recentAdditions = folderBookmarks.filter((b) => b.createdAt >= thirtyDaysAgo)
        .length;
      const growthRate = folderBookmarks.length > 0
        ? (recentAdditions / folderBookmarks.length) * 100
        : 0;

      stats.push({
        folderId: folder.id,
        name: folder.name,
        path: this.getFolderPath(folder.id, allFolders),
        bookmarkCount: folderBookmarks.length,
        subfolderCount,
        avgVisits: Math.round(avgVisits * 10) / 10,
        lastActivity,
        size: folderBookmarks.length,
        depth,
        growthRate: Math.round(growthRate * 10) / 10,
      });
    }

    this.setCache(cacheKey, stats);

    return stats;
  }

  /**
   * 获取域名统计
   */
  async getDomainStats(limit = 20): Promise<DomainStats[]> {
    const cacheKey = `domain-stats-${limit}`;

    const cached = this.getFromCache(cacheKey);
    if (cached) return cached.data as DomainStats[];

    const bookmarks = await db.bookmarks.toArray();
    const domainMap = new Map<string, DomainStats>();

    const total = bookmarks.length;

    for (const bookmark of bookmarks) {
      try {
        const url = new URL(bookmark.url);
        const domain = url.hostname;

        if (!domainMap.has(domain)) {
          domainMap.set(domain, {
            domain,
            count: 0,
            percentage: 0,
            lastVisited: 0,
            bookmarkSample: [],
          });
        }

        const stats = domainMap.get(domain)!;
        stats.count++;
        stats.lastVisited = Math.max(stats.lastVisited, bookmark.lastVisited || 0);

        // 添加示例（最多3个）
        if (stats.bookmarkSample.length < 3) {
          stats.bookmarkSample.push({
            id: bookmark.id,
            title: bookmark.title,
            url: bookmark.url,
          });
        }
      } catch {
        // 忽略无效 URL
      }
    }

    // 计算百分比
    const stats = Array.from(domainMap.values()).map((s) => ({
      ...s,
      percentage: Math.round((s.count / total) * 1000) / 10,
    }));

    // 排序并限制数量
    const sorted = stats.sort((a, b) => b.count - a.count).slice(0, limit);

    this.setCache(cacheKey, sorted);

    return sorted;
  }

  /**
   * 获取活跃度统计
   */
  async getBookmarkActivity(): Promise<ActivityStats> {
    const cacheKey = 'activity-stats';

    const cached = this.getFromCache(cacheKey);
    if (cached) return cached.data as ActivityStats;

    const bookmarks = await db.bookmarks.toArray();

    // 最常访问
    const mostVisited = bookmarks
      .filter((b) => b.visitCount > 0)
      .sort((a, b) => b.visitCount - a.visitCount)
      .slice(0, 10)
      .map((b) => ({
        bookmarkId: b.id,
        title: b.title,
        url: b.url,
        visits: b.visitCount,
        lastVisited: b.lastVisited || 0,
      }));

    // 最近添加
    const recentlyAdded = bookmarks
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10)
      .map((b) => ({
        bookmarkId: b.id,
        title: b.title,
        url: b.url,
        createdAt: b.createdAt,
      }));

    // 长期未访问
    const neglected = bookmarks
      .filter((b) => !b.isArchived && b.lastVisited)
      .map((b) => ({
        bookmarkId: b.id,
        title: b.title,
        url: b.url,
        daysSinceVisit: Math.floor((Date.now() - (b.lastVisited || 0)) / (24 * 60 * 60 * 1000)),
        lastVisited: b.lastVisited || 0,
      }))
      .sort((a, b) => b.daysSinceVisit - a.daysSinceVisit)
      .slice(0, 10);

    // 收藏
    const favorites = bookmarks
      .filter((b) => b.isFavorite)
      .sort((a, b) => b.visitCount - a.visitCount)
      .slice(0, 10)
      .map((b) => ({
        bookmarkId: b.id,
        title: b.title,
        url: b.url,
        visits: b.visitCount,
      }));

    const stats: ActivityStats = {
      mostVisited,
      recentlyAdded,
      neglected,
      favorites,
      frequent: [], // TODO: 计算访问频率
    };

    this.setCache(cacheKey, stats);

    return stats;
  }

  /**
   * 获取分类效果统计
   */
  async getClassificationStats(): Promise<ClassificationStats> {
    const cacheKey = 'classification-stats';

    const cached = this.getFromCache(cacheKey);
    if (cached) return cached.data as ClassificationStats;

    // TODO: 实现真实的分类统计
    const stats: ClassificationStats = {
      totalClassified: 0,
      accuracy: 0.85,
      acceptedSuggestions: 0,
      rejectedSuggestions: 0,
      confidenceDistribution: [
        { range: '0.0-0.2', count: 10 },
        { range: '0.2-0.4', count: 20 },
        { range: '0.4-0.6', count: 45 },
        { range: '0.6-0.8', count: 80 },
        { range: '0.8-1.0', count: 120 },
      ],
      ruleMatches: [],
      topConfidenceRules: [],
    };

    this.setCache(cacheKey, stats);

    return stats;
  }

  /**
   * 生成统计报告
   */
  async generateReport(period?: TimePeriod): Promise<StatsReport> {
    const defaultPeriod: TimePeriod = {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      end: new Date(),
      interval: 'day',
    };

    const reportPeriod = period || defaultPeriod;

    const [summary, trends, activity, health, classification] = await Promise.all([
      this.getOverallStats(false),
      this.getTimeTrends(reportPeriod),
      this.getBookmarkActivity(),
      this.getBookmarkHealth(),
      this.getClassificationStats(),
    ]);

    const report: StatsReport = {
      id: `report-${Date.now()}`,
      generatedAt: Date.now(),
      period: reportPeriod,
      summary,
      trends: {
        additionTrend: trends,
        contentTypeDistribution: await this.getContentTypeDistribution(),
        tagTrends: await this.getPopularTags(),
        domainDistribution: await this.getDomainStats(),
      },
      activity,
      health,
      classification,
      patterns: await this.getUsagePatterns(),
      insights: await this.generateInsights(summary, activity),
      recommendations: await this.generateRecommendations(summary, health),
    };

    return report;
  }

  /**
   * 获取书签健康度
   */
  async getBookmarkHealth(): Promise<BookmarkHealth> {
    const [total, broken, pending] = await Promise.all([
      db.bookmarks.count(),
      db.bookmarks.where('status').equals('broken').count(),
      db.bookmarks.where('status').equals('pending').count(),
    ]);

    const healthy = total - broken - pending;

    // TODO: 获取平均响应时间和问题列表
    const health: BookmarkHealth = {
      total,
      healthy,
      broken,
      pending,
      avgResponseTime: 0,
      lastChecked: Date.now(),
      issues: [],
    };

    return health;
  }

  /**
   * 获取使用模式
   */
  async getUsagePatterns(): Promise<UsagePatterns> {
    // TODO: 实现真实的使用模式分析
    return {
      peakAddHours: new Array(24).fill(0),
      peakVisitHours: new Array(24).fill(0),
      mostActiveDay: '周一',
      avgSessionLength: 15,
      typicalWorkflow: ['浏览', '收藏', '整理'],
    };
  }

  /**
   * 获取内容类型分布
   */
  async getContentTypeDistribution(): Promise<ContentTypeDistribution[]> {
    const bookmarks = await db.bookmarks.toArray();
    const typeMap = new Map<string, number>();

    for (const bookmark of bookmarks) {
      const type = bookmark.meta?.contentType || 'other';
      typeMap.set(type, (typeMap.get(type) || 0) + 1);
    }

    const total = bookmarks.length;

    return Array.from(typeMap.entries()).map(([type, count]) => ({
      contentType: type,
      count,
      percentage: Math.round((count / total) * 1000) / 10,
      trend: 'stable',
    }));
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  // ============ 私有辅助方法 ============

  private getFromCache(key: string): StatsCache | undefined {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached;
    }
    this.cache.delete(key);
    return undefined;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, {
      id: key,
      type: 'overall',
      data,
      createdAt: Date.now(),
      expiresAt: Date.now() + CACHE_TTL,
      ttl: CACHE_TTL,
    });
  }

  private formatDateKey(date: Date, interval: string): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    switch (interval) {
      case 'day':
        return `${year}-${month}-${day}`;
      case 'week':
        const weekNum = this.getWeekNumber(date);
        return `${year}-W${weekNum}`;
      case 'month':
        return `${year}-${month}`;
      default:
        return `${year}-${month}-${day}`;
    }
  }

  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  private calculateFolderDepth(folderId: string, folders: any[]): number {
    let depth = 0;
    let current = folders.find((f) => f.id === folderId);

    while (current?.parentId) {
      depth++;
      current = folders.find((f) => f.id === current.parentId);
    }

    return depth;
  }

  private getFolderPath(folderId: string, folders: any[]): string {
    const path: string[] = [];
    let current = folders.find((f) => f.id === folderId);

    while (current) {
      path.unshift(current.name);
      current = folders.find((f) => f.id === current.parentId);
    }

    return path.join(' / ');
  }

  private async generateInsights(
    summary: OverallStats,
    activity: ActivityStats
  ): Promise<string[]> {
    const insights: string[] = [];

    if (summary.duplicates > 0) {
      insights.push(`发现 ${summary.duplicates} 个重复书签，建议清理`);
    }

    if (summary.broken > 0) {
      insights.push(`有 ${summary.broken} 个失效链接需要处理`);
    }

    if (summary.uncategorized > 10) {
      insights.push(`${summary.uncategorized} 个书签未分类，建议使用 AI 整理`);
    }

    if (activity.mostVisited.length > 0) {
      const top = activity.mostVisited[0];
      insights.push(`最常访问的书签是 "${top.title}"，访问 ${top.visits} 次`);
    }

    if (summary.avgBookmarksPerFolder < 5) {
      insights.push('平均每个文件夹书签较少，可以考虑合并文件夹');
    }

    return insights;
  }

  private async generateRecommendations(
    summary: OverallStats,
    health: BookmarkHealth
  ): Promise<string[]> {
    const recommendations: string[] = [];

    if (summary.duplicates > 0) {
      recommendations.push('使用重复检测功能清理重复书签');
    }

    if (summary.broken > 0) {
      recommendations.push('运行链接健康检查并处理失效链接');
    }

    if (summary.uncategorized > 10) {
      recommendations.push('使用一键整理功能分类未分类书签');
    }

    if (health.broken > health.healthy * 0.1) {
      recommendations.push('建议定期（每月）检查链接健康度');
    }

    recommendations.push('考虑使用语义搜索提高搜索准确度');
    recommendations.push('启用云端同步以在多设备间保持书签一致');

    return recommendations;
  }
}

// 单例导出
export const statsService = new StatsService();
