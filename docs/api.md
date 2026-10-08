# 智能书签 API 参考（v0.7）

本文档是「智能书签」浏览器扩展（WXT 0.20 + React 18 + TypeScript，Chrome MV3）
的 API 参考，面向**调用方**（页面、组件、测试）。架构基线是 v0.6 那次重构
（chrome.bookmarks 成为唯一数据源），此后新增的能力都叠加在它之上。

**前提约定（v0.6 重构确立的核心原则）**

- **`chrome.bookmarks` 是唯一数据源**。扩展不自建书签库，浏览器书签由 Chrome
  账号同步；读取与写入全部直连 `chrome.bookmarks`。
- 扩展自有 Dexie 数据库 **`SmartBookmarkAuxDB`** 只存浏览器书签没有的增强元数据
  （标签 / 备注 / 收藏 / 访问次数 / 死链状态 / 整理历史），按 chrome 书签节点 id
  关联，可随时重建或丢弃。
- 因此：书签的 **增删改移** 走 `browserBookmarkStore` / `browserBookmarksService`；
  **标签、收藏、备注** 走 aux 库（`auxDatabase` 或 store 的元数据动作）。
- AI 只产建议、不落盘；`organizerService` 采用 `suggest`（只读）→ `apply`（写入）
  的预览-确认模式。

**导入别名**：`@/*` → `./src/*`（见 `tsconfig.json`）。
`@/services`、`@/stores`、`@/lib` 均为聚合导出；但请注意
`src/lib/index.ts` **不包含** `deepseekClient`，该模块须从 `@/lib/deepseekClient`
单独导入。

**导出形态约定**

| 形态 | 含义 | 例子 |
|---|---|---|
| 单例 | `export const xxx = new Xxx()`，直接可用，依赖真实浏览器 API | `browserBookmarks`、`aiService`、`httpChecker` |
| 可注入的 class | 构造函数接受依赖接口，便于单测替换 | `new BrowserBookmarksService(fakeApi as BookmarksApi)` |
| 静态纯函数 | 挂在 class 上、不依赖实例状态 | `BrowserBookmarksService.groupDuplicates` |
| 工具函数 | 顶层 `export function` | `getUrlKey`、`ensureHostPermissions` |
| 未导出 | 源码中存在但无 `export`，**不可从外部调用** | `DEFAULT_RULES`、`DEFAULT_CONCURRENCY` |

## 目录

