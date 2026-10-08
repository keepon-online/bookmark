# 开发指南

面向要在这个仓库里改代码的人。先读 [架构设计](./architecture.md) 了解"为什么这么分层"，再回来看怎么动手。

## 环境要求

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | ≥ 18 | WXT 0.20 的要求 |
| pnpm | ≥ 8 | 仓库使用 `pnpm-lock.yaml` + `pnpm-workspace.yaml`（含 esbuild / spawn-sync 的构建脚本白名单） |
| Chrome / Edge | ≥ 120 | 主要开发目标 |
| Firefox | ≥ 120 | 次要目标（`-b firefox`，产物为 MV2） |

## 起步

```bash
pnpm install     # postinstall 自动执行 wxt prepare，生成 .wxt/ 类型声明
pnpm dev         # Chrome 开发模式，带 HMR
```

加载扩展：

1. 打开 `chrome://extensions`，开启右上角「开发者模式」。
2. 「加载已解压的扩展程序」，选择 `.output/chrome-mv3-dev`（生产构建则是 `.output/chrome-mv3`）。
3. 改代码后自动重载；改了 `wxt.config.ts` 的 manifest 需要重启 `pnpm dev`。

调试入口：`chrome://extensions` → 该扩展 →「检查视图 service worker」（后台）、右键扩展图标 →「检查弹出内容」（popup）。侧边栏与设置页可以直接用 DevTools 打开。

> `.wxt/`、`.output/`、`node_modules/` 都在 `.gitignore` 里，不要提交。

## 代码约定

### 1. 数据源：这是全项目最重要的一条

- **书签的增、删、改、移一律走 `src/services/browserBookmarksService.ts`**，也就是 `chrome.bookmarks`。不要新建"书签表"，不要在前端直接拼 `chrome.bookmarks.*` 调用。
- **只有浏览器书签没有的字段才写 aux 库**（`src/lib/auxDatabase.ts`），并且必须以书签节点 id 关联。新字段加到 `AuxBookmarkMeta`（`src/types/browserBookmarks.ts`），设置页的元数据导出/导入会自动带上。
- **需要跨"节点 id 变化"存活的字段**（标签、备注这类用户资产）靠 `AuxBookmarkMeta.urlKey` 兜底：`reconcileMeta` 会在书签被重加或换设备同步后按 `urlKey` 把元数据认领回新节点。新增这类字段时不需要额外做什么，但**不要**自己按 id 删除元数据，交给 `reconcileMeta` 统一处理。
- **写操作之后刷新快照**，不要手改 `browserBookmarkStore` 里的 `tree` / `bookmarks`。浏览器书签事件会去抖触发整树重载，手动改内存只会造成状态错位。
- **AI 只建议，不执行。** 任何自动整理都必须遵循「生成建议 → 用户预览勾选 → 确认执行」两段式（见 `organizerService.suggest` / `apply`）。

### 2. TypeScript

`tsconfig.json` 开了 `strict` + `noUnusedLocals` + `noUnusedParameters`，未使用的变量/参数会直接让 `pnpm typecheck` 失败。新增领域模型放 `src/types/`，不要在组件里就地定义跨模块类型。

### 3. React 与样式

- `jsx` 已配置为 `react-jsx`，**可以正常写 JSX**。仓库里同时存在 JSX 与 `React.createElement` 两种写法（历史原因），两种都能编译；**新代码用 JSX**，不必回头改造旧文件。
- 样式统一走 Tailwind 工具类 + `cn()`（`src/lib/utils.ts`）；基础组件在 `src/components/ui/`，业务组件按功能放 `src/components/<feature>/`，每个目录用 `index.ts` 汇总导出。
- 图标用 `lucide-react`，不要内联 SVG（`CircularProgress` 这类需要精确控制的除外）。

### 4. 依赖注入，不要直接摸 `chrome`

服务类通过构造函数或参数接收 chrome API（例如 `BrowserBookmarksService` 接收一个 `BookmarksApi`），而不是在方法里直接引用全局 `chrome`。这样测试可以注入假实现，也是现有测试能跑起来的前提。

### 5. 日志

