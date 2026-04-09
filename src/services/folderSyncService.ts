// 文件夹浏览器同步服务

import { db } from '@/lib/database';
import { createLogger } from '@/lib/logger';
import { generateId, now } from '@/lib/utils';
import type { Folder } from '@/types';
import type {
  FolderMapping,
  FolderSyncResult,
  BatchFolderSyncResult,
  FolderSyncConflict,
} from '@/types/sync';

const logger = createLogger('FolderSync');

// 浏览器书签栏根目录 ID
const BOOKMARK_BAR_ID = '1';
const OTHER_BOOKMARKS_ID = '2';

export class FolderSyncService {
  private watching = false;
  private syncInProgress = false;
  private listeners: {
    created?: (id: string, bookmark: chrome.bookmarks.BookmarkTreeNode) => void;
    removed?: (id: string, removeInfo: chrome.bookmarks.BookmarkRemoveInfo) => void;
    moved?: (id: string, moveInfo: chrome.bookmarks.BookmarkMoveInfo) => void;
    changed?: (id: string, changeInfo: chrome.bookmarks.BookmarkChangeInfo) => void;
  } = {};

  // ========== 核心同步方法 ==========

  /**
   * 将数据库文件夹同步到浏览器
   */
  async syncFolderToBrowser(dbFolderId: string): Promise<FolderSyncResult> {
    if (this.syncInProgress) {
      return { success: false, action: 'skipped', error: 'Sync already in progress' };
    }

    return this.syncFolderToBrowserInternal(dbFolderId);
  }

  /**
   * 内部同步方法（不检查 syncInProgress，供批量同步调用）
   */
  private async syncFolderToBrowserInternal(dbFolderId: string): Promise<FolderSyncResult> {
    try {
      const folder = await db.folders.get(dbFolderId);
      if (!folder) {
        return { success: false, action: 'skipped', error: 'Folder not found' };
      }

      // 智能文件夹不同步到浏览器
      if (folder.isSmartFolder) {
        return { success: false, action: 'skipped', error: 'Smart folders cannot be synced' };
      }

      // 检查是否已有映射
      const existingMapping = await this.getMappingByDbId(dbFolderId);
      if (existingMapping) {
        // 更新现有浏览器文件夹
        return this.updateBrowserFolder(folder, existingMapping);
      }

      // 创建新的浏览器文件夹
      return this.createBrowserFolder(folder);
    } catch (error) {
      logger.error('syncFolderToBrowser failed', error);
      return { success: false, action: 'skipped', error: (error as Error).message };
    }
  }

  /**
   * 将浏览器文件夹同步到数据库
   */
  async syncFolderFromBrowser(browserFolderId: string): Promise<FolderSyncResult> {
    try {
      // 获取浏览器文件夹信息
      const browserFolders = await chrome.bookmarks.get(browserFolderId);
      if (!browserFolders || browserFolders.length === 0) {
        return { success: false, action: 'skipped', error: 'Browser folder not found' };
      }

      const browserFolder = browserFolders[0];

      // 忽略书签（只处理文件夹）
      if (browserFolder.url) {
        return { success: false, action: 'skipped', error: 'Not a folder' };
      }

      // 检查是否已有映射
      const existingMapping = await this.getMappingByBrowserId(browserFolderId);
      if (existingMapping) {
        // 更新现有数据库文件夹
        return this.updateDbFolder(browserFolder, existingMapping);
      }

      // 创建新的数据库文件夹
      return this.createDbFolder(browserFolder);
    } catch (error) {
      logger.error('syncFolderFromBrowser failed', error);
      return { success: false, action: 'skipped', error: (error as Error).message };
    }
  }

