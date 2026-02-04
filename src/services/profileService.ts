// 书签档案服务

import { db } from '@/lib/database';
import { now } from '@/lib/utils';
import type { Bookmark, Folder, Tag } from '@/types';
import type {
  BookmarkProfile,
  BookmarkCategory,
  DomainStats,
  TrendDataPoint,
  CollectorLevel,
  COLLECTOR_LEVELS,
  CATEGORY_CONFIGS,
} from '@/types/profile';
import {
  COLLECTOR_LEVELS as LEVELS,
  CATEGORY_CONFIGS as CATEGORIES,
} from '@/types/profile';

const PROFILE_CACHE_KEY = 'bookmark_profile';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24小时

export class ProfileService {
  // 生成完整档案
  async generateProfile(): Promise<BookmarkProfile> {
    const [bookmarks, folders, tags] = await Promise.all([
      db.bookmarks.toArray(),
      db.folders.toArray(),
      db.tags.toArray(),
    ]);

    // 基础统计
    const basicStats = this.calculateBasicStats(bookmarks, folders, tags);

    // 域名分析
    const domainAnalysis = this.analyzeDomains(bookmarks);

    // 分类分析
    const categoryAnalysis = this.analyzeCategories(bookmarks);

    // 时间趋势
    const trends = this.calculateTrends(bookmarks);

    // 质量指标
    const qualityMetrics = this.calculateQualityMetrics(bookmarks);

    // 组织度评分
    const organizationScore = this.calculateOrganizationScore(bookmarks, folders);

    // 收藏家等级
    const collectorInfo = this.calculateCollectorLevel({
      ...basicStats,
      ...domainAnalysis,
      organizationScore,
    });

    const profile: BookmarkProfile = {
      ...basicStats,
      ...domainAnalysis,
      ...categoryAnalysis,
      ...trends,
      ...qualityMetrics,
      organizationScore,
      ...collectorInfo,
      generatedAt: now(),
      version: '1.0.0',
    };

    // 缓存结果
    await this.cacheProfile(profile);

    return profile;
  }

  // 计算基础统计
  private calculateBasicStats(
    bookmarks: Bookmark[],
    folders: Folder[],
    tags: Tag[]
  ): Pick<BookmarkProfile, 'totalBookmarks' | 'totalFolders' | 'totalTags' | 'collectionStartDate' | 'collectionEndDate' | 'collectionDays' | 'averagePerMonth'> {
    const totalBookmarks = bookmarks.length;
    const totalFolders = folders.length;
    const totalTags = tags.length;

    if (totalBookmarks === 0) {
      return {
        totalBookmarks: 0,
        totalFolders,
        totalTags,
        collectionStartDate: now(),
        collectionEndDate: now(),
        collectionDays: 0,
        averagePerMonth: 0,
      };
    }

    const dates = bookmarks.map(b => b.createdAt).sort((a, b) => a - b);
    const collectionStartDate = dates[0];
    const collectionEndDate = dates[dates.length - 1];
    const collectionDays = Math.max(1, Math.ceil((collectionEndDate - collectionStartDate) / (1000 * 60 * 60 * 24)));
    const months = Math.max(1, collectionDays / 30);
    const averagePerMonth = Math.round((totalBookmarks / months) * 10) / 10;

    return {
      totalBookmarks,
      totalFolders,
      totalTags,
      collectionStartDate,
      collectionEndDate,
      collectionDays,
      averagePerMonth,
    };
  }

  // 分析域名
  private analyzeDomains(bookmarks: Bookmark[]): Pick<BookmarkProfile, 'uniqueDomains' | 'httpsRatio' | 'topDomains' | 'domainDiversity'> {
    if (bookmarks.length === 0) {
      return {
        uniqueDomains: 0,
        httpsRatio: 0,
        topDomains: [],
        domainDiversity: 0,
      };
    }

    const domainMap = new Map<string, { count: number; isHttps: boolean }>();
    let httpsCount = 0;

    for (const bookmark of bookmarks) {
      try {
        const url = new URL(bookmark.url);
        const domain = url.hostname.replace(/^www\./, '');
        const isHttps = url.protocol === 'https:';

        if (isHttps) httpsCount++;

        const existing = domainMap.get(domain);
        if (existing) {
          existing.count++;
        } else {
          domainMap.set(domain, { count: 1, isHttps });
        }
      } catch {
        // 忽略无效 URL
      }
    }

    const uniqueDomains = domainMap.size;
    const httpsRatio = bookmarks.length > 0 ? httpsCount / bookmarks.length : 0;

    // 排序获取 Top 10
    const sortedDomains = Array.from(domainMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);

    const topDomains: DomainStats[] = sortedDomains.map(([domain, data]) => ({
      domain,
      count: data.count,
      percentage: data.count / bookmarks.length,
      isHttps: data.isHttps,
      category: this.categorizeDomain(domain),
    }));

    // 域名多样性评分 (基于香农熵)
    const domainDiversity = this.calculateDiversity(domainMap, bookmarks.length);

    return {
      uniqueDomains,
      httpsRatio: Math.round(httpsRatio * 100) / 100,
      topDomains,
      domainDiversity: Math.round(domainDiversity),
    };
  }

