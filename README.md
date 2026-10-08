# 智能书签

浏览器书签增强扩展（v0.7）

**chrome.bookmarks 是唯一数据源**——书签直接保存在浏览器中，由 Chrome
账号跨设备同步；扩展在其上叠加增强能力，随时可卸载、零数据迁移负担。

## 功能特性

- 📁 **原生书签管理** — 直接读写浏览器书签树，文件夹树浏览、增删改移
- 🔍 **秒级搜索** — 标题/URL/标签/路径模糊搜索，内存快照零等待
- 🏷️ **标签与收藏** — 浏览器书签没有的字段存扩展元数据，支持 JSON 备份
- 🧠 **AI 智能整理** — 手动触发，生成建议 → 预览确认 → 执行（本地规则
  引擎免配置，可选接入 DeepSeek）
- 🧹 **书签清理** — 重复检测（URL 规范化分组）、空文件夹清理
- ❤️ **链接健康** — 批量死链检查，可停止、可跳过近期已检查项，可设置定时自动检查（后台分批执行，可续跑）
- 📊 **书签档案** — 域名分布、分类画像、组织度评分、收藏家等级
- 📱 **侧边栏** — Chrome Sidepanel 常驻，快捷键 Alt+Shift+S

## 技术栈

- **框架**: WXT (Manifest V3)
- **前端**: React 18 + TypeScript
- **状态管理**: Zustand
- **UI**: Tailwind CSS + Radix UI
- **数据**: chrome.bookmarks（唯一数据源）+ IndexedDB/Dexie（增强元数据）
- **搜索**: Fuse.js

## 开发

```bash
pnpm install     # 安装依赖
pnpm dev         # 开发模式
pnpm test        # 单元测试（监听）
pnpm build       # 构建
pnpm zip         # 打包
pnpm verify      # 提交前自检：typecheck + lint + test + build
```

## 文档

- [文档索引](./docs/README.md)
- [架构设计](./docs/architecture.md)
- [API 参考](./docs/api.md)
- [开发指南](./docs/development.md)

## 项目结构

```
src/
├── entrypoints/
│   ├── background/   # Service Worker（快捷键/右键菜单/事件清扫）
│   ├── popup/        # 快速操作弹窗
│   ├── sidepanel/    # 主界面侧边栏
│   └── options/      # 设置页
├── components/       # React 组件
├── stores/           # browserBookmarkStore + uiStore
├── services/         # browserBookmarks/organizer/linkHealth/profile/ai
├── lib/              # auxDatabase/messaging/httpChecker/utils
└── types/            # TypeScript 类型
```

## 许可证

MIT，见 [LICENSE](./LICENSE)。
