# 书签档案功能设计文档

> 设计日期: 2026-02-04
> 版本: 1.0
> 状态: 待审批

---

## 1. 功能概述

### 1.1 目标

为用户生成个性化的书签使用档案，展示收藏习惯、偏好分析和收藏家等级，增加产品趣味性和用户粘性。

### 1.2 核心功能

1. **统计分析**: 书签数量、文件夹数、收藏时间跨度等基础统计
2. **域名分析**: 常用域名、HTTPS 比例、域名多样性
3. **分类画像**: 按类别统计书签分布（技术、学习、工具等）
4. **时间趋势**: 按年/月展示书签收藏趋势
5. **收藏家等级**: 根据多维度评分计算用户等级
6. **分享功能**: 生成可分享的档案图片

---

## 2. 系统架构

### 2.1 模块结构

```
src/
├── types/
│   └── profile.ts              # 类型定义
├── services/
│   └── profileService.ts       # 档案计算服务
├── components/
│   └── profile/
│       ├── index.ts            # 导出
│       ├── BookmarkProfile.tsx # 主组件
│       ├── ProfileStats.tsx    # 统计卡片
│       ├── DomainChart.tsx     # 域名分布图
│       ├── TrendChart.tsx      # 趋势图
│       ├── CollectorBadge.tsx  # 收藏家徽章
│       ├── CategoryTags.tsx    # 分类标签
│       └── ShareCard.tsx       # 分享卡片
└── lib/
    └── profileUtils.ts         # 工具函数
```

### 2.2 数据流

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   IndexedDB     │────▶│  ProfileService  │────▶│  BookmarkProfile│
│   (bookmarks)   │     │  (计算统计)       │     │  (UI 展示)       │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │   StatsCache     │
                        │   (缓存结果)      │
                        └──────────────────┘
```

---

## 3. 类型定义

### 3.1 核心类型 (`src/types/profile.ts`)

```typescript
// 收藏家等级
export type CollectorLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

// 收藏家等级配置
export interface CollectorLevelConfig {
  level: CollectorLevel;
  minScore: number;
  title: {
    zh: string;
    en: string;
  };
  icon: string;
  color: string;
}

// 书签分类
export type BookmarkCategory =
  | 'tech'        // 技术
  | 'learning'    // 学习
  | 'tools'       // 工具
  | 'social'      // 社交
  | 'news'        // 新闻
  | 'shopping'    // 购物
  | 'entertainment' // 娱乐
  | 'finance'     // 金融
  | 'lifestyle'   // 生活
  | 'other';      // 其他

// 分类配置
export interface CategoryConfig {
  id: BookmarkCategory;
  name: {
    zh: string;
    en: string;
  };
  icon: string;
  color: string;
  domains: string[];      // 匹配的域名
  keywords: string[];     // 匹配的关键词
}

// 域名统计
export interface DomainStats {
  domain: string;
  count: number;
  percentage: number;
  isHttps: boolean;
  category?: BookmarkCategory;
}

// 时间趋势数据点
export interface TrendDataPoint {
  period: string;         // 如 "2024" 或 "2024-01"
  count: number;
  cumulative: number;     // 累计数量
}

// 书签档案
export interface BookmarkProfile {
  // 基础统计
  totalBookmarks: number;
  totalFolders: number;
  totalTags: number;

  // 时间统计
  collectionStartDate: number;    // 最早书签时间
  collectionEndDate: number;      // 最新书签时间
  collectionDays: number;         // 收藏天数
  averagePerMonth: number;        // 月均收藏数

  // 域名分析
  uniqueDomains: number;
  httpsRatio: number;             // 0-1
  topDomains: DomainStats[];      // 前10个域名
  domainDiversity: number;        // 域名多样性评分 0-100

  // 分类分布
  categoryDistribution: Record<BookmarkCategory, number>;
  primaryCategory: BookmarkCategory;

  // 时间趋势
  yearlyTrend: TrendDataPoint[];
  monthlyTrend: TrendDataPoint[];  // 最近12个月

