# 智能书签 AI 整理与分类系统设计

**版本**: v0.5.0
**日期**: 2025-01-19
**状态**: 设计阶段

---

## 1. 系统概述

### 1.1 功能目标

构建一个智能书签管理系统，通过 AI 技术实现：

1. **自动分类**: 根据书签 URL、标题、内容自动分类到文件夹
2. **智能标签**: 自动推荐和生成相关标签
3. **数据统计**: 提供多维度的书签统计和分析
4. **智能整理**: 一键整理混乱的书签
5. **学习优化**: 从用户行为中学习，持续优化分类效果

### 1.2 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                      用户界面层                              │
├─────────────────────────────────────────────────────────────┤
│  Sidepanel │  Popup │  Options │  BatchOperation          │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                      业务逻辑层                              │
├─────────────────────────────────────────────────────────────┤
│  AIService  │  StatsService │  OrganizerService            │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                      数据访问层                              │
├─────────────────────────────────────────────────────────────┤
│  BookmarkService │  FolderService │  TagService             │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                      数据存储层                              │
├─────────────────────────────────────────────────────────────┤
│  IndexedDB (Dexie.js) │  Chrome Storage │  Rules Store     │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 核心功能模块

### 2.1 智能分类服务 (AIService)

#### 2.1.1 已有功能
- ✅ 基于规则的书签分类
- ✅ URL 分析和内容类型检测
- ✅ 标签推荐
- ✅ 用户反馈学习

#### 2.1.2 需要增强的功能

**A. 批量分类优化**
```typescript
interface BatchClassifyOptions {
  batchSize?: number;        // 批次大小
  parallel?: boolean;        // 是否并行处理
  onProgress?: (progress: BatchProgress) => void;
}

interface BatchProgress {
  total: number;
  processed: number;
  classified: number;
  failed: number;
  current?: string;  // 当前处理的书签标题
}
```

**B. 机器学习集成**
```typescript
// 支持多种 AI 提供商
type MLProvider = 'local' | 'openai' | 'claude' | 'huggingface';

interface MLClassificationConfig {
  provider: MLProvider;
  model?: string;
  apiKey?: string;
  confidenceThreshold: number;
}

// 使用 ML 模型进行分类
async classifyWithML(
  bookmark: Bookmark,
  config: MLClassificationConfig
): Promise<ClassificationResult>;
```

**C. 规则建议引擎**
```typescript
// 自动生成分类规则
interface RuleSuggestion {
  pattern: string;          // URL 模式
  suggestedTags: string[];  // 建议标签
  suggestedFolder: string;  // 建议文件夹
  confidence: number;       // 置信度
  sampleCount: number;      // 样本数量
}

async suggestRules(bookmarks: Bookmark[]): Promise<RuleSuggestion[]>;
```

### 2.2 书签整理服务 (OrganizerService)

#### 2.2.1 新增服务

```typescript
export class OrganizerService {
  /**
   * 一键整理所有书签
   */
  async organizeAll(options: OrganizeOptions): Promise<OrganizeResult>;

  /**
   * 整理指定文件夹的书签
   */
  async organizeFolder(folderId: string, options: OrganizeOptions): Promise<OrganizeResult>;

  /**
   * 预览整理结果（不实际执行）
   */
  async previewOrganize(options: OrganizeOptions): Promise<OrganizePreview>;

  /**
   * 智能分组相似书签
   */
  async groupSimilarBookmarks(bookmarks: Bookmark[]): Promise<BookmarkGroup[]>;

  /**
   * 检测重复书签
   */
  async detectDuplicates(): Promise<DuplicateGroup[]>;

  /**
   * 智能重命名文件夹
   */
  async suggestFolderName(folderId: string): Promise<string>;

  /**
   * 清理无效书签
   */
  async cleanupInvalidBookmarks(): Promise<CleanupResult>;
}
```

#### 2.2.2 核心接口

