// 同步相关类型定义

export type SyncProvider = 'supabase' | 'custom' | 'webdav';
export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'error';
export type SyncDirection = 'upload' | 'download' | 'bidirectional';

// 同步配置
export interface SyncConfig {
  provider: SyncProvider;
  enabled: boolean;
  syncInterval: number; // 分钟
  autoSync: boolean;
  conflictResolution: 'local' | 'remote' | 'latest';
  encryptData: boolean;
  customUrl?: string;
  // Supabase 特定配置
  supabase?: {
    url: string;
    anonKey?: string;
  };
}

// 同步元数据
export interface SyncMeta {
  id: string;
  entityType: 'bookmark' | 'folder' | 'tag' | 'settings';
  entityId: string;
  version: number;
  syncedAt: number;
  status: SyncStatus;
  direction?: SyncDirection;
  hash?: string;
  deletedAt?: number | null;
}

// 书签同步数据（用于云端）
export interface BookmarkSyncData {
  id: string;
  url: string;
  title: string;
  description?: string;
  folderId?: string;
  tags: string[];
  favicon?: string;
  createdAt: number;
  updatedAt: number;
  lastVisited?: number;
  visitCount: number;
  isFavorite: boolean;
  isArchived: boolean;
  status: 'active' | 'broken' | 'pending';
  notes?: string;
  meta?: {
    author?: string;
    publishDate?: string;
    readingTime?: string;
    language?: string;
    contentType?: string;
  };
  // 同步特定字段
  syncMeta: {
    version: number;
    hash: string;
    deviceId?: string;
  };
}

// 文件夹同步数据
export interface FolderSyncData {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  parentId?: string;
  order: number;
  isSmartFolder: boolean;
  smartFilters?: any;
  createdAt: number;
  updatedAt: number;
  syncMeta: {
    version: number;
    hash: string;
    deviceId?: string;
  };
}

// 标签同步数据
export interface TagSyncData {
  id: string;
  name: string;
  color?: string;
  usageCount: number;
  createdAt: number;
  syncMeta: {
    version: number;
    hash: string;
    deviceId?: string;
  };
}

// 同步结果
export interface SyncResult {
  success: boolean;
  uploaded: number;
  downloaded: number;
  conflicts: number;
  errors: string[];
  duration: number; // 毫秒
  timestamp: number;
}

// 同步冲突
export interface SyncConflict {
  id: string;
  entityType: 'bookmark' | 'folder' | 'tag';
  localData: any;
  remoteData: any;
  conflictReason: string;
  resolved?: boolean;
  resolution?: 'local' | 'remote' | 'merge';
}

// 设备信息
export interface DeviceInfo {
  id: string;
  name: string;
  type: 'chrome' | 'firefox' | 'edge' | 'safari' | 'other';
  os: string;
  lastSeenAt: number;
  isCurrent: boolean;
}

// 用户会话
export interface UserSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  userId?: string;
  userEmail?: string;
}

// ========== 文件夹浏览器同步类型 ==========

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

// 文件夹同步结果
export interface FolderSyncResult {
  success: boolean;
  dbFolderId?: string;
  browserFolderId?: string;
  action: 'created' | 'updated' | 'deleted' | 'skipped';
  error?: string;
}

// 批量文件夹同步结果
export interface BatchFolderSyncResult {
  success: boolean;
  total: number;
  synced: number;
  skipped: number;
  errors: FolderSyncError[];
  conflicts: FolderSyncConflict[];
  duration: number;
}

// 文件夹同步错误
export interface FolderSyncError {
  folderId: string;
  folderName: string;
  error: string;
  timestamp: number;
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

// 浏览器文件夹信息
export interface BrowserFolderInfo {
  id: string;
  title: string;
  parentId?: string;
  index?: number;
  dateAdded?: number;
  path: string;  // 完整路径
}

// 文件夹同步设置
export interface FolderSyncSettings {
  autoSyncToBrowser: boolean;        // 自动同步到浏览器
  watchBrowserChanges: boolean;      // 监听浏览器变化并同步到数据库
  preserveBrowserFolders: boolean;   // 同步时保留浏览器原有文件夹
  conflictStrategy: 'ask' | 'prefer_db' | 'prefer_browser' | 'keep_both';
  excludedBrowserFolders: string[];  // 排除的浏览器文件夹 ID
}

// 默认文件夹同步设置
export const DEFAULT_FOLDER_SYNC_SETTINGS: FolderSyncSettings = {
  autoSyncToBrowser: true,
  watchBrowserChanges: true,
  preserveBrowserFolders: true,
  conflictStrategy: 'ask',
  excludedBrowserFolders: [],
};