```typescript
import { createLogger } from '@/lib/logger';

const logger = createLogger('ModuleName');
logger.debug('调试信息', data);
logger.info('普通信息', { count: 10 });
logger.warn('警告');
logger.error('失败', error);
```

级别由 `VITE_LOG_LEVEL` 控制，未设置时开发环境 `debug`、生产 `error`。

> 全仓库的日志已统一走 logger（`src/lib/logger.ts` 是唯一直接调用 `console` 的地方）。**新代码请沿用这个约定。**

### 6. 错误处理

用户可感知的失败要给出可行动的提示（例如"没有网站访问权限"而不是"检查失败"），内部错误再 `logger.error`。涉及书签写操作时，捕获异常后不要吞掉——用户需要知道哪一条没成功。

## 测试

```bash
pnpm test            # 监听模式
pnpm test:run        # 单次跑完（CI 用法）
pnpm test:ui         # 浏览器 UI
pnpm test:coverage   # v8 覆盖率
```

配置在 `vitest.config.ts`：环境 `happy-dom`，全局 setup 为 `src/test/setup.ts`，别名 `@` → `src`。

现状：**13 个测试文件 / 94 个用例**。按文件分布：`regressions.test.ts`（23 例，死链判定、并发队列、`httpChecker`、候选筛选、健康报告聚合与 aux 相关回归）、`deepseekAIService`(11，JSON 解析健壮性、缓存命中、成本统计与 30 天裁剪、分批与回退契约)、`organizerService`(9)、`auxDatabase`(8，元数据对账/认领/合并/清理)、`linkHealthAutoScan`(7，分片/续跑/让路)、`browserBookmarksService`(6)、`browserBookmarkStore`(6)、`deepseekClient`(5，请求重试策略)、`learnedRules`(5)、`setup`(5)、`commandHandlers`(3)、`profileService`(3)、`uiStore`(3)。UI 组件与 `aiService` 的规则表本身仍无测试。

三条实践约定：

1. **`src/test/setup.ts` 已经把 `global.chrome` 打成了 `vi.fn` 组成的假对象**，`console.log/debug` 也被静音以减少噪音。测试里直接用 `chrome.bookmarks.create` 等，不必自己 mock 全局。
2. **需要真 IndexedDB（也就是用到 Dexie / `auxDb`）的测试，必须在文件顶部加 `import 'fake-indexeddb/auto';`** —— setup.ts 里那个手写的 `indexedDB` 桩只够应付调用，撑不起 Dexie 的事务。参考 `src/stores/__tests__/browserBookmarkStore.test.ts`。
3. **测服务时注入假 chrome API，而不是 mock 整个 `chrome` 全局**，这样才能验证事件订阅、参数传递等真实行为：

```typescript
import { describe, expect, it, vi } from 'vitest';
import { BrowserBookmarksService, type BookmarksApi } from '@/services/browserBookmarksService';

const fakeApi = {
  getTree: async () => [rootNode],           // 自己拼一棵树
  getChildren: async (id: string) => [],
  create: vi.fn(async (arg) => ({ id: 'new', ...arg })),
  update: vi.fn(async (id, changes) => ({ id, ...changes })),
  move: vi.fn(async (id, destination) => ({ id, ...destination })),
  remove: vi.fn(async () => undefined),
  removeTree: vi.fn(async () => undefined),
  onCreated: { addListener: vi.fn(), removeListener: vi.fn() },
  onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
  onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  onMoved: { addListener: vi.fn(), removeListener: vi.fn() },
  onChildrenReordered: { addListener: vi.fn(), removeListener: vi.fn() },
} as unknown as BookmarksApi;

const service = new BrowserBookmarksService(fakeApi);
const snapshot = await service.loadTree();
expect(snapshot.bookmarks).toHaveLength(1);
```

完整样例见 `src/services/__tests__/browserBookmarksService.test.ts`。

## 提交前自检

```bash
pnpm verify   # = typecheck && lint && test:run && build
```

CI（`.github/workflows/ci.yml`）在 push 到 `master` 与 PR 时会跑同样的四步，本地先跑一遍能省一次往返。任何一步红了都不要提交。