  /**
   * 全量同步：数据库 → 浏览器
   */
  async syncAllToBrowser(): Promise<BatchFolderSyncResult> {
    const startTime = Date.now();
    const result: BatchFolderSyncResult = {
      success: true,
      total: 0,
      synced: 0,
      skipped: 0,
      errors: [],
      conflicts: [],
      duration: 0,
    };

    try {
      this.syncInProgress = true;
      const folders = await db.folders.toArray();
      result.total = folders.length;

      // 按层级排序，确保父文件夹先同步
      const sortedFolders = this.sortFoldersByHierarchy(folders);

      for (const folder of sortedFolders) {
        if (folder.isSmartFolder) {
          result.skipped++;
          continue;
        }

        const syncResult = await this.syncFolderToBrowserInternal(folder.id);
        if (syncResult.success) {
          result.synced++;
        } else {
          result.skipped++;
          if (syncResult.error) {
            result.errors.push({
              folderId: folder.id,
              folderName: folder.name,
              error: syncResult.error,
              timestamp: now(),
            });
          }
        }
      }

      logger.info(`Synced ${result.synced}/${result.total} folders to browser`);
    } catch (error) {
      result.success = false;
      logger.error('syncAllToBrowser failed', error);
    } finally {
      this.syncInProgress = false;
      result.duration = Date.now() - startTime;
    }

    return result;
  }

  /**
   * 全量同步：浏览器 → 数据库
   */
  async syncAllFromBrowser(): Promise<BatchFolderSyncResult> {
    const startTime = Date.now();
    const result: BatchFolderSyncResult = {
      success: true,
      total: 0,
      synced: 0,
      skipped: 0,
      errors: [],
      conflicts: [],
      duration: 0,
    };

    try {
      this.syncInProgress = true;
      const tree = await chrome.bookmarks.getTree();
      const browserFolders = this.extractFoldersFromTree(tree);
      result.total = browserFolders.length;

      for (const browserFolder of browserFolders) {
        const syncResult = await this.syncFolderFromBrowser(browserFolder.id);
        if (syncResult.success) {
          result.synced++;
        } else {
          result.skipped++;
        }
      }

      logger.info(`Synced ${result.synced}/${result.total} folders from browser`);
    } catch (error) {
      result.success = false;
      logger.error('syncAllFromBrowser failed', error);
    } finally {
      this.syncInProgress = false;
      result.duration = Date.now() - startTime;
    }

    return result;
  }

  // ========== 私有同步方法 ==========

  /**
   * 创建浏览器文件夹
   */
  private async createBrowserFolder(folder: Folder): Promise<FolderSyncResult> {
    // 获取父文件夹的浏览器 ID
    let parentBrowserId = BOOKMARK_BAR_ID;

    if (folder.parentId) {
      const parentMapping = await this.getMappingByDbId(folder.parentId);
      if (parentMapping) {
        parentBrowserId = parentMapping.browserFolderId;
      } else {
        // 父文件夹未同步，先同步父文件夹
        const parentFolder = await db.folders.get(folder.parentId);
        if (parentFolder && !parentFolder.isSmartFolder) {
          const parentResult = await this.syncFolderToBrowser(folder.parentId);
          if (parentResult.success && parentResult.browserFolderId) {
            parentBrowserId = parentResult.browserFolderId;
          }
        }
      }
    }

    // 在浏览器创建文件夹
    const browserFolder = await chrome.bookmarks.create({
      parentId: parentBrowserId,
      title: folder.name,
    });

    // 保存映射
    await this.createMapping(folder.id, browserFolder.id, browserFolder.parentId || BOOKMARK_BAR_ID);

    // 更新数据库文件夹
    await db.folders.update(folder.id, {
      browserFolderId: browserFolder.id,
      syncStatus: 'synced',
      lastSyncedAt: now(),
    });

    logger.info(`Created browser folder: ${folder.name} -> ${browserFolder.id}`);

    return {
      success: true,
      dbFolderId: folder.id,
      browserFolderId: browserFolder.id,
      action: 'created',
    };
  }

