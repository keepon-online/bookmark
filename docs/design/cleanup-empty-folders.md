# 清理空文件夹功能设计文档

## 1. 需求分析

### 1.1 业务背景

智能书签扩展在 AI 自动分类后，可能会创建大量空文件夹，原因包括：
- AI 分类建议了文件夹，但用户手动应用时未移动书签
- 删除书签后，原文件夹变空
- 文件夹创建后未使用
- 层级过深的分类结构导致中间层文件夹为空

### 1.2 功能目标

**主要目标：**
1. 自动检测并清理空文件夹
2. 提供灵活的清理策略（递归/非递归，保留根目录等）
3. 支持批量清理和交互式清理
4. 提供预览功能，避免误删
5. 记录清理历史，支持撤销

**用户体验目标：**
- 操作简单，一键清理
- 预览清晰，展示将被删除的文件夹
- 安全可靠，支持撤销和恢复
- 性能高效，快速处理大量文件夹

---

## 2. 系统设计

### 2.1 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                    UI Layer                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ FolderList  │  │ CleanupPanel │  │ PreviewModal │  │
│  │             │  │              │  │              │  │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                  │                  │          │
└─────────┼──────────────────┼──────────────────┼─────────┘
          │                  │                  │
┌─────────┼──────────────────┼──────────────────┼─────────┐
│         ▼                  ▼                  ▼          │
│              Business Logic Layer                     │
│  ┌──────────────────────────────────────────────┐     │
│  │         FolderService                         │     │
│  │  - delete()                                  │     │
│  │  - findEmptyFolders() ← NEW                  │     │
│  │  - deleteEmptyFolders() ← NEW                │     │
│  │  - previewEmptyFolders() ← NEW               │     │
│  └──────────────────────────────────────────────┘     │
│  ┌──────────────────────────────────────────────┐     │
│  │         OrganizerService                      │     │
│  │  - cleanup(options) ← EXTENDED               │     │
│  │  - generateSmartSuggestions() ← EXTENDED     │     │
│  └──────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────┘
          │
┌─────────┼─────────────────────────────────────────────┐
│         ▼                                              │
│              Data Access Layer                         │
│  ┌──────────────────────────────────────────────┐     │
│  │         IndexedDB (Dexie)                     │     │
│  │  - folders 表                                 │     │
│  │  - bookmarks 表                               │     │
│  │  - organizeHistory 表                         │     │
│  └──────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────┘
```

### 2.2 核心组件设计

#### 2.2.1 FolderService 扩展

**新增方法：**

```typescript
/**
 * 查找空文件夹
 */
interface FindEmptyFoldersOptions {
  recursive?: boolean;           // 是否递归检查子文件夹
  excludeRoot?: boolean;         // 是否排除根目录（parentId = null）
  minAge?: number;              // 最小存在时间（毫秒），防止误删新文件夹
  includeBookmarksCount?: boolean; // 是否返回每个文件夹的书签数量
}

interface EmptyFolderInfo {
  folder: Folder;
  bookmarksCount: number;
  childrenCount: number;        // 直接子文件夹数
  allDescendantsCount: number;  // 所有后代文件夹数
  isEmpty: boolean;             // 是否为空（无书签且无子文件夹）
  age: number;                  // 文件夹存在时间（毫秒）
}

/**
 * 预览清理结果
 */
interface CleanupPreviewResult {
  toDelete: EmptyFolderInfo[];          // 将被删除的文件夹
  toKeep: EmptyFolderInfo[];            // 将被保留的文件夹
  totalBookmarksAffected: number;       // 受影响的书签数（应为0）
  warnings: string[];                   // 警告信息
}

/**
 * 清理结果
 */
interface CleanupEmptyFoldersResult {
  deleted: number;                      // 删除的文件夹数
  kept: number;                         // 保留的文件夹数
  warnings: string[];                   // 警告信息
  duration: number;                     // 执行时间（毫秒）
}
```

**核心算法设计：**

```typescript
/**
 * 查找空文件夹（优化算法）
 */
