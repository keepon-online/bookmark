// 书签档案服务 v2
// 纯计算：输入浏览器书签树快照 + aux 元数据，输出 BookmarkProfile。
// 不落缓存（计算毫秒级），不读旧数据库。

import { now, getDomain, getUrlKey } from '@/lib/utils';
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
  // 生成完整档案（纯同步计算，单趟遍历累计全部指标）
  getProfile(input: ProfileInput): BookmarkProfile {
    const { bookmarks, folders, meta } = input;

    let minDate = 0;
    let maxDate = 0;
    const yearlyMap = new Map<string, number>();
    const monthlyMap = new Map<string, number>();
    const domainCounts = new Map<string, number>();
    const httpsDomains = new Set<string>();
    const urlKeyCounts = new Map<string, number>();
    let httpsCount = 0;
    const categoryDistribution = {} as Record<BookmarkCategory, number>;
    for (const category of CATEGORIES) {
      categoryDistribution[category.id] = 0;
    }
    const tagSet = new Set<string>();
    let folderedCount = 0; // 严格口径：已放入子文件夹（非根目录散落）
    let folderedLooseCount = 0; // 宽口径：有父级与路径即算（组织度评分用）
    let taggedCount = 0;
    let favoriteCount = 0;
    let brokenCount = 0;
    let aiGeneratedCount = 0;

    for (const node of bookmarks) {
      const date = node.dateAdded ?? 0;
      if (date > 0) {
        if (minDate === 0 || date < minDate) minDate = date;
        if (date > maxDate) maxDate = date;
        const d = new Date(date);
        const yearKey = `${d.getFullYear()}`;
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        yearlyMap.set(yearKey, (yearlyMap.get(yearKey) ?? 0) + 1);
        monthlyMap.set(monthKey, (monthlyMap.get(monthKey) ?? 0) + 1);
      }

      const url = node.url ?? '';
      const domain = url ? getDomain(url) : '';
      if (url) {
        domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
        if (url.startsWith('https://')) {
          httpsCount++;
          httpsDomains.add(domain);
        }
        const urlKey = getUrlKey(url);
        urlKeyCounts.set(urlKey, (urlKeyCounts.get(urlKey) ?? 0) + 1);
      }
      categoryDistribution[this.categorize(domain, node.title)]++;

      if (node.parentId && node.path) {
        folderedLooseCount++;
      }
      if (node.path && node.path !== '书签栏' && node.path !== '其他书签') {
        folderedCount++;
      }

      const record = meta[node.id];
      if (record?.tags.length) {
        taggedCount++;
        record.tags.forEach((tag) => tagSet.add(tag));
      }
      if (record?.isFavorite) favoriteCount++;
      if (record?.linkStatus === 'broken' || record?.linkStatus === 'unreachable') brokenCount++;
      if (record?.aiGenerated) aiGeneratedCount++;
    }

    const total = bookmarks.length;
    const collectionStartDate = minDate;
    const collectionEndDate = maxDate;
    const collectionDays =
      collectionEndDate > collectionStartDate
        ? Math.ceil((collectionEndDate - collectionStartDate) / 86400_000)
        : 0;
    const months = Math.max(collectionDays / 30, 1);
    const averagePerMonth = Math.round(total / months);

    const uniqueDomains = domainCounts.size;
    const httpsRatio = total > 0 ? httpsCount / total : 0;

    const topDomains: DomainStats[] = [...domainCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([domain, count]) => ({
        domain,
        count,
        percentage: count / Math.max(total, 1),
        isHttps: httpsDomains.has(domain),
        category: this.categorize(domain, ''),
      }));

    // 域名多样性（Shannon 熵归一化）
    let entropy = 0;
    for (const count of domainCounts.values()) {
      const p = count / Math.max(total, 1);
      entropy -= p * Math.log2(p);
    }
    const domainDiversity = uniqueDomains > 1 ? entropy / Math.log2(uniqueDomains) : 0;

    const sortedCategories = (Object.entries(categoryDistribution) as Array<[BookmarkCategory, number]>).sort(
      (a, b) => b[1] - a[1]
    );
    const primaryCategory = sortedCategories[0]?.[1] > 0 ? sortedCategories[0][0] : 'other';

    const toTrend = (map: Map<string, number>): TrendDataPoint[] => {
      let cumulative = 0;
      return [...map.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([period, count]) => {
          cumulative += count;
          return { period, count, cumulative };
        });
    };

    // 重复书签数 = 每个规范化 URL 分组中多出的份数之和
    let duplicateCount = 0;
    for (const count of urlKeyCounts.values()) {
      if (count > 1) {
        duplicateCount += count - 1;
      }
    }

    // 组织度评分：入夹率（宽口径，有路径即算）+ 打标率 - 重复/失效惩罚
    const folderedRatioLoose = total > 0 ? folderedLooseCount / total : 0;
    const taggedRatio = total > 0 ? taggedCount / total : 0;
    const duplicatePenalty = total > 0 ? Math.min(duplicateCount / total, 0.2) : 0;
    const brokenPenalty = total > 0 ? Math.min(brokenCount / total, 0.2) : 0;
    const organizationScore = Math.round(
      Math.max(0, Math.min(1, folderedRatioLoose * 0.5 + taggedRatio * 0.5 - duplicatePenalty - brokenPenalty)) * 100
    );

    // 收藏家积分与等级
    const collectorScore = Math.round(
      total + uniqueDomains * 2 + tagSet.size * 3 + favoriteCount * 5
    );
    const levelConfig = [...LEVELS].reverse().find((level) => collectorScore >= level.minScore) ?? LEVELS[0];
    const collectorLevel = levelConfig.level as CollectorLevel;
    const collectorTitle = levelConfig.title.zh;

    return {
      totalBookmarks: total,
      totalFolders: folders.length,
      totalTags: tagSet.size,
      folderedRate: total > 0 ? Math.round((folderedCount / total) * 100) : 0,
      taggedRate: total > 0 ? Math.round(taggedRatio * 100) : 0,
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
