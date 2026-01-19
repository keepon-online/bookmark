# 智能书签插件 - v0.2 开发设计

**设计日期**: 2025-01-19
**版本**: v0.2
**设计师**: Claude (Sonnet 4.5)
**基于**: v0.1 MVP

---

## 1. 当前状态回顾

### 1.1 v0.1 已完成功能

| 模块 | 状态 | 功能 |
|------|------|------|
| **数据层** | ✅ | IndexedDB (Dexie.js) |
| **服务层** | ✅ | BookmarkService, FolderService, TagService, SearchService |
| **状态管理** | ✅ | Zustand Stores |
| **UI 组件** | ✅ | Popup, Sidepanel, Options |
| **基础功能** | ✅ | CRUD, 搜索, 浏览器导入 |
| **构建系统** | ✅ | WXT + React + TypeScript |

### 1.2 v0.2 目标

在 MVP 基础上添加：
1. **AI 智能分类** - 基于规则的自动标签推荐
2. **链接健康检查** - 失效链接检测
3. **批量操作优化** - 更高效的批量管理
4. **快捷键支持** - 提升操作效率

---

## 2. AI 智能分类设计

### 2.1 架构设计

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        AI 分类服务架构                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    AIService                                     │    │
│  │  ┌────────────────────────────────────────────────────────────┐ │    │
│  │  │              分类策略层 (Strategy Layer)                    │ │    │
│  │  │  ┌─────────────────┐  ┌─────────────────┐                 │ │    │
│  │  │  │  URL 分析器     │  │  内容分析器     │                 │ │    │
│  │  │  │  UrlClassifier  │  │ContentClassifier│                 │ │    │
│  │  │  └─────────────────┘  └─────────────────┘                 │ │    │
│  │  └────────────────────────────────────────────────────────────┘ │    │
│  │                           │                                     │    │
│  │                           ▼                                     │    │
│  │  ┌────────────────────────────────────────────────────────────┐ │    │
│  │  │              规则引擎层 (Rule Engine)                      │ │    │
│  │  │  ┌──────────────────────────────────────────────────────┐ │ │    │
│  │  │  │  分类规则表                                           │ │ │    │
│  │  │  │  ┌────────────┐  ┌────────────┐  ┌────────────┐     │ │ │    │
│  │  │  │  │ GitHub     │  │ Stack      │  │ YouTube    │     │ │ │    │
│  │  │  │  │ /github.com│  │Overflow    │  │/youtube    │     │ │ │    │
│  │  │  │  │ → [开发]   │  │/stackoverflow│  │ → [视频]   │     │ │ │    │
│  │  │  │  └────────────┘  └────────────┘  └────────────┘     │ │ │    │
│  │  │  │  ... 更多规则 ...                                    │ │ │    │
│  │  │  └──────────────────────────────────────────────────────┘ │ │    │
│  │  └────────────────────────────────────────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 接口设计

```typescript
// src/services/aiService.ts

export interface ClassificationResult {
  suggestedFolder?: string;
  suggestedTags: string[];
  contentType: ContentType;
  confidence: number; // 0-1
}

export interface IAIService {
  // 单个书签分类
  classifyBookmark(bookmark: Bookmark): Promise<ClassificationResult>;

  // 批量分类
  batchClassify(bookmarks: Bookmark[]): Promise<ClassificationResult[]>;

  // 提取关键词
  extractKeywords(text: string): string[];

  // 检测内容类型
  detectContentType(url: string, title: string): ContentType;

  // 学习用户行为（可选）
  learnFromUserCorrections(
    bookmarkId: string,
    userTags: string[],
    userFolder?: string
  ): Promise<void>;
}
```

### 2.3 规则引擎设计

