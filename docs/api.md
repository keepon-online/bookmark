# 服务 API 文档

本文档描述了智能书签扩展中所有服务的 API 接口。

## 📚 目录

- [书签服务 (BookmarkService)](#书签服务-bookmarkservice)
- [文件夹服务 (FolderService)](#文件夹服务-folderservice)
- [标签服务 (TagService)](#标签服务-tagservice)
- [AI 服务 (AIService)](#ai-service-aiservice)
- [DeepSeek 服务 (DeepSeekAIService)](#deepseek-服务-deepseekaiservice)
- [浏览器同步服务 (BrowserSyncService)](#浏览器同步服务-browsersyncservice)
- [云端同步服务 (SyncService)](#云端同步服务-syncservice)
- [整理服务 (OrganizerService)](#整理服务-organizerservice)
- [链接健康服务 (LinkHealthService)](#链接健康服务-linkhealthservice)
- [统计服务 (StatsService)](#统计服务-statsservice)

---

## 书签服务 (BookmarkService)

### 导入
```typescript
import { bookmarkService } from '@/services';
```

### 方法

#### `create(data: CreateBookmarkDTO): Promise<Bookmark>`
创建新书签

**参数:**
- `data.url` - 书签 URL
- `data.title` - 书签标题
- `data.description` - 描述（可选）
- `data.tags` - 标签数组（可选）
- `data.folderId` - 文件夹 ID（可选）
- `data.isFavorite` - 是否收藏（可选）

**返回:** 创建的书签对象

**示例:**
```typescript
const bookmark = await bookmarkService.create({
  url: 'https://example.com',
  title: 'Example',
  tags: ['tech', 'blog'],
});
```

#### `getById(id: string): Promise<Bookmark | undefined>`
根据 ID 获取书签

#### `getAll(options?: QueryOptions): Promise<Bookmark[]>`
获取所有书签，支持过滤和排序

**参数:**
- `options.folderId` - 按文件夹过滤
- `options.isFavorite` - 按收藏状态过滤
- `options.isArchived` - 按归档状态过滤
- `options.sortBy` - 排序字段
- `options.sortOrder` - 排序方向
- `options.limit` - 返回数量限制
- `options.offset` - 偏移量

#### `update(id: string, data: UpdateBookmarkDTO): Promise<Bookmark>`
更新书签

#### `delete(id: string): Promise<void>`
删除书签

#### `importFromBrowser(): Promise<ImportResult>`
从浏览器导入书签

#### `search(query: string): Promise<Bookmark[]>`
全文搜索书签

---

## 文件夹服务 (FolderService)

### 方法

#### `create(dto: CreateFolderDTO): Promise<Folder>`
创建新文件夹

**参数:**
- `dto.name` - 文件夹名称
- `dto.parentId` - 父文件夹 ID（可选）
- `dto.icon` - 图标（可选）
- `dto.color` - 颜色（可选）

**示例:**
```typescript
const folder = await folderService.create({
  name: 'Tech',
  parentId: undefined, // 根目录
  icon: '💻',
});
```

#### `getTree(): Promise<FolderTreeNode[]>`
获取文件夹树形结构

**返回:** 包含嵌套子文件夹的树形结构

#### `move(id: string, newParentId?: string, newOrder?: number): Promise<Folder>`
移动文件夹

---

## 标签服务 (TagService)

### 方法

#### `create(dto: CreateTagDTO): Promise<Tag>`
创建新标签

#### `getAll(): Promise<Tag[]>`
获取所有标签

#### `getPopular(limit?: number): Promise<Tag[]>`
获取热门标签

#### `updateUsage(tagName: string): Promise<void>`
更新标签使用次数

---

## AI 服务 (AIService)

### 方法

#### `classifyBookmark(bookmark: Bookmark): Promise<ClassificationResult>`
AI 分类单个书签

**返回:**
```typescript
{
  suggestedTags: string[];
  suggestedFolder: string;
  confidence: number;
  reasoning: string;
}
```

#### `batchClassify(bookmarks: Bookmark[]): Promise<ClassificationResult[]>`
批量分类书签

#### `generateTags(bookmark: Bookmark): Promise<string[]>`
为书签生成标签

---

## DeepSeek 服务 (DeepSeekAIService)

### 配置

```typescript
import { deepSeekAIService } from '@/services';

// 初始化
await deepSeekAIService.initialize({
  apiKey: 'your_api_key',
  baseURL: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  temperature: 0.3,
});
```

### 方法

#### `initialize(config: DeepSeekConfig): Promise<void>`
初始化 DeepSeek 客户端

#### `classifyBookmark(bookmark: Bookmark): Promise<LLMClassificationResult>`
使用 DeepSeek 分类书签

#### `batchClassify(bookmarks: Bookmark[], options?: BatchClassifyOptions): Promise<LLMClassificationResult[]>`
批量分类，优化 API 调用

**选项:**
- `batchSize` - 每批处理数量（默认 5）
- `useCache` - 是否使用缓存（默认 true）
- `fallbackToLocal` - 失败时回退到本地分类（默认 true）

#### `getCostStats(): Promise<CostStats>`
获取成本统计

**返回:**
```typescript
{
  totalTokens: number;
  totalCost: number;
  requestCount: number;
}
```

---

## 浏览器同步服务 (BrowserSyncService)

### 方法

#### `syncToBrowser(options?: SyncOptions): Promise<SyncResult>`
同步到浏览器书签

**选项:**
- `moveBookmarks` - 是否移动书签到文件夹
- `applyTags` - 是否应用标签到标题
- `folderId` - 目标文件夹 ID

**返回:**
```typescript
{
  success: boolean;
  moved: number;
  tagged: number;
  errors: string[];
}
```

#### `importAndOrganize(): Promise<{importResult, syncResult}>`
导入并自动整理

---

## 云端同步服务 (SyncService)

### 配置

需要在环境变量中配置 Supabase:
```bash
VITE_SUPABASE_URL=your_url
VITE_SUPABASE_ANON_KEY=your_key
```

### 方法

#### `upload(): Promise<SyncResult>`
上传本地数据到云端

#### `download(): Promise<SyncResult>`
从云端下载数据

#### `sync(): Promise<SyncResult>`
双向同步（合并本地和云端数据）

#### `resolveConflicts(localData, remoteData): Promise<ResolvedData>`
解决数据冲突

---

## 整理服务 (OrganizerService)

### 方法

#### `organize(bookmarks: Bookmark[], options: OrganizeOptions): Promise<OrganizeResult>`
智能整理书签

**选项:**
- `applyTags` - 是否应用推荐标签
- `moveBookmarks` - 是否移动到推荐文件夹
- `createNewFolders` - 是否创建新文件夹
- `minConfidence` - 最小置信度（0-1）

**返回:**
```typescript
{
  success: boolean;
  processed: number;
  classified: number;
  moved: number;
  tagged: number;
  archived: number;
  errors: string[];
}
```

#### `preview(bookmark: Bookmark): Promise<OrganizePreview>`
预览整理效果（不实际修改）

---

## 链接健康服务 (LinkHealthService)

### 方法

#### `checkBookmark(bookmark: Bookmark): Promise<LinkCheckResult>`
检查单个书签链接

**返回:**
```typescript
{
  bookmarkId: string;
  url: string;
  status: number;
  isAccessible: boolean;
  responseTime: number;
  errorMessage?: string;
}
```

#### `checkBatch(bookmarkIds: string[], options?: BatchCheckOptions): Promise<LinkCheckResult[]>`
批量检查链接

#### `getBrokenBookmarks(limit?: number): Promise<Bookmark[]>`
获取失效书签列表

#### `cleanupOldRecords(daysToKeep?: number): Promise<number>`
清理旧的检查记录

---

## 统计服务 (StatsService)

### 方法

#### `getOverallStats(useCache?: boolean): Promise<OverallStats>`
获取整体统计

**返回:**
```typescript
{
  totalBookmarks: number;
  totalFolders: number;
  totalTags: number;
  favorites: number;
  archived: number;
  broken: number;
  uncategorized: number;
  duplicates: number;
  recentAdditions: number;
  avgBookmarksPerFolder: number;
  largestFolder: { name: string; count: number };
}
```

#### `getPopularTags(limit?: number): Promise<TagStats[]>`
获取热门标签统计

#### `getFolderStats(): Promise<FolderStats[]>`
获取文件夹统计

#### `getDomainStats(limit?: number): Promise<DomainStats[]>`
获取域名统计

#### `getBookmarkActivity(): Promise<ActivityStats>`
获取活跃度统计

#### `getTimeTrends(period: TimePeriod): Promise<TimeTrend[]>`
获取时间趋势

---

## 🔄 服务关系图

```
BookmarkService
    ├─→ FolderService
    ├─→ TagService
    └─→ AIService
           ├─→ DeepSeekAIService
           └─→ 本地分类算法

BrowserSyncService
    ├─→ BookmarkService
    └─→ FolderService

OrganizerService
    ├─→ AIService
    ├─→ BookmarkService
    ├─→ FolderService
    └─→ TagService

SyncService
    ├─→ BookmarkService
    ├─→ FolderService
    ├─→ TagService
    └─→ Supabase Client

LinkHealthService
    └─→ BookmarkService

StatsService
    ├─→ BookmarkService
    ├─→ FolderService
    └─→ TagService
```

---

## 📝 使用示例

### 完整工作流示例

```typescript
import {
  bookmarkService,
  folderService,
  organizerService,
  deepSeekAIService
} from '@/services';

// 1. 初始化 AI
await deepSeekAIService.initialize({
  apiKey: 'your_key',
  model: 'deepseek-chat',
});

// 2. 创建文件夹
const techFolder = await folderService.create({
  name: 'Technology',
  icon: '💻',
});

// 3. 创建书签
const bookmark = await bookmarkService.create({
  url: 'https://example.com',
  title: 'Example Site',
  folderId: techFolder.id,
});

// 4. AI 分类整理
const result = await organizerService.organize(
  [bookmark],
  {
    applyTags: true,
    moveBookmarks: true,
    minConfidence: 0.7,
  }
);

console.log(`分类完成: ${result.classified} 个书签`);
```

---

## 🧪 测试服务

所有服务都支持单元测试。示例：

```typescript
import { bookmarkService } from '@/services';

describe('BookmarkService', () => {
  it('should create bookmark', async () => {
    const bookmark = await bookmarkService.create({
      url: 'https://test.com',
      title: 'Test',
    });
    expect(bookmark).toBeDefined();
    expect(bookmark.url).toBe('https://test.com');
  });
});
```

---

## 📚 相关文档

- [架构设计](./architecture.md)
- [开发指南](./development.md)
- [API 参考](./api.md)
