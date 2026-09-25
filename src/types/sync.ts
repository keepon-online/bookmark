// 同步相关类型定义（遗留）
// v0.6 起浏览器书签是唯一数据源，同步服务已移除。
// 以下类型仅供旧数据库 schema 定义引用，随旧数据库一并退役。

// 文件夹映射记录
export interface FolderMapping {
  id: string;                    // 映射记录 ID
  dbFolderId: string;            // 数据库文件夹 ID
  browserFolderId: string;       // 浏览器文件夹 ID
  browserParentId: string;       // 浏览器父文件夹 ID
  lastSyncedAt: number;          // 最后同步时间
  syncDirection: 'db_to_browser' | 'browser_to_db' | 'bidirectional';
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error';
  errorMessage?: string;         // 错误信息
  version: number;               // 版本号（用于冲突检测）
}

// 文件夹同步冲突
export interface FolderSyncConflict {
  id: string;
  type: 'name_mismatch' | 'parent_mismatch' | 'deleted_on_one_side' | 'both_modified';
  dbFolderId?: string;
  browserFolderId?: string;
  dbFolderName?: string;
  browserFolderName?: string;
  detectedAt: number;
  resolved: boolean;
  resolution?: FolderConflictResolution;
}

// 冲突解决方案
export type FolderConflictResolution =
  | { action: 'use_db' }           // 使用数据库版本
  | { action: 'use_browser' }      // 使用浏览器版本
  | { action: 'merge'; mergeStrategy: 'rename' | 'keep_both' }
  | { action: 'delete_both' }      // 两边都删除
  | { action: 'skip' };            // 跳过
