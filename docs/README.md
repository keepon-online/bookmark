# 智能书签 · 文档索引

> 浏览器书签增强扩展（Chrome MV3）· 当前版本 **0.7.0**（`package.json` 与 `wxt.config.ts` 的 `manifest.version`；UI 里通过 `getExtensionVersion()` 读取，不要写死）

本目录只保留**与当前代码一致**的现状文档。v0.5 时期的历史设计稿（自建书签库、Supabase 云同步、文件夹双向同步等）已在 v0.6 重构时删除，需要考古时从 git 历史取回：

```bash
git log --diff-filter=D --name-only -- claudedocs docs/design docs/test
git show <commit>:claudedocs/architecture_smart_bookmark_20250119.md
```

## 📖 四份文档

| 文档 | 内容 | 什么时候看 |
|---|---|---|
| [项目 README](../README.md) | 功能特性、技术栈、快速开始 | 第一次接触项目 |
| [架构设计](./architecture.md) | 数据源原则、分层、服务职责、v0.5 → v0.6 变更 | 要改数据层或服务边界 |
| [API 参考](./api.md) | services / lib / stores 的导出签名与用法 | 要调用已有能力 |
| [开发指南](./development.md) | 环境、代码约定、测试、构建发布、故障排查 | 要动手写代码 |

## 项目一句话

**`chrome.bookmarks` 是唯一数据源。** 书签的读、写、移动全部直连浏览器书签 API，跨设备同步交给 Chrome 账号自带能力；扩展自有的 IndexedDB（`SmartBookmarkAuxDB`）只存浏览器书签没有的增强元数据——标签、备注、收藏、访问次数、死链状态——按书签节点 id 关联，可随时导出、重建或丢弃。卸载扩展不丢任何书签，也不需要数据迁移。

## 技术栈

| 层 | 选型 |
|---|---|
| 扩展框架 | WXT 0.20（Manifest V3） |
| 界面 | React 18 + TypeScript 5.6（strict）+ Tailwind CSS 3.4 + Radix UI + Lucide |
| 状态管理 | Zustand 4（整树快照 + 视图状态） |
| 数据 | `chrome.bookmarks`（唯一数据源）+ Dexie 4 / IndexedDB（增强元数据） |
| 搜索 | Fuse.js 7 |
| AI | 本地规则引擎（免配置，默认）+ DeepSeek API（可选，用户自带 key） |
| 测试 | Vitest 2 + happy-dom + fake-indexeddb |

## 目录结构

```
src/
├── entrypoints/              # WXT 入口（每个目录一个扩展页面/脚本）
│   ├── background/           # Service Worker：快捷键、右键菜单、消息、定时任务
│   │   ├── setup/            #   commands / contextMenus / bookmarkListeners / alarms
│   │   └── messages/         #   commandHandlers
│   ├── popup/                # 工具栏弹窗（快速添加 / 编辑当前页）
│   ├── sidepanel/            # 侧边栏主界面（浏览、搜索、批量操作）
│   └── options/              # 设置页（Bookmarks / AI / Organizer / Health / Advanced …）
├── components/               # React 组件
│   ├── ai/  batch/  bookmark/  dashboard/  linkHealth/  organizer/  search/  ui/
├── services/                 # 业务逻辑（见 docs/api.md）
│   ├── browserBookmarksService.ts   # chrome.bookmarks 薄封装：树规范化、事件、CRUD、查重
│   ├── aiService.ts                 # 本地规则分类引擎（免 API）
│   ├── deepseekAIService.ts         # DeepSeek 分类、缓存、成本统计
│   ├── organizerService.ts          # AI 整理：suggest（只读）→ apply（写入）
│   ├── linkHealthService.ts         # 死链检查：并发、限流、进度、报告
│   └── profileService.ts            # 书签档案：纯计算统计/域名/分类/趋势
├── lib/                      # 基础设施
│   ├── auxDatabase.ts        # Dexie 增强元数据库 + 元数据对账（urlKey 认领/清理）+ 导入导出
│   ├── httpChecker.ts        # HTTP 检查器：错误分级、重试、软 404
│   ├── deepseekClient.ts     # DeepSeek HTTP 客户端（含 SSE 流式解析）
│   ├── messaging.ts          # 与 background 的类型化消息通道
│   ├── logger.ts             # 统一日志（VITE_LOG_LEVEL 控制）
│   ├── extensionInfo.ts      # 从 manifest 读版本号等扩展自身信息
│   └── utils.ts  urlAnalyzer.ts
├── stores/                   # browserBookmarkStore / uiStore
├── types/                    # 领域模型（bookmark / browserBookmarks / organizer / linkHealth / profile / ai / messages）
├── styles/                   # 全局样式
└── test/                     # Vitest 全局 setup（chrome mock + 手写 indexedDB 桩）
```