```typescript
// 规则配置

interface ClassificationRule {
  id: string;
  name: string;
  priority: number;
  conditions: RuleCondition[];
  actions: RuleAction;
}

interface RuleCondition {
  type: 'url' | 'title' | 'domain' | 'path';
  operator: 'contains' | 'startsWith' | 'endsWith' | 'regex' | 'exact';
  value: string;
}

interface RuleAction {
  tags: string[];
  folder?: string;
  contentType: ContentType;
}

// 示例规则库
const DEFAULT_RULES: ClassificationRule[] = [
  {
    id: 'github',
    name: 'GitHub Repos',
    priority: 100,
    conditions: [
      { type: 'domain', operator: 'exact', value: 'github.com' }
    ],
    actions: {
      tags: ['开发', '代码', 'GitHub'],
      folder: '开发/代码库',
      contentType: 'tool'
    }
  },
  {
    id: 'stackoverflow',
    name: 'Stack Overflow',
    priority: 100,
    conditions: [
      { type: 'domain', operator: 'exact', value: 'stackoverflow.com' }
    ],
    actions: {
      tags: ['开发', '问答', '技术'],
      folder: '开发/问答',
      contentType: 'documentation'
    }
  },
  {
    id: 'youtube',
    name: 'YouTube',
    priority: 90,
    conditions: [
      { type: 'domain', operator: 'exact', value: 'youtube.com' },
      { type: 'domain', operator: 'exact', value: 'youtu.be' }
    ],
    actions: {
      tags: ['视频'],
      folder: '娱乐/视频',
      contentType: 'video'
    }
  },
  {
    id: 'docs',
    name: 'Documentation',
    priority: 80,
    conditions: [
      { type: 'path', operator: 'contains', value: '/docs/' },
      { type: 'url', operator: 'regex', value: '\\.(md|txt)$' }
    ],
    actions: {
      tags: ['文档'],
      contentType: 'documentation'
    }
  }
];
```

### 2.4 URL 分析器

```typescript
// src/lib/urlAnalyzer.ts

export class UrlAnalyzer {
  // 从 URL 提取信息
  analyze(url: string): UrlInfo {
    const parsed = new URL(url);
    return {
      domain: parsed.hostname,
      path: parsed.pathname,
      query: parsed.search,
      isGitHub: this.isGitHub(parsed),
      isStackOverflow: this.isStackOverflow(parsed),
      isYouTube: this.isYouTube(parsed),
      isDocumentation: this.isDocumentation(parsed),
      isBlog: this.isBlog(parsed),
    };
  }

  private isGitHub(url: URL): boolean {
    return url.hostname === 'github.com' || url.hostname.endsWith('.github.io');
  }

  private isStackOverflow(url: URL): boolean {
    return url.hostname === 'stackoverflow.com';
  }

  private isYouTube(url: URL): boolean {
    return url.hostname === 'youtube.com' || url.hostname === 'youtu.be';
  }

  private isDocumentation(url: URL): boolean {
    return url.pathname.includes('/docs/') ||
           url.pathname.includes('/reference/') ||
           url.pathname.endsWith('.md');
  }

  private isBlog(url: URL): boolean {
    const blogIndicators = ['/blog/', '/post/', '/article/', '/news/'];
    return blogIndicators.some(indicator => url.pathname.includes(indicator));
  }
}
```

---

## 3. 链接健康检查设计

### 3.1 架构设计

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      链接健康检查架构                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                  LinkHealthService                               │    │
│  │  ┌────────────────────────────────────────────────────────────┐ │    │
│  │  │  检查调度器 (Scheduler)                                     │ │    │
│  │  │  - 定时检查 (Alarm)                                         │ │    │
│  │  │  - 增量检查 (新书签)                                        │ │    │
│  │  │  - 手动检查                                                │ │    │
│  │  └────────────────────────────────────────────────────────────┘ │    │
│  │                           │                                     │    │
│  │                           ▼                                     │    │
│  │  ┌────────────────────────────────────────────────────────────┐ │    │
│  │  │  检查执行器 (Executor)                                      │ │    │
│  │  │  ┌────────────────┐  ┌────────────────┐                   │ │    │
│  │  │  │ 批量大小控制   │  │ 频率限制      │                   │ │    │
│  │  │  │ (batchSize:10) │  │ (rateLimit)   │                   │ │    │
│  │  │  └────────────────┘  └────────────────┘                   │ │    │
│  │  └────────────────────────────────────────────────────────────┘ │    │
│  │                           │                                     │    │
│  │                           ▼                                     │    │
│  │  ┌────────────────────────────────────────────────────────────┐ │    │
│  │  │  HTTP 检查器 (Checker)                                      │ │    │
│  │  │  - HEAD 请求优先                                           │ │    │
│  │  │  - 超时控制 (5s)                                           │ │    │
│  │  │  - 重试机制 (最多 2 次)                                     │ │    │
│  │  └────────────────────────────────────────────────────────────┘ │    │
│  │                           │                                     │    │
│  │                           ▼                                     │    │
│  │  ┌────────────────────────────────────────────────────────────┐ │    │
│  │  │  结果处理器 (Processor)                                     │ │    │
│  │  │  - 更新书签状态                                            │ │    │
│  │  │  - 记录检查历史                                            │ │    │
│  │  │  - 生成健康报告                                            │ │    │
│  │  └────────────────────────────────────────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 接口设计

