// 文件夹服务

import { db } from '@/lib/database';
import { generateId, now } from '@/lib/utils';
import type { Folder, CreateFolderDTO, UpdateFolderDTO, FolderTreeNode } from '@/types';

export class FolderService {
  // 创建文件夹
  async create(dto: CreateFolderDTO): Promise<Folder> {
    // 检查同名文件夹
    const existing = await db.folders
      .where('name')
      .equals(dto.name)
      .and((f) => f.parentId === dto.parentId)
      .first();

    if (existing) {
      throw new Error('Folder with this name already exists');
    }

    // 获取排序顺序
    const siblings = await db.folders.where('parentId').equals(dto.parentId || '').toArray();
    const maxOrder = siblings.reduce((max, f) => Math.max(max, f.order), -1);

    const folder: Folder = {
      id: generateId(),
      name: dto.name,
      icon: dto.icon || '📁',
      color: dto.color,
      parentId: dto.parentId,
      order: maxOrder + 1,
      isSmartFolder: false,
      createdAt: now(),
      updatedAt: now(),
    };

    await db.folders.add(folder);
    return folder;
  }

  // 更新文件夹
  async update(id: string, dto: UpdateFolderDTO): Promise<Folder> {
    const folder = await db.folders.get(id);
    if (!folder) {
      throw new Error('Folder not found');
    }

    // 如果更改名称，检查同名文件夹
    if (dto.name && dto.name !== folder.name) {
      const parentId = dto.parentId !== undefined ? dto.parentId : folder.parentId;
      const existing = await db.folders
        .where('name')
        .equals(dto.name)
        .and((f) => f.parentId === parentId && f.id !== id)
        .first();

      if (existing) {
        throw new Error('Folder with this name already exists');
      }
    }

    await db.folders.update(id, {
      ...dto,
      updatedAt: now(),
    });

    const updated = await db.folders.get(id);
    return updated!;
  }

  // 删除文件夹
  async delete(id: string, moveBookmarksTo?: string): Promise<void> {
    const folder = await db.folders.get(id);
    if (!folder) {
      throw new Error('Folder not found');
    }

    // 移动文件夹内的书签
    await db.bookmarks.where('folderId').equals(id).modify({
      folderId: moveBookmarksTo,
      updatedAt: now(),
    });

    // 递归删除子文件夹
    const children = await db.folders.where('parentId').equals(id).toArray();
    for (const child of children) {
      await this.delete(child.id, moveBookmarksTo);
    }

    // 删除文件夹
    await db.folders.delete(id);
  }

  // 获取单个文件夹
  async getById(id: string): Promise<Folder | undefined> {
    return db.folders.get(id);
  }

  // 获取所有文件夹
  async getAll(): Promise<Folder[]> {
    return db.folders.orderBy('order').toArray();
  }

  // 获取文件夹树
  async getTree(): Promise<FolderTreeNode[]> {
    const folders = await this.getAll();
    const bookmarkCounts = await this.getBookmarkCounts();

    // 构建树结构
    const buildTree = (parentId?: string): FolderTreeNode[] => {
      return folders
        .filter((f) => f.parentId === parentId)
        .sort((a, b) => a.order - b.order)
        .map((folder) => ({
          ...folder,
          children: buildTree(folder.id),
          bookmarkCount: bookmarkCounts[folder.id] || 0,
        }));
    };

    return buildTree(undefined);
  }

  // 获取各文件夹的书签数量
  private async getBookmarkCounts(): Promise<Record<string, number>> {
    const bookmarks = await db.bookmarks.toArray();
    const counts: Record<string, number> = {};

    for (const bookmark of bookmarks) {
      if (bookmark.folderId) {
        counts[bookmark.folderId] = (counts[bookmark.folderId] || 0) + 1;
      }
    }

    return counts;
  }

  // 移动文件夹
  async move(id: string, newParentId?: string, newOrder?: number): Promise<Folder> {
    const folder = await db.folders.get(id);
    if (!folder) {
      throw new Error('Folder not found');
    }

    // 检查是否试图移动到自己的子文件夹
    if (newParentId) {
      const isDescendant = await this.isDescendant(newParentId, id);
      if (isDescendant) {
        throw new Error('Cannot move folder into its own descendant');
      }
    }

    const updates: Partial<Folder> = { updatedAt: now() };

    if (newParentId !== undefined) {
      updates.parentId = newParentId;
    }

    if (newOrder !== undefined) {
      updates.order = newOrder;
      // 重新排序同级文件夹
      await this.reorderSiblings(folder.parentId, id, newOrder);
    }

    await db.folders.update(id, updates);

    const updated = await db.folders.get(id);
    return updated!;
  }

  // 检查是否是子文件夹
  private async isDescendant(folderId: string, potentialAncestorId: string): Promise<boolean> {
    let currentId: string | undefined = folderId;

    while (currentId) {
      if (currentId === potentialAncestorId) {
        return true;
      }
      const folder = await db.folders.get(currentId);
      currentId = folder?.parentId;
    }

    return false;
  }

  // 重新排序同级文件夹
  private async reorderSiblings(
    parentId: string | undefined,
    movedId: string,
    newOrder: number
  ): Promise<void> {
    const siblings = await db.folders
      .where('parentId')
      .equals(parentId || '')
      .and((f) => f.id !== movedId)
      .toArray();

    // 按当前顺序排序
    siblings.sort((a, b) => a.order - b.order);

    // 重新分配顺序
    let order = 0;
    for (const sibling of siblings) {
      if (order === newOrder) {
        order++; // 跳过新位置
      }
      if (sibling.order !== order) {
        await db.folders.update(sibling.id, { order });
      }
      order++;
    }
  }

  // 获取文件夹路径
  async getPath(id: string): Promise<Folder[]> {
    const path: Folder[] = [];
    let currentId: string | undefined = id;

    while (currentId) {
      const folder = await db.folders.get(currentId);
      if (!folder) break;
      path.unshift(folder);
      currentId = folder.parentId;
    }

    return path;
  }

  // 搜索文件夹
  async search(query: string): Promise<Folder[]> {
    const lowerQuery = query.toLowerCase();
    const folders = await db.folders.toArray();

    return folders.filter((f) => f.name.toLowerCase().includes(lowerQuery));
  }
}

// 单例导出
export const folderService = new FolderService();