## 常用命令

```bash
pnpm install        # 安装依赖（postinstall 自动执行 wxt prepare，生成 .wxt/ 类型）

pnpm dev            # Chrome 开发模式（HMR）
pnpm dev:firefox    # Firefox 开发模式
pnpm build          # 生产构建 → .output/chrome-mv3
pnpm build:firefox  # 生产构建 → .output/firefox-mv2
pnpm zip            # 打包成可上传商店的 zip
pnpm zip:firefox

pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm test           # vitest（监听模式）
pnpm test:run       # vitest 单次跑完（CI 用法）
pnpm test:ui        # vitest UI
pnpm test:coverage  # 覆盖率（v8）
pnpm verify         # typecheck + lint + test:run + build 一条龙
```

## 代码规模（截至本次文档整理）

| 范围 | 文件 | 总行数 |
|---|---|---|
| 全部 `src/` | 108 | 15931 |
| 其中源码（`*.ts` / `*.tsx`，不含测试） | 88 | 13038 |
| 其中测试（13 个 `*.test.ts` + `src/test/setup.ts`） | 14 | 2709 |
| services | 8 | 2996 |
| components | 36 | 5307 |
| lib | 11 | 1649 |
| entrypoints | 22 | 1882 |
| types | 8 | 715 |
| stores | 3 | 489 |

> 统计口径：总行数含空行、按 LF 计数，不含 `node_modules`、`.output`、`.wxt`。本表是快照，改动代码后请顺手更新。

测试：**13 个测试文件 / 94 个用例**（`typecheck`、`lint`、`test` 当前全绿）。注意 `src/test/setup.ts` 只提供 chrome mock 与手写的 indexedDB 桩，**用到 Dexie 的测试必须在文件顶部自行 `import 'fake-indexeddb/auto'`**。
构建产物：`.output/chrome-mv3` 共 17 个文件 / 649 KB（未压缩目录，`pnpm build` 实测）。

## 配置

| 配置项 | 位置 | 说明 |
|---|---|---|
| DeepSeek API Key | 设置页 → AI 设置 → `chrome.storage.local.deepseekConfig` | **不走 `.env`，不进代码库**；本地规则引擎免配置，不填也能用 |
| 日志级别 | `VITE_LOG_LEVEL`=`debug\|info\|warn\|error\|none` | 未设置时：开发 `debug`、生产 `error` |
| 主机权限 | `optional_host_permissions`（`http://*/*`、`https://*/*`） | 死链检查首次运行时通过 `chrome.permissions.request` 申请；未授权时降级判定为"无法连接"而不是"死链" |
| 开发服务器 | `wxt.config.ts` → `dev.server` | 显式绑定 `127.0.0.1:3000`，规避 Windows 下 `localhost` 只解析 IPv6 的问题 |

## 文档维护约定

- 改了任何模块的导出 API → 同步更新 [api.md](./api.md)。
- 改了数据源或服务边界 → 同步更新 [architecture.md](./architecture.md)。
- **`docs/` 不放设计稿。** 设计过程、方案对比、调研笔记请放在提交信息或临时草稿里，不要沉淀成与代码脱节的长期文档——这正是 v0.6 之前那批文档变成负担的原因。