```typescript
// src/services/linkHealthService.ts

export interface LinkCheckResult {
  bookmarkId: string;
  url: string;
  status: number;
  isAccessible: boolean;
  responseTime: number;
  errorMessage?: string;
  checkedAt: number;
}

export interface LinkHealthReport {
  total: number;
  healthy: number;
  broken: number;
  pending: number;
  avgResponseTime: number;
  lastCheckedAt: number;
}

export interface ILinkHealthService {
  // 检查单个链接
  checkLink(url: string): Promise<LinkCheckResult>;

  // 检查书签
  checkBookmark(bookmarkId: string): Promise<LinkCheckResult>;

  // 批量检查
  checkBatch(bookmarkIds: string[], options?: {
    batchSize?: number;
    concurrency?: number;
    timeout?: number;
  }): Promise<LinkCheckResult[]>;

  // 检查所有书签
  checkAllBookmarks(): Promise<LinkHealthReport>;

  // 获取健康报告
  getHealthReport(): Promise<LinkHealthReport>;

  // 获取失效链接
  getBrokenLinks(limit?: number): Promise<Bookmark[]>;

  // 修复链接（更新 URL）
  updateUrl(bookmarkId: string, newUrl: string): Promise<void>;

  // 标记为已修复
  markAsFixed(bookmarkId: string): Promise<void>;

  // 启动定时检查
  startScheduledCheck(intervalHours: number): void;

  // 停止定时检查
  stopScheduledCheck(): void;
}
```

### 3.3 HTTP 检查器实现

```typescript
// src/lib/httpChecker.ts

export class HttpChecker {
  async check(url: string, options: CheckOptions = {}): Promise<CheckResult> {
    const {
      method = 'HEAD',
      timeout = 5000,
      maxRedirects = 3,
      retries = 2
    } = options;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const startTime = performance.now();

        const response = await fetch(url, {
          method,
          redirect: 'follow',
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        const responseTime = performance.now() - startTime;

        return {
          url,
          status: response.status,
          isAccessible: response.ok,
          responseTime,
          finalUrl: response.url,
        };
      } catch (error) {
        lastError = error as Error;
        if (attempt < retries) {
          // 指数退避
          await sleep(Math.pow(2, attempt) * 1000);
        }
      }
    }

    return {
      url,
      status: 0,
      isAccessible: false,
      responseTime: 0,
      errorMessage: lastError?.message || 'Unknown error',
    };
  }
}

interface CheckOptions {
  method?: 'HEAD' | 'GET';
  timeout?: number;
  maxRedirects?: number;
  retries?: number;
}

interface CheckResult {
  url: string;
  status: number;
  isAccessible: boolean;
  responseTime: number;
  finalUrl?: string;
  errorMessage?: string;
}
```

---

## 4. 批量操作优化设计

### 4.1 批量选择 UI

```typescript
// 批量选择模式
interface BatchSelectionState {
  mode: 'normal' | 'select';
  selectedIds: Set<string>;
  allSelected: boolean;
  filteredIds: string[]; // 当前过滤后的书签 ID
}

// 批量操作
interface BatchActions {
  selectAll: () => void;
  deselectAll: () => void;
  selectFiltered: () => void;
  invertSelection: () => void;
  deleteSelected: () => Promise<void>;
  moveToFolder: (folderId: string) => Promise<void>;
  addTags: (tags: string[]) => Promise<void>;
  removeTags: (tags: string[]) => Promise<void>;
  exportSelected: () => Promise<Blob>;
}
```