async findEmptyFolders(
  options: FindEmptyFoldersOptions = {}
): Promise<EmptyFolderInfo[]> {
  const {
    recursive = true,
    excludeRoot = true,
    minAge = 0,
    includeBookmarksCount = true,
  } = options;

  // 1. 获取所有文件夹和书签（一次性查询）
  const [allFolders, allBookmarks] = await Promise.all([
    db.folders.toArray(),
    db.bookmarks.toArray(),
  ]);

  // 2. 构建文件夹树和统计信息
  const folderMap = new Map<string, Folder>();
  const folderBookmarksCount = new Map<string, number>();
  const folderChildren = new Map<string, Set<string>>();

  // 初始化统计
  allFolders.forEach(folder => {
    folderMap.set(folder.id, folder);
    folderBookmarksCount.set(folder.id, 0);
    folderChildren.set(folder.id, new Set());
  });

  // 统计书签分布
  allBookmarks.forEach(bookmark => {
    if (bookmark.folderId) {
      folderBookmarksCount.set(
        bookmark.folderId,
        (folderBookmarksCount.get(bookmark.folderId) || 0) + 1
      );
    }
  });

  // 构建父子关系
  allFolders.forEach(folder => {
    if (folder.parentId) {
      const children = folderChildren.get(folder.parentId);
      if (children) {
        children.add(folder.id);
      }
    }
  });

  // 3. 计算后代文件夹数（递归）
  const calculateDescendants = (folderId: string): number => {
    const children = folderChildren.get(folderId) || new Set();
    let count = children.size;
    children.forEach(childId => {
      count += calculateDescendants(childId);
    });
    return count;
  };

  // 4. 识别空文件夹
  const emptyFolders: EmptyFolderInfo[] = [];
  const now = Date.now();

  for (const folder of allFolders) {
    // 排除根目录
    if (excludeRoot && !folder.parentId) continue;

    const bookmarksCount = folderBookmarksCount.get(folder.id) || 0;
    const children = folderChildren.get(folder.id) || new Set();
    const directChildrenCount = children.size;
    const allDescendantsCount = recursive ? calculateDescendants(folder.id) : directChildrenCount;
    const age = now - folder.createdAt;

    // 判断是否为空
    const isEmpty = bookmarksCount === 0 && (recursive ? allDescendantsCount === 0 : true);

    // 应用最小存在时间过滤
    if (isEmpty && age < minAge) continue;

    emptyFolders.push({
      folder,
      bookmarksCount,
      childrenCount: directChildrenCount,
      allDescendantsCount,
      isEmpty,
      age,
    });
  }

  return emptyFolders;
}

/**
 * 预览清理结果
 */
async previewEmptyFolders(
  options: FindEmptyFoldersOptions = {}
): Promise<CleanupPreviewResult> {
  const emptyFolders = await this.findEmptyFolders(options);

  // 分类：删除 vs 保留
  const toDelete: EmptyFolderInfo[] = [];
  const toKeep: EmptyFolderInfo[] = [];
  const warnings: string[] = [];

  for (const info of emptyFolders) {
    // 检查是否有特殊情况需要保留
    const shouldKeep = await this.shouldKeepFolder(info);

    if (shouldKeep.reason) {
      toKeep.push(info);
      warnings.push(`"${info.folder.name}": ${shouldKeep.reason}`);
    } else {
      toDelete.push(info);
    }
  }

  return {
    toDelete,
    toKeep,
    totalBookmarksAffected: 0,
    warnings,
  };
}

/**
 * 判断文件夹是否应该保留
 */
private async shouldKeepFolder(
  info: EmptyFolderInfo
): Promise { reason: string } | { reason?: never }> {
  const { folder, allDescendantsCount, age } = info;

  // 1. 检查是否是智能文件夹
  if (folder.isSmartFolder) {
    return { reason: '智能文件夹需要保留' };
  }

  // 2. 检查是否有子文件夹（非递归模式）
  if (allDescendantsCount > 0) {
    return { reason: `包含 ${allDescendantsCount} 个子文件夹` };
  }

  // 3. 检查是否是系统文件夹（如"收藏"、"未分类"）
  const systemFolders = ['收藏', '未分类', '全部', '最近使用'];
  if (systemFolders.includes(folder.name)) {
    return { reason: '系统文件夹需要保留' };
  }

  // 4. 检查文件夹是否太新（防止误删刚创建的）
  const ONE_DAY = 24 * 60 * 60 * 1000;
  if (age < ONE_DAY) {
    return { reason: '创建时间小于24小时' };
  }

  return {};
}

/**
 * 清理空文件夹
 */