  // 计算多样性评分
  private calculateDiversity(domainMap: Map<string, { count: number }>, total: number): number {
    if (total === 0 || domainMap.size === 0) return 0;

    // 使用归一化香农熵
    let entropy = 0;
    for (const [, data] of domainMap) {
      const p = data.count / total;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    // 归一化到 0-100
    const maxEntropy = Math.log2(domainMap.size);
    const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;

    return normalizedEntropy * 100;
  }

  // 根据域名判断分类
  private categorizeDomain(domain: string): BookmarkCategory {
    for (const config of CATEGORIES) {
      if (config.domains.some(d => domain.includes(d) || d.includes(domain))) {
        return config.id;
      }
    }
    return 'other';
  }

  // 根据 URL 和标题判断分类
  private categorizeBookmark(bookmark: Bookmark): BookmarkCategory {
    try {
      const url = new URL(bookmark.url);
      const domain = url.hostname.replace(/^www\./, '');

      // 先按域名匹配
      for (const config of CATEGORIES) {
        if (config.domains.some(d => domain.includes(d) || d.includes(domain))) {
          return config.id;
        }
      }

      // 再按关键词匹配
      const text = `${bookmark.title} ${bookmark.description || ''} ${bookmark.tags.join(' ')}`.toLowerCase();
      for (const config of CATEGORIES) {
        if (config.keywords.some(k => text.includes(k))) {
          return config.id;
        }
      }
    } catch {
      // 忽略无效 URL
    }

    return 'other';
  }

  // 分析分类分布
  private analyzeCategories(bookmarks: Bookmark[]): Pick<BookmarkProfile, 'categoryDistribution' | 'primaryCategory'> {
    const distribution: Record<BookmarkCategory, number> = {
      tech: 0,
      learning: 0,
      tools: 0,
      social: 0,
      news: 0,
      shopping: 0,
      entertainment: 0,
      finance: 0,
      lifestyle: 0,
      other: 0,
    };

    for (const bookmark of bookmarks) {
      const category = this.categorizeBookmark(bookmark);
      distribution[category]++;
    }

    // 找出主要分类
    let primaryCategory: BookmarkCategory = 'other';
    let maxCount = 0;
    for (const [category, count] of Object.entries(distribution)) {
      if (count > maxCount) {
        maxCount = count;
        primaryCategory = category as BookmarkCategory;
      }
    }

    return {
      categoryDistribution: distribution,
      primaryCategory,
    };
  }

  // 计算时间趋势
  private calculateTrends(bookmarks: Bookmark[]): Pick<BookmarkProfile, 'yearlyTrend' | 'monthlyTrend'> {
    if (bookmarks.length === 0) {
      return {
        yearlyTrend: [],
        monthlyTrend: [],
      };
    }

    // 按年统计
    const yearMap = new Map<string, number>();
    // 按月统计 (最近12个月)
    const monthMap = new Map<string, number>();

    const nowDate = new Date();
    const twelveMonthsAgo = new Date(nowDate.getFullYear(), nowDate.getMonth() - 11, 1).getTime();

    for (const bookmark of bookmarks) {
      const date = new Date(bookmark.createdAt);
      const year = date.getFullYear().toString();
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      yearMap.set(year, (yearMap.get(year) || 0) + 1);

      if (bookmark.createdAt >= twelveMonthsAgo) {
        monthMap.set(month, (monthMap.get(month) || 0) + 1);
      }
    }

    // 转换为趋势数据
    const yearlyTrend: TrendDataPoint[] = [];
    let cumulative = 0;
    const sortedYears = Array.from(yearMap.keys()).sort();
    for (const year of sortedYears) {
      const count = yearMap.get(year) || 0;
      cumulative += count;
      yearlyTrend.push({ period: year, count, cumulative });
    }

    const monthlyTrend: TrendDataPoint[] = [];
    cumulative = 0;
    const sortedMonths = Array.from(monthMap.keys()).sort();
    for (const month of sortedMonths) {
      const count = monthMap.get(month) || 0;
      cumulative += count;
      monthlyTrend.push({ period: month, count, cumulative });
    }

    return {
      yearlyTrend,
      monthlyTrend,
    };
  }

  // 计算质量指标
  private calculateQualityMetrics(bookmarks: Bookmark[]): Pick<BookmarkProfile, 'duplicateCount' | 'brokenCount' | 'favoriteCount' | 'archivedCount' | 'aiGeneratedCount'> {
    let brokenCount = 0;
    let favoriteCount = 0;
    let archivedCount = 0;
    let aiGeneratedCount = 0;

    const urlSet = new Set<string>();
    let duplicateCount = 0;

    for (const bookmark of bookmarks) {
      if (urlSet.has(bookmark.url)) {
        duplicateCount++;
      } else {
        urlSet.add(bookmark.url);
      }

      if (bookmark.status === 'broken') brokenCount++;
      if (bookmark.isFavorite) favoriteCount++;
      if (bookmark.isArchived) archivedCount++;
      if (bookmark.aiGenerated) aiGeneratedCount++;
    }

    return {
      duplicateCount,
      brokenCount,
      favoriteCount,
      archivedCount,
      aiGeneratedCount,
    };
  }

  // 计算组织度评分
  private calculateOrganizationScore(bookmarks: Bookmark[], folders: Folder[]): number {
    if (bookmarks.length === 0) return 0;

    const weights = {
      folderUsage: 0.30,
      tagUsage: 0.30,
      descriptionRate: 0.15,
      duplicateRate: 0.15,
      folderStructure: 0.10,
    };

    // 使用文件夹的书签比例
    const withFolder = bookmarks.filter(b => b.folderId).length;
    const folderUsageScore = (withFolder / bookmarks.length) * 100;

    // 使用标签的书签比例
    const withTags = bookmarks.filter(b => b.tags.length > 0).length;
    const tagUsageScore = (withTags / bookmarks.length) * 100;

    // 有描述的书签比例
    const withDescription = bookmarks.filter(b => b.description && b.description.length > 0).length;
    const descriptionScore = (withDescription / bookmarks.length) * 100;

    // 重复率 (越低越好)
    const urlSet = new Set(bookmarks.map(b => b.url));
    const duplicateRate = 1 - (urlSet.size / bookmarks.length);
    const duplicateScore = (1 - duplicateRate) * 100;

    // 文件夹结构合理性 (有文件夹且层级适中)
    const folderStructureScore = folders.length > 0 ? Math.min(100, folders.length * 10) : 0;

    const totalScore =
      folderUsageScore * weights.folderUsage +
      tagUsageScore * weights.tagUsage +
      descriptionScore * weights.descriptionRate +
      duplicateScore * weights.duplicateRate +
      folderStructureScore * weights.folderStructure;

    return Math.round(totalScore);
  }

  // 计算收藏家等级
  private calculateCollectorLevel(data: {
    totalBookmarks: number;
    collectionDays: number;
    domainDiversity: number;
    organizationScore: number;
  }): { collectorScore: number; collectorLevel: CollectorLevel; collectorTitle: string } {
    // 计算总分 (0-1000)
    const factors = {
      // 数量因素 (最高 300 分)
      bookmarkCount: Math.min(data.totalBookmarks / 10, 300),
      // 时间因素 (最高 200 分)
      collectionDays: Math.min(data.collectionDays / 5, 200),
      // 质量因素 (最高 300 分)
      organizationScore: data.organizationScore * 3,
      // 多样性因素 (最高 200 分)
      domainDiversity: data.domainDiversity * 2,
    };

    const collectorScore = Math.round(
      factors.bookmarkCount +
      factors.collectionDays +
      factors.organizationScore +
      factors.domainDiversity
    );

    // 确定等级
    let levelConfig = LEVELS[0];
    for (const config of LEVELS) {
      if (collectorScore >= config.minScore) {
        levelConfig = config;
      }
    }

    return {
      collectorScore,
      collectorLevel: levelConfig.level,
      collectorTitle: levelConfig.title.zh,
    };
  }

  // 缓存档案
  private async cacheProfile(profile: BookmarkProfile): Promise<void> {
    try {
      await db.statsCache.put({
        id: PROFILE_CACHE_KEY,
        type: 'profile',
        data: profile as any,
        createdAt: now(),
        expiresAt: now() + CACHE_DURATION,
      });
    } catch (error) {
      console.error('[ProfileService] Failed to cache profile:', error);
    }
  }

  // 获取缓存的档案
  async getCachedProfile(): Promise<BookmarkProfile | null> {
    try {
      const cached = await db.statsCache.get(PROFILE_CACHE_KEY);
      if (cached && cached.expiresAt > now()) {
        return cached.data as unknown as BookmarkProfile;
      }
    } catch (error) {
      console.error('[ProfileService] Failed to get cached profile:', error);
    }
    return null;
  }

  // 清除缓存
  async clearCache(): Promise<void> {
    try {
      await db.statsCache.delete(PROFILE_CACHE_KEY);
    } catch (error) {
      console.error('[ProfileService] Failed to clear cache:', error);
    }
  }

  // 获取档案 (优先使用缓存)
  async getProfile(forceRefresh = false): Promise<BookmarkProfile> {
    if (!forceRefresh) {
      const cached = await this.getCachedProfile();
      if (cached) {
        return cached;
      }
    }
    return this.generateProfile();
  }
}

// 单例导出
export const profileService = new ProfileService();