### 4.2 批量操作进度显示

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        批量操作进度对话框                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  批量删除中...                                                    │    │
│  │  ┌─────────────────────────────────────────────────────────────┐ │    │
│  │  │  ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░  45% (45/100) │ │    │
│  │  └─────────────────────────────────────────────────────────────┘ │    │
│  │                                                                   │    │
│  │  ✓ 成功: 42  ⚠ 跳过: 3  ✗ 失败: 0                               │    │
│  │                                                                   │    │
│  │                        [取消]                                     │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. 快捷键支持设计

### 5.1 快捷键配置

```typescript
// src/lib/keyboardShortcuts.ts

export interface ShortcutConfig {
  id: string;
  description: string;
  default: string;
  currentValue?: string;
  action: () => void;
}

export const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
  {
    id: 'open-popup',
    description: '打开弹出窗口',
    default: 'Alt+Shift+B',
    action: () => chrome.action.openPopup()
  },
  {
    id: 'quick-add',
    description: '快速添加当前页面',
    default: 'Alt+Shift+A',
    action: () => quickAddCurrentPage()
  },
  {
    id: 'toggle-favorite',
    description: '切换收藏状态',
    default: 'Alt+Shift+F',
    action: () => toggleFavorite()
  },
  {
    id: 'open-sidepanel',
    description: '打开侧边栏',
    default: 'Alt+Shift+S',
    action: () => chrome.sidePanel.open()
  },
  {
    id: 'search-bookmarks',
    description: '搜索书签',
    default: 'Alt+Shift+/',
    action: () => focusSearch()
  },
  {
    id: 'import-browser',
    description: '导入浏览器书签',
    default: 'Alt+Shift+I',
    action: () => importBookmarks()
  }
];
```

### 5.2 快捷键注册

```typescript
// 注册快捷键
chrome.commands.onCommand.addListener((command) => {
  const shortcut = DEFAULT_SHORTCUTS.find(s => s.id === command);
  if (shortcut) {
    shortcut.action();
  }
});

// manifest.json 需要添加:
// "commands": {
//   "open-popup": {
//     "suggested_key": {
//       "default": "Alt+Shift+B"
//     },
//     "description": "打开弹出窗口"
//   },
//   ...
// }
```

---

## 6. 文件结构更新

```
src/
├── services/
│   ├── aiService.ts          # 新增：AI 分类服务
│   ├── linkHealthService.ts  # 新增：链接健康检查
│   └── ...
├── lib/
│   ├── urlAnalyzer.ts        # 新增：URL 分析器
│   ├── httpChecker.ts        # 新增：HTTP 检查器
│   ├── keyboardShortcuts.ts  # 新增：快捷键管理
│   └── ...
├── components/
│   ├── ai/
│   │   ├── TagSuggestion.tsx     # 新增：标签建议
│   │   └── ClassificationPanel.tsx # 新增：分类面板
│   ├── linkHealth/
│   │   ├── LinkStatusIndicator.tsx # 新增：链接状态指示器
│   │   ├── HealthReport.tsx        # 新增：健康报告
│   │   └── BatchCheckDialog.tsx    # 新增：批量检查对话框
│   ├── batch/
│   │   ├── BatchActionBar.tsx      # 新增：批量操作栏
│   │   └── BatchProgressDialog.tsx  # 新增：批量进度对话框
│   └── ...
└── types/
    ├── ai.ts                # 新增：AI 相关类型
    └── linkHealth.ts        # 新增：链接健康类型
```

---

## 7. 实施计划

### 阶段 1: AI 分类 (Week 1-2)

**任务**:
- [ ] 实现 UrlAnalyzer
- [ ] 实现规则引擎
- [ ] 实现 AIService
- [ ] 添加标签建议 UI
- [ ] 添加自动分类开关

**验收标准**:
- 新增书签自动建议标签
- 用户可以接受/拒绝建议
- 建议准确率 > 60%

### 阶段 2: 链接健康检查 (Week 2-3)

**任务**:
- [ ] 实现 HttpChecker
- [ ] 实现 LinkHealthService
- [ ] 添加链接状态指示器
- [ ] 添加健康报告页面
- [ ] 实现定时检查