async deleteEmptyFolders(
  options: FindEmptyFoldersOptions & {
    dryRun?: boolean;  // 预演模式，不实际删除
  } = {}
): Promise<CleanupEmptyFoldersResult> {
  const startTime = Date.now();
  const { dryRun = false, ...findOptions } = options;

  // 1. 预览
  const preview = await this.previewEmptyFolders(findOptions);

  // 2. 执行删除
  let deleted = 0;
  const kept = preview.toKeep.length;
  const warnings = [...preview.warnings];

  if (!dryRun) {
    for (const info of preview.toDelete) {
      try {
        // 递归删除文件夹及其子文件夹
        await this.delete(info.folder.id);
        deleted++;

        logger.debug(`Deleted empty folder: ${info.folder.name}`);
      } catch (error) {
        warnings.push(`删除失败 "${info.folder.name}": ${(error as Error).message}`);
      }
    }
  } else {
    deleted = preview.toDelete.length;
  }

  const duration = Date.now() - startTime;

  logger.info(`Cleanup completed: ${deleted} deleted, ${kept} kept, ${duration}ms`);

  return {
    deleted,
    kept,
    warnings,
    duration,
  };
}
```

#### 2.2.2 OrganizerService 扩展

**扩展现有的 `cleanup()` 方法：**

```typescript
/**
 * 清理书签和文件夹
 */
async cleanup(options: CleanupOptions): Promise<CleanupResult> {
  const startTime = Date.now();
  const result: CleanupResult = {
    removed: 0,
    archived: 0,
    kept: 0,
    invalid: 0,
    emptyFoldersRemoved: 0,  // 已有字段
    unusedTagsRemoved: 0,
    errors: [],
    duration: 0,
  };

  try {
    // ... 现有的清理逻辑 ...

    // 清理空文件夹（增强版）
    if (options.removeEmptyFolders) {
      const cleanupResult = await folderService.deleteEmptyFolders({
        recursive: true,
        excludeRoot: true,
        minAge: options.emptyFolderMinAge || 0,
      });

      result.emptyFoldersRemoved = cleanupResult.deleted;
      result.errors.push(...cleanupResult.warnings);
    }

    // ... 其他清理逻辑 ...

    result.duration = Date.now() - startTime;
    return result;
  } catch (error) {
    result.errors.push((error as Error).message);
    result.duration = Date.now() - startTime;
    return result;
  }
}
```

**扩展智能建议：**

```typescript
/**
 * 生成智能建议
 */
async generateSmartSuggestions(): Promise<SmartSuggestion[]> {
  const suggestions: SmartSuggestion[] = [];

  // ... 现有建议 ...

  // 检测空文件夹
  const emptyFolders = await folderService.findEmptyFolders({
    recursive: true,
    excludeRoot: true,
    minAge: 24 * 60 * 60 * 1000, // 1天
  });

  if (emptyFolders.length > 0) {
    suggestions.push({
      type: 'cleanup',
      priority: emptyFolders.length > 10 ? 'high' : 'medium',
      title: `发现 ${emptyFolders.length} 个空文件夹`,
      description: '清理空文件夹可以让书签结构更清晰',
      action: async () => {
        await folderService.deleteEmptyFolders({
          recursive: true,
          excludeRoot: true,
          minAge: 24 * 60 * 60 * 1000,
        });
      },
      estimatedImpact: {
        foldersAffected: emptyFolders.length,
        timeSaved: emptyFolders.length * 0.1, // 分钟
      },
    });
  }

  return suggestions;
}
```

### 2.3 UI 组件设计

#### 2.3.1 清理面板组件

```typescript
/**
 * 清理面板组件
 */
interface CleanupPanelProps {
  onCleanup: (options: CleanupOptions) => Promise<CleanupResult>;
  onPreview: (options: FindEmptyFoldersOptions) => Promise<CleanupPreviewResult>;
}