  // 质量指标
  duplicateCount: number;
  brokenCount: number;
  favoriteCount: number;
  archivedCount: number;
  aiGeneratedCount: number;

  // 组织度评分
  organizationScore: number;      // 0-100

  // 收藏家等级
  collectorScore: number;         // 0-1000
  collectorLevel: CollectorLevel;
  collectorTitle: string;

  // 元数据
  generatedAt: number;
  version: string;
}

// 分享卡片数据
export interface ShareCardData {
  nickname?: string;
  profile: BookmarkProfile;
  theme: 'light' | 'dark';
}
```

---

## 4. 服务层设计

### 4.1 ProfileService (`src/services/profileService.ts`)

```typescript
export class ProfileService {
  // 生成完整档案
  async generateProfile(): Promise<BookmarkProfile>;

  // 计算基础统计
  private async calculateBasicStats(): Promise<Partial<BookmarkProfile>>;

  // 分析域名
  private async analyzeDomains(bookmarks: Bookmark[]): Promise<{
    uniqueDomains: number;
    httpsRatio: number;
    topDomains: DomainStats[];
    domainDiversity: number;
  }>;

  // 分析分类分布
  private async analyzeCategories(bookmarks: Bookmark[]): Promise<{
    distribution: Record<BookmarkCategory, number>;
    primaryCategory: BookmarkCategory;
  }>;

  // 计算时间趋势
  private calculateTrends(bookmarks: Bookmark[]): {
    yearlyTrend: TrendDataPoint[];
    monthlyTrend: TrendDataPoint[];
  };

  // 计算组织度评分
  private calculateOrganizationScore(bookmarks: Bookmark[], folders: Folder[]): number;

  // 计算收藏家等级
  private calculateCollectorLevel(profile: Partial<BookmarkProfile>): {
    score: number;
    level: CollectorLevel;
    title: string;
  };

  // 获取缓存的档案
  async getCachedProfile(): Promise<BookmarkProfile | null>;

  // 清除缓存
  async clearCache(): Promise<void>;
}
```

### 4.2 评分算法

#### 组织度评分 (0-100)

```typescript
function calculateOrganizationScore(bookmarks: Bookmark[], folders: Folder[]): number {
  const weights = {
    folderUsage: 0.25,      // 使用文件夹的书签比例
    tagUsage: 0.25,         // 使用标签的书签比例
    descriptionRate: 0.15,  // 有描述的书签比例
    duplicateRate: 0.15,    // 重复率（越低越好）
    brokenRate: 0.10,       // 失效率（越低越好）
    folderDepth: 0.10,      // 文件夹层级合理性
  };

  // 计算各项得分...
  return weightedSum;
}
```

#### 收藏家等级评分 (0-1000)

```typescript
function calculateCollectorScore(profile: Partial<BookmarkProfile>): number {
  const factors = {
    // 数量因素 (最高 300 分)
    bookmarkCount: Math.min(profile.totalBookmarks / 10, 300),

    // 时间因素 (最高 200 分)
    collectionDays: Math.min(profile.collectionDays / 5, 200),

    // 质量因素 (最高 300 分)
    organizationScore: profile.organizationScore * 3,

    // 多样性因素 (最高 200 分)
    domainDiversity: profile.domainDiversity * 2,
  };

  return Object.values(factors).reduce((a, b) => a + b, 0);
}
```

#### 等级映射

| 等级 | 分数范围 | 中文称号 | 英文称号 | 图标 |
|------|----------|----------|----------|------|
| 1 | 0-99 | 初级收藏家 | Novice Collector | 🌱 |
| 2 | 100-199 | 书签爱好者 | Bookmark Enthusiast | 📚 |
| 3 | 200-299 | 资深收藏家 | Senior Collector | 📖 |
| 4 | 300-399 | 书签达人 | Bookmark Expert | ⭐ |
| 5 | 400-499 | 收藏专家 | Collection Master | 🌟 |
| 6 | 500-599 | 书签大师 | Bookmark Guru | 💫 |
| 7 | 600-699 | 收藏宗师 | Grand Master | 🏆 |
| 8 | 700-799 | 传奇收藏家 | Legendary Collector | 👑 |
| 9 | 800-899 | 史诗收藏家 | Epic Collector | 💎 |
| 10 | 900+ | 神级收藏家 | Divine Collector | 🔮 |

---

## 5. 组件设计

### 5.1 组件层级

```
BookmarkProfile (主容器)
├── ProfileHeader (标题 + 刷新按钮)
├── CollectorBadge (收藏家等级徽章)
├── ProfileStats (统计卡片网格)
│   ├── StatCard (书签总数)
│   ├── StatCard (文件夹数)
│   ├── StatCard (收藏天数)
│   └── StatCard (月均收藏)
├── CategoryTags (分类标签云)
├── DomainChart (域名分布饼图)
├── TrendChart (时间趋势折线图)
├── QualityMetrics (质量指标)
└── ShareButton (分享按钮)
    └── ShareCard (分享卡片弹窗)
