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
