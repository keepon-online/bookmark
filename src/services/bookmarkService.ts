// 书签服务

import { db } from '@/lib/database';
import { generateId, now, normalizeUrl, isValidUrl, getFaviconUrl } from '@/lib/utils';
import type {
  Bookmark,
  CreateBookmarkDTO,
  UpdateBookmarkDTO,
  ImportResult,
  DuplicateGroup,
} from '@/types';

export class BookmarkService {
  // 创建书签
  async create(dto: CreateBookmarkDTO): Promise<Bookmark> {
    if (!isValidUrl(dto.url)) {
      throw new Error('Invalid URL');
    }

    const normalizedUrl = normalizeUrl(dto.url);

    // 检查是否重复
    const existing = await db.bookmarks.where('url').equals(normalizedUrl).first();
    if (existing) {
      throw new Error('Bookmark already exists');
    }

    const bookmark: Bookmark = {
      id: generateId(),
      url: normalizedUrl,
      title: dto.title || normalizedUrl,
      description: dto.description,
      folderId: dto.folderId,
      tags: dto.tags || [],
      favicon: dto.favicon || getFaviconUrl(normalizedUrl),
      createdAt: now(),
      updatedAt: now(),
      visitCount: 0,
      isFavorite: false,
      isArchived: false,
      status: 'active',
      notes: dto.notes,
      aiGenerated: false,
    };

    await db.bookmarks.add(bookmark);

    // 更新标签使用计数
    if (bookmark.tags.length > 0) {
      await this.updateTagUsageCount(bookmark.tags, 1);
    }

    return bookmark;
  }

  // 更新书签
  async update(id: string, dto: UpdateBookmarkDTO): Promise<Bookmark> {
    const bookmark = await db.bookmarks.get(id);
    if (!bookmark) {
      throw new Error('Bookmark not found');
    }

    const oldTags = bookmark.tags;
    const updates: Partial<Bookmark> = {
      ...dto,
      updatedAt: now(),
    };

    if (dto.url) {
      if (!isValidUrl(dto.url)) {
        throw new Error('Invalid URL');
      }
      updates.url = normalizeUrl(dto.url);
    }

    await db.bookmarks.update(id, updates);

    // 更新标签使用计数
    if (dto.tags) {
      const removedTags = oldTags.filter((t) => !dto.tags!.includes(t));
      const addedTags = dto.tags.filter((t) => !oldTags.includes(t));

      if (removedTags.length > 0) {
        await this.updateTagUsageCount(removedTags, -1);
      }
      if (addedTags.length > 0) {
        await this.updateTagUsageCount(addedTags, 1);
      }
    }

    const updated = await db.bookmarks.get(id);
    return updated!;
  }

  // 删除书签
  async delete(id: string): Promise<void> {
    const bookmark = await db.bookmarks.get(id);
    if (!bookmark) {
      throw new Error('Bookmark not found');
    }

    await db.bookmarks.delete(id);

    // 更新标签使用计数
    if (bookmark.tags.length > 0) {
      await this.updateTagUsageCount(bookmark.tags, -1);
    }

    // 删除相关的链接检查记录
    await db.linkChecks.where('bookmarkId').equals(id).delete();
  }

