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
    // 已放入子文件夹的书签（非直接散落在根目录下）。
    // 按结构判定（parentId 是否为根节点 id），不比对根目录标题——
    // 那是浏览器本地化字符串（英文 Chrome 是 "Bookmarks bar"、
    // Firefox 是"书签工具栏"），按标题比对在非中文环境会全量误判。
    // Chrome 根节点 id 固定（0 虚拟根 / 1 书签栏 / 2 其他书签 / 3 移动）；
    // Firefox 根是 GUID（toolbar________ 等），靠结构兜底——扁平 folders
    // 里 parentId 不指向任何已知文件夹的即是根（Chrome 指向 '0'、
    // Firefox 指向 'root________'，都不在 folder ids 里）
    const folderIds = new Set(folders.map((f) => f.id));
    const rootIds = new Set(['0', '1', '2', '3']);
    for (const folder of folders) {
      if (folder.parentId === '0' || !folderIds.has(folder.parentId)) {
        rootIds.add(folder.id);
      }
    }
    let folderedCount = 0;
    let taggedCount = 0;
    let favoriteCount = 0;
    let brokenCount = 0;
    let healthyCount = 0;
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
      // 域名维度只统计网页协议：bookmarklet/内部页经 getDomain 兜底会
      // 以整段字符串混进来，污染 uniqueDomains/熵/topDomains/积分
      const isWebUrl = /^https?:\/\//i.test(url);
      const domain = isWebUrl ? getDomain(url) : '';
      if (isWebUrl) {
        domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
        if (url.startsWith('https://')) {
          httpsCount++;
          httpsDomains.add(domain);
        }
      }
      if (url) {
        const urlKey = getUrlKey(url);
        urlKeyCounts.set(urlKey, (urlKeyCounts.get(urlKey) ?? 0) + 1);
      }
      categoryDistribution[this.categorize(domain, node.title)]++;

      if (!rootIds.has(node.parentId)) {
        folderedCount++;
      }

      const record = meta[node.id];
      if (record?.tags.length) {
        taggedCount++;
        record.tags.forEach((tag) => tagSet.add(tag));
      }
      if (record?.isFavorite) favoriteCount++;
      if (record?.linkStatus === 'active') healthyCount++;
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

    // 组织度评分：入夹率 + 打标率 - 重复/失效惩罚。
    // 入夹率用严格口径（真的放进了子文件夹），与仪表盘展示的「分类整理率」
    // 同源，避免出现"评分判定结构良好、指标却显示 0%"的自相矛盾
    const folderedRatio = total > 0 ? folderedCount / total : 0;
    const taggedRatio = total > 0 ? taggedCount / total : 0;
    const duplicatePenalty = total > 0 ? Math.min(duplicateCount / total, 0.2) : 0;
    const brokenPenalty = total > 0 ? Math.min(brokenCount / total, 0.2) : 0;
    const organizationScore = Math.round(
      Math.max(0, Math.min(1, folderedRatio * 0.5 + taggedRatio * 0.5 - duplicatePenalty - brokenPenalty)) * 100
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
      healthyCount,
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
