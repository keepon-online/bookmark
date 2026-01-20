# 架构设计文档

本文档描述智能书签扩展的系统架构和设计模式。

## 📋 目录

- [架构概览](#架构概览)
- [数据流](#数据流)
- [核心模块](#核心模块)
- [设计模式](#设计模式)
- [技术选型](#技术选型)
- [扩展性设计](#扩展性设计)

---

## 架构概览

### 系统分层

```
┌─────────────────────────────────────────────┐
│           UI Layer (Components)              │
│  - BookmarkList, BookmarksOrganizer, etc.   │
├─────────────────────────────────────────────┤
│         State Management (Stores)            │
│  - uiStore (Zustand)                        │
├─────────────────────────────────────────────┤
│          Business Logic (Services)           │
│  - bookmarkService, organizerService, etc.   │
├─────────────────────────────────────────────┤
│         Data Access (Repository)             │
│  - db (Dexie - IndexedDB)                    │
├─────────────────────────────────────────────┤
│        External APIs (Integrations)          │
│  - DeepSeek AI, Supabase, Chrome APIs       │
└─────────────────────────────────────────────┘
```

### 扩展入口点

```
Extension
├── Background (Service Worker)
│   ├── 消息监听和处理
│   ├── 定时任务（链接检查、自动整理）
│   ├── 浏览器事件监听
│   └── 生命周期管理
│
├── Options (设置页面)
│   ├── 通用设置
│   ├── AI 配置
│   ├── 云端同步
│   ├── 数据统计
│   └── 链接健康
│
├── Popup (快速操作)
│   ├── 快速添加书签
│   ├── 切换收藏
│   └── 快速搜索
│
└── SidePanel (侧边栏)
    ├── 书签浏览
    ├── 搜索过滤
    └── 快速操作
```

---

## 数据流

### 书签创建流程

```
用户操作
    ↓
UI Component (AddBookmarkForm)
    ↓
bookmarkService.create()
    ↓
IndexedDB (db.bookmarks.add())
    ↓
AI 分类（可选）
    ├─→ AI Service → DeepSeek API
    └─→ 本地分类规则
    ↓
更新状态 (uiStore)
    ↓
UI 重新渲染
```

### AI 分类流程

```
书签数据
    ↓
organizerService.organize()
    ↓
DeepSeekAIService.batchClassify()
    ↓
缓存检查
    ├─ 命中 → 返回缓存结果
    └─ 未命中 → API 调用
        ↓
    DeepSeek API (批量处理)
        ↓
    解析响应
        ↓
    保存缓存
        ↓
    返回分类结果
    ↓
应用到书签（标签、文件夹）
    ↓
browserSyncService.syncToBrowser()
    ↓
更新浏览器书签
```

### 云端同步流程

```
本地数据变更
    ↓
syncService.upload()
    ↓
收集本地数据
    ├─→ bookmarks
    ├─→ folders
    └─→ tags
    ↓
上传到 Supabase
    ↓
syncService.download()
    ↓
从 Supabase 获取
    ↓
冲突检测
    ├─ 无冲突 → 直接合并
    └─ 有冲突 → resolveConflicts()
        ├─ 策略: 本地优先
        ├─ 策略: 远程优先
        └─ 策略: 合并
    ↓
更新本地数据库
    ↓
更新 UI
```

---

## 核心模块

### 1. 数据层 (Data Layer)

#### IndexedDB (Dexie)

**数据库 Schema:**

```typescript
// bookmarks 表
{
  id: string;                  // 主键
  url: string;                 // 索引
  title: string;               // 索引
  folderId: string;            // 索引
  createdAt: number;           // 索引
  isFavorite: number;          // 索引
  status: string;              // 索引
  isArchived: number;          // 索引
  aiGenerated: boolean;        // 索引 (v4)
  [folderId+createdAt]: string; // 复合索引
}

// folders 表
{
  id: string;
  name: string;                // 索引
  parentId: string;            // 索引
  order: number;              // 索引
  [parentId+order]: string;    // 复合索引
}

// tags 表
{
  id: string;
  name: string;                // 唯一索引
  usageCount: number;          // 索引
}

// linkChecks 表
{
  id: string;
  bookmarkId: string;          // 索引
  checkedAt: number;           // 索引
}
```

**版本管理:**

```typescript
// Version 4 (当前)
- 添加 aiGenerated 索引
- 包含所有表定义（避免索引丢失）
```

### 2. 业务逻辑层 (Business Logic)

#### 服务架构

```
Service Layer
├── Core Services
│   ├── BookmarkService   # 书签 CRUD
│   ├── FolderService     # 文件夹管理
│   └── TagService        # 标签管理
│
├── AI Services
│   ├── AIService         # 本地分类规则
│   └── DeepSeekAIService # LLM API 集成
│
├── Sync Services
│   ├── BrowserSyncService # 浏览器书签同步
│   └── SyncService       # 云端数据同步
│
├── Feature Services
│   ├── OrganizerService  # 书签整理
│   ├── LinkHealthService# 链接健康检查
│   └── StatsService      # 数据统计
```

**服务职责:**

- **单一职责**: 每个服务专注于特定领域
- **依赖注入**: 服务间通过接口依赖
- **错误处理**: 统一的错误处理和日志

### 3. 状态管理 (State Management)

#### Zustand Store

```typescript
// uiStore
{
  // 书签状态
  bookmarks: Bookmark[];
  selectedBookmark: string | null;
  filters: FilterState;

  // UI 状态
  sidebarOpen: boolean;
  searchQuery: string;
  activeView: string;

  // 加载状态
  isLoading: boolean;
  error: string | null;

  // Actions
  loadBookmarks: () => Promise<void>;
  selectBookmark: (id: string) => void;
  setSearchQuery: (query: string) => void;
  // ...
}
```

### 4. UI 组件层 (UI Layer)

#### 组件层次

```
App
├── Layout
│   ├── SidebarNav
│   └── MainContent
│       ├── Dashboard
│       ├── BookmarkList
│       │   ├── BookmarkCard
│       │   └── AddBookmarkForm
│       ├── BookmarksOrganizer
│       └── Settings
│           ├── AISettings
│           ├── SyncSettings
│           └── StatsSettings
└── Toast
```

---

## 设计模式

### 1. 服务单例模式

所有服务使用单例模式：

```typescript
export class BookmarkService {
  // 私有构造函数（通过类本身限制）
  private static instance: BookmarkService;

  // 单例导出
  static getInstance(): BookmarkService {
    if (!BookmarkService.instance) {
      BookmarkService.instance = new BookmarkService();
    }
    return BookmarkService.instance;
  }
}

// 使用单例导出
export const bookmarkService = BookmarkService.getInstance();
```

**优点:**
- 全局唯一实例
- 延迟初始化
- 便于测试

### 2. 工厂模式

数据库和客户端创建：

```typescript
// 数据库工厂
export class BookmarkDatabase extends Dexie {
  private static instance: BookmarkDatabase;

  static getInstance(): BookmarkDatabase {
    if (!BookmarkDatabase.instance) {
      BookmarkDatabase.instance = new BookmarkDatabase();
    }
    return BookmarkDatabase.instance;
  }
}

// 使用
export const db = BookmarkDatabase.getInstance();
```

### 3. 观察者模式

状态更新和 UI 渲染：

```typescript
// Zustand store (观察者)
const useBookmarks = create((set) => ({
  bookmarks: [],
  loadBookmarks: async () => {
    const bookmarks = await bookmarkService.getAll();
    set({ bookmarks });
  },
}));

// 组件订阅 (观察者)
function BookmarkList() {
  const bookmarks = useBookmarks(state => state.bookmarks);
  // 当 bookmarks 变化时自动重新渲染
}
```

### 4. 策略模式

AI 分类策略：

```typescript
interface ClassificationStrategy {
  classify(bookmark: Bookmark): Promise<ClassificationResult>;
}

class LocalStrategy implements ClassificationStrategy {
  async classify(bookmark: Bookmark) {
    // 本地规则分类
  }
}

class LLMStrategy implements ClassificationStrategy {
  async classify(bookmark: Bookmark) {
    // LLM API 分类
  }
}

// 使用策略
class OrganizerService {
  async classify(bookmark: Bookmark, strategy: ClassificationStrategy) {
    return strategy.classify(bookmark);
  }
}
```

### 5. 仓储模式 (Repository Pattern)

数据访问抽象：

```typescript
// Repository 接口
interface IBookmarkRepository {
  create(data: CreateBookmarkDTO): Promise<Bookmark>;
  findById(id: string): Promise<Bookmark | undefined>;
  findAll(): Promise<Bookmark[]>;
  update(id: string, data: UpdateBookmarkDTO): Promise<void>;
  delete(id: string): Promise<void>;
}

// Dexie 实现
class BookmarkRepository implements IBookmarkRepository {
  create(data: CreateBookmarkDTO) {
    return db.bookmarks.add(data);
  }
  // ...
}

// Service 使用 Repository
class BookmarkService {
  constructor(private repository: IBookmarkRepository) {}
}
```

---

## 技术选型

### 前端框架

**选择: WXT + React**

**理由:**
- WXT: 专为 WebExtension 设计，开箱即用
- React: 生态系统成熟，组件化开发
- TypeScript: 类型安全，减少运行时错误

**替代方案考虑:**
- ❌ Vanilla JS: 缺少组件化，维护困难
- ❌ Vue: 团队不熟悉
- ❌ Svelte: 生态不够成熟

### 状态管理

**选择: Zustand**

**理由:**
- 轻量级 (1KB gzipped)
- 简单易用，学习成本低
- TypeScript 支持良好
- 无需 Provider 包裹

**替代方案考虑:**
- ❌ Redux: 过于复杂，样板代码多
- ❌ Jotai: 团队不熟悉
- ❌ Context API: 性能问题，不适合频繁更新

### 数据库

**选择: IndexedDB (Dexie)**

**理由:**
- 浏览器本地存储，无需服务器
- 大容量支持（数百 MB）
- Dexie 提供友好的 API
- 支持索引和查询

**替代方案考虑:**
- ❌ localStorage: 容量限制（5MB）
- ❌ Chrome Storage API: 同步限制，不适合大数据
- ✅ Supabase: 用于云端备份，不是主要存储

### AI 服务

**选择: DeepSeek API**

**理由:**
- 性价比高
- 中文支持优秀
- API 简单易用
- 批量处理支持

**替代方案考虑:**
- ❌ OpenAI: 成本较高
- ❌ 本地模型: 浏览器性能限制
- ✅ 本地规则: 作为降级方案

---

## 扩展性设计

### 1. 插件化架构

服务可插拔：

```typescript
// 插件接口
interface IPlugin {
  name: string;
  initialize(): Promise<void>;
  onBookmarkCreate?(bookmark: Bookmark): Promise<void>;
  onBookmarkUpdate?(bookmark: Bookmark): Promise<void>;
}

// 插件管理器
class PluginManager {
  private plugins: Map<string, IPlugin> = new Map();

  register(plugin: IPlugin) {
    this.plugins.set(plugin.name, plugin);
  }

  async initializeAll() {
    for (const plugin of this.plugins.values()) {
      await plugin.initialize();
    }
  }
}
```

### 2. 驱动模式

可替换的 AI 驱动：

```typescript
// 驱动接口
interface IAIDriver {
  classify(bookmark: Bookmark): Promise<ClassificationResult>;
  batchClassify(bookmarks: Bookmark[]): Promise<ClassificationResult[]>;
}

// 不同驱动
class DeepSeekDriver implements IAIDriver { }
class OpenAIDriver implements IAIDriver { }
class LocalDriver implements IAIDriver { }

// 配置驱动
const aiDriver = config.useDeepSeek
  ? new DeepSeekDriver()
  : new LocalDriver();
```

### 3. 中间件模式

请求/响应处理：

```typescript
type Middleware = (context: Context, next: () => Promise<void>) => Promise<void>;

class Service {
  private middlewares: Middleware[] = [];

  use(middleware: Middleware) {
    this.middlewares.push(middleware);
  }

  async execute(context: Context) {
    let index = 0;
    const next = async () => {
      if (index < this.middlewares.length) {
        const middleware = this.middlewares[index++];
        await middleware(context, next);
      }
    };
    await next();
  }
}
```

---

## 性能优化

### 1. 批量处理

**AI 批量分类:**

```typescript
// ❌ 逐个处理 (慢)
for (const bookmark of bookmarks) {
  await deepSeekAIService.classifyBookmark(bookmark);
}

// ✅ 批量处理 (快)
await deepSeekAIService.batchClassify(bookmarks, {
  batchSize: 10,
});
```

### 2. 缓存策略

**多级缓存:**

```typescript
// 1. 内存缓存 (快速)
const memoryCache = new Map();

// 2. IndexedDB 缓存 (持久)
await db.cache.put(key, value);

// 3. API 缓存 (DeepSeek)
const cached = await deepSeekAIService.getFromCache(bookmark);
```

### 3. 懒加载

**组件懒加载:**

```typescript
// 懒加载组件
const [Component, setComponent] = useState(null);

useEffect(() => {
  // 延迟加载避免阻塞
  setTimeout(() => {
    import('./HeavyComponent').then(module => {
      setComponent(() => module.HeavyComponent);
    });
  }, 100);
}, []);
```

### 4. 数据库查询优化

**避免全表扫描:**

```typescript
// ❌ 全表扫描
const bookmarks = await db.bookmarks.toArray();
const filtered = bookmarks.filter(b => b.isFavorite);

// ✅ 使用索引
const favorites = await db.bookmarks.where('isFavorite').equals(1).toArray();
```

---

## 安全设计

### 1. API 密钥保护

```typescript
// 服务端代理（推荐）
// API 密钥不暴露在客户端

// 客户端使用（当前实现）
// 敏感信息存储在 chrome.storage.local
// 用户自行配置 API 密钥
```

### 2. 数据验证

```typescript
// 输入验证
function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// 使用
if (!validateUrl(inputUrl)) {
  throw new Error('Invalid URL');
}
```

### 3. 权限最小化

```typescript
// manifest.json
{
  "permissions": [
    "bookmarks",   // 书签访问
    "storage",     // 本地存储
    "tabs",        // 当前标签页
    "activeTab"    // 活动标签页
  ],
  "optional_host_permissions": [
    "https://*/*",  // 按需请求网站访问
    "http://*/*"
  ]
}
```

---

## 监控与日志

### 1. 统一日志

```typescript
import { createLogger } from '@/lib/logger';

const logger = createLogger('ModuleName');

// 自动添加时间戳和上下文
logger.debug('Debug info');
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message');
```

### 2. 错误追踪

```typescript
// 全局错误处理
window.addEventListener('error', (event) => {
  logger.error('Global error', event.error);
});

// Promise 错误
window.addEventListener('unhandledrejection', (event) => {
  logger.error('Unhandled rejection', event.reason);
});
```

### 3. 性能监控

```typescript
// 性能标记
performance.mark('start-operation');

// 执行操作
await someOperation();

performance.mark('end-operation');
performance.measure('operation', 'start-operation', 'end-operation');

// 获取测量结果
const measures = performance.getEntriesByName('operation');
logger.info('Performance', measures[0].duration);
```

---

## 测试策略

### 1. 单元测试

```typescript
describe('BookmarkService', () => {
  it('should create bookmark', async () => {
    const result = await bookmarkService.create({
      url: 'https://test.com',
      title: 'Test',
    });
    expect(result).toBeDefined();
  });
});
```

### 2. 集成测试

```typescript
describe('Sync Flow', () => {
  it('should sync bookmarks to browser', async () => {
    // 创建测试数据
    await bookmarkService.create(testData);

    // 执行同步
    const result = await browserSyncService.syncToBrowser();

    // 验证结果
    expect(result.success).toBe(true);
  });
});
```

### 3. E2E 测试

```typescript
// 使用 Playwright 或 Puppeteer
test('full workflow', async ({ page }) => {
  await page.goto('chrome-extension://.../options.html');
  await page.click('#organize-button');
  await expect(page.locator('.success-message')).toBeVisible();
});
```

---

## 📚 相关文档

- [API 文档](./api.md)
- [开发指南](./development.md)
- [项目 README](../README.md)
