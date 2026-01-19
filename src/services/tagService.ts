// 标签服务

import { db } from '@/lib/database';
import { generateId, now } from '@/lib/utils';
import type { Tag, CreateTagDTO, UpdateTagDTO } from '@/types';

export class TagService {
  // 创建标签
  async create(dto: CreateTagDTO): Promise<Tag> {
    // 检查是否已存在
    const existing = await db.tags.where('name').equals(dto.name).first();
    if (existing) {
      throw new Error('Tag already exists');
    }

    const tag: Tag = {
      id: generateId(),
      name: dto.name,
      color: dto.color,
      usageCount: 0,
      createdAt: now(),
    };

    await db.tags.add(tag);
    return tag;
  }

  // 更新标签
  async update(id: string, dto: UpdateTagDTO): Promise<Tag> {
    const tag = await db.tags.get(id);
    if (!tag) {
      throw new Error('Tag not found');
    }

    // 如果更改名称，检查是否已存在
    if (dto.name && dto.name !== tag.name) {
      const existing = await db.tags.where('name').equals(dto.name).first();
      if (existing) {
        throw new Error('Tag with this name already exists');
      }

      // 更新所有书签中的标签名
      const bookmarks = await db.bookmarks.where('tags').equals(tag.name).toArray();
      for (const bookmark of bookmarks) {
        const newTags = bookmark.tags.map((t) => (t === tag.name ? dto.name : t));
        await db.bookmarks.update(bookmark.id, { tags: newTags });
      }
    }

    await db.tags.update(id, dto);

    const updated = await db.tags.get(id);
    return updated!;
  }

  // 删除标签
  async delete(id: string): Promise<void> {
    const tag = await db.tags.get(id);
    if (!tag) {
      throw new Error('Tag not found');
    }

    // 从所有书签中移除该标签
    const bookmarks = await db.bookmarks.toArray();
    for (const bookmark of bookmarks) {
      if (bookmark.tags.includes(tag.name)) {
        const newTags = bookmark.tags.filter((t) => t !== tag.name);
        await db.bookmarks.update(bookmark.id, { tags: newTags });
      }
    }

    await db.tags.delete(id);
  }

  // 获取单个标签
  async getById(id: string): Promise<Tag | undefined> {
    return db.tags.get(id);
  }

  // 根据名称获取标签
  async getByName(name: string): Promise<Tag | undefined> {
    return db.tags.where('name').equals(name).first();
  }

  // 获取所有标签
  async getAll(options?: { sortBy?: 'name' | 'usageCount'; sortOrder?: 'asc' | 'desc' }): Promise<Tag[]> {
    let tags = await db.tags.toArray();

    const sortBy = options?.sortBy || 'usageCount';
    const sortOrder = options?.sortOrder || 'desc';

    tags.sort((a, b) => {
      if (sortBy === 'name') {
        return sortOrder === 'asc'
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name);
      }
      return sortOrder === 'asc'
        ? a.usageCount - b.usageCount
        : b.usageCount - a.usageCount;
    });

    return tags;
  }

  // 获取热门标签
  async getPopular(limit = 10): Promise<Tag[]> {
    const tags = await this.getAll({ sortBy: 'usageCount', sortOrder: 'desc' });
    return tags.slice(0, limit);
  }

  // 搜索标签
  async search(query: string, limit = 10): Promise<Tag[]> {
    const lowerQuery = query.toLowerCase();
    const tags = await db.tags.toArray();

    return tags
      .filter((t) => t.name.toLowerCase().includes(lowerQuery))
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, limit);
  }

  // 获取或创建标签
  async getOrCreate(name: string): Promise<Tag> {
    const existing = await this.getByName(name);
    if (existing) {
      return existing;
    }
    return this.create({ name });
  }

  // 批量获取或创建标签
  async getOrCreateMany(names: string[]): Promise<Tag[]> {
    const tags: Tag[] = [];
    for (const name of names) {
      const tag = await this.getOrCreate(name);
      tags.push(tag);
    }
    return tags;
  }

  // 合并标签
  async merge(sourceId: string, targetId: string): Promise<void> {
    const source = await db.tags.get(sourceId);
    const target = await db.tags.get(targetId);

    if (!source || !target) {
      throw new Error('Tag not found');
    }

    // 更新所有使用源标签的书签
    const bookmarks = await db.bookmarks.toArray();
    for (const bookmark of bookmarks) {
      if (bookmark.tags.includes(source.name)) {
        const newTags = bookmark.tags
          .filter((t) => t !== source.name)
          .concat(bookmark.tags.includes(target.name) ? [] : [target.name]);
        await db.bookmarks.update(bookmark.id, { tags: newTags });
      }
    }

    // 更新目标标签的使用计数
    await db.tags.update(targetId, {
      usageCount: target.usageCount + source.usageCount,
    });

    // 删除源标签
    await db.tags.delete(sourceId);
  }

  // 清理未使用的标签
  async cleanupUnused(): Promise<number> {
    const tags = await db.tags.where('usageCount').equals(0).toArray();
    const ids = tags.map((t) => t.id);
    await db.tags.bulkDelete(ids);
    return ids.length;
  }
}

// 单例导出
export const tagService = new TagService();
