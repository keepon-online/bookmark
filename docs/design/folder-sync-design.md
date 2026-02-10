# 文件夹双向同步设计文档

> 方案一：实时双向同步

## 1. 概述

### 1.1 目标
实现数据库（IndexedDB）文件夹与浏览器书签栏文件夹的实时双向同步。

### 1.2 核心原则
- **实时性**：操作即时生效
- **一致性**：两端数据保持同步
- **可靠性**：处理冲突和错误情况
- **可追溯**：记录同步历史

## 2. 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户界面层                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ FolderTree  │  │ SyncStatus  │  │ SyncSettings            │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        服务层                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              FolderSyncService (新增)                    │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │    │
│  │  │ SyncEngine  │ │ Conflict    │ │ EventListener   │   │    │
│  │  │             │ │ Resolver    │ │                 │   │    │
│  │  └─────────────┘ └─────────────┘ └─────────────────┘   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌─────────────┐      ┌─────────────┐                           │
│  │FolderService│◄────►│BrowserSync  │                           │
│  │  (修改)     │      │Service(修改)│                           │
│  └─────────────┘      └─────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        数据层                                    │
│  ┌─────────────────────┐      ┌─────────────────────────────┐   │
│  │     IndexedDB       │      │   Chrome Bookmarks API      │   │
│  │  ┌───────────────┐  │      │  ┌───────────────────────┐  │   │
│  │  │ folders       │  │◄────►│  │ chrome.bookmarks      │  │   │
│  │  ├───────────────┤  │      │  │ (文件夹节点)          │  │   │
│  │  │ folderMappings│  │      │  └───────────────────────┘  │   │
│  │  │ (新增)        │  │      │                             │   │
│  │  └───────────────┘  │      │                             │   │
│  └─────────────────────┘      └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## 3. 数据库设计

### 3.1 新增表：folderMappings

```typescript
// 文件夹映射记录
interface FolderMapping {
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
```

### 3.2 数据库版本升级

```typescript
// database.ts 新增版本
this.version(5).stores({
  bookmarks: 'id, url, title, folderId, createdAt, isFavorite, status, isArchived, aiGenerated, [folderId+createdAt]',
  folders: 'id, name, parentId, order, browserFolderId, [parentId+order]',
  tags: 'id, &name, usageCount',
  bookmarkTags: '[bookmarkId+tagId], bookmarkId, tagId',
  linkChecks: 'id, bookmarkId, checkedAt',
  syncMeta: 'id, [entityType+entityId], syncStatus',
  organizeHistory: 'id, timestamp',
  statsCache: 'id, type, createdAt, expiresAt',
  bookmarkGroups: 'id, name, createdAt',
  duplicateRecords: 'id, url, detectedAt, resolved',
  embeddings: 'id, bookmarkId, model, createdAt',
  // 新增
  folderMappings: 'id, dbFolderId, browserFolderId, syncStatus, [dbFolderId], [browserFolderId]',
});
```

### 3.3 Folder 类型扩展

```typescript
// types/folder.ts 扩展
interface Folder {
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
  // 新增字段
  browserFolderId?: string;      // 关联的浏览器文件夹 ID
  syncStatus?: 'synced' | 'pending' | 'conflict' | 'not_synced';
  lastSyncedAt?: number;         // 最后同步时间
}
```

## 4. 核心服务设计

### 4.1 FolderSyncService 接口

