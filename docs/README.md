# 智能书签 - 项目总览

> AI 驱动的智能书签管理浏览器扩展

[![Version](https://img.shields.io/badge/version-0.5.0-blue.svg)](./package.json)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![WXT](https://img.shields.io/badge/WXT-0.20.13-purple.svg)](https://wxt.dev)

## 📖 项目简介

智能书签是一个基于 AI 的浏览器扩展，通过 DeepSeek 大语言模型提供智能书签管理功能。支持自动分类、标签推荐、语义搜索、跨设备同步等高级功能。

### 核心特性

- 🤖 **AI 智能分类** - 使用 DeepSeek API 自动分析和分类书签
- 🏷️ **智能标签推荐** - 基于书签内容自动推荐相关标签
- 🔍 **语义搜索** - 超越关键词匹配的智能搜索
- 📁 **自动整理** - 一键智能整理杂乱的书签
- ☁️ **云端同步** - 基于 Supabase 的跨设备数据同步
- 🔗 **链接健康检查** - 定期检测失效链接
- 📊 **数据统计** - 可视化书签使用情况

## 🏗️ 项目结构

```
smart-bookmark/
├── src/
│   ├── components/        # React 组件
│   │   ├── ai/           # AI 配置和标签组件
│   │   ├── bookmark/     # 书签列表和卡片组件
│   │   ├── organizer/    # 书签整理组件
│   │   ├── stats/        # 数据统计组件
│   │   ├── sync/         # 同步设置组件
│   │   ├── ui/           # UI 基础组件
│   │   └── ...
│   ├── entrypoints/      # 扩展入口点
│   │   ├── background/   # 后台脚本
│   │   ├── options/      # 设置页面
│   │   ├── popup/        # 弹出页面
│   │   └── sidepanel/    # 侧边栏
│   ├── hooks/            # React Hooks
│   ├── lib/              # 工具库
│   │   ├── logger.ts     # 统一日志工具
│   │   ├── database.ts   # IndexedDB 数据库
│   │   ├── algorithms.ts # 算法实现
│   │   └── ...
│   ├── services/         # 业务逻辑服务
│   │   ├── aiService.ts           # AI 分类服务
│   │   ├── deepseekAIService.ts   # DeepSeek API 集成
│   │   ├── bookmarkService.ts     # 书签 CRUD
│   │   ├── folderService.ts       # 文件夹管理
│   │   ├── tagService.ts          # 标签管理
│   │   ├── browserSyncService.ts  # 浏览器同步
│   │   ├── syncService.ts         # 云端同步
│   │   ├── organizerService.ts    # 书签整理
│   │   ├── linkHealthService.ts   # 链接健康
│   │   └── statsService.ts        # 数据统计
│   ├── stores/           # 状态管理
│   ├── styles/           # 样式文件
│   └── types/            # TypeScript 类型定义
├── public/               # 静态资源
├── claudedocs/          # 设计文档
├── tests/               # 测试文件
└── docs/                # 项目文档
```

## 🛠️ 技术栈

### 核心框架
- **WXT** (v0.20.13) - WebExtension 开发框架
- **React** (v18.3.1) - UI 框架
- **TypeScript** (v5.6.3) - 类型安全

### 状态管理 & 数据
- **Zustand** (v4.5.5) - 轻量级状态管理
- **Dexie** (v4.0.8) - IndexedDB 封装
- **Supabase** (v2.45.4) - 云端数据库

### UI 组件
- **Tailwind CSS** (v3.4.14) - 样式框架
- **Radix UI** - 无障碍 UI 组件
- **Lucide React** - 图标库

### AI & 算法
- **DeepSeek API** - 大语言模型
- **Fuse.js** (v7.0.0) - 模糊搜索

### 开发工具
- **Vitest** (v2.1.4) - 单元测试
- **ESLint** (v9.14.0) - 代码检查

## 📊 代码统计

| 类别 | 数量 | 说明 |
|------|------|------|
| 组件 | 25+ | React UI 组件 |
| 服务 | 12+ | 业务逻辑服务 |
| 代码行数 | 5500+ | services 目录 |
| 类型定义 | 50+ | TypeScript 类型 |
| 入口点 | 4 | background, options, popup, sidepanel |

## 🚀 快速开始

### 安装依赖
```bash
pnpm install
```

### 开发模式
```bash
# Chrome
pnpm dev

# Firefox
pnpm dev:firefox
```

### 构建
```bash
# Chrome
pnpm build

# Firefox
pnpm build:firefox
```

### 打包
```bash
pnpm zip
```

## 📖 文档导航

### 核心文档
- [架构设计](./architecture.md) - 系统架构和设计模式
- [API 文档](./api.md) - 服务 API 参考
- [开发指南](./development.md) - 开发环境搭建和最佳实践
- [部署指南](./deployment.md) - 构建和发布流程

### 设计文档
- [AI 整理器设计](../claudedocs/ai_organizer_design_20250119.md)
- [设置页面设计](../claudedocs/settings_page_design_20250119.md)
- [同步故障排除](../claudedocs/sync_troubleshooting_guide.md)

### API 文档
- [书签服务](./services/bookmark-service.md) - 书签管理 API
- [AI 服务](./services/ai-service.md) - AI 分类 API
- [同步服务](./services/sync-service.md) - 数据同步 API

## 🔧 配置说明

### 环境变量
```bash
# DeepSeek API (必需)
VITE_DEEPSEEK_API_KEY=your_api_key
VITE_DEEPSEEK_BASE_URL=https://api.deepseek.com

# Supabase (可选,用于云端同步)
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# 日志级别 (可选)
VITE_LOG_LEVEL=debug|info|warn|error|none
```

### WXT 配置
详见 [wxt.config.ts](../wxt.config.ts)

## 🧪 测试

```bash
# 运行所有测试
pnpm test

# 测试 UI 模式
pnpm test:ui

# 覆盖率报告
pnpm test:coverage
```

## 📝 开发规范

### 代码风格
- 使用 TypeScript 严格模式
- 遵循 ESLint 规则
- 使用 Prettier 格式化代码

### Git 提交规范
```
feat: 新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式调整
refactor: 重构
test: 测试相关
chore: 构建/工具链相关
```

### 日志规范
```typescript
import { createLogger } from '@/lib/logger';

const logger = createLogger('ModuleName');
logger.debug('调试信息');
logger.info('普通信息');
logger.warn('警告信息');
logger.error('错误信息');
```

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

### 开发流程
1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'feat: Add AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

MIT License

## 👥 作者

- [@keepon-online](https://github.com/keepon-online)

## 🙏 致谢

- [WXT](https://wxt.dev) - 强大的 WebExtension 开发框架
- [DeepSeek](https://deepseek.com) - AI 模型支持
- [Radix UI](https://www.radix-ui.com) - 优秀的 UI 组件库
