# 架构设计文档

本文档描述智能书签扩展 v0.6 重构后的系统架构。v0.5 的自建书签库 + 云同步方案已整体移除，变更清单见文末。

## 核心原则

**`chrome.bookmarks` 是唯一数据源。**

扩展不再自建书签库：读取、写入全部直连浏览器书签 API，由 Chrome 账号自带跨设备同步。扩展自有数据库（`SmartBookmarkAuxDB`）只存浏览器书签没有的增强元数据，可随时重建或丢弃。

三条硬约束：

1. **写操作直连 `chrome.bookmarks`** —— 没有中间库，没有同步服务，从根上消除双库冲突。
2. **AI 只建议，不执行** —— 所有 AI 整理遵循「生成建议 → 预览勾选 → 确认执行」流程，绝不静默移动或打标。
3. **内存即缓存** —— 整树加载进 Zustand 后靠书签事件（去抖重载）保持同步，浏览/搜索零数据库往返。

## 架构总览

```
chrome.bookmarks（唯一数据源：树 + 事件）
        │
browserBookmarksService          ← 树加载/规范化/事件订阅/CRUD 透传/
        │                          ensureFolderPath/重复分组/空文件夹检测
browserBookmarkStore (Zustand)   ← 整树快照 + 视图状态，事件去抖 150ms 重载
        │
        ├── useBookmarkFilter    ← 文件夹闭包 + 快速过滤 + Fuse.js 搜索
        │                          （索引与查询分离：击键只 fuse.search，不重建索引）
UI: popup / sidepanel / options
        │
SmartBookmarkAuxDB (Dexie)       ← 增强元数据，按书签节点 id 关联
  - bookmarkMeta:    urlKey / orphanedAt / tags[] / notes / isFavorite / visitCount /
                     lastVisited / linkStatus / linkCheckedAt / lastStatusCode /
                     lastErrorMessage / lastResponseTime / linkStatusManual /
                     aiGenerated
  - linkChecks:      死链检查历史
  - organizeHistory: AI 整理历史
```

Background（Service Worker）职责收缩为：快捷键（`open-sidepanel`、`quick-add`、`toggle-favorite`、`search-bookmarks`）、右键菜单、书签删除事件的元数据对账（`reconcileMeta`：认领可回收的、清理真正失效的）、**定时自动死链检查**（周期闹钟 `link-health-check`，见下方"关键流程"）。消息通道仅保留 `GET_CURRENT_TAB`。

## 分层职责

### 数据层

| 存储 | 内容 | 可丢弃性 |
|---|---|---|
| `chrome.bookmarks` | 书签与文件夹树、创建时间、顺序 | 权威数据，绝不可丢 |
| `SmartBookmarkAuxDB`（IndexedDB / Dexie） | `bookmarkMeta`（标签、备注、收藏、访问次数、死链状态）、`linkChecks`（检查历史）、`organizeHistory`（整理历史） | 可随时重建；丢失只影响增强体验 |
| `chrome.storage.local` | `deepseekConfig`（API Key、模型、开关）、`deepseekClassificationCache`、`deepseekCostStats`、`learnedDomainRules`（AI 整理回流得到的域名级规则，上限 200，按学习时间淘汰）、`scan_settings`（死链扫描设置，含自动检查开关与间隔）、`linkHealthAutoScanProgress`（自动检查的进度：本轮已检查条数、进行中标记、上次完成时间） | 配置类，可重设 |

### 状态层

- `browserBookmarkStore`：持有整树快照（`tree` / `bookmarks` / `folders` / `meta`）与视图状态（搜索词、当前文件夹、过滤器、选中项）。模块级单例订阅，多个入口 `init()` 也只订阅一次；书签事件去抖 150ms 后整树重载。
- `uiStore`：主题、侧边栏等纯界面状态。

### 服务层

