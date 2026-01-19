// 书签整理相关类型定义

import type { Bookmark, Folder } from './bookmark';

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

// 整理进度
export interface OrganizeProgress {
  stage: 'analyzing' | 'classifying' | 'organizing' | 'cleanup' | 'complete';
  current: number;
  total: number;
  message: string;
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

// 整理预览
export interface OrganizePreview {
  changes: OrganizeChange[];
  summary: {
    totalChanges: number;
    newFolders: string[];
    affectedBookmarks: number;
    estimatedTime: number;
  };
  warnings: string[];
}

// 书签分组
export interface BookmarkGroup {
  id: string;
  name: string;              // 组名（如 "JavaScript 教程"）
  bookmarks: Bookmark[];
  similarity: number;         // 组内相似度 (0-1)
  suggestedFolder?: string;
  suggestedTags: string[];
  commonTags: string[];
  commonDomain?: string;
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
}

// 相似度计算结果
export interface SimilarityResult {
  bookmark1Id: string;
  bookmark2Id: string;
  similarity: number;        // 0-1
  factors: {
    url: number;
    title: number;
    tags: number;
    domain: number;
  };
  reason: string;
}

// 聚类结果
export interface ClusterResult {
  clusters: BookmarkGroup[];
  noise: Bookmark[];         // 无法归类的书签
  silhouetteScore: number;   // 聚类质量评分
}

// 清理选项
export interface CleanupOptions {
  // 删除重复
  removeDuplicates: boolean;

  // 处理失效链接
  handleBroken: 'delete' | 'archive' | 'ignore';

  // 归档长期未访问的书签
  archiveUnused: boolean;
  unusedDays: number;        // 多少天未访问算作未使用

  // 清理空文件夹
  removeEmptyFolders: boolean;

  // 清理未使用的标签
  cleanupUnusedTags: boolean;
}

// 清理结果
export interface CleanupResult {
  removed: number;
  archived: number;
  kept: number;
  invalid: number;
  emptyFoldersRemoved: number;
  unusedTagsRemoved: number;
  errors: string[];
  duration: number;
}

// 模式发现结果
export interface PatternDiscovery {
  pattern: string;           // URL 模式
  frequency: number;         // 出现频率
  suggestedTag: string;      // 建议标签
  suggestedFolder: string;   // 建议文件夹
  confidence: number;        // 置信度
  samples: string[];         // 示例 URL
}

// 智能建议
export interface SmartSuggestion {
  type: 'folder' | 'tag' | 'cleanup' | 'merge';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  action: () => Promise<void>;
  estimatedImpact: {
    bookmarksAffected: number;
    timeSaved: number;
  };
}