```typescript
interface FolderSyncService {
  // ========== 同步操作 ==========

  /** 将单个数据库文件夹同步到浏览器 */
  syncFolderToBrowser(dbFolderId: string): Promise<SyncResult>;

  /** 将单个浏览器文件夹同步到数据库 */
  syncFolderFromBrowser(browserFolderId: string): Promise<SyncResult>;

  /** 全量同步：数据库 → 浏览器 */
  syncAllToBrowser(): Promise<BatchSyncResult>;

  /** 全量同步：浏览器 → 数据库 */
  syncAllFromBrowser(): Promise<BatchSyncResult>;

  /** 双向同步（智能合并） */
  syncBidirectional(): Promise<BatchSyncResult>;

  // ========== 映射管理 ==========

  /** 获取数据库文件夹对应的浏览器文件夹 ID */
  getBrowserFolderId(dbFolderId: string): Promise<string | undefined>;

  /** 获取浏览器文件夹对应的数据库文件夹 ID */
  getDbFolderId(browserFolderId: string): Promise<string | undefined>;

  /** 创建映射关系 */
  createMapping(dbFolderId: string, browserFolderId: string): Promise<FolderMapping>;

  /** 删除映射关系 */
  removeMapping(mappingId: string): Promise<void>;

  // ========== 事件监听 ==========

  /** 开始监听浏览器书签变化 */
  startWatching(): void;

  /** 停止监听 */
  stopWatching(): void;

  /** 是否正在监听 */
  isWatching(): boolean;

  // ========== 冲突处理 ==========

  /** 获取所有冲突 */
  getConflicts(): Promise<SyncConflict[]>;

  /** 解决冲突 */
  resolveConflict(conflictId: string, resolution: ConflictResolution): Promise<void>;
}
```

### 4.2 类型定义

```typescript
// types/sync.ts 扩展

/** 同步结果 */
interface SyncResult {
  success: boolean;
  dbFolderId?: string;
  browserFolderId?: string;
  action: 'created' | 'updated' | 'deleted' | 'skipped';
  error?: string;
}

/** 批量同步结果 */
interface BatchSyncResult {
  success: boolean;
  total: number;
  synced: number;
  skipped: number;
  errors: SyncError[];
  conflicts: SyncConflict[];
  duration: number;
}

/** 同步冲突 */
interface SyncConflict {
  id: string;
  type: 'name_mismatch' | 'parent_mismatch' | 'deleted_on_one_side' | 'both_modified';
  dbFolder?: Folder;
  browserFolder?: BrowserFolderInfo;
  detectedAt: number;
  suggestedResolution: ConflictResolution;
}

/** 冲突解决方案 */
type ConflictResolution =
  | { action: 'use_db'; }           // 使用数据库版本
  | { action: 'use_browser'; }      // 使用浏览器版本
  | { action: 'merge'; mergeStrategy: 'rename' | 'keep_both'; }
  | { action: 'delete_both'; }      // 两边都删除
  | { action: 'skip'; };            // 跳过

/** 浏览器文件夹信息 */
interface BrowserFolderInfo {
  id: string;
  title: string;
  parentId?: string;
  index?: number;
  dateAdded?: number;
  path: string;  // 完整路径
}
```

## 5. 同步流程设计

### 5.1 创建文件夹同步流程

```
用户在应用中创建文件夹
         │
         ▼
┌─────────────────────────┐
│ folderService.create()  │
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│ 写入 IndexedDB          │
│ folders 表              │
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│ 检查同步设置            │
│ syncSettings.autoSync   │
└─────────────────────────┘
         │
    autoSync?
    ┌────┴────┐
   Yes       No
    │         │
    ▼         ▼
┌─────────┐  完成
│ 获取父  │
│ 文件夹  │
│ 浏览器ID│
└─────────┘
    │
    ▼
┌─────────────────────────┐
│ chrome.bookmarks.create │
│ {parentId, title}       │
└─────────────────────────┘
    │
    ▼
┌─────────────────────────┐
│ 保存映射关系            │
│ folderMappings 表       │
└─────────────────────────┘
    │
    ▼
┌─────────────────────────┐
│ 更新 folder.browserFolderId │
│ 和 syncStatus           │
└─────────────────────────┘
    │
    ▼
   完成
```

### 5.2 浏览器文件夹变化监听流程