**验收标准**:
- 可手动检查单个链接
- 可批量检查所有书签
- 失效链接显示特殊标记
- 定期检查自动运行

### 阶段 3: 批量操作优化 (Week 3)

**任务**:
- [ ] 实现批量选择模式
- [ ] 添加批量操作栏
- [ ] 实现批量进度对话框
- [ ] 优化批量删除性能

**验收标准**:
- 可选择多个书签
- 批量操作显示进度
- 支持取消操作

### 阶段 4: 快捷键支持 (Week 4)

**任务**:
- [ ] 实现快捷键管理
- [ ] 注册 Chrome Commands
- [ ] 添加快捷键设置 UI
- [ ] 文档化快捷键

**验收标准**:
- 所有核心操作有快捷键
- 用户可自定义快捷键
- 快捷键冲突检测

---

## 8. 测试策略

### 8.1 单元测试

```typescript
// AI 分类测试
describe('AIService', () => {
  it('should classify GitHub repos correctly', async () => {
    const result = await aiService.classifyBookmark({
      url: 'https://github.com/user/repo',
      title: 'user/repo'
    });
    expect(result.suggestedTags).toContain('开发');
    expect(result.suggestedTags).toContain('GitHub');
  });

  it('should detect YouTube videos', async () => {
    const result = await aiService.classifyBookmark({
      url: 'https://youtube.com/watch?v=xxx',
      title: 'Video Title'
    });
    expect(result.contentType).toBe('video');
  });
});

// 链接检查测试
describe('LinkHealthService', () => {
  it('should detect broken links', async () => {
    const result = await linkHealthService.checkLink('https://this-domain-does-not-exist-12345.com');
    expect(result.isAccessible).toBe(false);
  });

  it('should handle timeouts', async () => {
    const result = await linkHealthService.checkLink('https://httpbin.org/delay/10', {
      timeout: 1000
    });
    expect(result.isAccessible).toBe(false);
  });
});
```

### 8.2 集成测试

```typescript
// 端到端流程测试
describe('Bookmark Classification Flow', () => {
  it('should auto-classify on add', async () => {
    // 1. 添加书签
    const bookmark = await bookmarkService.create({
      url: 'https://github.com/test/repo',
      title: 'Test Repo'
    });

    // 2. 验证自动分类
    const classified = await bookmarkService.getById(bookmark.id);
    expect(classified?.tags).toContain('开发');
  });
});
```

---

## 9. 性能优化

### 9.1 批量检查优化

```typescript
// 并发控制
class BatchExecutor {
  async execute<T, R>(
    items: T[],
    executor: (item: T) => Promise<R>,
    concurrency: number = 5
  ): Promise<R[]> {
    const results: R[] = [];
    const executing: Promise<R>[] = [];

    for (const item of items) {
      const promise = executor(item).then(result => {
        executing.splice(executing.indexOf(promise), 1);
        return result;
      });

      results.push(await promise);
      executing.push(promise);

      if (executing.length >= concurrency) {
        await Promise.race(executing);
      }
    }

    return Promise.all(results);
  }
}
```

### 9.2 缓存策略

```typescript
// 分类结果缓存
class ClassificationCache {
  private cache = new Map<string, ClassificationResult>();
  private ttl = 24 * 60 * 60 * 1000; // 24 小时

  set(url: string, result: ClassificationResult) {
    this.cache.set(url, {
      ...result,
      cachedAt: Date.now()
    });
  }

  get(url: string): ClassificationResult | null {
    const cached = this.cache.get(url);
    if (!cached) return null;

    if (Date.now() - cached.cachedAt > this.ttl) {
      this.cache.delete(url);
      return null;
    }

    return cached;
  }
}
```

---

## 10. 下一步

完成 v0.2 设计后，可以使用 `/sc:implement` 开始实现这些功能。

**优先级**:
1. **AI 分类** - 提升用户体验的核心功能
2. **链接健康检查** - 保证数据质量
3. **批量操作** - 提高效率
4. **快捷键** - 增强可访问性

---

**文档版本**: v0.2
**最后更新**: 2025-01-19
**设计师**: Claude (Sonnet 4.5)
