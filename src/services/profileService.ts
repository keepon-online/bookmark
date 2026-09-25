// 书签档案服务 v2
// 纯计算：输入浏览器书签树快照 + aux 元数据，输出 BookmarkProfile。
// 不落缓存（计算毫秒级），不读旧数据库。

import { now, getDomain, getUrlKey } from '@/lib/utils';
import { BrowserBookmarksService } from './browserBookmarksService';
import type { AuxBookmarkMeta, BrowserBookmarkNode } from '@/types';
import type {
  BookmarkProfile,
  BookmarkCategory,
  DomainStats,
  TrendDataPoint,
  CollectorLevel,
} from '@/types/profile';
import { COLLECTOR_LEVELS as LEVELS, CATEGORY_CONFIGS as CATEGORIES } from '@/types/profile';

export interface ProfileInput {
  bookmarks: BrowserBookmarkNode[];
  folders: BrowserBookmarkNode[];
  meta: Record<string, AuxBookmarkMeta>;
}

export class ProfileService {
  // 生成完整档案（纯同步计算）
  getProfile(input: ProfileInput): BookmarkProfile {
    const { bookmarks, folders, meta } = input;

    const dates = bookmarks
      .map((node) => node.dateAdded ?? 0)
      .filter((date) => date > 0);
    const collectionStartDate = dates.length > 0 ? Math.min(...dates) : 0;
    const collectionEndDate = dates.length > 0 ? Math.max(...dates) : 0;
    const collectionDays =
      collectionEndDate > collectionStartDate
        ? Math.ceil((collectionEndDate - collectionStartDate) / 86400_000)
        : 0;
    const months = Math.max(collectionDays / 30, 1);
    const averagePerMonth = Math.round(bookmarks.length / months);

    // 域名分析
    const domainCounts = new Map<string, number>();
    let httpsCount = 0;
    for (const node of bookmarks) {
      if (!node.url) continue;
      const domain = getDomain(node.url);
      domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
      if (node.url.startsWith('https')) {
        httpsCount++;
      }
    }
    const uniqueDomains = domainCounts.size;
    const httpsRatio = bookmarks.length > 0 ? httpsCount / bookmarks.length : 0;

    const topDomains: DomainStats[] = [...domainCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([domain, count]) => ({
        domain,
        count,
        percentage: count / Math.max(bookmarks.length, 1),
        isHttps: bookmarks.some((node) => node.url?.startsWith(`https://${domain}`)),
        category: this.categorize(domain, ''),
      }));

    // 域名多样性（Shannon 熵归一化）
    let entropy = 0;
    for (const count of domainCounts.values()) {
      const p = count / Math.max(bookmarks.length, 1);
      entropy -= p * Math.log2(p);
    }
    const domainDiversity = uniqueDomains > 1 ? entropy / Math.log2(uniqueDomains) : 0;

    // 分类分布
    const categoryDistribution = {} as Record<BookmarkCategory, number>;
    for (const category of CATEGORIES) {
      categoryDistribution[category.id] = 0;
    }
    for (const node of bookmarks) {
      const category = this.categorize(getDomain(node.url ?? ''), node.title);
      categoryDistribution[category]++;
    }
    const sortedCategories = (Object.entries(categoryDistribution) as Array<[BookmarkCategory, number]>).sort(
      (a, b) => b[1] - a[1]
    );
    const primaryCategory = sortedCategories[0]?.[1] > 0 ? sortedCategories[0][0] : 'other';

    // 时间趋势
    const yearlyMap = new Map<string, number>();
    const monthlyMap = new Map<string, number>();
    for (const date of dates) {
      const d = new Date(date);
      const yearKey = `${d.getFullYear()}`;
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      yearlyMap.set(yearKey, (yearlyMap.get(yearKey) ?? 0) + 1);
      monthlyMap.set(monthKey, (monthlyMap.get(monthKey) ?? 0) + 1);
    }
    const toTrend = (map: Map<string, number>): TrendDataPoint[] => {
      let cumulative = 0;
      return [...map.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([period, count]) => {
          cumulative += count;
          return { period, count, cumulative };
        });
    };

    // 质量指标
    const duplicateCount = BrowserBookmarksService.groupDuplicates(bookmarks)
      .reduce((sum, group) => sum + group.bookmarks.length - 1, 0);
    let brokenCount = 0;
    let favoriteCount = 0;
    let aiGeneratedCount = 0;
    const tagSet = new Set<string>();
    for (const node of bookmarks) {
      const record = meta[node.id];
      if (!record) continue;
      if (record.linkStatus === 'broken') brokenCount++;
      if (record.isFavorite) favoriteCount++;
      if (record.aiGenerated) aiGeneratedCount++;
      record.tags.forEach((tag) => tagSet.add(tag));
    }
    const totalTags = tagSet.size;

    // 组织度评分：入夹率 + 打标率 - 重复/失效惩罚
    const folderedRatio = bookmarks.length > 0
      ? bookmarks.filter((node) => node.parentId && node.path).length / bookmarks.length
      : 0;
    const taggedRatio = bookmarks.length > 0
      ? bookmarks.filter((node) => (meta[node.id]?.tags.length ?? 0) > 0).length / bookmarks.length
      : 0;
    const duplicatePenalty = bookmarks.length > 0 ? Math.min(duplicateCount / bookmarks.length, 0.2) : 0;
    const brokenPenalty = bookmarks.length > 0 ? Math.min(brokenCount / bookmarks.length, 0.2) : 0;
    const organizationScore = Math.round(
      Math.max(0, Math.min(1, folderedRatio * 0.5 + taggedRatio * 0.5 - duplicatePenalty - brokenPenalty)) * 100
    );

    // 收藏家积分与等级
    const collectorScore = Math.round(
      bookmarks.length + uniqueDomains * 2 + totalTags * 3 + favoriteCount * 5
    );
    const levelConfig = [...LEVELS].reverse().find((level) => collectorScore >= level.minScore) ?? LEVELS[0];
    const collectorLevel = levelConfig.level as CollectorLevel;
    const collectorTitle = levelConfig.title.zh;

    return {
      totalBookmarks: bookmarks.length,
      totalFolders: folders.length,
      totalTags,
      collectionStartDate,
      collectionEndDate,
      collectionDays,
      averagePerMonth,
      uniqueDomains,
      httpsRatio,
      topDomains,
      domainDiversity,
      categoryDistribution,
      primaryCategory,
      yearlyTrend: toTrend(yearlyMap),
      monthlyTrend: toTrend(monthlyMap),
      duplicateCount,
      brokenCount,
      favoriteCount,
      archivedCount: 0,
      aiGeneratedCount,
      organizationScore,
      collectorScore,
      collectorLevel,
      collectorTitle,
      generatedAt: now(),
      version: '2.0',
    };
  }

  // 按域名/关键词归类
  private categorize(domain: string, title: string): BookmarkCategory {
    for (const category of CATEGORIES) {
      if (category.domains.some((d) => domain === d || domain.endsWith(`.${d}`))) {
        return category.id;
      }
    }
    const lowerTitle = title.toLowerCase();
    for (const category of CATEGORIES) {
      if (category.keywords.some((keyword) => lowerTitle.includes(keyword))) {
        return category.id;
      }
    }
    return 'other';
  }

  // 兼容 URL 去重键导出（供外部复用）
  static urlKeyOf(url: string): string {
    return getUrlKey(url);
  }
}

// 单例导出
export const profileService = new ProfileService();