```typescript
// 整理选项
interface OrganizeOptions {
  // 分类策略
  strategy: 'auto' | 'conservative' | 'aggressive';

  // 是否创建新文件夹
  createNewFolders: boolean;

  // 是否应用标签
  applyTags: boolean;

  // 是否移动书签
  moveBookmarks: boolean;

  // 是否删除重复
  removeDuplicates: boolean;

  // 最低置信度
  minConfidence: number;

  // 进度回调
  onProgress?: (progress: OrganizeProgress) => void;
}

// 整理进度
interface OrganizeProgress {
  stage: 'analyzing' | 'classifying' | 'organizing' | 'cleanup';
  current: number;
  total: number;
  message: string;
}

// 整理结果
interface OrganizeResult {
  success: boolean;
  processed: number;
  classified: number;
  moved: number;
  tagged: number;
  duplicatesRemoved: number;
  foldersCreated: number;
  errors: string[];
  duration: number;
}

// 整理预览
interface OrganizePreview {
  changes: OrganizeChange[];
  summary: {
    totalChanges: number;
    newFolders: string[];
    affectedBookmarks: number;
  };
}

interface OrganizeChange {
  bookmarkId: string;
  type: 'move' | 'tag' | 'delete';
  from?: string;
  to?: string;
  tags?: string[];
  confidence: number;
}

// 书签分组
interface BookmarkGroup {
  id: string;
  name: string;          // 组名（如 "JavaScript 教程"）
  bookmarks: Bookmark[];
  similarity: number;     // 组内相似度
  suggestedFolder?: string;
  suggestedTags: string[];
}

// 重复组
interface DuplicateGroup {
  url: string;
  bookmarks: Bookmark[];
  keep: string;          // 建议保留的书签 ID
  reason: string;        // 选择理由
}

// 清理结果
interface CleanupResult {
  removed: number;        // 删除数量
  archived: number;       // 归档数量
  kept: number;           // 保留数量
  invalid: number;        // 无效数量
}
```

### 2.3 统计分析服务 (StatsService)

#### 2.3.1 新增服务

```typescript
export class StatsService {
  /**
   * 获取整体统计信息
   */
  async getOverallStats(): Promise<OverallStats>;

  /**
   * 获取时间趋势数据
   */
  async getTimeTrends(period: TimePeriod): Promise<TimeTrend[]>;

  /**
   * 获取热门标签
   */
  async getPopularTags(limit?: number): Promise<TagStats[]>;

  /**
   * 获取文件夹统计
   */
  async getFolderStats(): Promise<FolderStats[]>;

  /**
   * 获取域名统计
   */
  async getDomainStats(): Promise<DomainStats[]>;

  /**
   * 获取书签活跃度
   */
  async getBookmarkActivity(): Promise<ActivityStats>;

  /**
   * 获取分类效果统计
   */
  async getClassificationStats(): Promise<ClassificationStats>;

  /**
   * 生成统计报告
   */
  async generateReport(): Promise<StatsReport>;
}
```

#### 2.3.2 核心数据结构

```typescript
// 整体统计
interface OverallStats {
  totalBookmarks: number;
  totalFolders: number;
  totalTags: number;
  favorites: number;
  archived: number;
  broken: number;          // 失效链接
  uncategorized: number;   // 未分类
  duplicates: number;      // 重复书签
  recentAdditions: number; // 最近7天新增
}

// 时间趋势
interface TimeTrend {
  date: string;            // YYYY-MM-DD
  added: number;
  visited: number;
  modified: number;
}

interface TimePeriod {
  start: Date;
  end: Date;
  interval: 'day' | 'week' | 'month';
}

// 标签统计
interface TagStats {
  tag: string;
  count: number;
  trend: 'up' | 'down' | 'stable';  // 趋势
  lastUsed: number;
  avgUsage: number;
}

// 文件夹统计
interface FolderStats {
  folderId: string;
  name: string;
  path: string;
  bookmarkCount: number;
  subfolderCount: number;
  avgVisits: number;
  lastActivity: number;
  size: number;  // 占用空间（虚拟）
}

// 域名统计
interface DomainStats {
  domain: string;
  count: number;
  percentage: number;
  lastVisited: number;
  avgResponseTime?: number;
  favicon?: string;
}

// 活跃度统计
interface ActivityStats {
  mostVisited: Array<{ bookmarkId: string; title: string; visits: number }>;
  recentlyAdded: Array<{ bookmarkId: string; title: string; date: number }>;
  neglected: Array<{ bookmarkId: string; title: string; daysSinceVisit: number }>;
  favorites: Array<{ bookmarkId: string; title: string; visits: number }>;
}

// 分类效果统计
interface ClassificationStats {
  totalClassified: number;
  accuracy: number;
  acceptedSuggestions: number;
  rejectedSuggestions: number;
  ruleMatches: Array<{ ruleId: string; ruleName: string; count: number }>;
  topConfidenceRanges: Array<{ range: string; count: number }>;
}

// 统计报告
interface StatsReport {
  generatedAt: number;
  period: TimePeriod;
  summary: OverallStats;
  trends: {
    additionTrend: TimeTrend[];
    tagTrends: TagStats[];
    domainDistribution: DomainStats[];
  };
  insights: string[];  // AI 生成的洞察
  recommendations: string[];
}
```