  /**
   * 更新浏览器文件夹
   */
  private async updateBrowserFolder(folder: Folder, mapping: FolderMapping): Promise<FolderSyncResult> {
    try {
      // 检查浏览器文件夹是否存在
      const browserFolders = await chrome.bookmarks.get(mapping.browserFolderId);
      if (!browserFolders || browserFolders.length === 0) {
        // 浏览器文件夹已被删除，重新创建
        await this.removeMapping(mapping.id);
        return this.createBrowserFolder(folder);
      }

      const browserFolder = browserFolders[0];
      let targetParentId = BOOKMARK_BAR_ID;

      if (folder.parentId) {
        const parentMapping = await this.getMappingByDbId(folder.parentId);
        if (parentMapping) {
          targetParentId = parentMapping.browserFolderId;
        } else {
          const parentFolder = await db.folders.get(folder.parentId);
          if (parentFolder && !parentFolder.isSmartFolder) {
            const parentResult = await this.syncFolderToBrowser(folder.parentId);
            if (parentResult.success && parentResult.browserFolderId) {
              targetParentId = parentResult.browserFolderId;
            }
          }
        }
      }

      // 更新名称
      if (browserFolder.title !== folder.name) {
        await chrome.bookmarks.update(mapping.browserFolderId, {
          title: folder.name,
        });
      }

      if (browserFolder.parentId !== targetParentId) {
        await chrome.bookmarks.move(mapping.browserFolderId, {
          parentId: targetParentId,
        });
      }

      // 更新映射和数据库
      await db.folderMappings.update(mapping.id, {
        browserParentId: targetParentId,
        lastSyncedAt: now(),
        syncStatus: 'synced',
      });

      await db.folders.update(folder.id, {
        syncStatus: 'synced',
        lastSyncedAt: now(),
      });

      logger.debug(`Updated browser folder: ${folder.name}`);

      return {
        success: true,
        dbFolderId: folder.id,
        browserFolderId: mapping.browserFolderId,
        action: 'updated',
      };
    } catch (error) {
      return { success: false, action: 'skipped', error: (error as Error).message };
    }
  }

  /**
   * 创建数据库文件夹
   */
  private async createDbFolder(browserFolder: chrome.bookmarks.BookmarkTreeNode): Promise<FolderSyncResult> {
    // 获取父文件夹的数据库 ID
    let parentDbId: string | undefined;

    if (browserFolder.parentId && browserFolder.parentId !== BOOKMARK_BAR_ID && browserFolder.parentId !== OTHER_BOOKMARKS_ID) {
      const parentMapping = await this.getMappingByBrowserId(browserFolder.parentId);
      if (parentMapping) {
        parentDbId = parentMapping.dbFolderId;
      }
    }

    // 检查是否已存在同名文件夹
    const existingFolders = await db.folders.toArray();
    const existing = existingFolders.find(f => f.name === browserFolder.title && f.parentId === parentDbId);
    if (existing) {
      // 已存在同名文件夹，创建映射
      await this.createMapping(existing.id, browserFolder.id, browserFolder.parentId || BOOKMARK_BAR_ID);
      await db.folders.update(existing.id, {
        browserFolderId: browserFolder.id,
        syncStatus: 'synced',
        lastSyncedAt: now(),
      });
      return {
        success: true,
        dbFolderId: existing.id,
        browserFolderId: browserFolder.id,
        action: 'updated',
      };
    }

    // 获取排序顺序
    const siblings = existingFolders.filter(f => f.parentId === parentDbId);
    const maxOrder = siblings.reduce((max, f) => Math.max(max, f.order), -1);

    // 创建新文件夹
    const newFolder: Folder = {
      id: generateId(),
      name: browserFolder.title,
      icon: '📁',
      parentId: parentDbId,
      order: maxOrder + 1,
      isSmartFolder: false,
      createdAt: browserFolder.dateAdded || now(),
      updatedAt: now(),
      browserFolderId: browserFolder.id,
      syncStatus: 'synced',
      lastSyncedAt: now(),
    };

    await db.folders.add(newFolder);

    // 保存映射
    await this.createMapping(newFolder.id, browserFolder.id, browserFolder.parentId || BOOKMARK_BAR_ID);

    logger.info(`Created DB folder from browser: ${browserFolder.title} -> ${newFolder.id}`);

    return {
      success: true,
      dbFolderId: newFolder.id,
      browserFolderId: browserFolder.id,
      action: 'created',
    };
  }