```

### 5.2 主组件 Props

```typescript
interface BookmarkProfileProps {
  className?: string;
  onShare?: (imageData: string) => void;
  showShareButton?: boolean;
}
```

### 5.3 UI 设计规范

#### 颜色方案

```typescript
const CATEGORY_COLORS: Record<BookmarkCategory, string> = {
  tech: '#3B82F6',        // blue-500
  learning: '#10B981',    // emerald-500
  tools: '#8B5CF6',       // violet-500
  social: '#EC4899',      // pink-500
  news: '#F59E0B',        // amber-500
  shopping: '#EF4444',    // red-500
  entertainment: '#06B6D4', // cyan-500
  finance: '#22C55E',     // green-500
  lifestyle: '#F97316',   // orange-500
  other: '#6B7280',       // gray-500
};

const LEVEL_COLORS: Record<CollectorLevel, string> = {
  1: '#9CA3AF',   // gray-400
  2: '#60A5FA',   // blue-400
  3: '#34D399',   // emerald-400
  4: '#FBBF24',   // amber-400
  5: '#F472B6',   // pink-400
  6: '#A78BFA',   // violet-400
  7: '#FB923C',   // orange-400
  8: '#F87171',   // red-400
  9: '#2DD4BF',   // teal-400
  10: '#E879F9',  // fuchsia-400
};
```

#### 布局规范

- 卡片间距: `gap-4` (16px)
- 卡片圆角: `rounded-xl`
- 统计数字: `text-3xl font-bold tabular-nums`
- 标签: `text-xs px-2 py-1 rounded-full`

---

## 6. 分类配置

### 6.1 域名分类规则

```typescript
const CATEGORY_CONFIGS: CategoryConfig[] = [
  {
    id: 'tech',
    name: { zh: '技术', en: 'Tech' },
    icon: '💻',
    color: '#3B82F6',
    domains: [
      'github.com', 'stackoverflow.com', 'dev.to', 'medium.com',
      'hackernews.com', 'reddit.com/r/programming', 'gitlab.com',
      'npmjs.com', 'pypi.org', 'crates.io', 'hub.docker.com',
      'juejin.cn', 'segmentfault.com', 'csdn.net', 'cnblogs.com',
      'oschina.net', 'gitee.com', 'v2ex.com',
    ],
    keywords: ['code', 'dev', 'api', 'sdk', 'docs', 'programming'],
  },
  {
    id: 'learning',
    name: { zh: '学习', en: 'Learning' },
    icon: '📚',
    color: '#10B981',
    domains: [
      'coursera.org', 'udemy.com', 'edx.org', 'khanacademy.org',
      'leetcode.com', 'hackerrank.com', 'codecademy.com',
      'freecodecamp.org', 'w3schools.com', 'mdn.io',
      'mooc.cn', 'icourse163.org', 'xuetangx.com', 'bilibili.com',
    ],
    keywords: ['learn', 'course', 'tutorial', 'education', 'study'],
  },
  {
    id: 'tools',
    name: { zh: '工具', en: 'Tools' },
    icon: '🔧',
    color: '#8B5CF6',
    domains: [
      'notion.so', 'figma.com', 'canva.com', 'trello.com',
      'slack.com', 'discord.com', 'zoom.us', 'vercel.com',
      'netlify.com', 'heroku.com', 'aws.amazon.com',
      'yuque.com', 'feishu.cn', 'dingtalk.com', 'processon.com',
    ],
    keywords: ['tool', 'app', 'service', 'platform', 'online'],
  },
  {
    id: 'social',
    name: { zh: '社交', en: 'Social' },
    icon: '💬',
    color: '#EC4899',
    domains: [
      'twitter.com', 'x.com', 'facebook.com', 'instagram.com',
      'linkedin.com', 'reddit.com', 'tiktok.com',
      'weibo.com', 'zhihu.com', 'douban.com', 'xiaohongshu.com',
    ],
    keywords: ['social', 'community', 'forum', 'chat'],
  },
  {
    id: 'news',
    name: { zh: '新闻', en: 'News' },
    icon: '📰',
    color: '#F59E0B',
    domains: [
      'bbc.com', 'cnn.com', 'nytimes.com', 'theguardian.com',
      'reuters.com', 'bloomberg.com', 'techcrunch.com',
      'sina.com.cn', 'sohu.com', 'qq.com', '163.com', 'ifeng.com',
      '36kr.com', 'huxiu.com', 'geekpark.net',
    ],
    keywords: ['news', 'media', 'press', 'daily'],
  },
  {
    id: 'shopping',
    name: { zh: '购物', en: 'Shopping' },
    icon: '🛒',
    color: '#EF4444',
    domains: [
      'amazon.com', 'ebay.com', 'aliexpress.com', 'etsy.com',
      'taobao.com', 'jd.com', 'tmall.com', 'pinduoduo.com',
      'suning.com', 'dangdang.com',
    ],
    keywords: ['shop', 'store', 'buy', 'mall', 'market'],
  },
  {
    id: 'entertainment',
    name: { zh: '娱乐', en: 'Entertainment' },
    icon: '🎮',
    color: '#06B6D4',
    domains: [
      'youtube.com', 'netflix.com', 'spotify.com', 'twitch.tv',
      'steam.com', 'epicgames.com', 'imdb.com',
      'bilibili.com', 'youku.com', 'iqiyi.com', 'douyin.com',
      'music.163.com', 'kugou.com',
    ],
    keywords: ['video', 'music', 'game', 'movie', 'stream'],
  },
  {
    id: 'finance',
    name: { zh: '金融', en: 'Finance' },
    icon: '💰',
    color: '#22C55E',
    domains: [
      'coinbase.com', 'binance.com', 'robinhood.com',
      'paypal.com', 'stripe.com', 'wise.com',
      'eastmoney.com', 'xueqiu.com', 'futunn.com',
    ],
    keywords: ['finance', 'bank', 'invest', 'crypto', 'stock'],
  },
  {
    id: 'lifestyle',
    name: { zh: '生活', en: 'Lifestyle' },
    icon: '🏠',
    color: '#F97316',
    domains: [
      'airbnb.com', 'booking.com', 'tripadvisor.com',
      'yelp.com', 'uber.com', 'doordash.com',
      'meituan.com', 'dianping.com', 'ctrip.com', 'eleme.cn',
    ],
    keywords: ['travel', 'food', 'hotel', 'restaurant', 'life'],
  },
];
```

---

## 7. 缓存策略

### 7.1 缓存结构

使用现有的 `statsCache` 表存储档案数据：

```typescript
interface ProfileCache {
  id: 'bookmark_profile';
  type: 'profile';
  data: BookmarkProfile;
  createdAt: number;
  expiresAt: number;  // 24小时后过期
}
```

### 7.2 缓存失效条件

- 书签增删改操作
- 文件夹增删改操作
- 手动刷新
- 缓存超过 24 小时

---

## 8. 分享功能设计

### 8.1 分享卡片布局

```
┌─────────────────────────────────────┐
│  🔖 我的书签档案                      │
│                                     │
│  ┌─────────┐  收藏家等级             │
│  │  👑     │  Lv.8 传奇收藏家        │
│  │ 徽章    │                        │
│  └─────────┘                        │
│                                     │
│  📚 1,234 书签  📁 56 文件夹         │
│  📅 收藏 365 天  ⭐ 组织度 85分       │
│                                     │
│  常用分类: 技术 学习 工具             │
│                                     │
│  ─────────────────────────────────  │
│  智能书签 · Smart Bookmark           │
└─────────────────────────────────────┘
```

### 8.2 实现方案

使用 `html2canvas` 库将 DOM 转换为图片：

```typescript
import html2canvas from 'html2canvas';

