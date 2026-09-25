// 书签类型定义

import type { ContentType } from './ai';

export type BookmarkStatus = 'active' | 'broken' | 'pending';

export interface BookmarkMeta {
  author?: string;
  publishDate?: string;
  readingTime?: string;
  language?: string;
  contentType?: ContentType;
}

export interface Bookmark {
  id: string;
  url: string;
  /** URL 去重键（去除协议/www 前缀的小写标准化形式），用于索引查重 */
  urlKey: string;
  title: string;
  description?: string;
  folderId?: string;
  tags: string[];
  favicon?: string;
  screenshot?: string;
  createdAt: number;
  updatedAt: number;
  lastVisited?: number;
  visitCount: number;
  isFavorite: boolean;
  isArchived: boolean;
  status: BookmarkStatus;
  notes?: string;
  aiGenerated: boolean;
  meta?: BookmarkMeta;
}

export interface CreateBookmarkDTO {
  url: string;
  title: string;
  description?: string;
  folderId?: string;
  tags?: string[];
  favicon?: string;
  notes?: string;
}

export interface UpdateBookmarkDTO {
  url?: string;
  title?: string;
  description?: string;
  folderId?: string;
  tags?: string[];
  favicon?: string;
  notes?: string;
  isFavorite?: boolean;
  isArchived?: boolean;
  status?: BookmarkStatus;
  aiGenerated?: boolean;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  duplicates: number;
  errors: string[];
}

// DuplicateGroup 移到 organizer.ts 中统一定义