```
chrome.bookmarks.onCreated
         │
         ▼
┌─────────────────────────┐
│ 检查是否为文件夹        │
│ (!node.url)             │
└─────────────────────────┘
         │
    是文件夹?
    ┌────┴────┐
   Yes       No
    │         │
    ▼         ▼
┌─────────┐  忽略
│ 检查是否│
│ 已有映射│
└─────────┘
    │
  有映射?
  ┌──┴──┐
 Yes   No
  │     │
  ▼     ▼
忽略  ┌─────────────────┐
      │ 检查同步设置    │
      │ syncFromBrowser │
      └─────────────────┘
            │
       启用同步?
       ┌───┴───┐
      Yes     No
       │       │
       ▼       ▼
┌───────────┐ 忽略
│ 创建数据库│
│ 文件夹    │
└───────────┘
       │
       ▼
┌───────────┐
│ 保存映射  │
└───────────┘
```

### 5.3 冲突检测与解决

```
同步操作开始
      │
      ▼
┌─────────────────────────┐
│ 获取双方最新状态        │
│ - DB folder             │
│ - Browser folder        │
└─────────────────────────┘
      │
      ▼
┌─────────────────────────┐
│ 比较版本/时间戳         │
└─────────────────────────┘
      │
   有差异?
   ┌──┴──┐
  No    Yes
   │     │
   ▼     ▼
 完成  ┌─────────────────┐
       │ 判断冲突类型    │
       └─────────────────┘
             │
    ┌────────┼────────┬────────┐
    ▼        ▼        ▼        ▼
 名称不同  父级不同  单边删除  双边修改
    │        │        │        │
    ▼        ▼        ▼        ▼
┌─────────────────────────────────┐
│ 根据策略自动解决或标记为冲突   │
└─────────────────────────────────┘
```

## 6. 实现代码框架

### 6.1 FolderSyncService 实现

```typescript
// services/folderSyncService.ts

import { db } from '@/lib/database';
import { createLogger } from '@/lib/logger';
import { generateId, now } from '@/lib/utils';
import type { Folder, FolderMapping, SyncResult, BatchSyncResult } from '@/types';

const logger = createLogger('FolderSync');

export class FolderSyncService {
  private watching = false;
  private listeners: {
    created?: (id: string, bookmark: chrome.bookmarks.BookmarkTreeNode) => void;
    removed?: (id: string, removeInfo: chrome.bookmarks.BookmarkRemoveInfo) => void;
    moved?: (id: string, moveInfo: chrome.bookmarks.BookmarkMoveInfo) => void;
    changed?: (id: string, changeInfo: chrome.bookmarks.BookmarkChangeInfo) => void;
  } = {};

  // ========== 核心同步方法 ==========

  /**
   * 将数据库文件夹同步到浏览器
   */
  async syncFolderToBrowser(dbFolderId: string): Promise<SyncResult> {
    try {
      const folder = await db.folders.get(dbFolderId);
      if (!folder) {
        return { success: false, action: 'skipped', error: 'Folder not found' };
      }

      // 检查是否已有映射
      const existingMapping = await this.getMappingByDbId(dbFolderId);
      if (existingMapping) {
        // 更新现有浏览器文件夹
        return this.updateBrowserFolder(folder, existingMapping);
      }

      // 创建新的浏览器文件夹
      return this.createBrowserFolder(folder);
    } catch (error) {
      logger.error('syncFolderToBrowser failed', error);
      return { success: false, action: 'skipped', error: (error as Error).message };
    }
  }

  /**
   * 创建浏览器文件夹
   */
  private async createBrowserFolder(folder: Folder): Promise<SyncResult> {
    // 获取父文件夹的浏览器 ID
    const parentBrowserId = folder.parentId
      ? await this.getBrowserFolderId(folder.parentId)
      : '1'; // 书签栏根目录

    if (!parentBrowserId && folder.parentId) {
      // 父文件夹未同步，先同步父文件夹
      await this.syncFolderToBrowser(folder.parentId);
    }

    const finalParentId = folder.parentId
      ? await this.getBrowserFolderId(folder.parentId)
      : '1';

    // 在浏览器创建文件夹
    const browserFolder = await chrome.bookmarks.create({
      parentId: finalParentId || '1',
      title: folder.name,
    });

    // 保存映射
    await this.createMapping(folder.id, browserFolder.id, browserFolder.parentId);

    // 更新数据库文件夹
    await db.folders.update(folder.id, {
      browserFolderId: browserFolder.id,
      syncStatus: 'synced',
      lastSyncedAt: now(),
    });

    logger.info(`Created browser folder: ${folder.name} -> ${browserFolder.id}`);

    return {
      success: true,
      dbFolderId: folder.id,
      browserFolderId: browserFolder.id,
      action: 'created',
    };
  }

  // ... 更多方法见下文
}

export const folderSyncService = new FolderSyncService();
```