| 服务 | 职责 | 数据来源 |
|---|---|---|
| `browserBookmarksService` | `chrome.bookmarks` 薄封装：树规范化、事件订阅、CRUD 透传、按路径确保文件夹、按 urlKey 重复分组、空文件夹检测 | chrome.bookmarks |
| `organizerService` | AI 整理：`suggest`（只读建议，规则与学习规则先行、仅长尾交 AI）/ `apply`（确认后执行，并把成功应用的高置信度 AI 结果回流为域名规则）/ 历史记录 | 树快照 + chrome.bookmarks + aux + chrome.storage |
| `linkHealthService` | 死链检查：批次并发、同域自适应限流、进度/停止、健康报告、人工标记豁免；导出 `selectCheckableNodes` 供前台与后台共用 | 树快照 + aux + httpChecker |
| `linkHealthAutoScan` | 定时自动检查：分片执行（每批最多 40 条）、进度落 storage、续跑闹钟、与设置同步周期闹钟 | 树快照 + aux + linkHealthService + chrome.storage/alarms |
| `profileService` | 书签档案：纯同步计算（统计、域名分布、分类画像、趋势、组织度评分、收藏家等级） | 树快照 + aux |
| `aiService` | 本地规则分类引擎（零配置、离线，默认方案） | 无 |
| `deepseekAIService` | DeepSeek LLM 分类（可选，用户自带 key），含结果缓存与成本统计 | chrome.storage |

### 基础设施层

| 模块 | 职责 |
|---|---|
| `lib/auxDatabase.ts` | Dexie 实例、默认元数据、元数据对账（`reconcileMeta`：按 `urlKey` 认领 + 孤儿清理）、JSON 导出/导入 |
| `lib/httpChecker.ts` | HTTP 检查器：网络错误分级（timeout / network / ssl / blocked）、HEAD→GET 回退、指数退避、软 404（停放域名）识别 |
| `lib/scanSettings.ts` | 死链扫描设置（超时 / 并发 / 重试 / 跳过窗口 / 白名单）的类型、默认值、读写与转换；前台面板与后台扫描共用 |
| `lib/deepseekClient.ts` | DeepSeek HTTP 客户端（含 SSE 流式解析与自定义错误类型） |
| `lib/messaging.ts` | 类型化的消息收发，`GET_CURRENT_TAB` 等后台专属能力 |
| `lib/logger.ts` | 统一日志，`VITE_LOG_LEVEL` 控制级别 |
| `lib/utils.ts` / `lib/urlAnalyzer.ts` | `cn()`、`getUrlKey()`、`getDomain()`、`sleep()` 等工具；URL 语义分析 |

### 入口层

`entrypoints/background`（Service Worker）、`popup`（快速操作）、`sidepanel`（主界面）、`options`（设置页：Bookmarks / AI / Organizer / Health / Advanced / About）。

## 关键流程

**书签变更同步**：任何来源（扩展自身、用户在浏览器里操作、Chrome 账号同步）改动书签 → `chrome.bookmarks` 事件 → store 去抖 150ms → 整树重载 → 顺带对账元数据（按 `urlKey` 认领可回收的、清理真正失效的孤儿）。可靠性优先于增量更新，`getTree()` 是毫秒级的。

**AI 整理**：`organizerService.suggest()` 只读生成建议，**规则先行**——先套用已学习的域名规则与本地规则引擎（免配置、零成本），只把规则未覆盖的长尾交给 DeepSeek，并把用户现有目录树注入提示词；AI 不可用时保留规则结果 → 用户在预览里勾选、微调 → `apply()` 逐条写 `chrome.bookmarks`（移动）与 aux（标签），把**应用成功的**高置信度 AI 建议固化为域名级学习规则 → 记录到 `organizeHistory`，支持撤销。

**死链检查**：`ensureHostPermissions()`（用户手势中申请主机权限）→ 按域名分组、同域串行且间隔自适应（遇 429/503 翻倍退避）→ `httpChecker` 逐个检查并分级 → 结果写 `bookmarkMeta.linkStatus` 与 `linkChecks`。**网络层失败（无任何 HTTP 响应）不判死链**，只有拿到明确 HTTP 错误才标记失效；`linkStatusManual` 的人工标记优先于自动判定。

**定时自动检查**：周期闹钟（默认关，可在设置页开启并选 6/12/24/72 小时间隔）触发 `runAutoScanTick()`。**每次只检查一批（最多 40 条）**：MV3 的 Service Worker 随时会被杀，一口气跑完整库等于把结果赌在"这次不被杀"上。进度写 `chrome.storage.local.linkHealthAutoScanProgress`，还有剩余就安排 1 分钟后的续跑闹钟（`link-health-check-continue`），全部跑完才清掉续跑闹钟。某批中途被杀时 `runningSince` 会留下痕迹，超过 5 分钟视为那次运行已死并允许继续，避免永久卡住。