const CleanupPanel: React.FC<CleanupPanelProps> = ({ onCleanup, onPreview }) => {
  const [preview, setPreview] = useState<CleanupPreviewResult | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [options, setOptions] = useState<FindEmptyFoldersOptions>({
    recursive: true,
    excludeRoot: true,
    minAge: 24 * 60 * 60 * 1000, // 默认1天
  });

  // 预览清理
  const handlePreview = async () => {
    setIsPreviewing(true);
    try {
      const result = await onPreview(options);
      setPreview(result);
    } catch (error) {
      console.error('Preview failed:', error);
    } finally {
      setIsPreviewing(false);
    }
  };

  // 执行清理
  const handleCleanup = async () => {
    if (!preview) return;

    setIsCleaning(true);
    try {
      const result = await onCleanup({
        removeEmptyFolders: true,
        ...options,
      });

      // 显示结果
      showNotification(`清理完成：删除 ${result.emptyFoldersRemoved} 个空文件夹`);
      setPreview(null);
    } catch (error) {
      console.error('Cleanup failed:', error);
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="cleanup-panel">
      <h2>清理空文件夹</h2>

      {/* 选项配置 */}
      <div className="cleanup-options">
        <label>
          <input
            type="checkbox"
            checked={options.recursive}
            onChange={(e) => setOptions({ ...options, recursive: e.target.checked })}
          />
          递归清理（包含子文件夹）
        </label>

        <label>
          <input
            type="checkbox"
            checked={options.excludeRoot}
            onChange={(e) => setOptions({ ...options, excludeRoot: e.target.checked })}
          />
          排除根目录
        </label>

        <label>
          最小存在时间：
          <select
            value={options.minAge}
            onChange={(e) => setOptions({ ...options, minAge: Number(e.target.value) })}
          >
            <option value={0}>不限制</option>
            <option value={60 * 60 * 1000}>1小时</option>
            <option value={24 * 60 * 60 * 1000}>1天</option>
            <option value={7 * 24 * 60 * 60 * 1000}>7天</option>
            <option value={30 * 24 * 60 * 60 * 1000}>30天</option>
          </select>
        </label>
      </div>

      {/* 操作按钮 */}
      <div className="cleanup-actions">
        <button onClick={handlePreview} disabled={isPreviewing}>
          {isPreviewing ? '分析中...' : '预览清理'}
        </button>

        {preview && (
          <button
            onClick={handleCleanup}
            disabled={isCleaning || preview.toDelete.length === 0}
          >
            {isCleaning ? '清理中...' : `确认清理 (${preview.toDelete.length}个)`}
          </button>
        )}
      </div>

      {/* 预览结果 */}
      {preview && (
        <div className="cleanup-preview">
          <h3>预览结果</h3>

          {preview.toDelete.length > 0 && (
            <div className="delete-list">
              <h4>将被删除的文件夹 ({preview.toDelete.length})</h4>
              <ul>
                {preview.toDelete.map((info) => (
                  <li key={info.folder.id}>
                    {info.folder.name}
                    {info.age > 0 && ` (${Math.round(info.age / (24 * 60 * 60 * 1000))}天前创建)`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.toKeep.length > 0 && (
            <div className="keep-list">
              <h4>将被保留的文件夹 ({preview.toKeep.length})</h4>
              <ul>
                {preview.toKeep.map((info) => (
                  <li key={info.folder.id}>
                    {info.folder.name}
                    {preview.warnings.find(w => w.includes(info.folder.name)) && (
                      <span className="warning">
                        ({preview.warnings.find(w => w.includes(info.folder.name))})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.warnings.length > 0 && (
            <div className="warnings">
              <h4>警告</h4>
              <ul>
                {preview.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
```

### 2.4 数据流设计

```
用户点击"预览清理"
    ↓
CleanupPanel.handlePreview()
    ↓
FolderService.previewEmptyFolders(options)
    ↓
┌─────────────────────────────────────┐
│  1. 获取所有文件夹和书签            │
│  2. 构建文件夹树和统计信息          │
│  3. 识别空文件夹                    │
│  4. 应用保留规则                    │
│  5. 返回预览结果                    │
└─────────────────────────────────────┘
    ↓
更新 UI 显示预览
    ↓
用户确认并点击"确认清理"
    ↓
CleanupPanel.handleCleanup()
    ↓
OrganizerService.cleanup({ removeEmptyFolders: true })
    ↓
FolderService.deleteEmptyFolders(options)
    ↓
┌─────────────────────────────────────┐
│  1. 调用 delete() 删除每个文件夹    │
│  2. 递归删除子文件夹                │
│  3. 返回清理结果                    │
└─────────────────────────────────────┘
    ↓
更新 UI 显示结果
```

---

## 3. 性能优化

### 3.1 数据库查询优化

**问题：** 当前实现分别查询文件夹和书签，可能导致性能问题

**优化方案：**

```typescript
// ❌ 低效：多次查询
const folders = await db.folders.toArray();
for (const folder of folders) {
  const bookmarks = await db.bookmarks.where('folderId').equals(folder.id).toArray();
}

// ✅ 高效：批量查询
const [allFolders, allBookmarks] = await Promise.all([
  db.folders.toArray(),
  db.bookmarks.toArray(),
]);

// 使用 Map 统计
const folderBookmarksCount = new Map<string, number>();
allBookmarks.forEach(bookmark => {
  if (bookmark.folderId) {
    folderBookmarksCount.set(
      bookmark.folderId,
      (folderBookmarksCount.get(bookmark.folderId) || 0) + 1
    );
  }
});
```

### 3.2 大规模数据处理

**场景：** 用户有 10,000+ 个文件夹

**优化方案：**

1. **分页处理**：每次处理 100 个文件夹
2. **Web Worker**：后台线程处理，不阻塞 UI
3. **增量更新**：显示进度条，实时更新

```typescript
/**
 * 批量删除（分页处理）
 */
async deleteEmptyFoldersBatch(
  options: FindEmptyFoldersOptions,
  batchSize = 100,
  onProgress?: (current: number, total: number) => void
): Promise<CleanupEmptyFoldersResult> {
  const emptyFolders = await this.findEmptyFolders(options);
  const total = emptyFolders.length;
  let deleted = 0;
  let kept = 0;
  const warnings: string[] = [];

  // 分批处理
  for (let i = 0; i < total; i += batchSize) {
    const batch = emptyFolders.slice(i, i + batchSize);

    for (const info of batch) {
      try {
        await this.delete(info.folder.id);
        deleted++;
      } catch (error) {
        warnings.push(`删除失败 "${info.folder.name}": ${(error as Error).message}`);
      }
    }

    // 进度回调
    onProgress?.(Math.min(i + batchSize, total), total);

    // 避免阻塞 UI，延迟一下
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  return { deleted, kept, warnings, duration: 0 };
}
```

---

## 4. 安全性和可靠性

### 4.1 防止误删

**保护措施：**

1. **最小存在时间**：默认 24 小时内的文件夹不删除
2. **系统文件夹保护**："收藏"、"未分类" 等系统文件夹不删除
3. **智能文件夹保护**：所有智能文件夹不删除
4. **预览确认**：必须用户手动确认才能执行
5. **备份机制**：删除前记录到历史表，支持撤销

### 4.2 事务处理

**问题：** 删除过程中断可能导致数据不一致

**解决方案：**

```typescript
/**
 * 事务性删除
 */
async deleteEmptyFoldersSafe(
  options: FindEmptyFoldersOptions
): Promise<CleanupEmptyFoldersResult> {
  return db.transaction('rw', db.folders, db.bookmarks, db.organizeHistory, async () => {
    // 1. 记录到历史
    const historyId = `cleanup-${Date.now()}`;
    const preview = await this.previewEmptyFolders(options);

    await db.organizeHistory.add({
      id: historyId,
      timestamp: Date.now(),
      type: 'empty-folder-cleanup',
      data: {
        folders: preview.toDelete.map(info => ({
          id: info.folder.id,
          name: info.folder.name,
          parentId: info.folder.parentId,
        })),
      },
    });

    // 2. 执行删除
    const result = await this.deleteEmptyFolders({ ...options, dryRun: false });

    return result;
  });
}
```

### 4.3 错误处理

**错误类型：**

1. **数据库错误**：记录日志，跳过当前项
2. **外键约束**：移动书签到父文件夹
3. **权限错误**：提示用户手动处理

```typescript
try {
  await this.delete(folder.id);
} catch (error) {
  if (error.name === 'ConstraintError') {
    // 外键约束：先移动书签
    await db.bookmarks.where('folderId').equals(folder.id).modify({
      folderId: folder.parentId || null,
    });
    await this.delete(folder.id);
  } else {
    throw error;
  }
}
```

---

## 5. 测试策略

### 5.1 单元测试

```typescript
describe('FolderService - Empty Folders', () => {
  beforeEach(async () => {
    await db.bookmarks.clear();
    await db.folders.clear();
  });

  test('should find empty folders', async () => {
    // 创建测试数据
    const folder1 = await folderService.create({ name: 'Empty' });
    const folder2 = await folderService.create({ name: 'Non-Empty' });
    await bookmarkService.create({
      url: 'https://test.com',
      title: 'Test',
      folderId: folder2.id,
    });

    // 执行测试
    const emptyFolders = await folderService.findEmptyFolders();

    // 验证
    expect(emptyFolders).toHaveLength(1);
    expect(emptyFolders[0].folder.id).toBe(folder1.id);
  });

  test('should respect minAge option', async () => {
    const folder = await folderService.create({ name: 'New' });

    // 创建1秒前的文件夹
    await db.folders.update(folder.id, {
      createdAt: Date.now() - 1000,
    });

    // 设置最小存在时间为1小时
    const emptyFolders = await folderService.findEmptyFolders({
      minAge: 60 * 60 * 1000,
    });

    // 验证：不应该被识别为可删除
    expect(emptyFolders).toHaveLength(0);
  });
});
```

### 5.2 集成测试

```typescript
describe('Cleanup Integration', () => {
  test('should cleanup empty folders and update UI', async () => {
    // 创建测试场景
    const folders = await createTestFolders(100);
    const emptyCount = folders.filter(f => f.isEmpty).length;

    // 执行清理
    const result = await organizerService.cleanup({
      removeEmptyFolders: true,
    });

    // 验证
    expect(result.emptyFoldersRemoved).toBe(emptyCount);

    // 验证数据库
    const remainingFolders = await db.folders.toArray();
    expect(remainingFolders.length).toBe(100 - emptyCount);
  });
});
```

---

## 6. 实施计划

### 6.1 开发阶段

**阶段 1: 核心功能**（2-3天）
- [ ] 实现 `findEmptyFolders()` 方法
- [ ] 实现 `previewEmptyFolders()` 方法
- [ ] 实现 `deleteEmptyFolders()` 方法
- [ ] 单元测试

**阶段 2: UI 开发**（2-3天）
- [ ] 开发 CleanupPanel 组件
- [ ] 开发预览和确认界面
- [ ] 集成到设置页面
- [ ] 集成测试

**阶段 3: 优化和测试**（1-2天）
- [ ] 性能优化（大规模数据）
- [ ] 安全性加固（防止误删）
- [ ] 端到端测试
- [ ] 文档完善

### 6.2 验收标准

**功能验收：**
- ✅ 能正确识别空文件夹
- ✅ 预览结果准确
- ✅ 删除操作安全可靠
- ✅ 支持撤销和恢复

**性能验收：**
- ✅ 1000 个文件夹内，分析时间 < 1秒
- ✅ 10000 个文件夹内，分析时间 < 5秒
- ✅ 删除操作不阻塞 UI

**用户体验验收：**
- ✅ 操作流程简单直观
- ✅ 预览信息清晰完整
- ✅ 错误提示友好明确

---

## 7. 后续优化方向

### 7.1 智能合并

**功能：** 检测相似文件夹并建议合并

```typescript
/**
 * 建议合并相似文件夹
 */
async suggestFolderMerge(): Promise<FolderMergeSuggestion[]> {
  const folders = await folderService.getAll();
  const suggestions: FolderMergeSuggestion[] = [];

  // 检测名称相似的文件夹
  const similarityGroups = groupByNameSimilarity(folders);

  for (const group of similarityGroups) {
    suggestions.push({
      type: 'merge',
      folders: group,
      reason: '文件夹名称相似',
      suggestedName: group[0].name,
    });
  }

  return suggestions;
}
```

### 7.2 自动归档

**功能：** 自动归档长期未使用的空文件夹

```typescript
/**
 * 自动归档空文件夹
 */
async autoArchiveEmptyFolders(): Promise<void> {
  const archiveFolder = await getOrCreateArchiveFolder();

  const emptyFolders = await folderService.findEmptyFolders({
    minAge: 90 * 24 * 60 * 60 * 1000, // 90天
  });

  for (const info of emptyFolders) {
    await folderService.update(info.folder.id, {
      parentId: archiveFolder.id,
      isArchived: true,
    });
  }
}
```

---

## 8. 总结

本设计文档详细描述了"清理空文件夹"功能的完整设计方案，包括：

- **架构设计**：清晰的分层架构和组件职责
- **核心算法**：高效的空文件夹识别和清理算法
- **UI 设计**：用户友好的预览和确认界面
- **性能优化**：大数据量下的优化策略
- **安全可靠**：防止误删和错误处理机制
- **测试策略**：完整的单元测试和集成测试方案

**预期效果：**
- 用户可以轻松清理空文件夹，保持书签结构清晰
- 性能优秀，支持大规模数据
- 安全可靠，防止误删重要文件夹

**实施建议：**
建议按照开发阶段逐步实施，先完成核心功能，再优化性能和用户体验。
