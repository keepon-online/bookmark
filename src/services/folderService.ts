// 文件夹服务

import { db } from '@/lib/database';
import { generateId, now } from '@/lib/utils';
import { createLogger } from '@/lib/logger';
import type {
  Folder,
  CreateFolderDTO,
  UpdateFolderDTO,
  FolderTreeNode,
  FindEmptyFoldersOptions,
  EmptyFolderInfo,
  CleanupPreviewResult,
  CleanupEmptyFoldersResult,
} from '@/types';

const logger = createLogger('FolderService');

export class FolderService {
  // 创建文件夹
  async create(dto: CreateFolderDTO): Promise<Folder> {
    // 检查同名文件夹
    const allFolders = await db.folders.toArray();
    const existing = allFolders.find(f => f.name === dto.name && f.parentId === dto.parentId);

    if (existing) {
      throw new Error('Folder with this name already exists');
    }

    // 获取排序顺序
    const allSiblings = await db.folders.toArray();
    const siblings = allSiblings.filter(f => f.parentId === dto.parentId);
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
      const allFolders = await db.folders.toArray();
      const existing = allFolders.find(f => f.name === dto.name && f.parentId === parentId && f.id !== id);

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

    // 构建树结构，递归计算包含子文件夹的书签总数
    const buildTree = (parentId?: string): FolderTreeNode[] => {
      return folders
        .filter((f) => f.parentId === parentId)
        .sort((a, b) => a.order - b.order)
        .map((folder) => {
          const children = buildTree(folder.id);
          // 直接书签数
          const directCount = bookmarkCounts[folder.id] || 0;
          // 子文件夹书签总数
          const childrenCount = children.reduce((sum, child) => sum + child.bookmarkCount, 0);

          return {
            ...folder,
            children,
            bookmarkCount: directCount + childrenCount, // 累计总数
          };
        });
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
    const allSiblings = await db.folders.toArray();
    const siblings = allSiblings.filter(f => f.parentId === parentId && f.id !== movedId);

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

  /**
   * 查找空文件夹（优化算法）
   */
  async findEmptyFolders(
    options: FindEmptyFoldersOptions = {}
  ): Promise<EmptyFolderInfo[]> {
    const {
      recursive = true,
      excludeRoot = true,
      minAge = 0,
      includeBookmarksCount = true,
    } = options;

    logger.debug('Finding empty folders', { recursive, excludeRoot, minAge });

    // 1. 批量获取所有文件夹和书签（一次性查询）
    const [allFolders, allBookmarks] = await Promise.all([
      db.folders.toArray(),
      db.bookmarks.toArray(),
    ]);

    // 2. 构建文件夹树和统计信息
    const folderMap = new Map<string, Folder>();
    const folderBookmarksCount = new Map<string, number>();
    const folderChildren = new Map<string, Set<string>>();

    // 初始化统计
    allFolders.forEach(folder => {
      folderMap.set(folder.id, folder);
      folderBookmarksCount.set(folder.id, 0);
      folderChildren.set(folder.id, new Set());
    });

    // 统计书签分布
    allBookmarks.forEach(bookmark => {
      if (bookmark.folderId) {
        folderBookmarksCount.set(
          bookmark.folderId,
          (folderBookmarksCount.get(bookmark.folderId) || 0) + 1
        );
      }
    });

    // 构建父子关系
    allFolders.forEach(folder => {
      if (folder.parentId) {
        const children = folderChildren.get(folder.parentId);
        if (children) {
          children.add(folder.id);
        }
      }
    });

    // 3. 计算后代文件夹数（递归）
    const calculateDescendants = (folderId: string): number => {
      const children = folderChildren.get(folderId) || new Set();
      let count = children.size;
      children.forEach(childId => {
        count += calculateDescendants(childId);
      });
      return count;
    };

    // 4. 识别空文件夹
    const emptyFolders: EmptyFolderInfo[] = [];
    const now = Date.now();

    for (const folder of allFolders) {
      // 排除根目录
      if (excludeRoot && !folder.parentId) continue;

      const bookmarksCount = folderBookmarksCount.get(folder.id) || 0;
      const children = folderChildren.get(folder.id) || new Set();
      const directChildrenCount = children.size;
      const allDescendantsCount = recursive ? calculateDescendants(folder.id) : directChildrenCount;
      const age = now - folder.createdAt;

      // 判断是否为空
      const isEmpty = bookmarksCount === 0 && (recursive ? allDescendantsCount === 0 : true);

      // 应用最小存在时间过滤
      if (isEmpty && age < minAge) continue;

      emptyFolders.push({
        folder,
        bookmarksCount,
        childrenCount: directChildrenCount,
        allDescendantsCount,
        isEmpty,
        age,
      });
    }

    logger.debug(`Found ${emptyFolders.length} empty folders`);
    return emptyFolders;
  }

  /**
   * 判断文件夹是否应该保留
   */
  private async shouldKeepFolder(
    info: EmptyFolderInfo
  ): Promise<{ reason: string } | { reason?: never }> {
    const { folder, allDescendantsCount, age } = info;

    // 1. 检查是否是智能文件夹
    if (folder.isSmartFolder) {
      return { reason: '智能文件夹需要保留' };
    }

    // 2. 检查是否有子文件夹（非递归模式）
    if (allDescendantsCount > 0) {
      return { reason: `包含 ${allDescendantsCount} 个子文件夹` };
    }

    // 3. 检查是否是系统文件夹（如"收藏"、"未分类"）
    const systemFolders = ['收藏', '未分类', '全部', '最近使用'];
    if (systemFolders.includes(folder.name)) {
      return { reason: '系统文件夹需要保留' };
    }

    // 4. 检查文件夹是否太新（防止误删刚创建的）
    const ONE_DAY = 24 * 60 * 60 * 1000;
    if (age < ONE_DAY) {
      return { reason: '创建时间小于24小时' };
    }

    return {};
  }

  /**
   * 预览清理结果
   */
  async previewEmptyFolders(
    options: FindEmptyFoldersOptions = {}
  ): Promise<CleanupPreviewResult> {
    const emptyFolders = await this.findEmptyFolders(options);

    logger.debug(`Previewing cleanup of ${emptyFolders.length} empty folders`);

    // 分类：删除 vs 保留
    const toDelete: EmptyFolderInfo[] = [];
    const toKeep: EmptyFolderInfo[] = [];
    const warnings: string[] = [];

    for (const info of emptyFolders) {
      // 检查是否有特殊情况需要保留
      const shouldKeep = await this.shouldKeepFolder(info);

      if (shouldKeep.reason) {
        toKeep.push(info);
        warnings.push(`"${info.folder.name}": ${shouldKeep.reason}`);
      } else {
        toDelete.push(info);
      }
    }

    logger.info(`Cleanup preview: ${toDelete.length} to delete, ${toKeep.length} to keep`);

    return {
      toDelete,
      toKeep,
      totalBookmarksAffected: 0,
      warnings,
    };
  }

  /**
   * 清理空文件夹
   */
  async deleteEmptyFolders(
    options: FindEmptyFoldersOptions & {
      dryRun?: boolean;  // 预演模式，不实际删除
    } = {}
  ): Promise<CleanupEmptyFoldersResult> {
    const startTime = Date.now();
    const { dryRun = false, ...findOptions } = options;

    logger.info('Starting empty folders cleanup', { dryRun, ...findOptions });

    // 1. 预览
    const preview = await this.previewEmptyFolders(findOptions);

    // 2. 执行删除
    let deleted = 0;
    const kept = preview.toKeep.length;
    const warnings = [...preview.warnings];

    if (!dryRun) {
      for (const info of preview.toDelete) {
        try {
          // 递归删除文件夹及其子文件夹
          await this.delete(info.folder.id);
          deleted++;

          logger.debug(`Deleted empty folder: ${info.folder.name}`);
        } catch (error) {
          const errorMsg = `删除失败 "${info.folder.name}": ${(error as Error).message}`;
          warnings.push(errorMsg);
          logger.error(errorMsg);
        }
      }
    } else {
      deleted = preview.toDelete.length;
      logger.info('Dry run completed, no actual deletions');
    }

    const duration = Date.now() - startTime;

    logger.info(`Cleanup completed: ${deleted} deleted, ${kept} kept, ${duration}ms`);

    return {
      deleted,
      kept,
      warnings,
      duration,
    };
  }
}

// 单例导出
export const folderService = new FolderService();
