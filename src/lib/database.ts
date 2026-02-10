// IndexedDB 数据库定义 (Dexie.js)

import Dexie, { type Table } from 'dexie';
import type { Bookmark, Folder, Tag } from '@/types';
import type { OrganizeHistory } from '@/types/organizer';
import type { StatsCache } from '@/types/stats';
import type { FolderMapping, FolderSyncConflict } from '@/types/sync';

// 书签-标签关联表
export interface BookmarkTag {
  bookmarkId: string;
  tagId: string;
}

// 链接检查记录
export interface LinkCheck {
  id: string;
  bookmarkId: string;
  status: number;
  isAccessible: boolean;
  responseTime: number;
  errorMessage?: string;
  checkedAt: number;
}

// 嵌入向量记录
export interface EmbeddingRecord {
  id: string;
  bookmarkId: string;
  embedding: number[];
  model: string;
  createdAt: number;
  updatedAt: number;
}

// 同步元数据
export interface SyncMeta {
  id: string;
  entityType: 'bookmark' | 'folder' | 'tag';
  entityId: string;
  version: number;
  lastSyncedAt: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

// 书签分组
export interface BookmarkGroupRecord {
  id: string;
  name: string;
  bookmarkIds: string[];
  similarity: number;
  createdAt: number;
  updatedAt: number;
}

// 重复检测记录
export interface DuplicateRecord {
  id: string;
  url: string;
  bookmarkIds: string[];
  detectedAt: number;
  resolved: boolean;
}

export class BookmarkDatabase extends Dexie {
  bookmarks!: Table<Bookmark>;
  folders!: Table<Folder>;
  tags!: Table<Tag>;
  bookmarkTags!: Table<BookmarkTag>;
  linkChecks!: Table<LinkCheck>;
  embeddings!: Table<EmbeddingRecord>;
  syncMeta!: Table<SyncMeta>;
  organizeHistory!: Table<OrganizeHistory>;
  statsCache!: Table<StatsCache>;
  bookmarkGroups!: Table<BookmarkGroupRecord>;
  duplicateRecords!: Table<DuplicateRecord>;
  folderMappings!: Table<FolderMapping>;
  folderSyncConflicts!: Table<FolderSyncConflict>;

  constructor() {
    super('SmartBookmarkDB');

    this.version(1).stores({
      // 书签表：主键 id，索引 url, title, folderId, createdAt, isFavorite, status
      bookmarks: 'id, url, title, folderId, createdAt, isFavorite, status, isArchived, [folderId+createdAt]',
      // 文件夹表：主键 id，索引 name, parentId, order
      folders: 'id, name, parentId, order, [parentId+order]',
      // 标签表：主键 id，唯一索引 name
      tags: 'id, &name, usageCount',
      // 书签-标签关联表：复合主键
      bookmarkTags: '[bookmarkId+tagId], bookmarkId, tagId',
      // 链接检查表
      linkChecks: 'id, bookmarkId, checkedAt',
      // 同步元数据表
      syncMeta: 'id, [entityType+entityId], syncStatus',
    });

    // 版本 2：添加嵌入向量表
    this.version(2).stores({
      embeddings: 'id, bookmarkId, model, createdAt',
    });

    // 版本 3：添加整理和统计相关表
    this.version(3).stores({
      organizeHistory: 'id, timestamp',
      statsCache: 'id, type, createdAt, expiresAt',
      bookmarkGroups: 'id, name, createdAt',
      duplicateRecords: 'id, url, detectedAt, resolved',
    });

    // 版本 4：添加 aiGenerated 索引
    this.version(4).stores({
      bookmarks: 'id, url, title, folderId, createdAt, isFavorite, status, isArchived, aiGenerated, [folderId+createdAt]',
      folders: 'id, name, parentId, order, [parentId+order]',
      tags: 'id, &name, usageCount',
      bookmarkTags: '[bookmarkId+tagId], bookmarkId, tagId',
      linkChecks: 'id, bookmarkId, checkedAt',
      syncMeta: 'id, [entityType+entityId], syncStatus',
      organizeHistory: 'id, timestamp',
      statsCache: 'id, type, createdAt, expiresAt',
      bookmarkGroups: 'id, name, createdAt',
      duplicateRecords: 'id, url, detectedAt, resolved',
      embeddings: 'id, bookmarkId, model, createdAt',
    });

    // 版本 5：添加文件夹浏览器同步相关表
    this.version(5).stores({
      bookmarks: 'id, url, title, folderId, createdAt, isFavorite, status, isArchived, aiGenerated, [folderId+createdAt]',
      folders: 'id, name, parentId, order, browserFolderId, syncStatus, [parentId+order]',
      tags: 'id, &name, usageCount',
      bookmarkTags: '[bookmarkId+tagId], bookmarkId, tagId',
      linkChecks: 'id, bookmarkId, checkedAt',
      syncMeta: 'id, [entityType+entityId], syncStatus',
      organizeHistory: 'id, timestamp',
      statsCache: 'id, type, createdAt, expiresAt',
      bookmarkGroups: 'id, name, createdAt',
      duplicateRecords: 'id, url, detectedAt, resolved',
      embeddings: 'id, bookmarkId, model, createdAt',
      // 新增：文件夹映射表
      folderMappings: 'id, dbFolderId, browserFolderId, syncStatus',
      // 新增：文件夹同步冲突表
      folderSyncConflicts: 'id, type, dbFolderId, browserFolderId, resolved, detectedAt',
    });
  }
}

// 单例数据库实例
export const db = new BookmarkDatabase();

// 数据库初始化
export async function initDatabase(): Promise<void> {
  try {
    await db.open();
    console.log('[DB] Database initialized successfully');
  } catch (error) {
    console.error('[DB] Failed to initialize database:', error);
    throw error;
  }
}

// 清空数据库（用于调试）
export async function clearDatabase(): Promise<void> {
  await db.bookmarks.clear();
  await db.folders.clear();
  await db.tags.clear();
  await db.bookmarkTags.clear();
  await db.linkChecks.clear();
  await db.embeddings.clear();
  await db.syncMeta.clear();
  await db.organizeHistory.clear();
  await db.statsCache.clear();
  await db.bookmarkGroups.clear();
  await db.duplicateRecords.clear();
  await db.folderMappings.clear();
  await db.folderSyncConflicts.clear();
  console.log('[DB] Database cleared');
}

// 导出数据库数据
export async function exportDatabase(): Promise<{
  bookmarks: Bookmark[];
  folders: Folder[];
  tags: Tag[];
}> {
  const [bookmarks, folders, tags] = await Promise.all([
    db.bookmarks.toArray(),
    db.folders.toArray(),
    db.tags.toArray(),
  ]);
  return { bookmarks, folders, tags };
}
