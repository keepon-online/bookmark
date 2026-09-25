# 架构设计文档（v0.6）

本文档描述智能书签扩展 v0.6 重构后的系统架构。

## 核心原则

**chrome.bookmarks 是唯一数据源。**

扩展不再自建书签库：读取、写入全部直连浏览器书签 API，由 Chrome 账号
自带跨设备同步。扩展自有数据库（SmartBookmarkAuxDB）只存浏览器书签
没有的增强元数据，可随时重建或丢弃。

三条硬约束：

1. **写操作直连 chrome.bookmarks**——没有中间库，没有同步服务，
   从根上消除双库冲突。
2. **AI 只建议，不执行**——所有 AI 整理遵循"生成建议 → 预览勾选 →
   确认执行"流程，绝不静默移动或打标。
3. **内存即缓存**——整树加载进 Zustand 后靠书签事件（去抖重载）
   保持同步，浏览/搜索零数据库往返。

## 架构总览

```
chrome.bookmarks（唯一数据源，树 + 事件）
        │
browserBookmarksService        ← 树加载/规范化/事件订阅/CRUD 透传/
        │                        ensureFolderPath/重复分组/空文件夹检测
browserBookmarkStore (Zustand) ← 整树快照 + 视图状态，事件去抖重载
        │
        ├── useBookmarkFilter   ← 文件夹闭包 + 快速过滤 + Fuse.js 搜索
        │
UI: popup / sidepanel / options
        │
SmartBookmarkAuxDB (Dexie)     ← 增强元数据，按书签节点 id 关联
  - bookmarkMeta:  tags[] / notes / isFavorite / visitCount /
                   lastVisited / linkStatus / linkCheckedAt / aiGenerated
  - linkChecks:    死链检查历史
  - organizeHistory: AI 整理历史
```

Background（Service Worker）职责收缩为：快捷键（quick-add、
toggle-favorite、侧边栏开关）、右键菜单、书签删除事件的孤儿元数据清扫、
定时任务占位（link-health-check）。消息通道仅保留 `GET_CURRENT_TAB`。

## 服务层

| 服务 | 职责 | 数据源 |
|---|---|---|
| browserBookmarksService | chrome.bookmarks 薄封装：树规范化、事件订阅、CRUD、按路径确保文件夹、urlKey 重复分组、空文件夹检测 | chrome.bookmarks |
| organizerService | AI 整理：suggest（只读建议）/ apply（确认后执行）/ 历史 | 树快照 + chrome.bookmarks + aux |
| linkHealthService | 死链检查：批量并发检查、进度、停止、健康报告 | 树快照 + aux + httpChecker |
| profileService | 书签档案：纯计算（统计/域名/分类/趋势/组织度/收藏家等级） | 树快照 + aux |
| aiService | 本地规则分类引擎（免 API，默认降级方案） | 无 |
| deepseekAIService | DeepSeek LLM 分类（可选，用户配置） | chrome.storage |

## 元数据生命周期

- 书签创建/删除事件驱动：`onRemoved` → 孤儿元数据清扫（后台 +
  store 刷新时双重兜底）
- aux 数据可通过 JSON 导出/导入备份（设置页 → 书签管理）
- 重装扩展：浏览器书签无损，仅丢增强元数据

## 已移除（v0.5 → v0.6）

- 自建 IndexedDB 书签库（SmartBookmarkDB）与 bookmarkService /
  folderService / tagService / searchService
- 三个同步服务：browserSyncService（推送到浏览器）、
  folderSyncService（文件夹双向映射）、syncService（Supabase 云同步）
- 语义搜索（embeddings）与创建书签时的自动 AI 分类
- 后台消息分发层（UI 已无调用方）

## 测试策略

- 服务层单测：注入 fake chrome API + fake-indexeddb（aux），
  覆盖树规范化、查重、整理建议/应用、死链检查、档案计算
- store 单测：事件订阅、元数据联动清理
- 每次提交前跑 typecheck / eslint / vitest / wxt build

## 📚 相关文档

- [开发指南](./development.md)
- [项目 README](../README.md)