  /**
   * 更新数据库文件夹
   */
  private async updateDbFolder(browserFolder: chrome.bookmarks.BookmarkTreeNode, mapping: FolderMapping): Promise<FolderSyncResult> {
    try {
      const folder = await db.folders.get(mapping.dbFolderId);
      if (!folder) {
        // 数据库文件夹已被删除，重新创建
        await this.removeMapping(mapping.id);
        return this.createDbFolder(browserFolder);
      }

      // 更新名称
      if (folder.name !== browserFolder.title) {
        await db.folders.update(mapping.dbFolderId, {
          name: browserFolder.title,
          updatedAt: now(),
          syncStatus: 'synced',
          lastSyncedAt: now(),
        });
      }

      // 更新映射
      await db.folderMappings.update(mapping.id, {
        lastSyncedAt: now(),
        syncStatus: 'synced',
      });

      return {
        success: true,
        dbFolderId: mapping.dbFolderId,
        browserFolderId: browserFolder.id,
        action: 'updated',
      };
    } catch (error) {
      return { success: false, action: 'skipped', error: (error as Error).message };
    }
  }

// PLACEHOLDER_MAPPING_METHODS

  // ========== 映射管理方法 ==========

  /**
   * 获取数据库文件夹对应的浏览器文件夹 ID
   */
  async getBrowserFolderId(dbFolderId: string): Promise<string | undefined> {
    const mapping = await this.getMappingByDbId(dbFolderId);
    return mapping?.browserFolderId;
  }

  /**
   * 获取浏览器文件夹对应的数据库文件夹 ID
   */
  async getDbFolderId(browserFolderId: string): Promise<string | undefined> {
    const mapping = await this.getMappingByBrowserId(browserFolderId);
    return mapping?.dbFolderId;
  }

  /**
   * 通过数据库文件夹 ID 获取映射
   */
  private async getMappingByDbId(dbFolderId: string): Promise<FolderMapping | undefined> {
    return db.folderMappings.where('dbFolderId').equals(dbFolderId).first();
  }

  /**
   * 通过浏览器文件夹 ID 获取映射
   */
  private async getMappingByBrowserId(browserFolderId: string): Promise<FolderMapping | undefined> {
    return db.folderMappings.where('browserFolderId').equals(browserFolderId).first();
  }

  /**
   * 创建映射关系
   */
  async createMapping(dbFolderId: string, browserFolderId: string, browserParentId: string): Promise<FolderMapping> {
    const mapping: FolderMapping = {
      id: generateId(),
      dbFolderId,
      browserFolderId,
      browserParentId,
      lastSyncedAt: now(),
      syncDirection: 'bidirectional',
      syncStatus: 'synced',
      version: 1,
    };

    await db.folderMappings.add(mapping);
    logger.debug(`Created mapping: ${dbFolderId} <-> ${browserFolderId}`);
    return mapping;
  }

  /**
   * 删除映射关系
   */
  async removeMapping(mappingId: string): Promise<void> {
    await db.folderMappings.delete(mappingId);
    logger.debug(`Removed mapping: ${mappingId}`);
  }

  /**
   * 通过数据库文件夹 ID 删除映射
   */
  async removeMappingByDbId(dbFolderId: string): Promise<void> {
    await db.folderMappings.where('dbFolderId').equals(dbFolderId).delete();
  }

  /**
   * 通过浏览器文件夹 ID 删除映射
   */
  async removeMappingByBrowserId(browserFolderId: string): Promise<void> {
    await db.folderMappings.where('browserFolderId').equals(browserFolderId).delete();
  }

  // ========== 事件监听方法 ==========

  /**
   * 开始监听浏览器书签变化
   */
  startWatching(): void {
    if (this.watching) return;

    this.listeners.created = this.handleBrowserCreated.bind(this);
    this.listeners.removed = this.handleBrowserRemoved.bind(this);
    this.listeners.moved = this.handleBrowserMoved.bind(this);
    this.listeners.changed = this.handleBrowserChanged.bind(this);

    chrome.bookmarks.onCreated.addListener(this.listeners.created);
    chrome.bookmarks.onRemoved.addListener(this.listeners.removed);
    chrome.bookmarks.onMoved.addListener(this.listeners.moved);
    chrome.bookmarks.onChanged.addListener(this.listeners.changed);

    this.watching = true;
    logger.info('Started watching browser bookmarks');
  }

