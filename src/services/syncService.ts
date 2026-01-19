// 云端同步服务 - 基于 Supabase

import type {
  SyncConfig,
  SyncResult,
  SyncConflict,
  BookmarkSyncData,
  FolderSyncData,
  TagSyncData,
  DeviceInfo,
  UserSession,
} from '@/types';
import { db } from '@/lib/database';
import { bookmarkService, folderService, tagService } from '@/services';
import type { Bookmark, Folder, Tag } from '@/types';

// 简单的 UUID 生成
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 进度回调类型
export interface SyncProgress {
  stage: 'connecting' | 'uploading' | 'downloading' | 'merging' | 'complete';
  current: number;
  total: number;
  message: string;
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

// 设备信息存储
const DEVICE_ID_KEY = 'smart_bookmark_device_id';
const DEVICE_NAME_KEY = 'smart_bookmark_device_name';

export class SyncService {
  private config: SyncConfig | null = null;
  private supabase: any = null;
  private session: UserSession | null = null;
  private isSyncing = false;
  private deviceId: string;

  constructor() {
    this.deviceId = this.getOrCreateDeviceId();
  }

  // 获取或创建设备 ID
  private getOrCreateDeviceId(): string {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = generateUUID();
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }

    // 设置设备名称
    if (!localStorage.getItem(DEVICE_NAME_KEY)) {
      const browser = this.detectBrowser();
      const os = this.detectOS();
      localStorage.setItem(DEVICE_NAME_KEY, `${browser} on ${os}`);
    }

    return deviceId;
  }

  // 检测浏览器类型
  private detectBrowser(): string {
    const agent = navigator.userAgent;
    if (agent.includes('Chrome')) return 'Chrome';
    if (agent.includes('Firefox')) return 'Firefox';
    if (agent.includes('Edge')) return 'Edge';
    if (agent.includes('Safari')) return 'Safari';
    return 'Unknown';
  }

  // 检测操作系统
  private detectOS(): string {
    const agent = navigator.userAgent;
    if (agent.includes('Windows')) return 'Windows';
    if (agent.includes('Mac')) return 'macOS';
    if (agent.includes('Linux')) return 'Linux';
    return 'Unknown';
  }

  // 获取设备信息
  getDeviceInfo(): DeviceInfo {
    return {
      id: this.deviceId,
      name: localStorage.getItem(DEVICE_NAME_KEY) || 'Unknown Device',
      type: this.detectBrowser().toLowerCase() as any,
      os: this.detectOS(),
      lastSeenAt: Date.now(),
      isCurrent: true,
    };
  }

  // 初始化 Supabase 客户端
  async initialize(config: SyncConfig): Promise<void> {
    if (config.provider === 'supabase') {
      // 动态导入 Supabase（仅在需要时加载）
      if (!this.supabase) {
        try {
          const { createClient } = await import('@supabase/supabase-js');
          this.supabase = createClient(
            config.supabase!.url,
            config.supabase!.anonKey || '',
            {
              auth: {
                persistSession: true,
                autoRefreshToken: true,
              },
            }
          );
        } catch (error) {
          throw new Error('Failed to initialize Supabase client. Make sure @supabase/supabase-js is installed.');
        }
      }
    }

    this.config = config;

    // 恢复会话
    if (this.supabase && config.provider === 'supabase') {
      const { data } = await this.supabase.auth.getSession();
      if (data.session) {
        this.session = {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresAt: data.session.expires_at ? data.session.expires_at * 1000 : 0,
          userId: data.session.user.id,
          userEmail: data.session.user.email,
        };
      }
    }
  }

  // 用户登录
  async login(email: string, password: string): Promise<UserSession> {
    if (!this.supabase) {
      throw new Error('Sync service not initialized');
    }

    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new Error(`Login failed: ${error.message}`);
    }

    this.session = {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at ? data.session.expires_at * 1000 : 0,
      userId: data.user.id,
      userEmail: data.user.email,
    };