async function generateShareImage(element: HTMLElement): Promise<string> {
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: '#ffffff',
    logging: false,
  });
  return canvas.toDataURL('image/png');
}
```

---

## 9. 文件清单

### 9.1 新增文件

| 文件路径 | 说明 |
|----------|------|
| `src/types/profile.ts` | 类型定义 |
| `src/services/profileService.ts` | 档案计算服务 |
| `src/lib/profileUtils.ts` | 工具函数 |
| `src/components/profile/index.ts` | 组件导出 |
| `src/components/profile/BookmarkProfile.tsx` | 主组件 |
| `src/components/profile/ProfileStats.tsx` | 统计卡片 |
| `src/components/profile/DomainChart.tsx` | 域名分布图 |
| `src/components/profile/TrendChart.tsx` | 趋势图 |
| `src/components/profile/CollectorBadge.tsx` | 收藏家徽章 |
| `src/components/profile/CategoryTags.tsx` | 分类标签 |
| `src/components/profile/ShareCard.tsx` | 分享卡片 |
| `src/components/ui/CircularProgress.tsx` | 圆形进度环 |

### 9.2 修改文件

| 文件路径 | 修改内容 |
|----------|----------|
| `src/types/index.ts` | 导出 profile 类型 |
| `src/services/index.ts` | 导出 profileService |
| `src/components/index.ts` | 导出 profile 组件 |
| `src/entrypoints/options/components/OrganizerSettings.tsx` | 添加档案组件 |
| `package.json` | 添加 html2canvas 依赖 |

---

## 10. 依赖项

### 10.1 新增依赖

```json
{
  "dependencies": {
    "html2canvas": "^1.4.1"
  }
}
```

### 10.2 现有依赖复用

- `lucide-react`: 图标
- `tailwindcss`: 样式
- `dexie`: 数据库操作

---

## 11. 实施计划

### Phase 1: 基础架构
1. 创建类型定义文件
2. 实现 ProfileService 核心计算逻辑
3. 实现缓存机制

### Phase 2: UI 组件
1. 实现 ProfileStats 统计卡片
2. 实现 CollectorBadge 徽章组件
3. 实现 CategoryTags 分类标签
4. 实现 CircularProgress 进度环

### Phase 3: 图表组件
1. 实现 DomainChart 域名分布图
2. 实现 TrendChart 趋势图

### Phase 4: 分享功能
1. 实现 ShareCard 分享卡片
2. 集成 html2canvas
3. 实现图片下载/分享

### Phase 5: 集成测试
1. 集成到设置页面
2. 性能优化
3. 边界情况处理

---

## 12. 注意事项

### 12.1 性能考虑

- 大量书签时使用分批处理
- 域名分析使用 Map 优化查找
- 缓存计算结果避免重复计算
- 图表使用虚拟化或限制数据点

### 12.2 隐私考虑

- 所有计算在本地完成
- 分享图片不包含具体 URL
- 仅展示统计数据和分类

### 12.3 国际化

- 所有文案支持中英文
- 使用 `name.zh` / `name.en` 结构
- 根据浏览器语言自动切换

---

## 13. 验收标准

1. ✅ 能正确计算所有统计指标
2. ✅ 收藏家等级计算准确
3. ✅ 分类识别覆盖主流网站
4. ✅ 图表渲染流畅无卡顿
5. ✅ 分享图片清晰美观
6. ✅ 缓存机制正常工作
7. ✅ 支持中英文切换

---

**下一步**: 使用 `/sc:implement` 开始实现