> CI 里几个刻意钉住的版本：runner 用 `ubuntu-24.04` 而不是 `ubuntu-latest`（后者将在 2026-11 切到 26.04，避免构建环境被无声换掉）；pnpm 固定 11，与本仓库 `pnpm-workspace.yaml` 的 `allowBuilds` 构建脚本白名单匹配；安装用 `pnpm install --frozen-lockfile`，锁文件与依赖不一致会直接失败而不是偷偷改写。

提交信息用约定式前缀：`feat:` / `fix:` / `docs:` / `refactor:` / `perf:` / `test:` / `chore:`，冒号后写中文说明。

## 构建与发布

```bash
pnpm build          # .output/chrome-mv3
pnpm build:firefox  # .output/firefox-mv2
pnpm zip            # .output/*.zip，用于上传商店
```

**版本号要改两处并保持一致**：

1. `package.json` 的 `version`
2. `wxt.config.ts` 里 `manifest.version`

改完提交并打标签：

```bash
git add package.json wxt.config.ts
git commit -m "chore: bump version to 0.7.0"
git tag v0.7.0 && git push && git push --tags
```

> 当前 `package.json` 与 manifest 都是 `0.6.0`，但 `master` 上已有标注为 v0.7 的功能提交（可撤销整理、建议微调、规则扩充）。发版前记得把版本号补齐。

## 故障排查

### 死链检查把所有链接都判成"无法连接"

没拿到主机权限。跨源 `fetch` 在没有 `http://*/*`、`https://*/*` 权限时会被 CORS 拦下。检查 `chrome://extensions` → 该扩展 →「网站访问权限」是否为「在所有网站上」；代码入口是 `linkHealthService.ensureHostPermissions()`（必须由用户手势触发，即按钮点击）。未授权时 `httpChecker` 会把结果标为 `blocked` 并**不作为死链**，这是有意设计，别改成误判。

### 定时自动检查没有跑

自动检查默认**关闭**，先在设置页 → 链接健康 → 扫描设置里开启并选间隔。仍不跑时按顺序查：

1. 在 `chrome://extensions` → 该扩展 →「检查视图 service worker」的 Console 里执行 `chrome.alarms.getAll()`，应能看到 `link-health-check`；没有就在设置页改一次开关（会触发 `syncAutoScanAlarm`）
2. `chrome.storage.local.get('linkHealthAutoScanProgress')`：带 `runningSince` 表示某批正在进行；只有 `lastFinishedAt` 表示本轮已跑完
3. 若进度里有 `lastError`，多半是权限被撤（结果记为"无法连接"）或上一轮还没跑完（同一时刻只允许一批）
4. 想看效果不必等到间隔到点：设成 6 小时（下限 1 小时），或在 SW Console 里 `chrome.alarms.create('link-health-check', { delayInMinutes: 1 })` 手动催一次

### dev 模式下扩展页面连不上开发服务器

`wxt.config.ts` 已把 dev server 显式绑定到 `127.0.0.1:3000`。Windows + Node 17+ 下 `localhost` 可能只解析到 IPv6 `::1`，导致 Chrome 走 IPv4 连接被拒。如果你改了端口或 host，记得同步 `dev.server.origin`。

### IndexedDB 查询报 `IDBKeyRange` / 查不到数据

不要对可能为 `undefined` 的索引字段使用 `where().equals()`，改用 `filter()`。索引定义见 `src/lib/auxDatabase.ts`。

### `defineBackground`、`import.meta.env` 找不到类型

`.wxt/` 目录未生成，跑一次 `pnpm wxt prepare`（`pnpm install` 的 postinstall 会自动执行）。

### 改了 manifest / 权限没生效

重新 `pnpm build`（或重启 `pnpm dev`），然后在 `chrome://extensions` 点该扩展的刷新按钮。权限变更后浏览器可能会禁用扩展，需要手动重新启用。

### 样式不生效

确认 `tailwind.config.js` 的 `content` 覆盖到了你新增的目录，然后重新构建。`src/styles/globals.css` 是唯一的全局样式入口。

## 相关文档

- [架构设计](./architecture.md)
- [API 参考](./api.md)
- [文档索引](./README.md)
- [项目 README](../README.md)
