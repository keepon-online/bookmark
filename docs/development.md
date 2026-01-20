# 开发指南

本文档提供智能书签扩展开发的完整指南。

## 📋 目录

- [环境准备](#环境准备)
- [项目搭建](#项目搭建)
- [开发工作流](#开发工作流)
- [代码规范](#代码规范)
- [测试指南](#测试指南)
- [构建部署](#构建部署)
- [故障排查](#故障排查)

---

## 环境准备

### 系统要求

- **Node.js**: >= 18.0.0
- **pnpm**: >= 8.0.0 (推荐) 或 npm >= 9.0.0
- **Git**: >= 2.0.0

### 安装工具

```bash
# 安装 pnpm (推荐)
npm install -g pnpm

# 或使用 npm
npm install -g npm@latest
```

### 浏览器

- **Chrome/Chromium**: >= 120 (开发主要目标)
- **Firefox**: >= 120 (次要支持)
- **Edge**: >= 120 (Chromium 内核)

---

## 项目搭建

### 1. 克隆项目

```bash
git clone https://github.com/keepon-online/bookmark.git
cd bookmark
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置环境变量

创建 `.env` 文件：

```bash
# DeepSeek API (必需)
VITE_DEEPSEEK_API_KEY=your_api_key_here
VITE_DEEPSEEK_BASE_URL=https://api.deepseek.com
VITE_DEEPSEEK_MODEL=deepseek-chat

# Supabase (可选,用于云端同步)
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# 日志级别
VITE_LOG_LEVEL=debug  # 开发环境使用 debug
```

### 4. 初始化数据库

WXT 会自动创建 IndexedDB，无需手动操作。

### 5. 启动开发服务器

```bash
# Chrome
pnpm dev

# Firefox
pnpm dev:firefox
```

### 6. 加载扩展

1. 打开浏览器扩展管理页面
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择项目目录下的 `.output/chrome-mv3` (自动生成)

---

## 开发工作流

### 热重载

WXT 支持热模块替换(HMR)：

```bash
pnpm dev
```

修改代码后会自动重新加载扩展。

### 项目结构

```
src/
├── components/       # React 组件
│   ├── ui/          # 基础 UI 组件
│   ├── bookmark/    # 书签相关组件
│   ├── organizer/   # 整理功能组件
│   └── ...
├── services/        # 业务逻辑
│   ├── bookmarkService.ts
│   ├── folderService.ts
│   └── ...
├── lib/            # 工具库
│   ├── database.ts
│   ├── logger.ts
│   └── ...
├── entrypoints/    # 扩展入口
│   ├── background/ # 后台脚本
│   ├── options/    # 设置页面
│   ├── popup/      # 弹出页面
│   └── sidepanel/  # 侧边栏
├── hooks/          # React Hooks
├── stores/         # Zustand 状态
├── types/          # TypeScript 类型
└── styles/         # 全局样式
```

### 创建新组件

1. 在 `src/components/` 下创建组件文件
2. 使用 React.createElement (项目约定):

```typescript
// src/components/myFeature/MyComponent.tsx
import * as React from 'react';

interface MyComponentProps {
  title: string;
  onClick?: () => void;
}

export function MyComponent({ title, onClick }: MyComponentProps) {
  return React.createElement('div', {
    className: 'p-4 bg-white rounded',
    onClick: onClick,
  },
    React.createElement('h2', { className: 'text-xl' }, title)
  );
}
```

3. 导出组件:

```typescript
// src/components/myFeature/index.ts
export * from './MyComponent';
```

4. 使用组件:

```typescript
import { MyComponent } from '@/components/myFeature';
```

### 创建新服务

1. 在 `src/services/` 创建服务文件:

```typescript
// src/services/myService.ts
import { createLogger } from '@/lib/logger';

const logger = createLogger('MyService');

export class MyService {
  async doSomething(data: any) {
    logger.debug('Doing something...', data);
    // 业务逻辑
    return result;
  }
}

export const myService = new MyService();
```

2. 导出服务:

```typescript
// src/services/index.ts
export * from './myService';
```

3. 使用服务:

```typescript
import { myService } from '@/services';
await myService.doSomething(data);
```

---

## 代码规范

### TypeScript 规范

**使用严格模式:**

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true
  }
}
```

**类型定义:**

```typescript
// ✅ 好的做法
interface Bookmark {
  id: string;
  url: string;
  title: string;
  tags: string[];
  createdAt: number;
}

// ❌ 避免
const bookmark: any = {};

// ✅ 使用联合类型
type Status = 'active' | 'archived' | 'broken';
```

### React 规范

**使用 React.createElement:**

```typescript
// ✅ 项目约定
import * as React from 'react';

export function Component() {
  return React.createElement('div', { className: 'p-4' },
    React.createElement('h1', null, 'Title')
  );
}

// ❌ 不使用 JSX (项目未配置)
export function Component() {
  return <div className="p-4"><h1>Title</h1></div>;
}
```

**组件命名:**

- 组件文件: PascalCase (如 `BookmarkCard.tsx`)
- 组件函数: PascalCase (如 `BookmarkCard`)
- 工具函数: camelCase (如 `formatDate`)

### 日志规范

**使用统一日志工具:**

```typescript
import { createLogger } from '@/lib/logger';

const logger = createLogger('ModuleName');

// 开发调试
logger.debug('Debug info', data);

// 普通信息
logger.info('Process completed', { count: 10 });

// 警告
logger.warn('Deprecated API used', { api: 'oldMethod' });

// 错误
logger.error('Processing failed', error);
```

**不要使用 console:**

```typescript
// ❌ 避免
console.log('Debug info');
console.error('Error', error);

// ✅ 使用 logger
logger.debug('Debug info');
logger.error('Error', error);
```

### 错误处理

**统一的错误处理模式:**

```typescript
try {
  await someAsyncOperation();
} catch (error) {
  logger.error('Operation failed', error);
  // 可选: 重新抛出或返回默认值
  throw new Error(`Failed to process: ${error}`);
}
```

**自定义错误类型:**

```typescript
export class BookmarkNotFoundError extends Error {
  constructor(id: string) {
    super(`Bookmark not found: ${id}`);
    this.name = 'BookmarkNotFoundError';
  }
}
```

---

## 测试指南

### 单元测试

使用 Vitest：

```typescript
// tests/unit/bookmarkService.test.ts
import { describe, it, expect } from 'vitest';
import { bookmarkService } from '@/services';

describe('BookmarkService', () => {
  it('should create bookmark', async () => {
    const bookmark = await bookmarkService.create({
      url: 'https://test.com',
      title: 'Test',
    });

    expect(bookmark).toBeDefined();
    expect(bookmark.url).toBe('https://test.com');
  });

  it('should throw error for invalid URL', async () => {
    await expect(
      bookmarkService.create({
        url: 'not-a-url',
        title: 'Test',
      })
    ).rejects.toThrow();
  });
});
```

### 运行测试

```bash
# 运行所有测试
pnpm test

# 监听模式
pnpm test -- --watch

# UI 模式
pnpm test:ui

# 覆盖率报告
pnpm test:coverage
```

### 集成测试

```typescript
// tests/integration/sync.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/database';
import { syncService } from '@/services';

describe('Sync Integration', () => {
  beforeEach(async () => {
    await db.bookmarks.clear();
  });

  it('should sync bookmarks to cloud', async () => {
    // 测试云端同步流程
  });
});
```

---

## 构建部署

### 开发构建

```bash
pnpm dev
```

### 生产构建

```bash
# Chrome
pnpm build

# Firefox
pnpm build:firefox
```

构建产物在 `.output/` 目录。

### 打包扩展

```bash
# Chrome
pnpm zip

# Firefox
pnpm zip:firefox
```

生成的 zip 文件可用于上传到扩展商店。

### 发布到 Chrome Web Store

1. 访问 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. 创建扩展或更新现有扩展
3. 上传 `.output/chrome-mv3.zip`
4. 填写商店信息
5. 提交审核

### 版本管理

更新版本号：

1. 修改 `package.json` 中的版本
2. 修改 `wxt.config.ts` 中的版本（如果不同步）
3. 提交更改：

```bash
git add package.json wxt.config.ts
git commit -m "chore: bump version to 0.6.0"
git tag v0.6.0
git push && git push --tags
```

---

## 故障排查

### 常见问题

#### 1. 扩展无法加载

**问题:** 加载扩展时提示错误

**解决:**
```bash
# 检查构建输出
pnpm build

# 查看构建日志
# 检查 .output/ 目录内容
```

#### 2. IndexedDB 错误

**问题:** IDBKeyRange 错误

**解决:**
- 确保使用 `filter()` 而不是 `where().equals()` 查询可能为 undefined 的字段
- 参考数据库schema: `src/lib/database.ts`

#### 3. AI 分类失败

**问题:** DeepSeek API 调用失败

**解决:**
```bash
# 检查环境变量
echo $VITE_DEEPSEEK_API_KEY

# 检查 API 密钥格式
# 应该是: sk-xxxxxxxxxxxxxxxx

# 查看日志
logger.error('DeepSeek error', error);
```

#### 4. 样式不生效

**问题:** Tailwind CSS 样式丢失

**解决:**
```bash
# 重新构建样式
pnpm build

# 检查 tailwind.config.js
# 确保内容路径正确
```

#### 5. 热重载不工作

**问题:** 修改代码后扩展不自动重载

**解决:**
```bash
# 重启开发服务器
# 清理 .output 目录
rm -rf .output
pnpm dev
```

### 调试技巧

#### 后台脚本调试

1. 打开 `chrome://extensions`
2. 找到扩展，点击"检查视图 service worker"
3. 查看后台日志

#### 弹出页面/选项页调试

1. 右键点击扩展图标
2. 选择"检查弹出内容"
3. 使用 Chrome DevTools 调试

#### 查看数据库

1. 打开 DevTools
2. 进入 Application 标签
3. 左侧找到 IndexedDB
4. 展开 SmartBookmarkDB

### 性能优化

#### 减少打包体积

```bash
# 分析打包大小
npx wxt build --analyze
```

**优化建议:**
- 移除未使用的依赖
- 使用动态导入
- 启用 Tree Shaking

#### 优化 AI 调用

```typescript
// ✅ 批量处理
await deepSeekAIService.batchClassify(bookmarks, {
  batchSize: 10,
  useCache: true,
});

// ❌ 逐个处理
for (const bookmark of bookmarks) {
  await deepSeekAIService.classifyBookmark(bookmark);
}
```

---

## 📚 相关资源

### 官方文档

- [WXT 文档](https://wxt.dev)
- [Chrome Extension 文档](https://developer.chrome.com/docs/extensions)
- [React 文档](https://react.dev)
- [Dexie.js 文档](https://dexie.org)
- [DeepSeek API](https://platform.deepseek.com/api-docs)

### 设计文档

- [架构设计](../claudedocs/architecture_smart_bookmark_20250119.md)
- [AI 整理器设计](../claudedocs/ai_organizer_design_20250119.md)

### 工具

- [TypeScript](https://www.typescriptlang.org)
- [Vitest](https://vitest.dev)
- [Tailwind CSS](https://tailwindcss.com)

---

## 🤝 贡献

欢迎贡献代码！请参考 [贡献指南](./CONTRIBUTING.md)。

### Pull Request 流程

1. Fork 项目
2. 创建功能分支
3. 编写代码和测试
4. 确保 CI 通过
5. 提交 PR

---

## 📄 许可证

MIT License