    return this.session;
  }

  // 用户注册
  async register(email: string, password: string): Promise<UserSession> {
    if (!this.supabase) {
      throw new Error('Sync service not initialized');
    }

    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      throw new Error(`Registration failed: ${error.message}`);
    }

    this.session = {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at ? data.session.expires_at * 1000 : 0,
      userId: data.user.id,
      userEmail: data.user.email,
    };

    return this.session;
  }

  // 用户登出
  async logout(): Promise<void> {
    if (this.supabase) {
      await this.supabase.auth.signOut();
    }
    this.session = null;
  }

  // 获取当前会话
  getSession(): UserSession | null {
    return this.session;
  }

  // 检查是否已登录
  isAuthenticated(): boolean {
    return this.session !== null && this.session.expiresAt > Date.now();
  }

  // 生成数据哈希（简单实现）
  private generateHash(data: any): string {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  // 转换书签到同步格式
  private bookmarkToSyncData(bookmark: Bookmark): BookmarkSyncData {
    return {
      id: bookmark.id,
      url: bookmark.url,
      title: bookmark.title,
      description: bookmark.description,
      folderId: bookmark.folderId,
      tags: bookmark.tags,
      favicon: bookmark.favicon,
      createdAt: bookmark.createdAt,
      updatedAt: bookmark.updatedAt,
      lastVisited: bookmark.lastVisited,
      visitCount: bookmark.visitCount,
      isFavorite: bookmark.isFavorite,
      isArchived: bookmark.isArchived,
      status: bookmark.status,
      notes: bookmark.notes,
      meta: bookmark.meta,
      syncMeta: {
        version: 1,
        hash: this.generateHash(bookmark),
        deviceId: this.deviceId,
      },
    };
  }

  // 从同步格式转换书签
  private syncDataToBookmark(data: BookmarkSyncData): Bookmark {
    return {
      id: data.id,
      url: data.url,
      title: data.title,
      description: data.description,
      folderId: data.folderId,
      tags: data.tags,
      favicon: data.favicon,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      lastVisited: data.lastVisited,
      visitCount: data.visitCount,
      isFavorite: data.isFavorite,
      isArchived: data.isArchived,
      status: data.status,
      notes: data.notes,
      meta: data.meta ? {
        ...data.meta,
        contentType: data.meta.contentType as any,
      } : undefined,
      aiGenerated: false, // 云端同步不包含此字段
    };
  }

  // 转换文件夹到同步格式
  private folderToSyncData(folder: Folder): FolderSyncData {
    return {
      id: folder.id,
      name: folder.name,
      icon: folder.icon,
      color: folder.color,
      parentId: folder.parentId,
      order: folder.order,
      isSmartFolder: folder.isSmartFolder,
      smartFilters: folder.smartFilters,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
      syncMeta: {
        version: 1,
        hash: this.generateHash(folder),
        deviceId: this.deviceId,
      },
    };
  }

  // 从同步格式转换文件夹
  private syncDataToFolder(data: FolderSyncData): Folder {
    return {
      id: data.id,
      name: data.name,
      icon: data.icon,
      color: data.color,
      parentId: data.parentId,
      order: data.order,
      isSmartFolder: data.isSmartFolder,
      smartFilters: data.smartFilters,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }

  // 转换标签到同步格式
  private tagToSyncData(tag: Tag): TagSyncData {
    return {
      id: tag.id,
      name: tag.name,
      color: tag.color,
      usageCount: tag.usageCount,
      createdAt: tag.createdAt,
      syncMeta: {
        version: 1,
        hash: this.generateHash(tag),
        deviceId: this.deviceId,
      },
    };
  }

  // 从同步格式转换标签
  private syncDataToTag(data: TagSyncData): Tag {
    return {
      id: data.id,
      name: data.name,
      color: data.color,
      usageCount: data.usageCount,
      createdAt: data.createdAt,
    };
  }

  // 上传书签到云端
  private async uploadBookmarks(
    bookmarks: Bookmark[],
    onProgress?: SyncProgressCallback
  ): Promise<void> {
    if (!this.supabase || !this.session) {
      throw new Error('Not authenticated');
    }

    const total = bookmarks.length;
    for (let i = 0; i < bookmarks.length; i++) {
      const bookmark = bookmarks[i];
      const syncData = this.bookmarkToSyncData(bookmark);

      // 使用 upsert：如果存在则更新，不存在则插入
      const { error } = await this.supabase
        .from('bookmarks')
        .upsert(syncData, { onConflict: 'id' });

      if (error) {
        console.error('[Sync] Failed to upload bookmark:', bookmark.id, error);
      }

      // 更新本地同步元数据
      await db.syncMeta.put({
        id: `bookmark-${bookmark.id}`,
        entityType: 'bookmark',
        entityId: bookmark.id,
        version: syncData.syncMeta.version,
        lastSyncedAt: Date.now(),
        syncStatus: 'synced',
      });

      onProgress?.({
        stage: 'uploading',
        current: i + 1,
        total,
        message: `Uploading bookmarks (${i + 1}/${total})`,
      });
    }
  }

  // 从云端下载书签
  private async downloadBookmarks(
    onProgress?: SyncProgressCallback
  ): Promise<Bookmark[]> {
    if (!this.supabase || !this.session) {
      throw new Error('Not authenticated');
    }

    const { data, error } = await this.supabase
      .from('bookmarks')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to download bookmarks: ${error.message}`);
    }

    const bookmarks: Bookmark[] = [];
    const total = data.length;

    for (let i = 0; i < data.length; i++) {
      const syncData = data[i] as any;
      bookmarks.push(this.syncDataToBookmark(syncData));

      // 更新本地同步元数据
      await db.syncMeta.put({
        id: `bookmark-${syncData.id}`,
        entityType: 'bookmark',
        entityId: syncData.id,
        version: syncData.sync_meta.version,
        lastSyncedAt: Date.now(),
        syncStatus: 'synced',
      });

      onProgress?.({
        stage: 'downloading',
        current: i + 1,
        total,
        message: `Downloading bookmarks (${i + 1}/${total})`,
      });
    }

    return bookmarks;
  }

  // 检测冲突
  private async detectConflicts(
    localData: Bookmark[],
    remoteData: Bookmark[]
  ): Promise<SyncConflict[]> {
    const conflicts: SyncConflict[] = [];
    const localMap = new Map(localData.map(b => [b.id, b]));
    const remoteMap = new Map(remoteData.map(b => [b.id, b]));

    // 检查每个在两边都存在的书签
    for (const [id, localBookmark] of localMap) {
      const remoteBookmark = remoteMap.get(id);
      if (!remoteBookmark) continue;

      // 比较更新时间
      const localTime = Math.max(localBookmark.updatedAt, localBookmark.createdAt);
      const remoteTime = Math.max(remoteBookmark.updatedAt, remoteBookmark.createdAt);

      // 如果两边都在"最近同步"之后修改，则冲突
      const localSyncMeta = await db.syncMeta.get(`bookmark-${id}`);
      const lastSyncTime = localSyncMeta?.lastSyncedAt || 0;

      if (localTime > lastSyncTime && remoteTime > lastSyncTime) {
        // 进一步比较内容哈希
        const localHash = this.generateHash(localBookmark);
        const remoteHash = this.generateHash(remoteBookmark);

        if (localHash !== remoteHash) {
          conflicts.push({
            id,
            entityType: 'bookmark',
            localData: localBookmark,
            remoteData: remoteBookmark,
            conflictReason: 'Both modified since last sync',
          });
        }
      }
    }

    return conflicts;
  }

  // 解决冲突
  private async resolveConflict(
    conflict: SyncConflict,
    resolution: 'local' | 'remote' | 'latest'
  ): Promise<Bookmark> {
    if (resolution === 'local') {
      return conflict.localData as Bookmark;
    } else if (resolution === 'remote') {
      return conflict.remoteData as Bookmark;
    } else {
      // 使用最新修改时间
      const local = conflict.localData as Bookmark;
      const remote = conflict.remoteData as Bookmark;
      return local.updatedAt > remote.updatedAt ? local : remote;
    }
  }

  // 执行双向同步
  async sync(
    direction: 'upload' | 'download' | 'bidirectional' = 'bidirectional',
    onProgress?: SyncProgressCallback
  ): Promise<SyncResult> {
    if (this.isSyncing) {
      throw new Error('Sync already in progress');
    }

    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    this.isSyncing = true;

    const result: SyncResult = {
      success: false,
      uploaded: 0,
      downloaded: 0,
      conflicts: 0,
      errors: [],
      duration: 0,
      timestamp: Date.now(),
    };

    const startTime = Date.now();

    try {
      onProgress?.({
        stage: 'connecting',
        current: 0,
        total: 0,
        message: 'Connecting to sync server...',
      });

      // 获取本地数据
      const localBookmarks = await bookmarkService.getAll({ limit: 10000 });
      const localFolders = await folderService.getTree();
      const localTags = await tagService.getAll();

      if (direction === 'upload') {
        // 仅上传
        await this.uploadBookmarks(localBookmarks, onProgress);
        result.uploaded = localBookmarks.length;
      } else if (direction === 'download') {
        // 仅下载
        const remoteBookmarks = await this.downloadBookmarks(onProgress);
        result.downloaded = remoteBookmarks.length;

        // 合并到本地
        for (const bookmark of remoteBookmarks) {
          const existing = await db.bookmarks.get(bookmark.id);
          if (!existing) {
            await db.bookmarks.put(bookmark);
          }
        }
      } else {
        // 双向同步
        const remoteBookmarks = await this.downloadBookmarks(onProgress);
        result.downloaded = remoteBookmarks.length;

        // 检测冲突
        onProgress?.({
          stage: 'merging',
          current: 0,
          total: 0,
          message: 'Checking for conflicts...',
        });

        const conflicts = await this.detectConflicts(localBookmarks, remoteBookmarks);
        result.conflicts = conflicts.length;

        // 解决冲突
        for (const conflict of conflicts) {
          const resolution = this.config?.conflictResolution || 'latest';
          const resolved = await this.resolveConflict(conflict, resolution);
          await db.bookmarks.put(resolved);
        }

        // 上传本地独有的书签
        const localOnly = localBookmarks.filter(
          lb => !remoteBookmarks.find(rb => rb.id === lb.id)
        );
        await this.uploadBookmarks(localOnly, onProgress);
        result.uploaded = localOnly.length;

        // 合并远程书签到本地
        for (const remote of remoteBookmarks) {
          const local = localBookmarks.find(lb => lb.id === remote.id);
          if (!local) {
            await db.bookmarks.put(remote);
          } else if (conflicts.find(c => c.id === remote.id)) {
            // 已处理的冲突，跳过
            continue;
          } else if (remote.updatedAt > local.updatedAt) {
            // 远程更新，使用远程版本
            await db.bookmarks.put(remote);
          }
        }
      }

      result.success = true;
    } catch (error) {
      result.errors.push((error as Error).message);
      console.error('[Sync] Sync failed:', error);
    } finally {
      result.duration = Date.now() - startTime;
      this.isSyncing = false;

      onProgress?.({
        stage: 'complete',
        current: 0,
        total: 0,
        message: result.success ? 'Sync completed successfully' : 'Sync failed',
      });
    }

    return result;
  }

  // 获取同步状态
  async getSyncStatus(): Promise<{
    lastSyncTime: number;
    pendingCount: number;
    conflictCount: number;
  }> {
    const metas = await db.syncMeta.toArray();
    const pending = metas.filter(m => m.syncStatus === 'pending').length;
    const conflicts = metas.filter(m => m.syncStatus === 'conflict').length;
    const lastSync = metas.length > 0
      ? Math.max(...metas.map(m => m.lastSyncedAt))
      : 0;

    return {
      lastSyncTime: lastSync,
      pendingCount: pending,
      conflictCount: conflicts,
    };
  }

  // 清除同步数据（登出时调用）
  async clearSyncData(): Promise<void> {
    await db.syncMeta.clear();
  }
}

// 单例实例
export const syncService = new SyncService();