### 2.4 UI 组件设计

#### 2.4.1 整理工具组件

```typescript
// 书签整理面板
export function BookmarksOrganizer() {
  return (
    <div>
      {/* 整理模式选择 */}
      <OrganizeModeSelector />

      {/* 整理选项 */}
      <OrganizeOptions />

      {/* 预览变更 */}
      <OrganizePreview />

      {/* 进度显示 */}
      <OrganizeProgress />

      {/* 执行按钮 */}
      <OrganizeActions />
    </div>
  );
}

// 重复书签管理器
export function DuplicateManager() {
  return (
    <div>
      <DuplicateList />
      <DuplicateActions />
    </div>
  );
}

// 智能分组查看器
export function SmartGroupViewer() {
  return (
    <div>
      <GroupList />
      <GroupDetails />
      <GroupActions />
    </div>
  );
}
```

#### 2.4.2 统计仪表板组件

```typescript
// 统计仪表板
export function StatsDashboard() {
  return (
    <div>
      {/* 概览卡片 */}
      <StatsOverview />

      {/* 图表区域 */}
      <StatsCharts>
        <AdditionTrendChart />
        <TagDistributionChart />
        <DomainDistributionChart />
        <FolderSizeChart />
      </StatsCharts>

      {/* 详细统计 */}
      <DetailedStats>
        <PopularTagsList />
        <FolderStatsList />
        <ActivityStats />
        <HealthStats />
      </DetailedStats>

      {/* 洞察和建议 */}
      <AIInsights />
    </div>
  );
}

// 迷你统计卡片
export function MiniStatsCard({ type }: { type: StatsType }) {
  // 显示单个指标的小卡片
}
```

---

## 3. 数据库 Schema 设计

### 3.1 新增表

```typescript
// 整理历史记录
interface OrganizeHistory {
  id: string;
  timestamp: number;
  options: OrganizeOptions;
  result: OrganizeResult;
  changes: OrganizeChange[];
}

// 统计缓存
interface StatsCache {
  id: string;
  type: 'overall' | 'tags' | 'folders' | 'domains';
  data: any;
  createdAt: number;
  expiresAt: number;
}

// 重复检测记录
interface DuplicateRecord {
  id: string;
  url: string;
  bookmarkIds: string[];
  detectedAt: number;
  resolved: boolean;
}

// 书签分组
interface BookmarkGroup {
  id: string;
  name: string;
  bookmarkIds: string[];
  similarity: number;
  createdAt: number;
  updatedAt: number;
}

// 学习数据
interface LearningRecord {
  id: string;
  bookmarkId: string;
  originalTags: string[];
  userTags: string[];
  originalFolder?: string;
  userFolder?: string;
  timestamp: number;
  accepted: boolean;
}
```

### 3.2 数据库迁移

```typescript
// 版本 3：添加整理和统计相关表
db.version(3).stores({
  organizeHistory: 'id, timestamp',
  statsCache: 'id, type, createdAt, expiresAt',
  duplicateRecords: 'id, url, detectedAt, resolved',
  bookmarkGroups: 'id, name, createdAt',
  learningRecords: 'id, bookmarkId, timestamp, accepted',
});
```

---

## 4. API 设计

### 4.1 Background Service Worker Messages

```typescript
// 整理相关消息
type OrganizeMessages =
  | { type: 'ORGANIZE_ALL'; payload: OrganizeOptions }
  | { type: 'ORGANIZE_FOLDER'; payload: { folderId: string; options: OrganizeOptions } }
  | { type: 'PREVIEW_ORGANIZE'; payload: OrganizeOptions }
  | { type: 'DETECT_DUPLICATES'; payload: undefined }
  | { type: 'GROUP_SIMILAR'; payload: { bookmarkIds: string[] } }
  | { type: 'GET_ORGANIZE_HISTORY'; payload: undefined };

// 统计相关消息
type StatsMessages =
  | { type: 'GET_OVERALL_STATS'; payload: undefined }
  | { type: 'GET_TIME_TRENDS'; payload: TimePeriod }
  | { type: 'GET_POPULAR_TAGS'; payload: { limit?: number } }
  | { type: 'GET_FOLDER_STATS'; payload: undefined }
  | { type: 'GET_DOMAIN_STATS'; payload: undefined }
  | { type: 'GENERATE_REPORT'; payload: TimePeriod }
  | { type: 'REFRESH_STATS_CACHE'; payload: undefined };
```

