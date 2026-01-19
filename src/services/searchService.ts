// 搜索服务

import Fuse from 'fuse.js';
import { db } from '@/lib/database';
import type { Bookmark, BookmarkStatus, ContentType } from '@/types';

export interface SearchOptions {
  limit?: number;
  offset?: number;
  sortBy?: 'relevance' | 'date' | 'title' | 'visitCount';
  sortOrder?: 'asc' | 'desc';
}

export interface SearchFilters {
  query?: string;
  folders?: string[];
  tags?: string[];
  dateRange?: { start: number; end: number };
  status?: BookmarkStatus[];
  isFavorite?: boolean;
  isArchived?: boolean;
  contentTypes?: ContentType[];
}

export interface SearchResult {
  items: Bookmark[];
  total: number;
  query?: string;
}

export class SearchService {
  private fuse: Fuse<Bookmark> | null = null;
  private bookmarksCache: Bookmark[] = [];
  private cacheTime = 0;
  private readonly CACHE_TTL = 5000; // 5 秒缓存

  // 获取或构建搜索索引
  private async getFuseIndex(): Promise<Fuse<Bookmark>> {
    const now = Date.now();

    // 检查缓存是否有效
    if (this.fuse && now - this.cacheTime < this.CACHE_TTL) {
      return this.fuse;
    }

    // 重新构建索引
    this.bookmarksCache = await db.bookmarks.toArray();
    this.cacheTime = now;

    this.fuse = new Fuse(this.bookmarksCache, {
      keys: [
        { name: 'title', weight: 0.4 },
        { name: 'url', weight: 0.2 },
        { name: 'description', weight: 0.2 },
        { name: 'tags', weight: 0.15 },
        { name: 'notes', weight: 0.05 },
      ],
      threshold: 0.3,
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });

    return this.fuse;
  }

  // 基础搜索
  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    if (!query.trim()) {
      // 空查询返回所有书签
      const bookmarks = await db.bookmarks.toArray();
      return this.applyOptionsToResult(bookmarks, query, options);
    }

    const fuse = await this.getFuseIndex();
    const results = fuse.search(query);

    const items = results.map((r) => r.item);
    return this.applyOptionsToResult(items, query, options);
  }

  // 高级搜索（带过滤器）
  async advancedSearch(filters: SearchFilters, options?: SearchOptions): Promise<SearchResult> {
    let bookmarks = await db.bookmarks.toArray();

    // 应用文本搜索
    if (filters.query?.trim()) {
      const fuse = await this.getFuseIndex();
      const results = fuse.search(filters.query);
      const matchedIds = new Set(results.map((r) => r.item.id));
      bookmarks = bookmarks.filter((b) => matchedIds.has(b.id));
    }

    // 应用过滤器
    bookmarks = this.applyFilters(bookmarks, filters);

    return this.applyOptionsToResult(bookmarks, filters.query, options);
  }

  // 应用过滤器
  private applyFilters(bookmarks: Bookmark[], filters: SearchFilters): Bookmark[] {
    let result = bookmarks;

    // 文件夹过滤
    if (filters.folders && filters.folders.length > 0) {
      result = result.filter((b) => b.folderId && filters.folders!.includes(b.folderId));
    }

    // 标签过滤
    if (filters.tags && filters.tags.length > 0) {
      result = result.filter((b) => filters.tags!.some((t) => b.tags.includes(t)));
    }

    // 日期范围过滤
    if (filters.dateRange) {
      result = result.filter(
        (b) => b.createdAt >= filters.dateRange!.start && b.createdAt <= filters.dateRange!.end
      );
    }

    // 状态过滤
    if (filters.status && filters.status.length > 0) {
      result = result.filter((b) => filters.status!.includes(b.status));
    }

    // 收藏过滤
    if (filters.isFavorite !== undefined) {
      result = result.filter((b) => b.isFavorite === filters.isFavorite);
    }

    // 归档过滤
    if (filters.isArchived !== undefined) {
      result = result.filter((b) => b.isArchived === filters.isArchived);
    }

    // 内容类型过滤
    if (filters.contentTypes && filters.contentTypes.length > 0) {
      result = result.filter(
        (b) => b.meta?.contentType && filters.contentTypes!.includes(b.meta.contentType)
      );
    }

    return result;
  }

  // 应用排序和分页
  private applyOptionsToResult(
    bookmarks: Bookmark[],
    query?: string,
    options?: SearchOptions
  ): SearchResult {
    const total = bookmarks.length;
    let items = [...bookmarks];

    // 排序
    if (options?.sortBy && options.sortBy !== 'relevance') {
      const sortOrder = options.sortOrder || 'desc';
      items.sort((a, b) => {
        let aVal: string | number;
        let bVal: string | number;

        switch (options.sortBy) {
          case 'date':
            aVal = a.createdAt;
            bVal = b.createdAt;
            break;
          case 'title':
            aVal = a.title.toLowerCase();
            bVal = b.title.toLowerCase();
            break;
          case 'visitCount':
            aVal = a.visitCount;
            bVal = b.visitCount;
            break;
          default:
            return 0;
        }

        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return sortOrder === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
      });
    }

    // 分页
    if (options?.offset !== undefined) {
      items = items.slice(options.offset);
    }
    if (options?.limit !== undefined) {
      items = items.slice(0, options.limit);
    }

    return { items, total, query };
  }

  // 重建索引
  async rebuildIndex(): Promise<void> {
    this.fuse = null;
    this.cacheTime = 0;
    await this.getFuseIndex();
  }

  // 使索引失效
  invalidateCache(): void {
    this.cacheTime = 0;
  }

  // 获取搜索建议
  async getSuggestions(query: string, limit = 5): Promise<string[]> {
    if (!query.trim()) return [];

    const fuse = await this.getFuseIndex();
    const results = fuse.search(query, { limit });

    // 提取唯一的标题和标签作为建议
    const suggestions = new Set<string>();

    for (const result of results) {
      suggestions.add(result.item.title);
      result.item.tags.forEach((t) => suggestions.add(t));
    }

    return Array.from(suggestions).slice(0, limit);
  }

  // 获取相关书签
  async getRelated(bookmarkId: string, limit = 5): Promise<Bookmark[]> {
    const bookmark = await db.bookmarks.get(bookmarkId);
    if (!bookmark) return [];

    // 基于标签查找相关书签
    const allBookmarks = await db.bookmarks.toArray();

    const scored = allBookmarks
      .filter((b) => b.id !== bookmarkId)
      .map((b) => {
        // 计算标签重叠度
        const commonTags = b.tags.filter((t) => bookmark.tags.includes(t)).length;
        return { bookmark: b, score: commonTags };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map((item) => item.bookmark);
  }
}

// 单例导出
export const searchService = new SearchService();
