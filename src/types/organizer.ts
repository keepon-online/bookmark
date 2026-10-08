// 书签整理相关类型定义

import type { Bookmark } from './bookmark';

// 整理策略
export type OrganizeStrategy = 'auto' | 'conservative' | 'aggressive';

// 整理选项
export interface OrganizeOptions {
  // 分类策略
  strategy: OrganizeStrategy;

  // 是否创建新文件夹
  createNewFolders: boolean;

  // 是否应用标签
  applyTags: boolean;

  // 是否移动书签
  moveBookmarks: boolean;

  // 是否删除重复
  removeDuplicates: boolean;

  // 最低置信度 (0-1)
  minConfidence: number;

  // 是否归档未分类的书签
  archiveUncategorized: boolean;

  // 是否处理失效链接
  handleBroken: 'delete' | 'archive' | 'ignore';
}

// 整理变更
export interface OrganizeChange {
  bookmarkId: string;
  bookmarkTitle: string;
  type: 'move' | 'tag' | 'delete' | 'archive';
  from?: string;      // 源文件夹 ID
  to?: string;        // 目标文件夹 ID
  tags?: {
    added: string[];
    removed: string[];
  };
  confidence: number;
  reason?: string;
}

// 整理结果
export interface OrganizeResult {
  success: boolean;
  processed: number;
  classified: number;
  moved: number;
  tagged: number;
  duplicatesRemoved: number;
  archived: number;
  foldersCreated: string[];
  errors: string[];
  duration: number;
  timestamp: number;
}

// 重复组
export interface DuplicateGroup {
  id: string;
  url: string;
  bookmarks: Bookmark[];
  keep: string;              // 建议保留的书签 ID
  reason: string;            // 选择理由
  duplicates: Array<{
    id: string;
    title: string;
    createdAt: number;
    lastVisited?: number;
  }>;
}

// 整理历史记录
export interface OrganizeHistory {
  id: string;
  timestamp: number;
  options: OrganizeOptions;
  result: OrganizeResult;
  changes: OrganizeChange[];
  rolledBack?: boolean;
  rolledBackAt?: number;
}
