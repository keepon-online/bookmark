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
