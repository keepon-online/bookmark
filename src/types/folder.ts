// 文件夹类型定义

import type { BookmarkStatus, ContentType } from './bookmark';

export interface SmartFilters {
  tags?: string[];
  dateRange?: { start: number; end: number };
  status?: BookmarkStatus[];
  contentTypes?: ContentType[];
  isFavorite?: boolean;
}

export interface Folder {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  parentId?: string;
  order: number;
  isSmartFolder: boolean;
  smartFilters?: SmartFilters;
  createdAt: number;
  updatedAt: number;
}

export interface CreateFolderDTO {
  name: string;
  icon?: string;
  color?: string;
  parentId?: string;
}

export interface UpdateFolderDTO {
  name?: string;
  icon?: string;
  color?: string;
  parentId?: string;
  order?: number;
}

export interface FolderTreeNode extends Folder {
  children: FolderTreeNode[];
  bookmarkCount: number;
}

// 空文件夹清理相关类型
export interface FindEmptyFoldersOptions {
  recursive?: boolean;           // 是否递归检查子文件夹
  excludeRoot?: boolean;         // 是否排除根目录（parentId = null）
  minAge?: number;               // 最小存在时间（毫秒），防止误删新文件夹
  includeBookmarksCount?: boolean; // 是否返回每个文件夹的书签数量
}

export interface EmptyFolderInfo {
  folder: Folder;
  bookmarksCount: number;
  childrenCount: number;        // 直接子文件夹数
  allDescendantsCount: number;  // 所有后代文件夹数
  isEmpty: boolean;             // 是否为空（无书签且无子文件夹）
  age: number;                  // 文件夹存在时间（毫秒）
}

export interface CleanupPreviewResult {
  toDelete: EmptyFolderInfo[];          // 将被删除的文件夹
  toKeep: EmptyFolderInfo[];            // 将被保留的文件夹
  totalBookmarksAffected: number;       // 受影响的书签数（应为0）
  warnings: string[];                   // 警告信息
}

export interface CleanupEmptyFoldersResult {
  deleted: number;                      // 删除的文件夹数
  kept: number;                         // 保留的文件夹数
  warnings: string[];                   // 警告信息
  duration: number;                     // 执行时间（毫秒）
}

// 浏览器书签栏空文件夹清理类型
export interface EmptyBrowserFolder {
  id: string;
  title: string;
  path: string;                // 完整路径，如 "书签栏 > 技术 > 前端"
  parentId?: string;
  index?: number;
  dateAdded?: number;
}

export interface BrowserCleanupResult {
  deleted: number;             // 删除的文件夹数
  errors: string[];            // 错误信息
  duration: number;            // 执行时间（毫秒）
}
