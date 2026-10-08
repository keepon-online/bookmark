// 书签档案类型定义

// 收藏家等级 (1-10)
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
  | 'tech'
  | 'learning'
  | 'tools'
  | 'social'
  | 'news'
  | 'shopping'
  | 'entertainment'
  | 'finance'
  | 'lifestyle'
  | 'other';

// 分类配置
export interface CategoryConfig {
  id: BookmarkCategory;
  name: {
    zh: string;
    en: string;
  };
  icon: string;
  color: string;
  domains: string[];
  keywords: string[];
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
  period: string;
  count: number;
  cumulative: number;
}

// 书签档案
export interface BookmarkProfile {
  // 基础统计
  totalBookmarks: number;
  totalFolders: number;
  totalTags: number;

  // 组织度展示指标（0-100）：入夹率排除直接散落在根目录的书签
  folderedRate: number;
  taggedRate: number;

  // 时间统计
  collectionStartDate: number;
  collectionEndDate: number;
  collectionDays: number;
  averagePerMonth: number;

  // 域名分析
  uniqueDomains: number;
  httpsRatio: number;
  topDomains: DomainStats[];
  domainDiversity: number;

  // 分类分布
  categoryDistribution: Record<BookmarkCategory, number>;
  primaryCategory: BookmarkCategory;

  // 时间趋势
  yearlyTrend: TrendDataPoint[];
  monthlyTrend: TrendDataPoint[];

  // 质量指标
  duplicateCount: number;
  brokenCount: number;
  favoriteCount: number;
  archivedCount: number;
  aiGeneratedCount: number;

  // 组织度评分
  organizationScore: number;

  // 收藏家等级
  collectorScore: number;
  collectorLevel: CollectorLevel;
  collectorTitle: string;

  // 元数据
  generatedAt: number;
  version: string;
}

// 收藏家等级配置表
export const COLLECTOR_LEVELS: CollectorLevelConfig[] = [
  { level: 1, minScore: 0, title: { zh: '初级收藏家', en: 'Novice Collector' }, icon: '🌱', color: '#9CA3AF' },
  { level: 2, minScore: 100, title: { zh: '书签爱好者', en: 'Bookmark Enthusiast' }, icon: '📚', color: '#60A5FA' },
  { level: 3, minScore: 200, title: { zh: '资深收藏家', en: 'Senior Collector' }, icon: '📖', color: '#34D399' },
  { level: 4, minScore: 300, title: { zh: '书签达人', en: 'Bookmark Expert' }, icon: '⭐', color: '#FBBF24' },
  { level: 5, minScore: 400, title: { zh: '收藏专家', en: 'Collection Master' }, icon: '🌟', color: '#F472B6' },
  { level: 6, minScore: 500, title: { zh: '书签大师', en: 'Bookmark Guru' }, icon: '💫', color: '#A78BFA' },
  { level: 7, minScore: 600, title: { zh: '收藏宗师', en: 'Grand Master' }, icon: '🏆', color: '#FB923C' },
  { level: 8, minScore: 700, title: { zh: '传奇收藏家', en: 'Legendary Collector' }, icon: '👑', color: '#F87171' },
  { level: 9, minScore: 800, title: { zh: '史诗收藏家', en: 'Epic Collector' }, icon: '💎', color: '#2DD4BF' },
  { level: 10, minScore: 900, title: { zh: '神级收藏家', en: 'Divine Collector' }, icon: '🔮', color: '#E879F9' },
];

// 分类配置表
export const CATEGORY_CONFIGS: CategoryConfig[] = [
  {
    id: 'tech',
    name: { zh: '技术', en: 'Tech' },
    icon: '💻',
    color: '#3B82F6',
    domains: [
      'github.com', 'stackoverflow.com', 'dev.to', 'medium.com',
      'hackernews.com', 'gitlab.com', 'npmjs.com', 'pypi.org',
      'juejin.cn', 'segmentfault.com', 'csdn.net', 'cnblogs.com',
      'oschina.net', 'gitee.com', 'v2ex.com', 'infoq.cn',
    ],
    keywords: ['code', 'dev', 'api', 'sdk', 'docs', 'programming', 'developer'],
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
      'mooc.cn', 'icourse163.org', 'xuetangx.com',
    ],
    keywords: ['learn', 'course', 'tutorial', 'education', 'study', 'training'],
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
    keywords: ['tool', 'app', 'service', 'platform', 'online', 'generator'],
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
    keywords: ['social', 'community', 'forum', 'chat', 'network'],
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
    keywords: ['news', 'media', 'press', 'daily', 'report'],
  },
  {
    id: 'shopping',
    name: { zh: '购物', en: 'Shopping' },
    icon: '🛒',
    color: '#EF4444',
    domains: [
      'amazon.com', 'ebay.com', 'aliexpress.com', 'etsy.com',
      'taobao.com', 'jd.com', 'tmall.com', 'pinduoduo.com',
      'suning.com', 'dangdang.com', 'vip.com',
    ],
    keywords: ['shop', 'store', 'buy', 'mall', 'market', 'price'],
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
    keywords: ['video', 'music', 'game', 'movie', 'stream', 'play'],
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
    keywords: ['finance', 'bank', 'invest', 'crypto', 'stock', 'money'],
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
    keywords: ['travel', 'food', 'hotel', 'restaurant', 'life', 'health'],
  },
  {
    id: 'other',
    name: { zh: '其他', en: 'Other' },
    icon: '📎',
    color: '#6B7280',
    domains: [],
    keywords: [],
  },
];