### 6.2 事件监听实现

```typescript
// folderSyncService.ts 续

  /**
   * 开始监听浏览器书签变化
   */
  startWatching(): void {
    if (this.watching) return;

    this.listeners.created = this.handleBrowserCreated.bind(this);
    this.listeners.removed = this.handleBrowserRemoved.bind(this);
    this.listeners.moved = this.handleBrowserMoved.bind(this);
    this.listeners.changed = this.handleBrowserChanged.bind(this);

    chrome.bookmarks.onCreated.addListener(this.listeners.created);
    chrome.bookmarks.onRemoved.addListener(this.listeners.removed);
    chrome.bookmarks.onMoved.addListener(this.listeners.moved);
    chrome.bookmarks.onChanged.addListener(this.listeners.changed);

    this.watching = true;
    logger.info('Started watching browser bookmarks');
  }

  /**
   * 停止监听
   */
  stopWatching(): void {
    if (!this.watching) return;

    if (this.listeners.created) {
      chrome.bookmarks.onCreated.removeListener(this.listeners.created);
    }
    if (this.listeners.removed) {
      chrome.bookmarks.onRemoved.removeListener(this.listeners.removed);
    }
    if (this.listeners.moved) {
      chrome.bookmarks.onMoved.removeListener(this.listeners.moved);
    }
    if (this.listeners.changed) {
      chrome.bookmarks.onChanged.removeListener(this.listeners.changed);
    }

    this.watching = false;
    logger.info('Stopped watching browser bookmarks');
  }

  /**
   * 处理浏览器文件夹创建
   */
  private async handleBrowserCreated(
    id: string,
    bookmark: chrome.bookmarks.BookmarkTreeNode
  ): Promise<void> {
    // 忽略书签（只处理文件夹）
    if (bookmark.url) return;

    // 检查是否已有映射（避免循环同步）
    const existing = await this.getMappingByBrowserId(id);
    if (existing) return;

    logger.debug(`Browser folder created: ${bookmark.title} (${id})`);

    // 同步到数据库
    await this.syncFolderFromBrowser(id);
  }

  /**
   * 处理浏览器文件夹删除
   */
  private async handleBrowserRemoved(
    id: string,
    removeInfo: chrome.bookmarks.BookmarkRemoveInfo
  ): Promise<void> {
    const mapping = await this.getMappingByBrowserId(id);
    if (!mapping) return;

    logger.debug(`Browser folder removed: ${id}`);

    // 标记数据库文件夹为待删除或冲突
    await db.folders.update(mapping.dbFolderId, {
      syncStatus: 'conflict',
    });

    // 记录冲突
    await this.recordConflict({
      type: 'deleted_on_one_side',
      dbFolderId: mapping.dbFolderId,
      browserFolderId: id,
      side: 'browser',
    });
  }
```

## 7. folderService 修改