手动扫描与自动扫描**共用同一套候选筛选**（`selectCheckableNodes`：非 http(s)、白名单、人工标记、跳过窗口），因此刚手动扫过的书签在跳过窗口（默认 24 小时）内不会被自动扫描重复检查；两者共用同一份 `scan_settings`。

## 元数据生命周期与已知边界

- **创建**：用户打标签/收藏/写备注，或 AI 整理与死链检查写入。
- **对账与清理**：书签被删除 → 后台 `bookmarkListeners` 与 store 刷新时双重兜底调用 `reconcileMeta`：能给新节点认领的就认领（见下方"已知取舍"），暂时无人认领的先打 `orphanedAt` 等待 90 天，超时才真正清除。
- **备份**：设置页 → 书签管理 → 元数据导出/导入（JSON，合并写入）。导出内容含 aux 三张表与 AI 学习规则 `learnedDomainRules`（后者按 key 合并，导入方优先）。
- **重装扩展**：浏览器书签无损，仅丢失增强元数据。

**元数据与书签的关联方式**：以书签节点 id 为主键，同时记录规范化 URL 键 `urlKey`。浏览器里的节点 id 会变——**删除后重新添加**同一个链接、或换设备时 Chrome 同步带来的新 id——此时由 `reconcileMeta` 按 `urlKey` 把元数据**认领**回新节点，标签与备注不会丢。无人认领的元数据保留 90 天（`ORPHAN_META_TTL_MS`）后清理，避免无限增长。

**仍存的边界**：认领只在"新节点还没有自己的元数据"时发生，所以如果同一个链接同时存在多份、且各自都打过标签，重加后只能认回其中一份；另外两份同名书签的元数据不会自动合并。

**另一个已知取舍**：AI 学习规则的粒度是**整个域名**（`learnedDomainRules` 以域名为 key）。同一域名的多用途书签会共用一条规则、互相覆盖，学错时在下一次学习覆盖它之前会一直抢先于 LLM。因此设置页 → AI 设置提供了「AI 学习规则」面板用于查看与清空，让误学可发现、可撤销；不做"域名 + 内容类型"细粒度的原因见 `@/lib/learnedRules` 的注释（本地 `inferContentType` 主要看 URL 与域名，同一域名通常只映射到同一类型，细化收益小却明显降低命中率）。

## 已移除（v0.5 → v0.6）

- 自建 IndexedDB 书签库（`SmartBookmarkDB`）与 `bookmarkService` / `folderService` / `tagService` / `searchService`
- 三个同步服务：`browserSyncService`（推送到浏览器）、`folderSyncService`（文件夹双向映射）、`syncService`（Supabase 云同步）
- 语义搜索（embeddings）与创建书签时的自动 AI 分类
- 后台消息分发层（UI 已无调用方）

历史设计稿已从仓库删除，需要考古时用 `git log --diff-filter=D --name-only -- claudedocs` 找回。

## 测试策略

- 服务层单测：注入假 `chrome` API（`BookmarksApi` 等）+ `fake-indexeddb`（aux），覆盖树规范化、查重、空文件夹检测、整理建议/应用与学习回流、死链判定与并发队列、健康报告的零查询聚合、自动检查的分片/续跑/让路逻辑、档案计算。
- 基础库单测：元数据对账（`reconcileMeta` 的认领 / 补齐 / 等待 / 清理）、学习规则的存取与容量裁剪（`learnedRules`）、DeepSeek 客户端的请求重试策略（`deepseekClient`）。
- entrypoints 单测：后台消息处理与启动装配（`commandHandlers`、`setup`）。
- store 单测：事件订阅、元数据联动清理、标签派生。
- 现状：12 个测试文件 / 82 个用例。`aiService` 规则引擎、`deepseekAIService`、UI 组件尚无覆盖。
- 每次提交前跑 `pnpm verify`（= typecheck / lint / test:run / build）；`.github/workflows/ci.yml` 在 push 到 master 与 PR 时执行同样四步。

## 相关文档

- [API 参考](./api.md)
- [开发指南](./development.md)
- [文档索引](./README.md)
- [项目 README](../README.md)