  /**
   * 停止监听
   */
  stopWatching(): void {
    if (!this.watching) return;

    if (this.listeners.created) {
      chrome.bookmarks.onCreated.removeListener(this.listeners.created);
    }
    if (this.listeners.removed) {
      chrome.bookmarks.onRemoved.removeListener(this.listeners.removed);
    }
    if (this.listeners.moved) {
      chrome.bookmarks.onMoved.removeListener(this.listeners.moved);
    }
    if (this.listeners.changed) {
      chrome.bookmarks.onChanged.removeListener(this.listeners.changed);
    }

    this.watching = false;
    logger.info('Stopped watching browser bookmarks');
  }

  /**
   * 是否正在监听
   */
  isWatchingBrowser(): boolean {
    return this.watching;
  }

  /**
   * 处理浏览器文件夹创建
   */
  private async handleBrowserCreated(
    id: string,
    bookmark: chrome.bookmarks.BookmarkTreeNode
  ): Promise<void> {
    // 忽略书签（只处理文件夹）
    if (bookmark.url) return;

    // 同步进行中时忽略（避免循环）
    if (this.syncInProgress) return;

    // 检查是否已有映射（避免循环同步）
    const existing = await this.getMappingByBrowserId(id);
    if (existing) return;

    logger.debug(`Browser folder created: ${bookmark.title} (${id})`);

    // 同步到数据库
    await this.syncFolderFromBrowser(id);
  }

  /**
   * 处理浏览器文件夹删除
   */
  private async handleBrowserRemoved(
    id: string,
    _removeInfo: chrome.bookmarks.BookmarkRemoveInfo
  ): Promise<void> {
    // 同步进行中时忽略
    if (this.syncInProgress) return;

    const mapping = await this.getMappingByBrowserId(id);
    if (!mapping) return;

    logger.debug(`Browser folder removed: ${id}`);

    // 记录冲突或直接删除数据库文件夹
    const folder = await db.folders.get(mapping.dbFolderId);
    if (folder) {
      // 标记为冲突，让用户决定
      await db.folders.update(mapping.dbFolderId, {
        syncStatus: 'conflict',
      });

      // 记录冲突
      await this.recordConflict({
        type: 'deleted_on_one_side',
        dbFolderId: mapping.dbFolderId,
        browserFolderId: id,
        dbFolderName: folder.name,
      });
    }

    // 删除映射
    await this.removeMapping(mapping.id);
  }

  /**
   * 处理浏览器文件夹移动
   */
  private async handleBrowserMoved(
    id: string,
    moveInfo: chrome.bookmarks.BookmarkMoveInfo
  ): Promise<void> {
    // 同步进行中时忽略
    if (this.syncInProgress) return;

    const mapping = await this.getMappingByBrowserId(id);
    if (!mapping) return;

    logger.debug(`Browser folder moved: ${id}`);

    // 更新映射中的父文件夹
    await db.folderMappings.update(mapping.id, {
      browserParentId: moveInfo.parentId,
      lastSyncedAt: now(),
    });

    // 更新数据库文件夹的父级
    const newParentMapping = await this.getMappingByBrowserId(moveInfo.parentId);
    await db.folders.update(mapping.dbFolderId, {
      parentId: newParentMapping?.dbFolderId,
      updatedAt: now(),
      syncStatus: 'synced',
      lastSyncedAt: now(),
    });
  }

  /**
   * 处理浏览器文件夹重命名
   */
  private async handleBrowserChanged(
    id: string,
    changeInfo: chrome.bookmarks.BookmarkChangeInfo
  ): Promise<void> {
    // 同步进行中时忽略
    if (this.syncInProgress) return;

    const mapping = await this.getMappingByBrowserId(id);
    if (!mapping) return;

    if (changeInfo.title) {
      logger.debug(`Browser folder renamed: ${id} -> ${changeInfo.title}`);

      // 更新数据库文件夹名称
      await db.folders.update(mapping.dbFolderId, {
        name: changeInfo.title,
        updatedAt: now(),
        syncStatus: 'synced',
        lastSyncedAt: now(),
      });

      // 更新映射
      await db.folderMappings.update(mapping.id, {
        lastSyncedAt: now(),
        syncStatus: 'synced',
      });
    }
  }