```typescript
// services/folderService.ts 修改

import { folderSyncService } from './folderSyncService';
import { settingsService } from './settingsService';

export class FolderService {
  /**
   * 创建文件夹（修改版）
   */
  async create(dto: CreateFolderDTO & { skipBrowserSync?: boolean }): Promise<Folder> {
    // ... 现有验证逻辑 ...

    const folder: Folder = {
      id: generateId(),
      name: dto.name,
      icon: dto.icon || '📁',
      color: dto.color,
      parentId: dto.parentId,
      order: maxOrder + 1,
      isSmartFolder: false,
      createdAt: now(),
      updatedAt: now(),
      // 新增字段
      syncStatus: 'pending',
    };

    await db.folders.add(folder);

    // 新增：自动同步到浏览器
    if (!dto.skipBrowserSync) {
      const settings = await settingsService.get();
      if (settings.folderSync?.autoSyncToBrowser) {
        try {
          const result = await folderSyncService.syncFolderToBrowser(folder.id);
          if (result.success) {
            folder.browserFolderId = result.browserFolderId;
            folder.syncStatus = 'synced';
          }
        } catch (error) {
          logger.warn('Auto sync to browser failed', error);
          // 不影响文件夹创建
        }
      }
    }

    return folder;
  }

  /**
   * 更新文件夹（修改版）
   */
  async update(id: string, dto: UpdateFolderDTO): Promise<Folder> {
    // ... 现有逻辑 ...

    await db.folders.update(id, {
      ...dto,
      updatedAt: now(),
      syncStatus: 'pending', // 标记需要同步
    });

    // 新增：同步更新到浏览器
    const settings = await settingsService.get();
    if (settings.folderSync?.autoSyncToBrowser) {
      await folderSyncService.syncFolderToBrowser(id);
    }

    const updated = await db.folders.get(id);
    return updated!;
  }

  /**
   * 删除文件夹（修改版）
   */
  async delete(id: string, moveBookmarksTo?: string): Promise<void> {
    const folder = await db.folders.get(id);
    if (!folder) {
      throw new Error('Folder not found');
    }

    // 新增：同步删除浏览器文件夹
    if (folder.browserFolderId) {
      const settings = await settingsService.get();
      if (settings.folderSync?.autoSyncToBrowser) {
        try {
          await chrome.bookmarks.remove(folder.browserFolderId);
          // 删除映射
          await folderSyncService.removeMappingByDbId(id);
        } catch (error) {
          logger.warn('Failed to delete browser folder', error);
        }
      }
    }

    // ... 现有删除逻辑 ...
  }
}
```

## 8. 设置配置

### 8.1 新增设置类型

```typescript
// types/settings.ts 扩展

interface FolderSyncSettings {
  /** 自动同步到浏览器 */
  autoSyncToBrowser: boolean;
  /** 监听浏览器变化并同步到数据库 */
  watchBrowserChanges: boolean;
  /** 同步时保留浏览器原有文件夹 */
  preserveBrowserFolders: boolean;
  /** 冲突解决策略 */
  conflictStrategy: 'ask' | 'prefer_db' | 'prefer_browser' | 'keep_both';
  /** 排除的浏览器文件夹 ID */
  excludedBrowserFolders: string[];
}

interface Settings {
  // ... 现有设置
  folderSync?: FolderSyncSettings;
}
```

### 8.2 默认设置

```typescript
const defaultFolderSyncSettings: FolderSyncSettings = {
  autoSyncToBrowser: true,
  watchBrowserChanges: true,
  preserveBrowserFolders: true,
  conflictStrategy: 'ask',
  excludedBrowserFolders: [],
};
```

## 9. UI 组件设计

### 9.1 同步设置面板