- 服务层（`src/services`）
  - [1. browserBookmarksService](#1-browserbookmarksservice) — chrome.bookmarks 薄封装
  - [2. aiService](#2-aiservice) — 本地规则分类引擎
  - [3. deepseekAIService](#3-deepseekaiservice) — DeepSeek LLM 分类
  - [4. linkHealthService](#4-linkhealthservice) — 死链检查
  - [5. organizerService](#5-organizerservice) — 智能整理（建议-确认）
  - [6. profileService](#6-profileservice) — 书签档案纯计算
- 基础库（`src/lib`）
  - [7. auxDatabase](#7-auxdatabase) — 增强元数据数据库
  - [8. httpChecker](#8-httpchecker) — HTTP 检查器
  - [9. deepseekClient](#9-deepseekclient) — DeepSeek HTTP 客户端
  - [10. messaging](#10-messaging) — 消息通信与当前页面
  - [11. logger](#11-logger) — 统一日志
  - [12. utils](#12-utils) — 通用工具函数
  - [13. urlAnalyzer](#13-urlanalyzer) — URL 分析器
- 状态管理（`src/stores`）
  - [14. browserBookmarkStore](#14-browserbookmarkstore) — 浏览器书签状态
  - [15. uiStore](#15-uistore) — UI/主题状态
- [16 类型索引](#16-类型索引)
- [17 导出形态速查](#17-导出形态速查)
- [18 相关文档](#18-相关文档)

---

## 一、服务层（`src/services`）

聚合导出：`import { ... } from '@/services'`（`src/services/index.ts` 逐个
`export *`）。

### 1. browserBookmarksService

**导入路径**：`@/services/browserBookmarksService` 或 `@/services`
**职责**：`chrome.bookmarks` 的薄封装——整树加载/规范化、事件订阅、CRUD 透传、
按路径确保文件夹、重复分组、空文件夹检测。所有写操作直连浏览器。

#### 常量

| 名称 | 值 | 说明 |
|---|---|---|
| `ROOT_ID` | `'0'` | Chrome 书签树的虚拟根节点 |
| `BOOKMARK_BAR_ID` | `'1'` | 书签栏；`createBookmark` / `createFolder` 的默认父节点 |
| `OTHER_BOOKMARKS_ID` | `'2'` | 其他书签 |

#### 类型

```ts
// 规范化后的浏览器书签事件；任何事件都意味着整树需要重载
export type BrowserBookmarkEvent =
  | { kind: 'created'; id: string }
  | { kind: 'removed'; id: string }
  | { kind: 'changed'; id: string }
  | { kind: 'moved'; id: string }
  | { kind: 'reordered'; id: string };

// chrome.bookmarks 的结构化子集，便于测试注入 mock
export interface BookmarksApi {
  getTree: () => Promise<chrome.bookmarks.BookmarkTreeNode[]>;
  getChildren: (id: string) => Promise<chrome.bookmarks.BookmarkTreeNode[]>;
  create: (bookmark: chrome.bookmarks.BookmarkCreateArg) => Promise<chrome.bookmarks.BookmarkTreeNode>;
  update: (id: string, changes: { title?: string; url?: string }) => Promise<chrome.bookmarks.BookmarkTreeNode>;
  move: (id: string, destination: { parentId?: string; index?: number }) => Promise<chrome.bookmarks.BookmarkTreeNode>;
  remove: (id: string) => Promise<void>;
  removeTree: (id: string) => Promise<void>;
  onCreated: EventLike<[string, chrome.bookmarks.BookmarkTreeNode]>;
  onRemoved: EventLike<[string, chrome.bookmarks.BookmarkRemoveInfo]>;
  onChanged: EventLike<[string, chrome.bookmarks.BookmarkChangeInfo]>;
  onMoved: EventLike<[string, chrome.bookmarks.BookmarkMoveInfo]>;
  onChildrenReordered: EventLike<[string, chrome.bookmarks.BookmarkReorderInfo]>;
}
```

> `EventLike<TArgs>` 是模块内部的私有类型，只需满足
> `{ addListener(cb); removeListener(cb) }` 结构。

#### `class BrowserBookmarksService`

可注入依赖的类：`constructor(private readonly api: BookmarksApi)`。

| 方法 | 签名 | 返回 | 语义 |
|---|---|---|---|
| `loadTree` | `loadTree(): Promise<BrowserTreeSnapshot>` | 整树快照 | 拉取 `getTree()` 的第一项作为根，展开其子根（书签栏、其他书签）。根节点 `'0'` 是虚拟节点，不进入结果；同时产出 `tree`（嵌套，供渲染）、`bookmarks`（平铺）、`folders`（平铺，不含虚拟根）。`path` 的语义：文件夹节点存的是**其父文件夹路径**（顶层根节点为 `''`），书签节点存的是**所在文件夹路径**（如 `'书签栏/开发'`），逐级以 `/` 拼接。`getTree()` 返回空数组时返回 `{ tree: [], bookmarks: [], folders: [] }` |
| `subscribe` | `subscribe(onEvent: (event: BrowserBookmarkEvent) => void): () => void` | 取消订阅函数 | 订阅 `onCreated` / `onRemoved` / `onChanged` / `onMoved` / `onChildrenReordered`，统一映射为 `BrowserBookmarkEvent`。返回的函数会逐个 `removeListener` |
| `createBookmark` | `createBookmark(input: { url: string; title?: string; parentId?: string }): Promise<chrome.bookmarks.BookmarkTreeNode>` | 新建节点 | `title` 缺省回退为 `url`，`parentId` 缺省为 `BOOKMARK_BAR_ID`（`'1'`） |
| `createFolder` | `createFolder(title: string, parentId: string = BOOKMARK_BAR_ID)` | 新建节点 | 仅传 `{ title, parentId }`，即建文件夹 |
| `updateBookmark` | `updateBookmark(id: string, changes: { title?: string; url?: string })` | 更新后的节点 | 只能改标题 / URL |
| `moveBookmark` | `moveBookmark(id: string, parentId: string, index?: number)` | 移动后的节点 | 仅当 `index !== undefined` 时才把 `index` 传给 API，避免 `index: undefined` 影响落位 |
| `remove` | `remove(id: string, isFolder: boolean): Promise<void>` | — | `isFolder` 为 `true` 走 `removeTree`，否则走 `remove` |
| `ensureFolderPath` | `ensureFolderPath(segments: string[], rootId: string = BOOKMARK_BAR_ID): Promise<string>` | 目标文件夹 id | 逐级查找或创建。会先 `segments.filter(Boolean)` 丢弃空段；每级用 `getChildren` 找到 **无 `url` 且标题完全相同** 的文件夹复用，找不到才 `create` |
| `static groupDuplicates` | `groupDuplicates(bookmarks: BrowserBookmarkNode[], meta?: Record<string, AuxBookmarkMeta>, strategy: DuplicateRetentionStrategy = 'smart'): BrowserDuplicateGroup[]` | 重复分组 | 见下 |
| `static findEmptyFolders` | `findEmptyFolders(folders: BrowserBookmarkNode[], bookmarks: BrowserBookmarkNode[]): BrowserBookmarkNode[]` | 空文件夹列表 | 既没有子文件夹、也没有书签的文件夹（叶子优先）。判定依据是 `folders`/`bookmarks` 的 `parentId` 集合 |

**`groupDuplicates` 的保留策略**

按 `getUrlKey(bookmark.url)`（规范化后去协议/`www`、小写）分组，只有组内 ≥ 2 个
节点才产出分组；无 `url` 的节点跳过。返回的 `bookmarks` 已排序，`keepId` 即
`bookmarks[0].id`。

- `strategy = 'newest'`：按 `dateAdded` 降序，最新在前。
- `strategy = 'oldest'`：按 `dateAdded` 升序，最早在前。
- `strategy = 'smart'`（默认）：加权评分降序，评分规则为

  | 加分项 | 分值 |
  |---|---|
  | `meta.isFavorite` | +1000 |
  | `meta.tags` 每有一个标签 | +100 / 个 |
  | `meta.notes` 非空白 | +50 |
  | `meta.visitCount` | +10 / 次，**上限 200** |
  | `node.path` 深度（经过人工整理） | +5 / 级 |
  | `node.dateAdded` | +`dateAdded / 1e14`（微弱平局决胜） |

  评分相同时再按 `dateAdded` 降序。

#### 单例：`browserBookmarks`

```ts
export const browserBookmarks =
  typeof chrome !== 'undefined' && chrome.bookmarks
    ? new BrowserBookmarksService(chrome.bookmarks as unknown as BookmarksApi)
    : new BrowserBookmarksService({} as BookmarksApi);
```

> ⚠️ 非扩展环境（如纯 Node 单测）下单例会用一个**空对象**伪装成 `BookmarksApi`，
> 调用任何方法都会抛错。测试请自行
> `new BrowserBookmarksService(fakeApi as BookmarksApi)`。

#### 用法示例

```ts
import {
  browserBookmarks,
  BrowserBookmarksService,
  BOOKMARK_BAR_ID,
} from '@/services/browserBookmarksService';
import type { BookmarksApi } from '@/services/browserBookmarksService';

// 1) 单例：加载整树 + 按路径确保文件夹
const snapshot = await browserBookmarks.loadTree();
console.log(snapshot.bookmarks.length, snapshot.folders.length);

const folderId = await browserBookmarks.ensureFolderPath(['开发', '文档']);
await browserBookmarks.createBookmark({
  url: 'https://react.dev/learn',
  title: 'Learn React',
  parentId: folderId,
});

// 2) 订阅事件（返回取消订阅函数）
const unsubscribe = browserBookmarks.subscribe((event) => {
  console.log('书签变化', event.kind, event.id);
});
unsubscribe();

// 3) 静态纯函数：查重与空文件夹
const groups = BrowserBookmarksService.groupDuplicates(snapshot.bookmarks, undefined, 'smart');
const emptyFolders = BrowserBookmarksService.findEmptyFolders(snapshot.folders, snapshot.bookmarks);

// 4) 测试：注入 fake api
const service = new BrowserBookmarksService(fakeChrome as unknown as BookmarksApi);
await service.loadTree();
```

---

### 2. aiService

**导入路径**：`@/services/aiService` 或 `@/services`
**职责**：**纯本地**规则分类引擎（无需 API Key，是 DeepSeek 不可用时的默认降级
方案）。基于内置分类规则 + URL 特征 + 关键词启发式产出标签/文件夹建议。

导出：`class AIService`、单例 `aiService`。
模块内部的 `DEFAULT_RULES`（18 条内置规则）**未导出**，只能通过实例方法读写。

#### 方法

| 方法 | 签名 | 返回 | 语义 |
|---|---|---|---|
| `classifyBookmark` | `classifyBookmark(bookmark: Bookmark): Promise<ClassificationResult>` | 分类结果 | 先按 `priority` 降序匹配规则，命中即返回（`confidence: 0.85`、`method: 'rule'`、`matchedRuleId`）；未命中则走关键词 + 内容类型启发式 |
| `getRules` | `getRules(): ClassificationRule[]` | 规则**副本** | 浅拷贝数组，外部改数组不影响内部 |
| `addRule` | `addRule(rule: ClassificationRule): void` | — | 追加一条规则 |
| `updateRule` | `updateRule(ruleId: string, updates: Partial<ClassificationRule>): boolean` | 是否更新成功 | 按 `id` 查找后浅合并 |
| `removeRule` | `removeRule(ruleId: string): boolean` | 是否删除成功 | 按 `id` 删除 |
| `detectContentType` | `detectContentType(url: string, title: string): ContentType` | 内容类型 | 直接代理 `urlAnalyzer.inferContentType` |

**以下是 `private` 方法，外部不可调用**：
`generateFolderFromContentType`、`extractKeywordsFromBookmark`、
`generateTagsFromKeywords`、`isCommonWord`、`findMatchingRule`、`matchesRule`、
`matchesCondition`、`evaluateOperator`。

#### 启发式分支的置信度

| 条件 | `confidence` |
|---|---|
| 命中规则 | `0.85` |
| 推断出明确内容类型（非 `other` 且非 `article`） | `0.75` |
| 兜底 `article`/`other`，且产出 ≥ 2 个标签 | `0.55` |
| 兜底且标签不足 2 个 | `0.5` |

启发式分支返回的 `method` 仍然是 `'rule'`，且不带 `matchedRuleId`。

#### 规则匹配语义

- 规则按 `priority` 降序尝试，`enabled === false` 直接跳过，**首个命中的规则胜出**。
- `matchesRule` 的语义：**同 `type` 的条件之间为 OR（任一满足），不同 `type`
  之间为 AND（每组都要满足）**。
- 条件 `type` 的取值与取值来源：
  `url` → `bookmark.url`，`title` → `bookmark.title`，`domain` → `urlInfo.domain`，
  `path` → `urlInfo.path`，`query` → `urlInfo.query`。
- 操作符：`contains`（`includes`）、`startsWith`、`endsWith`、`exact`（`===`）、
  `regex`（`new RegExp(value, 'i')`，编译失败返回 `false`）。
- 默认大小写不敏感（`caseSensitive` 缺省 `false`，两侧都 `toLowerCase()`）。

#### 未命中规则时的映射表

内容类型 → 建议文件夹（`generateFolderFromContentType`）：

| ContentType | 建议文件夹 | ContentType | 建议文件夹 |
|---|---|---|---|
| `article` | `学习/文章` | `shopping` | `购物` |
| `video` | `娱乐/视频` | `repository` | `开发/代码库` |
| `documentation` | `开发/文档` | `blog` | `学习/博客` |
| `tool` | `工具` | `forum` | `开发/问答` |
| `social` | `社交` | `other` | `undefined`（不建文件夹） |

内容类型 → 内容类型标签（`generateTagsFromKeywords`）：
`article`→`文章`、`video`→`视频`、`documentation`→`文档`、`tool`→`工具`、
`social`→`社交`、`shopping`→`购物`、`repository`→`仓库`、`blog`→`博客`、
`forum`→`论坛`、`other`→`[]`。

关键词提取与标签生成的实际约束（工程细节）：

- 只从 `title` 提取关键词；**仅当标题关键词少于 3 个**时才从 URL 补，且最多补 3 个；
  不从 `description` 提取（避免标签泛滥）。最终关键词去重后最多 8 个。
- 关键词转标签时会过滤：长度 < 2 或 > 15、命中常见词表、含 `.`、含 `-`、
  纯数字、形如 `a1`。剩余按**长度降序**取前 3 个。
- 最终标签 = 内容类型标签 + 最多 3 个关键词标签，去重后**最多 4 个**。

#### 内置规则（`DEFAULT_RULES`，18 条）

| 规则 id | 优先级 | 内容类型 | 文件夹 | 标签 | 匹配条件（简写） |
|---|---|---|---|---|---|
| `github` | 100 | `repository` | `开发/代码库` | 开发、代码、GitHub | domain `exact` `github.com`；domain `endsWith` `.github.io` |
| `stackoverflow` | 100 | `forum` | `开发/问答` | 开发、问答、技术 | domain `exact` `stackoverflow.com` |
| `mdn` | 95 | `documentation` | `开发/文档` | 开发、文档、MDN、Web | domain `exact` `developer.mozilla.org` |
| `youtube` | 90 | `video` | `娱乐/视频` | 视频 | domain `exact` `youtube.com` / `youtu.be` |
| `bilibili` | 90 | `video` | `娱乐/视频` | 视频、B站 | domain `exact` `bilibili.com` |
| `frontend-frameworks` | 85 | `documentation` | `开发/前端` | 开发、前端、框架 | domain `exact` `react.dev` / `vuejs.org` / `angular.io` / `angular.dev` / `svelte.dev` / `nextjs.org` / `nuxt.com`；domain `endsWith` `.vuejs.org` |
| `dev-runtimes` | 85 | `documentation` | `开发/前端与工具链` | 开发、工具链、JavaScript | domain `exact` `typescriptlang.org` / `nodejs.org` / `bun.sh` / `deno.land` / `vitejs.dev` / `webpack.js.org` |
| `programming-languages` | 85 | `documentation` | `开发/编程语言` | 开发、编程语言 | domain `exact` `go.dev` / `golang.org` / `rust-lang.org` / `python.org` |
| `ai-tools` | 85 | `tool` | `AI/工具与模型` | AI、大模型、工具 | domain `exact` `chatgpt.com` / `openai.com` / `claude.ai` / `deepseek.com` / `huggingface.co` |
| `docs` | 80 | `documentation` | —（无） | 文档 | path `contains` `/docs/` `/doc/` `/documentation/` `/api/` `/reference/` |
| `css-ui` | 80 | `documentation` | `开发/前端` | 开发、UI、前端 | domain `exact` `tailwindcss.com` / `getbootstrap.com` / `ant.design` / `mui.com` |
| `tech-communities` | 80 | `blog` | `学习/技术社区` | 技术、博客、社区 | domain `endsWith` `juejin.cn` / `csdn.net` / `segmentfault.com` / `cnblogs.com`；domain `exact` `v2ex.com` |
| `productivity-notes` | 80 | `tool` | `办公/知识库` | 办公、知识库、协作 | domain `exact` `notion.so`；domain `endsWith` `yuque.com` / `wolai.com` / `feishu.cn` |
| `design-tools` | 80 | `tool` | `设计/灵感与工具` | 设计、工具、素材 | domain `exact` `figma.com` / `canva.com` / `dribbble.com` / `behance.net` |
| `shopping` | 75 | `shopping` | `购物` | 购物 | domain `endsWith` `amazon.com` / `amazon.cn` / `taobao.com` / `tmall.com` / `jd.com` |
| `knowledge-wiki` | 75 | `article` | `学习/知识库` | 学习、百科、问答 | domain `endsWith` `wikipedia.org` / `baike.baidu.com` / `zhihu.com` |
| `blog` | 70 | `blog` | —（无） | 博客 | path `contains` `/blog/` `/post/` `/posts/` `/article/` |
| `social` | 70 | `social` | `社交` | 社交 | domain `exact` `twitter.com` / `x.com` / `facebook.com` / `instagram.com` / `linkedin.com` / `reddit.com` |

#### 用法示例

```ts
import { aiService } from '@/services/aiService';
import { getUrlKey } from '@/lib/utils';
import type { Bookmark } from '@/types';

const url = 'https://react.dev/learn';
const bookmark: Bookmark = {
  id: 'preview',
  url,
  urlKey: getUrlKey(url),
  title: 'Learn React',
  description: 'React 官方教程',
  tags: [],
  createdAt: 0,
  updatedAt: 0,
  visitCount: 0,
  isFavorite: false,
  isArchived: false,
  status: 'active',
  aiGenerated: false,
};

const result = await aiService.classifyBookmark(bookmark);
// { suggestedFolder: '开发/前端', suggestedTags: [...], contentType: 'documentation',
//   confidence: 0.85, method: 'rule', matchedRuleId: 'frontend-frameworks' }
console.log(result.suggestedFolder, result.suggestedTags, result.confidence, result.matchedRuleId);

// 规则管理
const rules = aiService.getRules();
aiService.addRule({
  id: 'my-docs',
  name: '我的文档',
  priority: 60,
  enabled: true,
  conditions: [{ type: 'domain', operator: 'exact', value: 'example.com' }],
  actions: { tags: ['自建'], folder: '自建/文档', contentType: 'documentation' },
});
aiService.updateRule('my-docs', { priority: 90 });
aiService.removeRule('my-docs');

// 内容类型检测
aiService.detectContentType('https://youtube.com/watch?v=1', '视频标题'); // 'video'
```

---

### 3. deepseekAIService

**导入路径**：`@/services/deepseekAIService` 或 `@/services`
**职责**：DeepSeek LLM 驱动的书签分类（**可选**，需用户在设置页配置）；带本地
缓存、成本统计、失败回退本地规则。

导出：`class DeepSeekAIService`、单例 `deepSeekAIService`。
未导出：`DEFAULT_PROMPT_TEMPLATES`（3 个模板）、`TOKEN_PRICE`、模块级 `logger`。

#### 配置来源

API Key 不存在 `.env`，而是由设置页写入 **`chrome.storage.local` 的
`deepseekConfig`**（`src/components/ai/DeepSeekConfig.tsx`），字段见
[16 类型索引](#16-类型索引)的 `@/types` 版 `DeepSeekConfig`。

#### 方法

| 方法 | 签名 | 返回 | 语义 |
|---|---|---|---|
| `initialize` | `initialize(config: DeepSeekConfig): Promise<void>` | — | 保存配置；**仅当 `config.enabled && config.apiKey`** 时才创建客户端，并异步 `loadCache()` + `loadCostStats()`。未启用时不会创建客户端 |
| `classifyBookmark` | `classifyBookmark(bookmark: Bookmark, templateId?: string): Promise<LLMClassificationResult>` | LLM 结果 | 未初始化/未启用时抛 `Error('DeepSeek AI service is not initialized or disabled')`。先查缓存（24h 内直接返回并 `hitCount++`）；`templateId` 不在 3 个模板中则回退模板 `default-classify` |
| `batchClassify` | `batchClassify(bookmarks: Bookmark[], options: BatchClassifyOptions = {}): Promise<LLMClassificationResult[]>` | 结果数组（**与入参同序、同长度**） | 见下 |
| `getCostStats` | `getCostStats(): CostStats` | 统计快照 | **同步**方法，返回浅拷贝（改动返回值不影响内部状态） |
| `clearCache` | `clearCache(): Promise<void>` | — | 清空内存缓存并 `chrome.storage.local.remove('deepseekClassificationCache')` |
| `testConnection` | `testConnection(): Promise<boolean>` | 是否连通 | 未创建客户端时直接 `false`；内部异常也吞掉返回 `false` |
| `getPromptTemplates` | `getPromptTemplates(): PromptTemplate[]` | 3 个模板 | 直接返回模块级模板数组（**非副本**） |

`private`（不可外部调用）：`checkInitialized`、`buildBatchPrompt`、
`getBatchSystemPrompt`、`injectFolderTree`、`parseBatchClassificationResponse`、
`getDefaultResult`、`buildPrompt`、`parseClassificationResponse`、`getCacheKey`、
`loadCache`、`saveCache`、`loadCostStats`、`saveCostStats`、`updateCostStats`、
`delay`。

#### `classifyBookmark` 细节

- **缓存键**：`` `${url}|${title}` ``；有效期 **24 小时**（`expiresAt = Date.now() + 24*60*60*1000`）。
- 请求参数：`model = config.model || 'deepseek-chat'`，
  `temperature = template.temperature ?? config.temperature ?? 0.3`，
  `max_tokens = template.maxTokens ?? config.maxTokens ?? 500`。
- 响应用正则 `/\{[\s\S]*\}/` 抠 JSON；解析失败返回
  `{ suggestedTags: [], contentType: 'other', confidence: 0, method: 'llm', reasoning: '解析失败' }`。
- 结果会补 `modelUsed`（响应 `model`）、`tokensUsed`（`usage.total_tokens`）、
  `cost`（`total_tokens * TOKEN_PRICE`，`TOKEN_PRICE = 0.000001`，即 ¥1/百万 tokens）。
- **调用失败回退**：走后 `await aiService.classifyBookmark(bookmark)`，返回
  `{ ...localResult, method: 'rule', reasoning: 'LLM 调用失败，使用本地规则分类' }`。

#### `batchClassify` 细节

`BatchClassifyOptions` 的解构默认值为
`{ batchSize = 20, onProgress, fallbackToLocal = true, folderTree }`。

- **`batchSize` 默认 20**，并被强制收敛到 **[10, 50]** 区间；被修正时通过
  `logger.warn` 记录。
- **`folderTree` 是用户现有文件夹的完整路径**（如 `"开发/前端"`），只影响系统
  提示词：每批都用 `getBatchSystemPrompt(folderTree)` 构建 system message，
  它把基础提示词交给私有 `injectFolderTree(prompt, folderTree)`：对路径做归一化
  （去掉开头的 `书签栏/`、`其他书签/` 前缀与尾部 `/`，再 `trim()`）、过滤空串、
  去重、**最多展示 60 个**（超出时追加一句"文件夹较多，仅展示前 60 个"），并在
  提示词末尾追加第 5 条规则"**优先使用用户现有文件夹**"（`suggestedFolder`
  应优先映射到这些路径，确实都不合适时才建议新文件夹）。`folderTree` 为空时
  提示词原样返回。
- 先扫一遍缓存，命中项直接落到结果数组的**原位**，未命中项才进入批量请求；
  因此返回数组与入参**等长同序**。
- 每批一次 `chatCompletions`：`temperature = config.temperature ?? 0.3`，
  `max_tokens = min(validBatchSize * 300, 4000)`；用正则
  `\[[\s\S]*\]` 抠出 JSON 数组，解析失败时整批填 `getDefaultResult()`。
- 整批 token 按书签**均摊**（`tokensPerItem = ceil(total_tokens / batch.length)`），
  同时更新 `deepseekCostStats`。
- 批失败时：`fallbackToLocal === true` 才逐条回退本地规则（`reasoning` 为
  `'LLM批量调用失败，使用本地分类'`）；否则该批**不写入任何位置**——由于实现是
  `results[index] = ...` 按位赋值，返回数组可能**短于入参**（中间批成功、首尾批失败时
  还会出现空洞），**调用方必须按位判空**（`organizerService` 就是这么做的）。
- 每批结束回调 `onProgress(results.filter(r => r).length, total)`；
  批与批之间 `await delay(500)` 以避免限流。

#### 缓存与成本统计的持久化

| storage key | 内容 | 说明 |
|---|---|---|
| `deepseekClassificationCache` | `Record<cacheKey, ClassificationCache>` | 由 `saveCache()` 整体覆写；结构见 `ClassificationCache` |
| `deepseekCostStats` | `CostStats` | `updateCostStats` 累计 `totalTokens`/`totalCost`/`classifyCount`/`avgCostPerClassify`，并按 `date`（`YYYY-MM-DD`）维护 `dailyStats`，**只保留最近 30 天**（`slice(-30)`） |

#### 用法示例

```ts
import { deepSeekAIService } from '@/services/deepseekAIService';
import { getUrlKey } from '@/lib/utils';
import type { Bookmark, DeepSeekConfig } from '@/types';

// 配置由设置页写入 chrome.storage.local.deepseekConfig
const stored = await chrome.storage.local.get('deepseekConfig');
const config = stored.deepseekConfig as DeepSeekConfig;

await deepSeekAIService.initialize(config);

const url = 'https://react.dev/learn';
const bookmark: Bookmark = {
  id: '42',
  url,
  urlKey: getUrlKey(url),
  title: 'Learn React',
  tags: [],
  createdAt: 0,
  updatedAt: 0,
  visitCount: 0,
  isFavorite: false,
  isArchived: false,
  status: 'active',
  aiGenerated: false,
};

const single = await deepSeekAIService.classifyBookmark(bookmark);          // 默认模板
const tech = await deepSeekAIService.classifyBookmark(bookmark, 'tech-classify');

const batch = await deepSeekAIService.batchClassify([bookmark], {
  batchSize: 20,
  fallbackToLocal: true,
  folderTree: ['开发/前端', '学习/文章'],
  onProgress: (current, total) => console.log(`${current}/${total}`),
});

const stats = deepSeekAIService.getCostStats(); // 同步
console.log(stats.totalTokens, stats.totalCost, stats.avgCostPerClassify);

console.log(deepSeekAIService.getPromptTemplates().map((t) => t.id));
// ['default-classify', 'tech-classify', 'shopping-classify']

if (await deepSeekAIService.testConnection()) {
  await deepSeekAIService.clearCache();
}
```

---

### 4. linkHealthService

**导入路径**：`@/services/linkHealthService` 或 `@/services`
**职责**：输入浏览器书签节点，批量检查链接可达性；结果写入 aux（`linkChecks`
历史 + `bookmarkMeta.linkStatus`）。手动触发、可停止、支持跳过近期已检查项。

#### 导出

| 导出 | 签名 | 说明 |
|---|---|---|
| `type LinkVerdict` | `'active' \| 'broken' \| 'unknown'` | 状态码判定结果 |
| `classifyLinkStatus` | `classifyLinkStatus(status: number): LinkVerdict` | 纯函数，见下表 |
| `nextDomainInterval` | `nextDomainInterval(current: number, statusCode: number): number` | 同域名间隔自适应：`429`/`503` → `min(current * 2, 4000)`；`2xx`/`3xx` → `max(250, floor(current / 2))`；其他 → 原值 |
| `HOST_ORIGINS` | `['http://*/*', 'https://*/*']` | 权限申请用的 origin 列表 |
| `ensureHostPermissions` | `ensureHostPermissions(): Promise<boolean>` | 申请网站访问权限。已授权直接 `true`；非扩展环境（无 `chrome.permissions`）返回 `true`；异常返回 `false`。**必须在用户手势中调用**（如按钮点击） |
| `isCheckableUrl` | `isCheckableUrl(url?: string): boolean` | 仅 `http:`/`https:` 返回 `true`；`chrome://`、`javascript:`、`file://` 等返回 `false`；URL 解析失败返回 `false` |
| `selectCheckableNodes` | `selectCheckableNodes(nodes: BrowserBookmarkNode[], meta: Record<string, AuxBookmarkMeta>, options?: SelectCheckableOptions, nowTs?: number): BrowserBookmarkNode[]` | **纯函数**：挑出本轮真正要检查的节点——过滤非 http(s)、白名单域名（含子域名）、`linkStatusManual` 人工标记、以及仍在 `skipRecentHours` 窗口内的；`options.force` 只忽略后两者。`checkBookmarks` 内部也用它，手动扫描与后台定时自动扫描因此共用同一套规则 |
| `interface SelectCheckableOptions` | `{ skipRecentHours?: number; whitelist?: string[]; force?: boolean }` | 与 `BatchCheckOptions` 的对应字段同义（结构兼容） |
| `class LinkHealthService` | — | 见下 |
| 单例 `linkHealthService` | `new LinkHealthService()` | 默认实例 |

**未导出**（不可调用）：`isWhitelisted`、`isRootUrl`、`DomainQueue`、
`recentRecords`（私有方法），以及模块常量 `DEFAULT_CONCURRENCY = 5`、
`SAME_DOMAIN_INTERVAL_MS = 250`、`MAX_DOMAIN_INTERVAL_MS = 4000`、
`UNREACHABLE_THRESHOLD = 3`。

`classifyLinkStatus` 判定表：

| 状态码 | 判定 | 理由 |
|---|---|---|
| `200`–`399` | `active` | 正常/重定向 |
| `401`, `403`, `405`, `408` | `active` | 可达但拒绝/受限（如 Cloudflare 拦截）；能回应就说明活着 |
| `429` | `unknown` | 限流：服务器活着，但没有资源状态的证据 |
| 其他（含 `404`/`410`/`5xx`） | `broken` | — |

#### `class LinkHealthService` 方法

| 方法 | 签名 | 返回 | 语义 |
|---|---|---|---|
| `stopCheck` | `stopCheck(): void` | — | 置停止标记；进行中的 worker 在下一次循环退出 |
| `isCheckRunning` | `isCheckRunning(): boolean` | 是否运行中 | — |
| `checkBookmarks` | `checkBookmarks(nodes: BrowserBookmarkNode[], options: BatchCheckOptions = {}, onProgress?: (progress: CheckProgress) => void): Promise<LinkCheckResult[]>` | 本次实际检查的结果 | 见下。**已在运行时抛** `Error('已有检查正在进行中，请先停止或等待完成')` |
| `markAsHealthy` | `markAsHealthy(bookmarkIds: string[]): Promise<void>` | — | 人工标记为正常：写入 `linkStatus: 'active'` + `linkStatusManual: true`，后续自动扫描不再改判 |
| `getHealthReport` | `getHealthReport(nodes: BrowserBookmarkNode[], meta: Record<string, AuxBookmarkMeta>): Promise<LinkHealthReport>` | 健康报告 | 基于**传入快照**统计 `active`/`broken`/`unreachable`，其余计入 `pending`；**零查询聚合**——不再查 `linkChecks` 表，`lastCheckedAt` 取已判定（`linkStatus` 为 `active`/`broken`/`unreachable`）记录中 `meta.linkCheckedAt` 的最大值，`avgResponseTime` 为这些记录 `meta.lastResponseTime` 的平均值（仅 `typeof === 'number' && > 0` 的样本计入，无样本时为 `0`） |
| `getCheckHistory` | `getCheckHistory(bookmarkId: string, limit = 10): Promise<LinkCheckRecord[]>` | 历史记录 | 按 `checkedAt` 降序取前 `limit` 条 |
| `resetCheckResults` | `resetCheckResults(): Promise<void>` | — | 清空 `linkChecks`，并把每条 `bookmarkMeta` **重写为只含** `bookmarkId/tags/notes/isFavorite/visitCount/lastVisited/aiGenerated`（即抹掉 `linkStatus`/`linkCheckedAt`/`lastStatusCode`/`lastErrorMessage`/`lastResponseTime`/`linkStatusManual`）。运行中抛 `Error('A check is running')` |
| `cleanupOldRecords` | `cleanupOldRecords(daysToKeep = 30): Promise<number>` | 删除条数 | 以 `cutoff = now() - daysToKeep * 24 * 3600_000` 为界，删除 `checkedAt < cutoff` 的全部记录（Dexie `where('checkedAt').below(cutoff).delete()`） |

#### `checkBookmarks` 的完整行为

**1）先筛掉不检查的项**（计入 `skipped`，不出现在结果里）：

- 无 `url` 或 `!isCheckableUrl(url)`；
- 命中 `options.whitelist`（精确域名**或子域名**，如 `example.com` 覆盖
  `docs.example.com`）；
- `meta.linkStatusManual === true` 且 `options.force !== true`；
- `options.skipRecentHours` 窗口内已检查过（`now() - meta.linkCheckedAt < skipRecentHours * 3600_000`）
  且 `options.force !== true`。
- `options.force` 语义：**忽略跳过窗口与人工标记**，用于单条/所选重查。

**2）并发模型**：`concurrency = max(1, options.concurrency ?? 5)`，但 worker 数量为
`min(concurrency, max(域名队列数, 1))`。**同域名串行 + 保持间隔，不同域名并行**：
每个域名队列有独立 `intervalMs`（初始 250ms）与 `nextAvailableTime`；worker 处理完
一个请求后按 `nextDomainInterval` 更新该域名冷却时间，并立刻转去处理其他可用域名
（不闲置等待）。相关域名都在冷却时 `sleep(25)` 后重试。

**3）单条检查流程**：

- 根路径书签（`pathname` 为 `''` 或 `'/'`，即首页）直接用 **GET** 检查，顺带做
  软 404 检测；其余用 **HEAD**。
- HEAD 结果为 `broken` 且不是网络层失败时，**用 GET 复核一次**——不少站点/WAF
  对 HEAD 返回 404/5xx 但 GET 正常。GET 没网络错误就采信 GET 结果。
- 每次请求都往 `auxDb.linkChecks` 追加一条 `LinkCheckRecord`（含 `networkError` 标记）。

**4）判定与改判规则**（`newStatus` / `keepStatus`）：

| 情况 | 结果 |
|---|---|
| 网络层失败，`errorKind` 为 `timeout` 或 `network` | 连同历史记录统计「连续网络失败轮数」，自本次起 **≥ 3 轮** 才标 `unreachable`；否则 `keepStatus`（保持原状态，但**仍更新检查时间**） |
| 网络层失败，`errorKind` 为 `ssl` 或 `blocked` | `keepStatus`（环境问题，不动状态） |
| `soft404 === true` | `broken` |
| 状态码判定 `active` | `active` |
| 状态码判定 `unknown`（429） | `keepStatus`（并对该域名指数退避） |
| `404` / `410` | `broken`（明确失效，立即标死） |
| 其他 `broken`（4xx/5xx） | **需要上一轮也是 `broken`** 才标 `broken`，否则 `keepStatus`（可能是瞬时故障） |

判定历史用 `recentRecords` 按**记录排除**而非时间戳截断，避免同毫秒写入时漏掉
上一轮结果。

**5）写库策略**：`base = meta ?? defaultMeta(bookmarkId)`，写
`linkCheckedAt` / `lastStatusCode` / `lastErrorMessage` / `lastResponseTime`
（即 `check.responseTime`）；仅在 `!keepStatus` 时写
`linkStatus`。**例外**：`networkError && errorKind === 'blocked'`（无主机权限导致的
无效检查）**完全不写 meta**，也不占跳过窗口，授权后下次检查即可重新覆盖。

**6）结果与计数**：`LinkCheckResult` 只包含实际发起过请求的项（`skipped` 不在其中）。
`success` 计 `active`，`failed` 计 `broken`/`unreachable`，其余（网络失败/待确认/限流）
计入 `skipped`。`onProgress` 回调里 `total` 是**待检查项数**（不含跳过项），
并给出 `estimatedRemaining`。

#### 用法示例

```ts
import { linkHealthService, ensureHostPermissions } from '@/services/linkHealthService';
import { useBrowserBookmarkStore } from '@/stores/browserBookmarkStore';

// 1) 必须有主机权限，否则跨源 fetch 受 CORS 限制，大多数站点无法检测
//    必须在用户手势（按钮点击）中调用
const granted = await ensureHostPermissions();
if (!granted) {
  console.warn('未授权，检查会返回 blocked');
}

// 2) 确保快照就绪
await useBrowserBookmarkStore.getState().init();
const nodes = useBrowserBookmarkStore.getState().bookmarks;

const results = await linkHealthService.checkBookmarks(
  nodes,
  {
    concurrency: 5,
    timeout: 5000,
    retries: 1,
    skipRecentHours: 24,
    whitelist: ['localhost', 'intranet.example.com'],
    force: false,
  },
  (progress) => {
    console.log(
      `${progress.completed}/${progress.total} 正常 ${progress.success} ` +
      `失效 ${progress.failed} 跳过 ${progress.skipped}`
    );
  }
);
console.log('本次检查', results.length, '条');

// 3) 停止
// linkHealthService.stopCheck();

// 4) 结果已写入 aux，刷新 store 的 meta 映射后再取报告
await useBrowserBookmarkStore.getState().refresh();
const { bookmarks, meta } = useBrowserBookmarkStore.getState();
const report = await linkHealthService.getHealthReport(bookmarks, meta);
console.log(report.total, report.healthy, report.broken, report.unreachable, report.pending);

// 5) 人工放行 + 历史
await linkHealthService.markAsHealthy([nodes[0].id]);
const history = await linkHealthService.getCheckHistory(nodes[0].id, 10);

// 6) 维护
await linkHealthService.cleanupOldRecords(30); // 返回删除条数
await linkHealthService.resetCheckResults();   // 清空检查结果（用于纠正历史误判）
```

#### 扫描设置：`@/lib/scanSettings`

设置原本放在 `ScanSettingsPanel.tsx` 里，抽出来是因为后台（Service Worker）的定时
自动扫描也要读它——组件文件带着 React，后台不能引。**未收录进 `@/lib` 聚合导出**。

```ts
export interface ScanSettings {
  timeout: number;          // 超时（秒）
  concurrency: number;      // 并发数
  retries: number;          // 重试次数
  skipRecentHours: number;  // 跳过最近检查过的（小时）
  whitelist: string[];      // 白名单域名（含子域名）
  autoScanEnabled: boolean; // 定时自动检查开关
  autoScanIntervalHours: number; // 自动检查间隔（小时）
}

export const DEFAULT_SCAN_SETTINGS: ScanSettings = {
  timeout: 10, concurrency: 5, retries: 2, skipRecentHours: 24, whitelist: [],
  autoScanEnabled: false, autoScanIntervalHours: 24,
};
export const SCAN_SETTINGS_KEY = 'scan_settings'; // chrome.storage.local 的键，别改

export function loadScanSettings(): Promise<ScanSettings>;
export function saveScanSettings(settings: ScanSettings): Promise<void>;
export function toBatchCheckOptions(settings: ScanSettings): BatchCheckOptions; // timeout 秒 → 毫秒
```

`loadScanSettings` 会把读到的值合并到默认值之上（老版本缺字段时也能用），
读取失败时返回默认值并 `logger.error`。

#### 定时自动检查：`@/services/linkHealthAutoScan`

跑在 Service Worker 里。**分片可续跑**是这里的核心约束：MV3 的 SW 随时可能被杀，
一口气检查完整库等于把结果赌在"这次不被杀"上，因此每次闹钟只检查一批，进度落
`chrome.storage.local`，有剩余就安排 1 分钟后的续跑闹钟。

```ts
export const AUTO_SCAN_ALARM = 'link-health-check';              // 周期闹钟名
export const AUTO_SCAN_CONTINUE_ALARM = 'link-health-check-continue';
export const AUTO_SCAN_PROGRESS_KEY = 'linkHealthAutoScanProgress';
export const AUTO_SCAN_BATCH_SIZE = 40;      // 每批最多检查条数
export const AUTO_SCAN_STALE_MS = 5 * 60_000; // runningSince 超过此时长视为上次已死
export const AUTO_SCAN_MIN_INTERVAL_HOURS = 1;

export interface AutoScanProgress {
  runningSince?: number;   // 仅某批进行中时存在
  startedAt: number;       // 本轮开始时间
  checked: number;         // 本轮已检查条数
  lastFinishedAt?: number; // 最近一次跑完全部候选
  lastError?: string;      // 最近一次失败原因
}

export function runAutoScanTick(deps?: Partial<AutoScanDeps>): Promise<AutoScanTickResult>;
export function syncAutoScanAlarm(settings: ScanSettings): Promise<void>;
export function ensureAutoScanAlarm(): Promise<void>;  // 读设置后同步（后台启动时用）
```

| 函数 | 语义 |
|---|---|
| `runAutoScanTick` | 跑一批。返回 `{ skipped?, checked, remaining, finished }`；`skipped` 取 `'disabled'`（未开启）或 `'running'`（上一批还在跑、或 `runningSince` 未过期）。没有候选时直接判定本轮结束并写 `lastFinishedAt`；有候选则取前 `AUTO_SCAN_BATCH_SIZE` 条检查，之后清掉"进行中"标记——还有剩余就 `scheduleContinue()`，否则 `clearContinue()` 并记完成时间。单批抛错不丢进度，记入 `lastError` |
| `syncAutoScanAlarm` | 关掉就 `clear` 两个闹钟；开着则按 `autoScanIntervalHours` 重建周期闹钟（`delayInMinutes` 同间隔，避免开扩展就突发请求）。无 `chrome.alarms` 时直接返回 |
| `ensureAutoScanAlarm` | `loadScanSettings()` 后调 `syncAutoScanAlarm`，后台启动时调用，保证闹钟与设置不漂移 |

`AutoScanDeps` 把设置读取、书签/元数据加载、实际检查、进度读写、续跑闹钟调度
与 `now()` 全部做成可注入项，默认接真实实现，测试里逐项替换即可（不需要 chrome
或 IndexedDB）。

**与手动扫描的关系**：两者共用 `selectCheckableNodes` 的跳过规则，默认 24 小时的
"跳过最近检查过的"窗口让刚手动扫过的书签不会被自动扫描重复检查。极端情况下
（手动扫描进行中恰好有闹钟触发）可能重叠少量重复请求，结果一致，因此不做额外的
跨上下文加锁。

---

### 5. organizerService

**导入路径**：`@/services/organizerService` 或 `@/services`
**职责**：智能整理 v2——**预览-确认模式**。`suggest` 只读地生成建议，用户勾选后
`apply` 执行：移动走 `chrome.bookmarks`，标签写 aux，全程记录整理历史并支持撤销。

#### 导出

| 导出 | 类型 | 说明 |
|---|---|---|
| `interface OrganizeSuggestion` | 类型 | 单条建议，见下 |
| `interface SuggestOptions` | 类型 | `minConfidence?` / `engine?` / `moveBookmarks?` / `applyTags?` / `folderPaths?` |
| `interface ApplyResult` | 类型 | `{ applied, moved, tagged, errors }` |
| `isDeepSeekEnabled` | `() => Promise<boolean>` | 读 `chrome.storage.local.deepseekConfig`，返回 `Boolean(config?.enabled && config?.apiKey)`；异常返回 `false` |
| `class OrganizerService` | 类 | 见下 |
| 单例 `organizerService` | `new OrganizerService()` | — |

```ts
export interface OrganizeSuggestion {
  node: BrowserBookmarkNode;          // 原始浏览器书签节点
  suggestedFolderPath?: string;       // 相对书签栏的路径，如 '开发/文档'
  suggestedTags: string[];            // 已排除现有标签
  confidence: number;
  reason: string;                     // 'DeepSeek 分类' | '规则引擎匹配'
  engine: 'rule' | 'deepseek';
}

export interface SuggestOptions {
  minConfidence?: number;   // 默认 0.6
  engine?: 'auto' | 'rule'; // 默认 'auto'
  moveBookmarks?: boolean;  // 默认 true
  applyTags?: boolean;      // 默认 true
  folderPaths?: string[];   // 用户现有文件夹完整路径（如 '开发/前端'），作为 AI 分类目标结构
}

export interface ApplyResult {
  applied: number;
  moved: number;
  tagged: number;
  errors: string[];
}
```

> 模块内部函数 `toClassifierInput(node, meta?)`（把浏览器节点 + meta 适配成分类器
> 需要的 `Bookmark` 形状）**未导出**。

#### `class OrganizerService` 方法

| 方法 | 签名 | 返回 | 语义 |
|---|---|---|---|
| `suggest` | `suggest(nodes: BrowserBookmarkNode[], meta: Record<string, AuxBookmarkMeta>, options: SuggestOptions = {}): Promise<OrganizeSuggestion[]>` | 建议列表 | **纯只读，不写任何数据**（除按需初始化 DeepSeek 服务外） |
| `apply` | `apply(suggestions: OrganizeSuggestion[]): Promise<ApplyResult>` | 执行结果 | 移动直写 `chrome.bookmarks`，标签写 aux，记录 `organizeHistory`；**应用成功**的高置信度 AI 建议还会按域名学习回流 |
| `rollback` | `rollback(historyId: string): Promise<{ restored: number; errors: string[] }>` | 撤销结果 | 见下 |
| `getHistory` | `getHistory(limit = 20): Promise<OrganizeHistory[]>` | 历史（新在前） | 按 `timestamp` 降序取前 `limit` 条 |
| `deleteHistory` | `deleteHistory(historyId: string): Promise<void>` | — | 删一条 |
| `clearHistory` | `clearHistory(): Promise<void>` | — | 清空 |

#### `suggest` 的行为

1. `targets = nodes.filter((node) => node.url)`——只处理有 URL 的节点，再逐个
   `toClassifierInput(node, meta[node.id])` 适配成分类器输入 `inputs`。
2. **规则先行（免费、确定、含学到的规则）**：先读
   `chrome.storage.local.learnedDomainRules`（`loadLearnedRules`，实现见
   [`@/lib/learnedRules`](#学习规则liblearnedrules)），然后
   `Promise.all` 逐条并发判定：`matchLearnedRule(rules, url)` 命中（按
   `getDomain(url).toLowerCase()` 查表）就返回学习结果（`confidence: 0.9`、
   `matchedRuleId: 'learned:<domain>'`），未命中的才跑本地规则引擎
   `aiService.classifyBookmark(input)`。**不再调用 `aiService.batchClassify`**。
3. **AI 只处理长尾**：`engine === 'auto'`（默认）**且**
   `await isDeepSeekEnabled()` 为真时，取 `!results[i].matchedRuleId` 的下标
   （即学习规则与内置规则都没命中的长尾），读
   `chrome.storage.local.deepseekConfig` 并 `deepSeekAIService.initialize(config)`，
   再 `deepSeekAIService.batchClassify(长尾 inputs, { batchSize: 20, folderTree: folderPaths })`；
   返回结果逐条**原位覆盖** `results[i]` 并记入 `aiHandled`（该集合决定每条建议的
   `engine`）。
4. **AI 抛错时保留规则结果**：整段 `try/catch` 静默吞掉异常，已算出的规则结果
   原样保留（不再整体回退成本地批量分类）。
5. 逐条过滤：`!result || result.confidence < minConfidence` 直接丢弃。
6. `moveBookmarks` 为假时 `folder = undefined`；否则取 `result.suggestedFolder`。
   若目标文件夹与书签**当前所在目录一致**（两侧都去掉开头的 `书签栏/`、`其他书签/`
   及尾部 `/` 并 `trim()` 后比较），则取消移动建议。
7. `applyTags` 为假时 `tags = []`；否则用 `result.suggestedTags` 过滤掉
   `meta[node.id].tags` 中已有的标签。
8. **既没有文件夹建议、也没有新标签时不产出建议**。
9. `reason` 取 `'DeepSeek 分类'` 或 `'规则引擎匹配'`；`engine` 是**逐条判定**的
   ——只有该条被 AI 接管（在 `aiHandled` 中）才是 `'deepseek'`，其余（学习规则
   命中、内置规则命中、AI 未启用）都是 `'rule'`。

#### `apply` 的行为

逐条 `try/catch`（单条失败只记入 `errors`，不影响其余）：

- 有 `suggestedFolderPath` 时：`ensureFolderPath(suggestedFolderPath.split('/'))`
  得到 `folderId`；**仅当 `folderId !== suggestion.node.parentId`** 才
  `moveBookmark(node.id, folderId)` 并 `moved++`。
- 有 `suggestedTags` 时：读 `auxDb.bookmarkMeta.get(node.id) ?? defaultMeta(node.id)`，
  以 `tags: [...new Set([...base.tags, ...suggestedTags])]` 与 `aiGenerated: true`
  写回，`tagged++`。
- 发生过移动或打标则追加一条 `OrganizeChange`（`type` 为 `'move'` 或 `'tag'`）。
- 每条都 `applied++`（无论是否真的产生变更）；**只有整条 try 块没抛错**的建议才
  进入 `appliedSuggestions`，供下面的学习回流使用。
- `errors` 的文案为 `` `${node.title || node.url}: ${error.message}` ``。
- `applied > 0` 时写一条 `organizeHistory`。新流程没有"策略/阈值"这类输入，因此
  `options` 记录的是**从本次执行推导出的等价信息**，不是用户输入：
  `strategy` 固定 `'auto'`、`createNewFolders` 恒 `true`（缺的文件夹会自动建）、
  `applyTags` / `moveBookmarks` 取自本次建议里是否真的含有标签/文件夹、
  `minConfidence` 取本次应用建议中的最低置信度；`removeDuplicates` /
  `archiveUncategorized` / `handleBroken` 是未实现的旧字段，固定为
  `false` / `false` / `'ignore'`。`result.duration` 是真实耗时，
  `result.foldersCreated` **未跟踪**（`ensureFolderPath` 只回报目标 id，不回报是否新建）。
- **学习回流**：从 `appliedSuggestions` 里筛出同时满足
  `engine === 'deepseek'`、`confidence >= 0.8`（`LEARN_MIN_CONFIDENCE`）、
  `suggestedFolderPath` 非空的建议，按 `getDomain(url).toLowerCase()` 为键，
  把 `{ folder, tags, learnedAt: now() }` 经 `saveLearnedRules` 写进
  `chrome.storage.local.learnedDomainRules`（下次 `suggest` 的同域名书签会直接命中
  学习规则，不再消耗 AI 调用）。总容量 **200**（`LEARNED_RULES_MAX`），超出时按
  `learnedAt` 淘汰最旧的。⚠️ **只有应用成功的建议才会回流**：移动或写标签抛错的
  那些不写入规则，避免把失败的结果沉淀成偏好。
  用户可在设置页 → AI 设置的「AI 学习规则」面板查看与清空（见
  `LearnedRulesPanel`），导出 JSON 备份时也会带上这份数据。

#### `rollback` 的行为

- 记录不存在 → 抛 `` Error(`未找到整理记录: ${historyId}`) ``；
  已撤销 → 抛 `Error('该记录已撤销，无法重复撤销')`。
- 逐条 `change` 还原：
  1. `change.from && change.to && change.from !== change.to` →
     `moveBookmark(change.bookmarkId, change.from)` 移回原文件夹；
  2. `change.tags.added` 非空 → 从 aux 的 `tags` 中**精确移除本次添加的标签**
     （其他标签保留）。
- 只要该条产生过任一动作即 `restored++`；失败项写入 `errors`（文案含
  `还原文件夹失败` / `还原标签失败` / `回滚变更失败` 前缀 + 书签名）。
- 最后标记 `rolledBack: true` 与 `rolledBackAt: now()`。

#### 用法示例

```ts
import { organizerService, isDeepSeekEnabled } from '@/services/organizerService';
import type { OrganizeSuggestion } from '@/services/organizerService';
import { useBrowserBookmarkStore } from '@/stores/browserBookmarkStore';

await useBrowserBookmarkStore.getState().init();
const { bookmarks, meta } = useBrowserBookmarkStore.getState();

console.log('DeepSeek 可用：', await isDeepSeekEnabled());

// 1) 生成建议（只读）
const suggestions: OrganizeSuggestion[] = await organizerService.suggest(bookmarks, meta, {
  minConfidence: 0.6,
  engine: 'auto',
  moveBookmarks: true,
  applyTags: true,
  folderPaths: ['开发/前端', '学习/文章'], // 注入现有文件夹结构给 AI
});

// 2) 用户勾选后执行（这里演示全选）
const result = await organizerService.apply(suggestions);
console.log(`执行 ${result.applied} 项：移动 ${result.moved}，打标 ${result.tagged}`);
if (result.errors.length > 0) console.warn(result.errors);

// 3) 刷新快照，然后撤销最近一次整理
await useBrowserBookmarkStore.getState().refresh();
const history = await organizerService.getHistory(15);
if (history[0]) {
  const { restored, errors } = await organizerService.rollback(history[0].id);
  console.log(`已还原 ${restored} 项`, errors);
  await useBrowserBookmarkStore.getState().refresh();
}

await organizerService.deleteHistory(history[0]?.id ?? '');
// await organizerService.clearHistory();
```

---

### 6. profileService

**导入路径**：`@/services/profileService` 或 `@/services`
**职责**：书签档案 v2——**纯计算**，输入书签树快照 + aux 元数据，输出
`BookmarkProfile`。不落缓存（毫秒级）、不读旧数据库。

| 导出 | 签名 | 说明 |
|---|---|---|
| `interface ProfileInput` | `{ bookmarks: BrowserBookmarkNode[]; folders: BrowserBookmarkNode[]; meta: Record<string, AuxBookmarkMeta> }` | 输入 |
| `class ProfileService` | — | 见下 |
| `getProfile` | `getProfile(input: ProfileInput): BookmarkProfile` | **同步**方法（非 Promise） |
| `static urlKeyOf` | `static urlKeyOf(url: string): string` | 兼容用的 URL 去重键导出，内部即 `getUrlKey(url)` |
| 单例 `profileService` | `new ProfileService()` | — |

`categorize(domain, title)` 是 `private`，不可外部调用。它先按 `CATEGORY_CONFIGS`
的 `domains` 做精确/子域名匹配，再按 `keywords` 匹配小写标题，都不中返回 `'other'`。

#### `getProfile` 的计算口径

| 字段 | 计算方式 |
|---|---|
| `totalBookmarks` / `totalFolders` | `bookmarks.length` / `folders.length` |
| `totalTags` | aux 中所有标签去重后的数量（仅统计有 meta 的书签） |
| `folderedRate` | **严格口径**的入夹率（0-100 整数）：`node.path` 存在且**既不是** `'书签栏'` **也不是** `'其他书签'`（即真正放进了子文件夹）的书签占比；无书签时为 `0` |
| `taggedRate` | 打标率（0-100 整数）：`meta.tags` 非空的书签占比 |
| `collectionStartDate` / `collectionEndDate` | `dateAdded > 0` 的最小/最大值；无有效日期时为 `0` |
| `collectionDays` | 仅当 `end > start` 时为 `ceil((end - start) / 86400_000)`，否则 `0` |
| `averagePerMonth` | `round(totalBookmarks / max(collectionDays / 30, 1))` |
| `uniqueDomains` | `getDomain(url)` 去重数量 |
| `httpsRatio` | `url.startsWith('https://')` 的数量 / `totalBookmarks`（无书签时为 `0`） |
| `topDomains` | 域名计数降序**取前 10**；每项含 `percentage = count / max(totalBookmarks, 1)`、`isHttps`（该域名出现在 **https 域名集合**中，即存在 `https://` 且域名相同的书签）、`category`（`categorize(domain, '')`，即只按域名匹配） |
| `domainDiversity` | 归一化 Shannon 熵：`entropy / log2(uniqueDomains)`，`uniqueDomains <= 1` 时为 `0` |
| `categoryDistribution` | 每个 `CATEGORY_CONFIGS.id` 的计数（先全部置 0 再累加） |
| `primaryCategory` | 计数最多的分类；最大值仍为 0 时取 `'other'` |
| `yearlyTrend` / `monthlyTrend` | 按 `YYYY` / `YYYY-MM` 升序，每项 `{ period, count, cumulative }`（`cumulative` 为累计值） |
| `duplicateCount` | 单趟用 `urlKeyCounts` Map（按 `getUrlKey(url)` 分组）累加**各组多出的份数**（`count - 1`）之和；`ProfileService` **已不再 import `BrowserBookmarksService`**，也不再调用 `groupDuplicates`（与原实现结果等价） |
| `brokenCount` | `meta.linkStatus` 为 `'broken'` 或 `'unreachable'` 的数量 |
| `favoriteCount` / `aiGeneratedCount` | `meta.isFavorite` / `meta.aiGenerated` 为真的数量 |
| `organizationScore` | `round(max(0, min(1, 入夹率 * 0.5 + 打标率 * 0.5 - duplicatePenalty - brokenPenalty)) * 100)`。⚠️ **入夹率与 `folderedRate` 同源（严格口径）**，不再是"有 `parentId` 且 `path` 非空"的宽口径；`duplicatePenalty = min(duplicateCount / totalBookmarks, 0.2)`、`brokenPenalty = min(brokenCount / totalBookmarks, 0.2)`，两个惩罚项各自**上限 0.2** |
| `collectorScore` | `round(totalBookmarks + uniqueDomains * 2 + totalTags * 3 + favoriteCount * 5)` |
| `collectorLevel` / `collectorTitle` | 从 `COLLECTOR_LEVELS` **倒序**查找首个 `collectorScore >= minScore` 的等级，取 `level` 与 `title.zh` |
| `archivedCount` | 恒为 `0`（v0.6 无归档概念） |
| `generatedAt` / `version` | `now()` / `'2.0'` |

#### 用法示例

```ts
import { profileService } from '@/services/profileService';
import { useBrowserBookmarkStore } from '@/stores/browserBookmarkStore';

await useBrowserBookmarkStore.getState().init();
const { bookmarks, folders, meta } = useBrowserBookmarkStore.getState();

// 同步返回，不需要 await
const profile = profileService.getProfile({ bookmarks, folders, meta });

console.log(profile.totalBookmarks, profile.uniqueDomains, profile.primaryCategory);
console.log(profile.organizationScore, profile.collectorLevel, profile.collectorTitle);
console.log(profile.topDomains.slice(0, 3));

// 兼容导出：URL 去重键
const key = profileService.urlKeyOf('https://www.example.com/a/');
```

---

## 二、基础库（`src/lib`）

聚合导出 `@/lib`（`src/lib/index.ts`）包含：
`utils`、`messaging`、`urlAnalyzer`、`httpChecker`、`auxDatabase`、`logger`。
**`deepseekClient` 不在其中**，必须写 `import ... from '@/lib/deepseekClient'`。

### 7. auxDatabase

**导入路径**：`@/lib/auxDatabase` 或 `@/lib`
**职责**：扩展增强元数据数据库（Dexie，库名 **`SmartBookmarkAuxDB`**）。全部记录
以 **chrome 书签节点 id** 关联，可随时重建或丢弃。

#### 表结构（`version(1)`）

| 表 | Dexie schema | 记录类型 | 说明 |
|---|---|---|---|
| `bookmarkMeta` | `'bookmarkId, isFavorite, linkStatus'` | `AuxBookmarkMeta`（主键 `bookmarkId`） | 标签/备注/收藏/访问次数/死链状态 |
| `linkChecks` | `'id, bookmarkId, checkedAt'` | `LinkCheckRecord` | 死链检查历史 |
| `organizeHistory` | `'id, timestamp'` | `OrganizeHistory` | AI 整理历史 |

#### 导出

| 导出 | 签名 | 说明 |
|---|---|---|
| `interface LinkCheckRecord` | 见下 | 一次检查记录 |
| `class AuxDatabase extends Dexie` | `constructor()` | 构造时即 `super('SmartBookmarkAuxDB')` 并注册 v1 schema |
| 单例 `auxDb` | `new AuxDatabase()` | 直接可用的实例 |
| `defaultMeta` | `defaultMeta(bookmarkId: string): AuxBookmarkMeta` | 返回 `{ bookmarkId, tags: [], isFavorite: false, visitCount: 0 }` |
| `reconcileMeta` | `reconcileMeta(bookmarks: BrowserBookmarkNode[], nowTs = Date.now()): Promise<ReconcileResult>` | **元数据对账**（取代旧版 sweepOrphanMeta，后者已删除）：①书签还在 → 补齐缺失的 `urlKey`；②书签没了但某新节点 `urlKey` 相同且该节点还没有元数据 → **认领**（`bookmarkId` 换成新 id）；③书签没了但同链接节点**已有自己的元数据** → 用 `mergeMeta` **合并**；④暂时无人认领 → 写入 `orphanedAt` 等待；⑤超过 `ORPHAN_META_TTL_MS`（90 天）或没有 `urlKey` 的旧数据 → 清理。返回 `{ rebound, backfilled, merged, removed, pending }` |
| `mergeMeta` | `mergeMeta(target: AuxBookmarkMeta, orphan: AuxBookmarkMeta): AuxBookmarkMeta` | 同一链接两份元数据的合并规则：标签并集去重、收藏取或、`visitCount` 相加、`lastVisited` 取较晚、备注优先 `target` 的、死链状态取 `linkCheckedAt` 较新的那份、`aiGenerated`/`linkStatusManual` 取或 |
| `ORPHAN_META_TTL_MS` | `90 * 24 * 3600_000` | 孤儿元数据等待被认领的时长 |
| `interface AuxExportData` | 见下 | 导出/导入的数据包 |
| `exportAuxData` | `exportAuxData(): Promise<AuxExportData>` | 并行导出三张表全部数据 + `chrome.storage.local` 里的学习规则，固定 `version: 1`、`exportedAt: Date.now()` |
| `importAuxData` | `importAuxData(data: AuxExportData): Promise<void>` | 三张表 `bulkPut` 合并写入（**不覆盖未涉及的记录**）；学习规则按 key 合并、**导入方优先**。`data.version !== 1` 时抛 `Error('Unsupported aux data version')` |

```ts
export interface LinkCheckRecord {
  id: string;
  bookmarkId: string;
  status: number;
  isAccessible: boolean;
  responseTime: number;
  errorMessage?: string;
  checkedAt: number;
  networkError?: boolean; // 网络层失败（未获得 HTTP 响应），用于"连续无法连接"判定
}

export interface AuxExportData {
  version: 1;
  exportedAt: number;
  bookmarkMeta: AuxBookmarkMeta[];
  linkChecks: LinkCheckRecord[];
  organizeHistory: OrganizeHistory[];
  // AI 整理的学习规则（存在 chrome.storage.local，不属于 aux 库，但同属扩展自有数据）
  learnedDomainRules?: LearnedDomainRules;
}
```

#### 用法示例

```ts
import {
  auxDb,
  defaultMeta,
  reconcileMeta,
  exportAuxData,
  importAuxData,
} from '@/lib/auxDatabase';
import type { AuxExportData } from '@/lib/auxDatabase';

// 1) 单条元数据读写
await auxDb.bookmarkMeta.put({ ...defaultMeta('42'), tags: ['前端'], isFavorite: true });
const meta = await auxDb.bookmarkMeta.get('42');

// 2) 元数据对账（书签增删改后调用）
const { rebound, removed, pending } = await reconcileMeta(bookmarks);
console.log('认领', rebound, '条；清理', removed, '条；等待中', pending, '条');

// 3) JSON 备份 / 还原
const data = await exportAuxData();
const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
// ... 下载 blob ...

const parsed = JSON.parse(await file.text()) as AuxExportData;
await importAuxData(parsed); // 合并写入
```

#### 学习规则：`@/lib/learnedRules`

AI 整理的"学习回流"数据存在 `chrome.storage.local`（不属于 Dexie 库），
单独放在这个模块里，供 `organizerService`、备份导出与设置页共用。
**未收录进 `@/lib` 聚合导出**。

```ts
export interface LearnedDomainRule {
  folder: string;
  tags: string[];
  learnedAt: number;
}
export type LearnedDomainRules = Record<string, LearnedDomainRule>; // key = 域名（小写）

export const LEARNED_RULES_KEY = 'learnedDomainRules';
export const LEARNED_RULES_MAX = 200;
export const LEARNED_RULE_CONFIDENCE = 0.9;

export function loadLearnedRules(): Promise<LearnedDomainRules>;
export function saveLearnedRules(rules: LearnedDomainRules): Promise<void>;
export function clearLearnedRules(): Promise<void>;
export function trimLearnedRules(rules: LearnedDomainRules): LearnedDomainRules;
export function lookupLearnedRule(rules: LearnedDomainRules, url: string): LearnedDomainRule | undefined;
export function matchLearnedRule(rules: LearnedDomainRules, url: string): ClassificationResult | null;
```

| 函数 | 语义 |
|---|---|
| `loadLearnedRules` | 读 `chrome.storage.local[LEARNED_RULES_KEY]`；storage 抛错时**降级为空对象**，不向上抛 |
| `saveLearnedRules` / `clearLearnedRules` | 整体覆写 / 删除该 key；失败静默（不影响整理主流程） |
| `trimLearnedRules` | 超过 `LEARNED_RULES_MAX` 时按 `learnedAt` 保留最新 200 条；未超限时**返回原引用** |
| `lookupLearnedRule` | 用 `getDomain(url).toLowerCase()` 查规则；空域名返回 `undefined` |
| `matchLearnedRule` | 命中则返回 `ClassificationResult`（`confidence: 0.9`、`method: 'rule'`、`matchedRuleId: 'learned:<域名>'`，因此**不会再送 AI**）；未命中返回 `null` |

**已知取舍**：粒度是整个域名，同一域名的多用途书签会共用一条规则；学错时只能靠
设置页「AI 学习规则」面板查看与清空（或下一次学习覆盖）。之所以不做"域名 + 内容类型"
的细粒度：本地 `inferContentType` 主要依据 URL 与域名，同一域名通常只映射到同一个
类型，细化收益很小却会明显降低命中率。

---

### 8. httpChecker

**导入路径**：`@/lib/httpChecker` 或 `@/lib`
**职责**：HTTP 检查器。封装 `fetch` + 超时 + 网络错误分级 + 指数退避重试 +
HEAD→GET 回退 + 软 404（停放域名）识别。

#### 类型

```ts
export interface CheckOptions {
  method?: 'HEAD' | 'GET';  // 默认 'HEAD'
  timeout?: number;         // 默认 5000
  retries?: number;         // 默认 2
  retryDelay?: number;      // 默认 1000
}

export type NetworkErrorKind =
  | 'timeout'   // 请求超时（服务器未在时限内响应）
  | 'network'   // 连接失败（DNS/断网/连接被拒等）
  | 'ssl'       // 证书错误（主机可达但 TLS 异常）
  | 'blocked';  // 环境限制（无主机权限/CORS 拦截/opaque 响应）

export interface CheckResult {
  url: string;
  status: number;
  isAccessible: boolean;
  responseTime: number;
  finalUrl?: string;        // 重定向后的最终 URL（与入参不同才有值）
  errorMessage?: string;
  checkedAt: number;
  networkError?: boolean;   // 未获得任何 HTTP 响应，不能据此判断链接失效
  errorKind?: NetworkErrorKind;
  soft404?: boolean;        // 状态 200 但内容是域名出售页
}
```

> `DEFAULT_OPTIONS` 未导出。`mergeOptions` 会先过滤掉**显式传入的 `undefined`**
> 再合并默认值（否则 `setTimeout(fn, undefined)` 会立即 abort、`retries: undefined`
> 会跳过重试）。

#### `class HttpChecker` 方法

| 方法 | 签名 | 返回 | 语义 |
|---|---|---|---|
| `check` | `check(url: string, options: CheckOptions = {}): Promise<CheckResult>` | 检查结果 | 见下 |
| `checkBatch` | `checkBatch(urls: string[], options: CheckOptions & { concurrency?: number } = {}): Promise<CheckResult[]>` | 结果数组 | `concurrency` 默认 **5**，worker 数 `min(concurrency, urls.length)`。⚠️ 结果按**完成顺序** push，**不保证与入参顺序一致** |
| `isValidUrl` | `isValidUrl(url: string): boolean` | 是否合法 | 仅 `http:`/`https:` |
| `getStatusDescription` | `getStatusDescription(status: number): string` | 中文描述 | 查表，未命中返回 `` `HTTP ${status}` `` |
| `isHealthyStatus` | `isHealthyStatus(status: number): boolean` | — | `status >= 200 && status < 400` |

#### `check` 的执行流程

1. `!isValidUrl(url)` → 直接返回 `status: 0`、`networkError: true`、
   `errorKind: 'blocked'`、`errorMessage: 'Unsupported URL scheme'`。
2. 循环尝试（`attempt` 从 0 起）：
   - 执行一次 `performCheck`；
   - **HEAD 回退**：`method === 'HEAD'`、无网络错误、且状态码为 `405` 或 `501`
     时，**改用 GET 再请求一次并直接返回**（不再进入重试）；
   - **可重试判定**：仅 `networkError && (errorKind === 'timeout' || errorKind === 'network')`
     为可重试；`attempt >= retries` 时返回；
   - **指数退避**：`await sleep(retryDelay * Math.pow(2, attempt))`，即默认
     1000ms → 2000ms（`retries = 2` 时最多 3 次请求）。
   - `ssl` / `blocked` 重试必然同样结果，**不重试**。

`performCheck` 的细节：

- `fetch` 使用 `redirect: 'follow'`、`cache: 'no-cache'`、`credentials: 'omit'`、
  `referrerPolicy: 'no-referrer'`，`Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8`。
- `response.type === 'opaque'` → `status: 0`、`networkError: true`、
  `errorKind: 'blocked'`、`errorMessage: 'Opaque response'`，并释放响应体。
- `isAccessible = response.ok && !soft404`。
- 异常分级：`err.name === 'AbortError'` → `timeout` / `'Request timeout'`；
  消息含 `SSL` 或 `certificate` → `ssl` / `'SSL certificate error'`；
  否则若 `hasFetchPermission()` 为假 → `blocked` / `'Host permission not granted'`；
  其余 → `network`。
- 未消费的响应体会通过 `response.body?.cancel()` 释放，避免批量检查时连接悬挂。

#### 软 404（停放域名 / 域名过期）识别

仅在 **GET 且 `status === 200`** 时进行，且整体带 **3 秒超时**（
`Promise.race([sniffSoft404(response), sleep(3000).then(() => false)])`）。

判定必须**同时**满足「页面体积极小」与「命中停放特征词」，避免误杀正常页面：

- 最多读取 `SOFT404_MAX_SNIPPET_BYTES = 64 KiB` 正文；
- 一旦累计字节数 `> SOFT404_MAX_PAGE_BYTES = 4 KiB` 即中止并判定**不是**软 404
  （停放页通常极小）；
- 命中以下任一特征（`PARKED_SIGNATURES`，大小写不敏感）才判定为软 404：
  - `/buy this domain/i`
  - `/domain (?:is |may be )?(?:for sale|parked|expired)/i`
  - `/(?:godaddy|namecheap|sedo|dan\.com|hugedomains).*(?:parking|parked)/i`
  - `/域名(出售|交易|停放|到期|过期|被注册)/`
  - `/该域名.{0,12}(出售|转让|续费|过期)/`

#### 状态码中文描述表

`0` 无法连接、`200` 正常、`201` 已创建、`204` 无内容、`301` 永久重定向、
`302` 临时重定向、`304` 未修改、`400` 请求错误、`401` 未授权、`403` 禁止访问、
`404` 未找到、`408` 请求超时、`410` 已删除、`429` 请求过多、`495` SSL 错误、
`500` 服务器错误、`502` 网关错误、`503` 服务不可用、`504` 网关超时。

#### 单例

```ts
export const httpChecker = new HttpChecker();
```

#### 用法示例

```ts
import { httpChecker } from '@/lib/httpChecker';

// 单条：默认 HEAD / 5s 超时 / 重试 2 次
const result = await httpChecker.check('https://example.com');
console.log(result.status, result.isAccessible, result.responseTime);
if (result.networkError) {
  console.log('网络层失败', result.errorKind); // timeout | network | ssl | blocked
}
if (result.soft404) {
  console.log('疑似停放域名 / 软 404');
}

// 首页用 GET（顺带做软 404 检测）
const root = await httpChecker.check('https://example.com/', { method: 'GET', timeout: 8000 });

// 批量（结果顺序为完成顺序）
const batch = await httpChecker.checkBatch(
  ['https://a.com', 'https://b.com'],
  { method: 'GET', concurrency: 3, retries: 1 }
);

console.log(httpChecker.getStatusDescription(404)); // '未找到'
console.log(httpChecker.isHealthyStatus(301));       // true
console.log(httpChecker.isValidUrl('chrome://bookmarks')); // false
```

---

### 9. deepseekClient

**导入路径**：`@/lib/deepseekClient`（**不在 `@/lib` 聚合导出中**）
**职责**：DeepSeek Chat Completions 的原生 HTTP 客户端（非流式 + 流式）。上层
业务请优先用 `deepseekAIService`。

#### 类型

```ts
// ⚠️ 与 @/types 里的 DeepSeekConfig 同名但字段不同：
// 本模块的版本面向 HTTP 客户端（timeout / maxRetries），
// @/types 的版本面向用户配置（model / enabled / temperature / maxTokens）。
export interface DeepSeekConfig {
  apiKey: string;
  baseURL?: string;   // 默认 'https://api.deepseek.com/v1'
  timeout?: number;   // 默认 30000（单次尝试的超时）
  maxRetries?: number; // 默认 3，含义是**总尝试次数**（即最多重试 2 次）
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionParams {
  model: 'deepseek-chat' | 'deepseek-coder';
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: { role?: string; content?: string };
    finish_reason: string | null;
  }>;
}

export class DeepSeekAPIError extends Error {
  constructor(message: string, public statusCode?: number, public response?: any);
  name = 'DeepSeekAPIError';
}
```

#### `class DeepSeekClient`

`constructor(config: DeepSeekConfig)`——内部把配置补全为 `Required<DeepSeekConfig>`
（`baseURL` 默认 `'https://api.deepseek.com/v1'`、`timeout` 默认 `30000`、
`maxRetries` 默认 `3`）。

**请求层重试策略**：`maxRetries` 是总尝试次数；只对"值得重试"的失败重试——
网络层失败与超时（无状态码）、`429`、`5xx`，退避为 `500ms × 2^attempt`；
其余 4xx（如 401 密钥错误、400 参数错误）重试结果相同，直接抛出。
超时是**单次尝试**的超时，因此最坏耗时约为 `timeout × maxRetries + 退避`。

| 方法 | 签名 | 返回 | 语义 |
|---|---|---|---|
| `chatCompletions` | `chatCompletions(params: ChatCompletionParams): Promise<ChatCompletionResponse>` | 完整响应 | `POST {baseURL}/chat/completions`。请求体固定 `stream: false`，`temperature ?? 0.7`、`max_tokens ?? 2000`、`top_p ?? 1.0` |
| `streamChatCompletions` | `streamChatCompletions(params: ChatCompletionParams): AsyncGenerator<ChatCompletionChunk>` | 异步生成器 | 请求体固定 `stream: true`；按 SSE 逐行解析，跳过空行与 `data: [DONE]`，只 yield `data: ` 前缀且能 `JSON.parse` 成功的块；解析失败的块只 `logger.error` 后跳过。**注意：流式路径不经过重试包装** |
| `testConnection` | `testConnection(): Promise<boolean>` | 是否连通 | 用 `model: 'deepseek-chat'`、`max_tokens: 5` 发一句 `Hello`，返回 `!!response.choices?.[0]?.message?.content`；异常返回 `false` |

`request<T>(endpoint, options)` 为 `private`。错误处理：非 2xx 时读取响应体并抛
`DeepSeekAPIError(error.error?.message || \`HTTP ${status}\`, status, error)`；
`AbortError` → `DeepSeekAPIError('Request timeout')`；其他 `Error` → 用其
`message` 包装；非 Error 抛 `'Unknown error occurred'`。超时由
`AbortController` + `config.timeout` 控制。

#### 工厂函数

```ts
export function createDeepSeekClient(config: DeepSeekConfig): DeepSeekClient;
```

#### 用法示例

```ts
import { createDeepSeekClient, DeepSeekAPIError } from '@/lib/deepseekClient';
import { createLogger } from '@/lib/logger';

const logger = createLogger('MyModule');
const client = createDeepSeekClient({
  apiKey: 'sk-xxxx',
  baseURL: 'https://api.deepseek.com/v1',
  timeout: 30000,
});

try {
  const response = await client.chatCompletions({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: '你是一个书签分类助手。' },
      { role: 'user', content: '为 https://react.dev/learn 推荐标签' },
    ],
    temperature: 0.3,
    max_tokens: 300,
  });
  console.log(response.choices[0]?.message.content, response.usage.total_tokens);
} catch (error) {
  if (error instanceof DeepSeekAPIError) {
    logger.error(error.message, error.statusCode);
  }
}

// 流式
for await (const chunk of client.streamChatCompletions({
  model: 'deepseek-chat',
  messages: [{ role: 'user', content: '你好' }],
})) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? '');
}

console.log(await client.testConnection());
```

---

### 10. messaging

**导入路径**：`@/lib/messaging` 或 `@/lib`
**职责**：与 background service worker 的消息通信，以及读取当前标签页/页面信息。

v0.6 起 UI 直连数据层，消息通道**只保留 `GET_CURRENT_TAB`**
（`MessageType = 'GET_CURRENT_TAB'`）。

| 导出 | 签名 | 说明 |
|---|---|---|
| `onMessage` | `onMessage<TType extends MessageType = MessageType, R = unknown>(handler: (message: Message<TType>, sender: chrome.runtime.MessageSender) => Promise<MessageResponse<R>> \| MessageResponse<R>): void` | background 侧监听。用 `Promise.resolve(handler(...))` 包装并 `sendResponse`；handler 抛错时回 `{ success: false, error, requestId }`；**始终 `return true`**（保持消息端口开启以支持异步响应） |
| `getCurrentTab` | `getCurrentTab(): Promise<chrome.tabs.Tab \| null>` | `chrome.tabs.query({ active: true, currentWindow: true })` 的第一项，没有则 `null` |
| `getCurrentPageInfo` | `getCurrentPageInfo(): Promise<{ url: string; title: string; favicon?: string } \| null>` | 基于 `getCurrentTab()`；无 tab 或无 `tab.url` 返回 `null`；`title` 缺省回退为 `url`，`favicon` 取 `tab.favIconUrl` |

> 相关类型来自 `@/types`：`MessageType`、`MessagePayloadMap`、`MessagePayload`、
> `Message`、`MessageResponse`。
> 发送侧没有导出函数：UI（如表单）直接调用 `getCurrentPageInfo()` 读取当前页面；
> background 侧用 `onMessage` 注册 `GET_CURRENT_TAB` 处理器，`Message` /
> `MessageResponse` 是这条通道的线格式。

#### 用法示例

```ts
import { getCurrentPageInfo } from '@/lib/messaging';

// 直接读取当前页面（BrowserBookmarkForm 的做法）
const pageInfo = await getCurrentPageInfo();
if (pageInfo) {
  console.log(pageInfo.url, pageInfo.title, pageInfo.favicon);
}
```

background 侧如需接管 `GET_CURRENT_TAB`，用 `onMessage` 注册处理器（见
`src/entrypoints/background`）。

---

### 11. logger

**导入路径**：`@/lib/logger` 或 `@/lib`
**职责**：统一日志工具，支持级别过滤与上下文前缀。

| 导出 | 签名 | 说明 |
|---|---|---|
| `debug` | `debug(message: string, context?: string, ...args: unknown[]): void` | `console.log`，前缀 `🐛` |
| `info` | `info(message: string, context?: string, ...args: unknown[]): void` | `console.log`，前缀 `ℹ️` |
| `warn` | `warn(message: string, context?: string, ...args: unknown[]): void` | `console.warn`，前缀 `⚠️` |
| `error` | `error(message: string, context?: string, ...args: unknown[]): void` | `console.error`，前缀 `❌` |
| `createLogger` | `createLogger(context: string)` | 返回 `{ debug, info, warn, error }`，四个方法的签名都变成 `(message: string, ...args: unknown[])`，自动带上 `context` |

> ⚠️ `LogLevel` 类型（`'debug' | 'info' | 'warn' | 'error' | 'none'`）**未导出**，
> 只在模块内部使用。
> **级别只由构建期 `VITE_LOG_LEVEL` 决定**：`currentLogLevel` 是模块级 `const`，
> 取 `import.meta.env.VITE_LOG_LEVEL`（构建期环境变量）优先，否则
> `import.meta.env.MODE === 'development'` 时为 `'debug'`，生产为 `'error'`。
> 运行期**没有任何读取或修改级别的接口**（v0.6 起已移除），要改级别必须
> 带 `VITE_LOG_LEVEL` 重新构建。
> 级别数值：`debug 0 < info 1 < warn 2 < error 3 < none 4`；`shouldLog` 判定为
> `LOG_LEVELS[level] >= LOG_LEVELS[currentLogLevel]`。
> 日志前缀格式为 `HH:MM:SS.mmm <emoji> [context]`。

#### 用法示例

```ts
import { createLogger } from '@/lib/logger';

const logger = createLogger('MyFeature');
logger.info('开始处理', { count: 3 });
logger.warn('批次大小被修正');
logger.error('请求失败', error);
```

---

### 12. utils

**导入路径**：`@/lib/utils` 或 `@/lib`
**职责**：通用工具函数（类名合并、ID/时间、相对时间格式化、URL 规范化、去重键、
关键词提取）。共 **13 个导出**。

| 函数 | 签名 | 语义 |
|---|---|---|
| `cn` | `cn(...inputs: ClassValue[]): string` | `twMerge(clsx(inputs))`，Tailwind 类名合并 |
| `generateId` | `generateId(): string` | `crypto.randomUUID()` |
| `now` | `now(): number` | `Date.now()` |
| `formatRelativeTime` | `formatRelativeTime(timestamp: number, locale = 'zh-CN'): string` | `Intl.RelativeTimeFormat`（`numeric: 'auto'`），按 年/月/周/日/时/分/秒 逐级回退。实例按 `locale` 缓存在模块级 Map 里（私有 `getRelativeTimeFormatter`），避免列表渲染时反复构造 `Intl` |
| `parseUrl` | `parseUrl(url: string): URL \| null` | `new URL` 失败返回 `null` |
| `getDomain` | `getDomain(url: string): string` | `hostname`；解析失败**原样返回入参** |
| `getFaviconUrl` | `getFaviconUrl(url: string, size = 32): string` | 返回 `https://www.google.com/s2/favicons?domain={domain}&sz={size}` |
| `truncate` | `truncate(text: string, maxLength: number): string` | 超长时截到 `maxLength - 3` 再拼 `'...'` |
| `sleep` | `sleep(ms: number): Promise<void>` | 延时 |
| `isValidUrl` | `isValidUrl(url: string): boolean` | 仅 `http:`/`https:` |
| `normalizeUrl` | `normalizeUrl(url: string): string` | `origin + pathname（去尾部斜杠） + search`；解析失败原样返回 |
| `getUrlKey` | `getUrlKey(url: string): string` | **去重键**：`normalizeUrl` 后 `toLowerCase()`，再去掉开头的 `http(s)://` 与 `www.` |
| `extractKeywords` | `extractKeywords(text: string): string[]` | 小写、标点替换为空格、按空白分词、丢弃长度 ≤ 1 的词、去重 |

`getUrlKey` 示例：`'https://www.Example.com/a/'` → `'example.com/a'`。

#### 用法示例

```ts
import {
  cn,
  getDomain,
  getFaviconUrl,
  getUrlKey,
  formatRelativeTime,
} from '@/lib/utils';

console.log(getUrlKey('https://www.Example.com/a/')); // 'example.com/a'
console.log(getDomain('https://docs.example.com/x')); // 'docs.example.com'
console.log(getFaviconUrl('https://example.com', 64));
console.log(formatRelativeTime(Date.now() - 3 * 3600_000)); // '3小时前'
console.log(cn('px-2', false && 'hidden', 'px-4'));          // 'px-4'
```

---

### 13. urlAnalyzer

**导入路径**：`@/lib/urlAnalyzer` 或 `@/lib`
**职责**：URL 特征分析与内容类型推断（`aiService` 的底层依赖）。

导出：`class UrlAnalyzer`、单例 `urlAnalyzer`。

| 方法 | 签名 | 返回 | 语义 |
|---|---|---|---|
| `analyze` | `analyze(url: string): UrlInfo` | URL 特征 | 解析失败时返回全空的 `UrlInfo`（`domain`/`path`/`query` 为 `''`，各 `is*` 为 `false`）。成功时 `domain = hostname.toLowerCase()`、`path = pathname.toLowerCase()`、`query = search`（**保留大小写**） |
| `inferContentType` | `inferContentType(url: string, title: string = ''): ContentType` | 内容类型 | 见下 |
| `extractDomain` | `extractDomain(url: string): string` | `hostname` | 失败返回 `''`（注意与 `getDomain` 不同，后者回退为入参） |
| `extractRootDomain` | `extractRootDomain(url: string): string` | 主域名 | 取域名最后两段（如 `a.b.co.uk` → `co.uk`），**不做公共后缀表处理** |
| `extractKeywords` | `extractKeywords(url: string): string[]` | 关键词 | 域名段：长度 > 3 且不以 `www` 开头；路径段：去掉 `.html/.htm/.php/.asp/.aspx` 后长度 > 2 且非纯数字；去重 |
| `normalize` | `normalize(url: string): string` | 规范化 URL | 与 `utils.normalizeUrl` 逻辑相同 |
| `isSameUrl` | `isSameUrl(url1: string, url2: string): boolean` | 是否同一资源 | `normalize(url1) === normalize(url2)` |

`private` 判定方法（不可外部调用）：`isGitHub`（`github.com`、`gist.github.com`、
`*.github.io`）、`isStackOverflow`（含子域名）、`isYouTube`（`youtube.com`、`youtu.be`）、
`isDocumentation`（路径含 `/docs/`、`/doc/`、`/documentation/`、`/reference/`、
`/api/`、`/guide/`、`/tutorial/`、`/tutorials/`）、`isBlog`（路径含 `/blog/`、`/post/`、
`/posts/`、`/article/`、`/articles/`、`/news/`、`/journal/`）、`isShoppingDomain`、
`isSocialDomain`、`isToolDomain`。

`inferContentType` 的判定顺序（**先命中先返回**）：

1. `isYouTube` → `'video'`
2. `isGitHub && path.includes('/')` → `'repository'`
3. `isStackOverflow` → `'forum'`
4. `isDocumentation` → `'documentation'`
5. `isBlog` → `'blog'`
6. 域名命中购物站 → `'shopping'`；命中社交站 → `'social'`；命中工具站 → `'tool'`
7. 标题含 `tutorial`/`教程` → `'documentation'`；含 `blog`/`博客` → `'blog'`；
   含 `video`/`视频` → `'video'`
8. 兜底 → `'article'`

#### 用法示例

```ts
import { urlAnalyzer } from '@/lib/urlAnalyzer';

const info = urlAnalyzer.analyze('https://github.com/facebook/react');
console.log(info.domain, info.path, info.isGitHub, info.isDocumentation);

console.log(urlAnalyzer.inferContentType('https://youtube.com/watch?v=1', '视频')); // 'video'
console.log(urlAnalyzer.extractRootDomain('https://a.b.example.co.uk/x'));          // 'co.uk'
console.log(urlAnalyzer.extractKeywords('https://react.dev/learn/tutorial'));
console.log(urlAnalyzer.isSameUrl('https://example.com/a/', 'https://www.example.com/a'));
```

---

## 三、状态管理（`src/stores`）

聚合导出 `@/stores`。

### 14. browserBookmarkStore

**导入路径**：`@/stores/browserBookmarkStore` 或 `@/stores`
**职责**：v0.6 核心 store。持有整树快照，靠浏览器书签事件（去抖重载）保持同步；
书签操作直写 `chrome.bookmarks`，增强元数据写 aux 库。

| 导出 | 说明 |
|---|---|
| `useBrowserBookmarkStore` | Zustand hook（`create<BrowserBookmarkState>(...)`）。React 中用选择器订阅，非 React 用 `useBrowserBookmarkStore.getState()` |
| `selectAllTags` | `selectAllTags(meta: Record<string, AuxBookmarkMeta>): Array<{ name: string; count: number }>`——派生全部标签及使用次数，按次数降序 |
| `resetBrowserBookmarkStoreForTesting` | `(): void`——**仅测试用**：清除重载定时器、取消事件订阅、把状态重置为初始值 |

> `interface BrowserBookmarkState` **未导出**（仅有类型层面的内部约束）。

#### 状态字段

| 字段 | 类型 | 初值 | 说明 |
|---|---|---|---|
| `isInitialized` | `boolean` | `false` | `init()` 是否完成 |
| `isLoading` | `boolean` | `false` | — |
| `error` | `string \| null` | `null` | 最近一次失败信息 |
| `tree` | `BrowserTreeNode[]` | `[]` | 嵌套树，供渲染 |
| `bookmarks` | `BrowserBookmarkNode[]` | `[]` | 平铺书签 |
| `folders` | `BrowserBookmarkNode[]` | `[]` | 平铺文件夹 |
| `meta` | `Record<string, AuxBookmarkMeta>` | `{}` | 按书签 id 索引的增强元数据 |
| `searchQuery` | `string` | `''` | 视图：搜索词 |
| `currentFolderId` | `string \| undefined` | `undefined` | 视图：当前文件夹 |
| `filter` | `BrowserBookmarkFilter` | `'all'` | `'all' \| 'favorites' \| 'recent' \| 'broken' \| 'tag'` |
| `selectedTag` | `string \| undefined` | `undefined` | 视图：标签过滤 |
| `selectedIds` | `Set<string>` | `new Set()` | 多选集合 |

#### 动作

| 动作 | 签名 | 语义 |
|---|---|---|
| `init` | `() => Promise<void>` | 先 `refresh()`，再**只订阅一次**书签事件（模块级 `unsubscribeEvents` 兜底）。事件回调去抖 **150ms**（`EVENT_RELOAD_DEBOUNCE_MS`）后整树重载（`getTree` 毫秒级，可靠性优先）。成功置 `isInitialized: true`；异常写入 `error`；无论成败都会把 `isLoading` 复位。可重复调用（幂等订阅） |
| `refresh` | `() => Promise<void>` | `loadTree()` → `reconcileMeta(bookmarks)` 对账（认领可回收的元数据、补齐 `urlKey`、清理真正失效的孤儿）→ 读全部 `bookmarkMeta` 成 map → 写入 `tree`/`bookmarks`/`folders`/`meta` 并清空 `error` |
| `setSearchQuery` | `(query: string) => void` | — |
| `setCurrentFolder` | `(folderId?: string) => void` | 同时把 `filter` 复位为 `'all'`、清空 `selectedTag` |
| `setFilter` | `(filter: BrowserBookmarkFilter, tag?: string) => void` | — |
| `clearFilters` | `() => void` | 清空 `searchQuery`、`currentFolderId`、`filter`、`selectedTag` |
| `toggleSelect` | `(id: string) => void` | 切换 `selectedIds`（新建 Set，保证引用变化） |
| `clearSelection` | `() => void` | — |
| `addBookmark` | `(input: { url: string; title?: string; parentId?: string }) => Promise<void>` | 先按 `getUrlKey` 查重，**已存在则抛 `Error('书签已存在')`**；否则 `browserBookmarks.createBookmark(input)` 后 `refresh()` |
| `updateBookmark` | `(id: string, changes: { title?: string; url?: string }) => Promise<void>` | 直写浏览器后 `refresh()` |
| `moveBookmarks` | `(ids: string[], parentId: string) => Promise<void>` | 逐个 `moveBookmark`（串行），然后 `refresh()` |
| `removeBookmarks` | `(ids: string[]) => Promise<void>` | 按 `folders` 判断每个 id 是否为文件夹以选择 `remove`/`removeTree`；随后 `auxDb.bookmarkMeta.bulkDelete(ids)` 删除对应元数据、`refresh()`，并把已删 id 从 `selectedIds` 移除。⚠️ 传文件夹 id 时也会尝试删同名元数据（通常不存在，无副作用） |
| `removeFolder` | `(folderId: string) => Promise<void>` | `browserBookmarks.remove(folderId, true)` 后 `refresh()`。⚠️ **不会**主动删除子节点的 aux 元数据（由下次 `refresh()` 的 `reconcileMeta` 兜底：先等待认领，超时才清理） |
| `createFolder` | `(title: string, parentId?: string) => Promise<void>` | `parentId` 由 service 缺省为书签栏；然后 `refresh()` |
| `toggleFavorite` | `(id: string) => Promise<void>` | 读 `meta[id] ?? defaultMeta(id)`，取反 `isFavorite` 写 aux，并同步内存 map。**不触发整树重载** |
| `addTags` | `(ids: string[], tags: string[]) => Promise<void>` | 逐条与现有标签做 `Set` 合并去重，`bulkPut` 后一次性更新内存 map |
| `removeTag` | `(id: string, tag: string) => Promise<void>` | `meta[id]` 不存在时直接返回（不创建记录） |
| `setNotes` | `(id: string, notes: string) => Promise<void>` | 空字符串会写成 `undefined`（即清空备注） |
| `recordVisit` | `(id: string) => Promise<void>` | `visitCount + 1` 且 `lastVisited = now()` |

#### 用法示例

```ts
import {
  useBrowserBookmarkStore,
  selectAllTags,
} from '@/stores/browserBookmarkStore';

// React 组件中按需订阅
// const bookmarks = useBrowserBookmarkStore((state) => state.bookmarks);

// 非 React：初始化并读取快照
await useBrowserBookmarkStore.getState().init();
const { bookmarks, folders, meta } = useBrowserBookmarkStore.getState();

// 书签操作（直写 chrome.bookmarks，内部会 refresh）
const store = useBrowserBookmarkStore.getState();
await store.addBookmark({ url: 'https://react.dev/learn', title: 'Learn React' });
await store.createFolder('开发');
await store.moveBookmarks([bookmarks[0].id], folders[0].id);

// 元数据操作（写 aux，不整树重载）
await store.toggleFavorite(bookmarks[0].id);
await store.addTags([bookmarks[0].id], ['前端', 'React']);
await store.removeTag(bookmarks[0].id, 'React');
await store.setNotes(bookmarks[0].id, '待读');
await store.recordVisit(bookmarks[0].id);

// 视图状态
store.setFilter('tag', '前端');
store.setSearchQuery('react');
store.clearFilters();

// 派生标签统计
const tags = selectAllTags(useBrowserBookmarkStore.getState().meta);
// [{ name: '前端', count: 3 }, ...]
```

---

### 15. uiStore

**导入路径**：`@/stores/uiStore` 或 `@/stores`
**职责**：UI 状态（视图模式、主题、主色调、侧边栏、对话框），持久化到
`localStorage` 的 **`smart-bookmark-ui`**。

#### 导出

| 导出 | 说明 |
|---|---|
| `type ViewMode` | `'list' \| 'grid'` |
| `type Theme` | `'light' \| 'dark' \| 'system'` |
| `type PrimaryColor` | `'blue' \| 'purple' \| 'emerald' \| 'orange' \| 'rose'` |
| `interface PrimaryColorOption` | `{ id, label, hex, lightHsl, darkHsl }` |
| `PRIMARY_COLOR_OPTIONS` | `PrimaryColorOption[]`，5 项：`blue` 科技蓝 `#2563eb`、`purple` 经典紫 `#7c3aed`、`emerald` 翡翠绿 `#059669`、`orange` 活力橙 `#ea580c`、`rose` 玫瑰红 `#e11d48` |
| `applyTheme` | `applyTheme(theme: Theme, primaryColor: PrimaryColor = 'blue'): void`——`theme === 'system'` 时读 `prefers-color-scheme` 决定是否加 `dark` 类；随后按当前明暗把 `--primary` 与 `--ring` 设为主色调对应的 HSL。`typeof document === 'undefined'` 时直接返回 |
| `interface UIState` | store 的完整状态与动作类型 |
| `useUIStore` | `create<UIState>()(persist(...))` |
| `initializeTheme` | `initializeTheme(): () => void`——应用当前主题，监听系统主题变化（仅当 `theme === 'system'` 时响应）与 `storage` 事件（跨扩展页面同步主题/主题色）。**返回清理函数**；非浏览器环境返回空函数 |

#### `UIState`

| 字段 | 类型 | 初值 | 是否持久化 |
|---|---|---|---|
| `viewMode` | `ViewMode` | `'list'` | ✅ |
| `theme` | `Theme` | `'system'` | ✅ |
| `primaryColor` | `PrimaryColor` | `'blue'` | ✅ |
| `sidebarCollapsed` | `boolean` | `false` | ✅ |
| `isAddBookmarkOpen` | `boolean` | `false` | ❌ |
| `isSettingsOpen` | `boolean` | `false` | ❌ |
| `editingBookmarkId` | `string \| null` | `null` | ❌ |

（`partialize` 只持久化上面标记 ✅ 的 4 个字段。）

| 动作 | 签名 | 语义 |
|---|---|---|
| `setViewMode` | `(mode: ViewMode) => void` | — |
| `setTheme` | `(theme: Theme) => void` | 同时 `applyTheme(theme, primaryColor ?? 'blue')` |
| `setPrimaryColor` | `(color: PrimaryColor) => void` | 同时 `applyTheme(theme, color)` |
| `toggleSidebar` | `() => void` | 取反 `sidebarCollapsed` |
| `openAddBookmark` / `closeAddBookmark` | `() => void` | `isAddBookmarkOpen` |
| `openSettings` / `closeSettings` | `() => void` | `isSettingsOpen` |
| `openEditBookmark` | `(id: string) => void` | 设置 `editingBookmarkId` |
| `closeEditBookmark` | `() => void` | `editingBookmarkId = null` |

#### 用法示例

```ts
import {
  useUIStore,
  initializeTheme,
  PRIMARY_COLOR_OPTIONS,
  applyTheme,
} from '@/stores/uiStore';
import type { PrimaryColor } from '@/stores/uiStore';

// 入口挂载时（useEffect / main.tsx）
const dispose = initializeTheme();
// 卸载：dispose();

// React 中
// const theme = useUIStore((state) => state.theme);
// const setTheme = useUIStore((state) => state.setTheme);

const ui = useUIStore.getState();
ui.setViewMode('grid');
ui.setTheme('dark');
ui.setPrimaryColor('emerald');
ui.toggleSidebar();
ui.openEditBookmark('42');
ui.closeEditBookmark();

console.log(PRIMARY_COLOR_OPTIONS.map((c) => `${c.id}:${c.label}`));
applyTheme('light', 'rose' as PrimaryColor);
```

---

## 16 类型索引

类型定义集中在 `src/types`（`@/types`），`src/types/index.ts` 的导出规则：

| 模块 | 导出方式 | 主要内容 |
|---|---|---|
| `bookmark.ts` | `export *` | `BookmarkStatus`、`BookmarkMeta`、`Bookmark`（`Bookmark` 含**必填字段 `urlKey: string`**，即 `getUrlKey(url)` 的标准化去重键） |
| `browserBookmarks.ts` | `export *` | `BrowserBookmarkNode`、`BrowserTreeNode`、`BrowserTreeSnapshot`、`AuxBookmarkMeta`、`DuplicateRetentionStrategy`、`BrowserDuplicateGroup`、`BrowserBookmarkFilter` |
| `messages.ts` | `export *` | `MessageType`（仅 `'GET_CURRENT_TAB'`）、`MessagePayloadMap`、`MessagePayload`、`Message`、`MessageResponse` |
| `ai.ts` | `export *` | `ClassificationMethod`、`ClassificationResult`、`UrlInfo`、`ClassificationRule`、`RuleCondition`、`RuleAction`、`ContentType`、`DeepSeekConfig`、`LLMClassificationResult`、`PromptTemplate`、`ClassificationCache`、`BatchClassifyOptions`、`CostStats` |
| `linkHealth.ts` | `export *` | `LinkStatus`、`LinkCheckResult`、`LinkHealthReport`、`BatchCheckOptions`、`CheckProgress`（源码末尾注明：链接历史记录已由 aux 库 `LinkCheckRecord` 承担） |
| `organizer.ts` | `export *` | `OrganizeStrategy`、`OrganizeOptions`、`OrganizeChange`、`OrganizeResult`、`DuplicateGroup`、`OrganizeHistory` |
| `profile.ts` | **逐个导出**指定符号 + 2 个常量 | 类型：`BookmarkProfile`、`BookmarkCategory`、`CategoryConfig`、`CollectorLevel`、`CollectorLevelConfig`、`DomainStats`（在 `@/types` 里以别名 **`ProfileDomainStats`** 导出，避免与旧统计类型冲突）、`TrendDataPoint`；常量：`COLLECTOR_LEVELS`、`CATEGORY_CONFIGS` |

**两处 `DeepSeekConfig` 的定义差异**（同名不同源，注意区分）：

| 来源 | 字段 | 用途 |
|---|---|---|
| `@/types`（`ai.ts`） | `apiKey`、`baseURL?`、`model?: 'deepseek-chat' \| 'deepseek-coder'`、`enabled?`、`temperature?`、`maxTokens?` | 用户配置（存 `chrome.storage.local.deepseekConfig`）；`deepSeekAIService.initialize` 的参数类型 |
| `@/lib/deepseekClient` | `apiKey`、`baseURL?`、`timeout?`、`maxRetries?` | HTTP 客户端构造参数；`createDeepSeekClient` 的参数类型 |

两者结构兼容，`deepseekAIService` 内部直接把前者传给后者。

**关键类型的形状速查**

```ts
// 增强元数据（aux 库 bookmarkMeta 表）
export interface AuxBookmarkMeta {
  bookmarkId: string;
  urlKey?: string;            // getUrlKey(url)：节点 id 变化后靠它把元数据认领回来
  orphanedAt?: number;        // 书签消失后开始等待认领的时间戳（超过 90 天才清理）
  tags: string[];
  notes?: string;
  isFavorite: boolean;
  visitCount: number;
  lastVisited?: number;
  // active 可达；broken 失效（连续确认）；unreachable 连续多轮无法建立连接；
  // pending/未设置 待检查
  linkStatus?: 'active' | 'broken' | 'pending' | 'unreachable';
  linkCheckedAt?: number;
  lastStatusCode?: number;    // 最近一次 HTTP 状态码（0 = 网络层失败）
  lastErrorMessage?: string;  // 软 404/超时等（展示用）
  lastResponseTime?: number;  // 最近一次检查的响应时间（毫秒），报告聚合直接读，免查历史表
  linkStatusManual?: boolean; // 人工标记为正常：自动扫描不再改判（强制重查除外）
  aiGenerated?: boolean;
}

// 整树快照
export interface BrowserTreeSnapshot {
  tree: BrowserTreeNode[];          // 顶层根节点（书签栏、其他书签）
  bookmarks: BrowserBookmarkNode[]; // 所有书签平铺
  folders: BrowserBookmarkNode[];   // 所有文件夹平铺（不含虚拟根 '0'）
}

// 批量检查选项
export interface BatchCheckOptions {
  concurrency?: number;
  timeout?: number;
  retries?: number;
  skipRecentHours?: number;
  whitelist?: string[];
  force?: boolean;
}
```

---

## 17 导出形态速查

| 模块 | 单例 | 可注入 class | 静态纯函数 / 独立函数 |
|---|---|---|---|
| `@/services/browserBookmarksService` | `browserBookmarks` | `BrowserBookmarksService`（构造参数 `BookmarksApi`） | `BrowserBookmarksService.groupDuplicates`、`findEmptyFolders` |
| `@/services/aiService` | `aiService` | `AIService`（无构造参数） | — |
| `@/services/deepseekAIService` | `deepSeekAIService` | `DeepSeekAIService`（无构造参数） | — |
| `@/services/linkHealthService` | `linkHealthService` | `LinkHealthService`（无构造参数） | `classifyLinkStatus`、`nextDomainInterval`、`ensureHostPermissions`、`isCheckableUrl`、`HOST_ORIGINS` |
| `@/services/organizerService` | `organizerService` | `OrganizerService`（无构造参数） | `isDeepSeekEnabled` |
| `@/services/profileService` | `profileService` | `ProfileService`（无构造参数） | `ProfileService.urlKeyOf` |
| `@/services/linkHealthAutoScan` | — | — | `runAutoScanTick`、`syncAutoScanAlarm`、`ensureAutoScanAlarm`、`AUTO_SCAN_ALARM`、`AUTO_SCAN_CONTINUE_ALARM`、`AUTO_SCAN_PROGRESS_KEY`、`AUTO_SCAN_BATCH_SIZE`、`AUTO_SCAN_STALE_MS`、`AUTO_SCAN_MIN_INTERVAL_HOURS` |
| `@/lib/auxDatabase` | `auxDb` | `AuxDatabase extends Dexie` | `defaultMeta`、`reconcileMeta`、`mergeMeta`、`ORPHAN_META_TTL_MS`、`exportAuxData`、`importAuxData` |
| `@/lib/learnedRules` | — | — | `loadLearnedRules`、`saveLearnedRules`、`clearLearnedRules`、`trimLearnedRules`、`lookupLearnedRule`、`matchLearnedRule`、`LEARNED_RULES_KEY`、`LEARNED_RULES_MAX`、`LEARNED_RULE_CONFIDENCE` |
| `@/lib/httpChecker` | `httpChecker` | `HttpChecker`（无构造参数） | — |
| `@/lib/scanSettings` | — | — | `loadScanSettings`、`saveScanSettings`、`toBatchCheckOptions`、`DEFAULT_SCAN_SETTINGS`、`SCAN_SETTINGS_KEY` |
| `@/lib/extensionInfo` | — | — | `getExtensionVersion`（从 manifest 读版本号，UI 不要写死） |
| `@/lib/deepseekClient` | — | `DeepSeekClient`（构造参数 `DeepSeekConfig`） | `createDeepSeekClient` |
| `@/lib/urlAnalyzer` | `urlAnalyzer` | `UrlAnalyzer`（无构造参数） | — |
| `@/lib/messaging` | — | — | `onMessage`、`getCurrentTab`、`getCurrentPageInfo` |
| `@/lib/logger` | — | — | `debug`、`info`、`warn`、`error`、`createLogger`（级别由构建期 `VITE_LOG_LEVEL` 固定，运行期不可改） |
| `@/lib/utils` | — | — | 13 个工具函数（见 [12 utils](#12-utils)） |
| `@/stores/browserBookmarkStore` | `useBrowserBookmarkStore`（Zustand hook） | — | `selectAllTags`、`resetBrowserBookmarkStoreForTesting` |
| `@/stores/uiStore` | `useUIStore`（Zustand hook） | — | `applyTheme`、`initializeTheme`、`PRIMARY_COLOR_OPTIONS` |

**依赖关系**

```
chrome.bookmarks ──► browserBookmarksService ──► browserBookmarkStore ──► UI
                              │                        │
                              │                        └──► profileService（纯计算）
                              │                        └──► linkHealthService ──► httpChecker
                              │                        └──► organizerService
                              │                                   ├──► aiService ──► urlAnalyzer
                              │                                   └──► deepSeekAIService ──► deepseekClient
                              └───────────────────────────────────────────► auxDatabase（SmartBookmarkAuxDB）
```

---

## 18 相关文档

- [架构设计](./architecture.md)
- [开发指南](./development.md)
- [项目 README](../README.md)
