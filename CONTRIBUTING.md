# 贡献指南

感谢你考虑为「智能书签」贡献代码！本文说明开发环境、代码规范与提交流程。

## 环境要求

- Node.js ≥ 22
- pnpm ≥ 11（`corepack enable` 后自动使用仓库锁定的版本）
- Chrome 或 Firefox 用于本地调试

## 快速开始

```bash
git clone https://github.com/keepon-online/bookmark.git
cd bookmark
pnpm install        # 安装依赖并生成 WXT 类型
pnpm dev            # Chrome 开发模式（加载 .output/chrome-mv3）
pnpm dev:firefox    # Firefox 开发模式
```

开发模式入口：Chrome 打开 `chrome://extensions` 开启「开发者模式」→
「加载已解压的扩展程序」选择 `.output/chrome-mv3`；Firefox 打开
`about:debugging` → 「此 Firefox」→ 「临时载入附加组件」选择
`.output/firefox-mv2/manifest.json`。

## 提交前自检

```bash
pnpm verify         # typecheck + lint + test + build 一条龙
```

PR 必须全部通过以下检查（CI 会原样执行）：

- `pnpm typecheck` —— 严格模式类型检查
- `pnpm lint` —— ESLint（`.ts` / `.tsx`）
- `pnpm test:run` —— Vitest 单元测试
- `pnpm build` / `pnpm build:firefox` —— 双端生产构建

涉及同步、存储、搜索流程的改动请附 `pnpm test:coverage` 结果，
并为核心目录（`src/services`、`src/lib`、`src/stores`）保持或提升覆盖率。

## 代码规范

- TypeScript 严格模式；路径别名 `@/` 指向 `src/`
- 函数式 React 组件；单引号、带分号
- 组件与页面文件用 `PascalCase`（如 `SettingsPage.tsx`）；
  hooks / services / stores / 工具用 `camelCase`（如 `folderSyncService.ts`）
- 目录职责：入口 `src/entrypoints/`、共享 UI `src/components/`、
  可复用逻辑 `src/hooks/`、跨切面工具 `src/lib/`、领域逻辑 `src/services/`、
  Zustand store `src/stores/`、共享类型 `src/types/`
- 设计与测试笔记放 `docs/design/`、`docs/test/`

## 测试

- Vitest 运行于 `happy-dom`，共享 setup 在 `src/test/setup.ts`；
  IndexedDB 相关用例使用 `fake-indexeddb`
- 测试与被测代码同目录，放在 `__tests__/` 下，命名 `*.test.ts` / `*.spec.ts`
- 重构前先为核心服务行为补测试

## 提交与 PR 约定

- 提交信息使用约定式前缀：`feat:` / `fix:` / `refactor:` / `test:` / `docs:` / `chore:`，
  祈使句短摘要，一次提交只做一件事
- PR 描述需说明用户可见的变更、验证步骤（上面四项检查）、
  UI 变更附截图或录屏
- 谨慎修改 `wxt.config.ts` 权限；manifest 变更必须在 PR 中明确指出
- 主分支为 `master`，请从特性分支发起 PR

## 行为准则

保持友善与专业，对事不对人。讨论聚焦技术与用户价值。