```tsx
// components/settings/FolderSyncSettings.tsx

export function FolderSyncSettings() {
  const [settings, setSettings] = useState<FolderSyncSettings>();
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>();

  return (
    <div className="space-y-4">
      <h3>文件夹同步</h3>

      {/* 自动同步开关 */}
      <div className="flex items-center justify-between">
        <label>自动同步到浏览器</label>
        <Switch
          checked={settings?.autoSyncToBrowser}
          onChange={(v) => updateSetting('autoSyncToBrowser', v)}
        />
      </div>

      {/* 监听浏览器变化 */}
      <div className="flex items-center justify-between">
        <label>监听浏览器文件夹变化</label>
        <Switch
          checked={settings?.watchBrowserChanges}
          onChange={(v) => updateSetting('watchBrowserChanges', v)}
        />
      </div>

      {/* 冲突策略 */}
      <div>
        <label>冲突解决策略</label>
        <Select value={settings?.conflictStrategy}>
          <option value="ask">每次询问</option>
          <option value="prefer_db">优先使用数据库</option>
          <option value="prefer_browser">优先使用浏览器</option>
          <option value="keep_both">保留两者</option>
        </Select>
      </div>

      {/* 手动同步按钮 */}
      <div className="flex gap-2">
        <Button onClick={syncToBrowser} disabled={syncStatus === 'syncing'}>
          同步到浏览器
        </Button>
        <Button onClick={syncFromBrowser} disabled={syncStatus === 'syncing'}>
          从浏览器导入
        </Button>
      </div>
    </div>
  );
}
```

## 10. 实现计划

### Phase 1: 基础设施（预计 2-3 小时）

| 任务 | 文件 | 说明 |
|------|------|------|
| 1.1 | `types/folder.ts` | 扩展 Folder 类型，添加同步字段 |
| 1.2 | `types/sync.ts` | 新增同步相关类型定义 |
| 1.3 | `lib/database.ts` | 升级数据库版本，添加 folderMappings 表 |
| 1.4 | `types/settings.ts` | 添加 FolderSyncSettings 类型 |

### Phase 2: 核心服务（预计 4-5 小时）

| 任务 | 文件 | 说明 |
|------|------|------|
| 2.1 | `services/folderSyncService.ts` | 实现 FolderSyncService 核心类 |
| 2.2 | `services/folderService.ts` | 修改现有方法，集成同步逻辑 |
| 2.3 | `services/index.ts` | 导出新服务 |

### Phase 3: 事件监听（预计 2-3 小时）

| 任务 | 文件 | 说明 |
|------|------|------|
| 3.1 | `folderSyncService.ts` | 实现 chrome.bookmarks 事件监听 |
| 3.2 | `folderSyncService.ts` | 实现冲突检测逻辑 |
| 3.3 | `folderSyncService.ts` | 实现冲突解决逻辑 |

### Phase 4: UI 集成（预计 2-3 小时）

| 任务 | 文件 | 说明 |
|------|------|------|
| 4.1 | `components/settings/FolderSyncSettings.tsx` | 新增同步设置面板 |
| 4.2 | `entrypoints/settings/` | 集成到设置页面 |
| 4.3 | `components/ui/SyncStatusIndicator.tsx` | 同步状态指示器 |

### Phase 5: 测试与优化（预计 2 小时）

| 任务 | 说明 |
|------|------|
| 5.1 | 单元测试 |
| 5.2 | 集成测试 |
| 5.3 | 边界情况处理 |

## 11. 风险与注意事项

### 11.1 潜在风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 循环同步 | 无限循环导致性能问题 | 使用标记位防止重复触发 |
| 数据丢失 | 误删文件夹 | 删除前确认，支持撤销 |
| 权限问题 | 无法访问浏览器书签 | 检查权限，优雅降级 |
| 性能问题 | 大量文件夹同步卡顿 | 批量操作，异步处理 |

### 11.2 特殊情况处理

1. **智能文件夹**：不同步到浏览器（浏览器不支持）
2. **系统文件夹**：书签栏、其他书签等不可删除
3. **嵌套层级**：浏览器书签栏层级限制
4. **名称冲突**：同级文件夹同名处理

## 12. 验收标准

- [ ] 在应用中创建文件夹后，浏览器书签栏自动出现对应文件夹
- [ ] 在浏览器创建文件夹后，应用数据库自动同步
- [ ] 重命名文件夹双向同步
- [ ] 移动文件夹双向同步
- [ ] 删除文件夹双向同步（带确认）
- [ ] 冲突检测和解决机制正常工作
- [ ] 设置页面可配置同步选项
- [ ] 同步状态可视化显示

---

**下一步**：确认设计后，使用 `/sc:implement` 开始实现。