  // 批量删除书签
  async deleteMany(ids: string[]): Promise<void> {
    const bookmarks = await db.bookmarks.where('id').anyOf(ids).toArray();

    await db.bookmarks.bulkDelete(ids);

    // 更新标签使用计数
    const allTags = bookmarks.flatMap((b) => b.tags);
    const tagCounts = allTags.reduce((acc, tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    for (const [tag, count] of Object.entries(tagCounts)) {
      await this.updateTagUsageCount([tag], -count);
    }

    // 删除相关的链接检查记录
    await db.linkChecks.where('bookmarkId').anyOf(ids).delete();
  }

  // 获取单个书签
  async getById(id: string): Promise<Bookmark | undefined> {
    return db.bookmarks.get(id);
  }

  // 获取所有书签
  async getAll(options?: {
    folderId?: string;
    isFavorite?: boolean;
    isArchived?: boolean;
    status?: string;
    limit?: number;
    offset?: number;
    sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'visitCount';
    sortOrder?: 'asc' | 'desc';
  }): Promise<Bookmark[]> {
    let query = db.bookmarks.toCollection();

    // 应用过滤条件
    if (options?.folderId !== undefined) {
      query = db.bookmarks.where('folderId').equals(options.folderId);
    }

    let results = await query.toArray();

    // 应用额外过滤
    if (options?.isFavorite !== undefined) {
      results = results.filter((b) => b.isFavorite === options.isFavorite);
    }
    if (options?.isArchived !== undefined) {
      results = results.filter((b) => b.isArchived === options.isArchived);
    }
    if (options?.status !== undefined) {
      results = results.filter((b) => b.status === options.status);
    }

    // 排序
    const sortBy = options?.sortBy || 'createdAt';
    const sortOrder = options?.sortOrder || 'desc';
    results.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortOrder === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

    // 分页
    if (options?.offset !== undefined) {
      results = results.slice(options.offset);
    }
    if (options?.limit !== undefined) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  // 搜索书签
  async search(query: string, options?: { limit?: number }): Promise<Bookmark[]> {
    const lowerQuery = query.toLowerCase();
    const allBookmarks = await db.bookmarks.toArray();

    const results = allBookmarks.filter((b) => {
      return (
        b.title.toLowerCase().includes(lowerQuery) ||
        b.url.toLowerCase().includes(lowerQuery) ||
        b.description?.toLowerCase().includes(lowerQuery) ||
        b.tags.some((t) => t.toLowerCase().includes(lowerQuery)) ||
        b.notes?.toLowerCase().includes(lowerQuery)
      );
    });

    // 按相关度排序（标题匹配优先）
    results.sort((a, b) => {
      const aTitle = a.title.toLowerCase().includes(lowerQuery) ? 1 : 0;
      const bTitle = b.title.toLowerCase().includes(lowerQuery) ? 1 : 0;
      return bTitle - aTitle;
    });

    if (options?.limit) {
      return results.slice(0, options.limit);
    }

    return results;
  }

  // 获取书签数量
  async count(options?: { folderId?: string; isArchived?: boolean }): Promise<number> {
    if (!options) {
      return db.bookmarks.count();
    }

    let results = await db.bookmarks.toArray();

    if (options.folderId !== undefined) {
      results = results.filter((b) => b.folderId === options.folderId);
    }
    if (options.isArchived !== undefined) {
      results = results.filter((b) => b.isArchived === options.isArchived);
    }

    return results.length;
  }

  // 切换收藏状态
  async toggleFavorite(id: string): Promise<Bookmark> {
    const bookmark = await db.bookmarks.get(id);
    if (!bookmark) {
      throw new Error('Bookmark not found');
    }

    await db.bookmarks.update(id, {
      isFavorite: !bookmark.isFavorite,
      updatedAt: now(),
    });

    const updated = await db.bookmarks.get(id);
    return updated!;
  }

  // 归档书签
  async archive(ids: string[]): Promise<void> {
    await db.bookmarks.where('id').anyOf(ids).modify({
      isArchived: true,
      updatedAt: now(),
    });
  }

  // 取消归档
  async unarchive(ids: string[]): Promise<void> {
    await db.bookmarks.where('id').anyOf(ids).modify({
      isArchived: false,
      updatedAt: now(),
    });
  }

  // 移动到文件夹
  async moveToFolder(bookmarkIds: string[], folderId: string | undefined): Promise<void> {
    await db.bookmarks.where('id').anyOf(bookmarkIds).modify({
      folderId,
      updatedAt: now(),
    });
  }

  // 添加标签
  async addTags(bookmarkId: string, tags: string[]): Promise<Bookmark> {
    const bookmark = await db.bookmarks.get(bookmarkId);
    if (!bookmark) {
      throw new Error('Bookmark not found');
    }

    const newTags = [...new Set([...bookmark.tags, ...tags])];
    const addedTags = tags.filter((t) => !bookmark.tags.includes(t));

    await db.bookmarks.update(bookmarkId, {
      tags: newTags,
      updatedAt: now(),
    });

    if (addedTags.length > 0) {
      await this.updateTagUsageCount(addedTags, 1);
    }

    const updated = await db.bookmarks.get(bookmarkId);
    return updated!;
  }

  // 移除标签
  async removeTags(bookmarkId: string, tags: string[]): Promise<Bookmark> {
    const bookmark = await db.bookmarks.get(bookmarkId);
    if (!bookmark) {
      throw new Error('Bookmark not found');
    }

    const newTags = bookmark.tags.filter((t) => !tags.includes(t));
    const removedTags = tags.filter((t) => bookmark.tags.includes(t));

    await db.bookmarks.update(bookmarkId, {
      tags: newTags,
      updatedAt: now(),
    });

    if (removedTags.length > 0) {
      await this.updateTagUsageCount(removedTags, -1);
    }

    const updated = await db.bookmarks.get(bookmarkId);
    return updated!;
  }

  // 查找重复书签
  async findDuplicates(): Promise<DuplicateGroup[]> {
    const bookmarks = await db.bookmarks.toArray();
    const urlMap = new Map<string, Bookmark[]>();

    for (const bookmark of bookmarks) {
      const normalized = normalizeUrl(bookmark.url);
      const existing = urlMap.get(normalized) || [];
      existing.push(bookmark);
      urlMap.set(normalized, existing);
    }

    const duplicates: DuplicateGroup[] = [];
    for (const [url, bms] of urlMap) {
      if (bms.length > 1) {
        duplicates.push({ url, bookmarks: bms });
      }
    }

    return duplicates;
  }

  // 合并重复书签
  async mergeDuplicates(bookmarkIds: string[], keepId: string): Promise<void> {
    const idsToDelete = bookmarkIds.filter((id) => id !== keepId);
    await this.deleteMany(idsToDelete);
  }

  // 从浏览器导入书签
  async importFromBrowser(): Promise<ImportResult> {
    const result: ImportResult = {
      success: true,
      imported: 0,
      duplicates: 0,
      errors: [],
    };

    try {
      const browserBookmarks = await chrome.bookmarks.getTree();
      await this.processBookmarkTree(browserBookmarks, undefined, result);
    } catch (error) {
      result.success = false;
      result.errors.push((error as Error).message);
    }

    return result;
  }

  // 递归处理浏览器书签树
  private async processBookmarkTree(
    nodes: chrome.bookmarks.BookmarkTreeNode[],
    folderId: string | undefined,
    result: ImportResult
  ): Promise<void> {
    for (const node of nodes) {
      if (node.url) {
        // 这是一个书签
        try {
          await this.create({
            url: node.url,
            title: node.title || node.url,
            folderId,
          });
          result.imported++;
        } catch (error) {
          if ((error as Error).message === 'Bookmark already exists') {
            result.duplicates++;
          } else {
            result.errors.push(`Failed to import ${node.url}: ${(error as Error).message}`);
          }
        }
      } else if (node.children) {
        // 这是一个文件夹，递归处理
        // 暂时将子书签放入当前文件夹
        await this.processBookmarkTree(node.children, folderId, result);
      }
    }
  }

  // 更新标签使用计数
  private async updateTagUsageCount(tags: string[], delta: number): Promise<void> {
    for (const tagName of tags) {
      const tag = await db.tags.where('name').equals(tagName).first();
      if (tag) {
        await db.tags.update(tag.id, {
          usageCount: Math.max(0, tag.usageCount + delta),
        });
      } else if (delta > 0) {
        // 创建新标签
        await db.tags.add({
          id: generateId(),
          name: tagName,
          usageCount: delta,
          createdAt: now(),
        });
      }
    }
  }

  // 记录访问
  async recordVisit(id: string): Promise<void> {
    const bookmark = await db.bookmarks.get(id);
    if (!bookmark) return;

    await db.bookmarks.update(id, {
      lastVisited: now(),
      visitCount: bookmark.visitCount + 1,
    });
  }
}

// 单例导出
export const bookmarkService = new BookmarkService();