---

## 5. 实现优先级

### Phase 1: 核心整理功能 (高优先级)
- [ ] OrganizerService 基础实现
- [ ] 一键整理功能
- [ ] 重复检测和清理
- [ ] 整理预览功能
- [ ] 整理历史记录

### Phase 2: 统计分析功能 (高优先级)
- [ ] StatsService 实现
- [ ] 基础统计指标
- [ ] 时间趋势分析
- [ ] 标签和文件夹统计
- [ ] 统计缓存机制

### Phase 3: UI 组件 (中优先级)
- [ ] 整理工具界面
- [ ] 统计仪表板
- [ ] 图表可视化
- [ ] 进度和预览 UI

### Phase 4: 高级功能 (中优先级)
- [ ] 智能分组
- [ ] AI 洞察生成
- [ ] 个性化建议
- [ ] 学习优化

### Phase 5: 增强功能 (低优先级)
- [ ] ML 模型集成
- [ ] 高级统计
- [ ] 导出报告
- [ ] 自动化任务

---

## 6. 技术实现要点

### 6.1 性能优化

1. **批量处理**: 大量书签分批处理，避免 UI 卡顿
2. **Web Worker**: 将计算密集型任务移到 Worker
3. **缓存机制**: 统计结果缓存，减少重复计算
4. **增量更新**: 只更新变化的数据

### 6.2 用户体验

1. **可预览**: 所有整理操作先预览，用户确认后执行
2. **可撤销**: 支持撤销整理操作
3. **进度提示**: 长时间操作显示进度
4. **错误处理**: 友好的错误提示和恢复机制

### 6.3 数据安全

1. **备份机制**: 整理前自动备份
2. **事务性**: 要么全部成功，要么全部回滚
3. **日志记录**: 记录所有整理操作

---

## 7. 后续扩展

### 7.1 AI 增强
- 集成 OpenAI/Claude API 进行智能分类
- 使用 NLP 模型提取书签内容关键词
- 生成书签摘要和描述

### 7.2 高级统计
- 书签阅读时长估算
- 知识图谱可视化
- 使用习惯分析
- 书签价值评估

### 7.3 自动化
- 定时自动整理
- 新书签自动分类
- 无效链接自动清理
- 存储空间优化建议

---

## 8. 文件结构

```
src/
├── services/
│   ├── organizerService.ts      # 整理服务（新增）
│   ├── statsService.ts          # 统计服务（新增）
│   └── aiService.ts             # AI 服务（增强）
├── types/
│   ├── organizer.ts             # 整理类型（新增）
│   └── stats.ts                 # 统计类型（新增）
├── components/
│   ├── organizer/               # 整理组件（新增）
│   │   ├── BookmarksOrganizer.tsx
│   │   ├── DuplicateManager.tsx
│   │   ├── SmartGroupViewer.tsx
│   │   └── index.ts
│   └── stats/                   # 统计组件（新增）
│       ├── StatsDashboard.tsx
│       ├── StatsOverview.tsx
│       ├── StatsCharts.tsx
│       ├── AIInsights.tsx
│       └── index.ts
├── lib/
│   ├── algorithms.ts            # 算法库（新增）
│   │   - similarity.js         # 相似度计算
│   │   - clustering.js         # 聚类算法
│   │   └── patternMining.js    # 模式挖掘
│   └── visualization.ts         # 可视化工具（新增）
└── stores/
    ├── organizerStore.ts        # 整理状态（新增）
    └── statsStore.ts            # 统计状态（新增）
```

---

## 9. 总结

本设计文档详细规划了智能书签的 AI 整理、分类和统计功能，包括：

1. **智能整理**: 一键整理、重复检测、智能分组
2. **统计分析**: 多维度数据统计、趋势分析、可视化展示
3. **学习优化**: 从用户行为中学习，持续改进分类效果
4. **用户体验**: 预览、撤销、进度提示等友好交互

通过这些功能，用户可以轻松管理大量书签，提高书签组织效率，发现书签使用模式和规律。

**下一步**: 使用 `/sc:implement` 开始实现 Phase 1 的核心功能。