  // ========== 冲突处理方法 ==========

  /**
   * 记录冲突
   */
  private async recordConflict(conflict: Omit<FolderSyncConflict, 'id' | 'detectedAt' | 'resolved'>): Promise<void> {
    const fullConflict: FolderSyncConflict = {
      id: generateId(),
      ...conflict,
      detectedAt: now(),
      resolved: false,
    };

    await db.folderSyncConflicts.add(fullConflict);
    logger.warn(`Recorded conflict: ${conflict.type}`, conflict);
  }

  /**
   * 获取所有未解决的冲突
   */
  async getConflicts(): Promise<FolderSyncConflict[]> {
    return db.folderSyncConflicts.where('resolved').equals(0).toArray();
  }

  /**
   * 解决冲突
   */
  async resolveConflict(conflictId: string, resolution: FolderSyncConflict['resolution']): Promise<void> {
    const conflict = await db.folderSyncConflicts.get(conflictId);
    if (!conflict) return;

    switch (resolution?.action) {
      case 'use_db':
        // 使用数据库版本，重新同步到浏览器
        if (conflict.dbFolderId) {
          await this.syncFolderToBrowser(conflict.dbFolderId);
        }
        break;

      case 'use_browser':
        // 使用浏览器版本，删除数据库文件夹
        if (conflict.dbFolderId) {
          await db.folders.delete(conflict.dbFolderId);
        }
        break;

      case 'delete_both':
        // 两边都删除
        if (conflict.dbFolderId) {
          await db.folders.delete(conflict.dbFolderId);
        }
        if (conflict.browserFolderId) {
          try {
            await chrome.bookmarks.remove(conflict.browserFolderId);
          } catch {
            // 可能已被删除
          }
        }
        break;

      case 'skip':
      default:
        // 跳过，不做处理
        break;
    }

    // 标记冲突已解决
    await db.folderSyncConflicts.update(conflictId, {
      resolved: true,
      resolution,
    });

    logger.info(`Resolved conflict ${conflictId} with action: ${resolution?.action}`);
  }

  // ========== 辅助方法 ==========

  /**
   * 按层级排序文件夹（父文件夹在前）
   */
  private sortFoldersByHierarchy(folders: Folder[]): Folder[] {
    const folderMap = new Map(folders.map(f => [f.id, f]));
    const result: Folder[] = [];
    const visited = new Set<string>();

    const visit = (folder: Folder) => {
      if (visited.has(folder.id)) return;

      // 先访问父文件夹
      if (folder.parentId && folderMap.has(folder.parentId)) {
        visit(folderMap.get(folder.parentId)!);
      }

      visited.add(folder.id);
      result.push(folder);
    };

    folders.forEach(visit);
    return result;
  }

  /**
   * 从浏览器书签树中提取所有文件夹
   */
  private extractFoldersFromTree(tree: chrome.bookmarks.BookmarkTreeNode[]): chrome.bookmarks.BookmarkTreeNode[] {
    const folders: chrome.bookmarks.BookmarkTreeNode[] = [];

    const traverse = (node: chrome.bookmarks.BookmarkTreeNode) => {
      // 只处理文件夹（没有 url 的节点）
      if (!node.url && node.id !== '0') {
        // 排除根节点和系统文件夹
        if (node.id !== BOOKMARK_BAR_ID && node.id !== OTHER_BOOKMARKS_ID) {
          folders.push(node);
        }
      }

      if (node.children) {
        node.children.forEach(traverse);
      }
    };

    tree.forEach(traverse);
    return folders;
  }

  /**
   * 删除浏览器文件夹
   */
  async deleteBrowserFolder(browserFolderId: string): Promise<boolean> {
    try {
      await chrome.bookmarks.removeTree(browserFolderId);
      await this.removeMappingByBrowserId(browserFolderId);
      return true;
    } catch (error) {
      logger.error('Failed to delete browser folder', error);
      return false;
    }
  }
}

// 单例导出
export const folderSyncService = new FolderSyncService();
