// 统计分析相关类型定义

// 时间周期
export interface TimePeriod {
  start: Date;
  end: Date;
  interval: 'day' | 'week' | 'month';
}

// 整体统计
export interface OverallStats {
  totalBookmarks: number;
  totalFolders: number;
  totalTags: number;
  favorites: number;
  archived: number;
  broken: number;           // 失效链接
  uncategorized: number;    // 未分类
  duplicates: number;       // 重复书签
  recentAdditions: number;  // 最近7天新增
  avgBookmarksPerFolder: number;
  largestFolder: {
    name: string;
    count: number;
  };
}

// 时间趋势数据点
export interface TimeTrend {
  date: string;             // YYYY-MM-DD
  added: number;
  visited: number;
  modified: number;
  deleted: number;
}

// 标签统计
export interface TagStats {
  tag: string;
  count: number;
  trend: 'up' | 'down' | 'stable';
  lastUsed: number;
  avgUsage: number;         // 平均使用频率
  relatedTags: string[];     // 相关标签
}

// 文件夹统计
export interface FolderStats {
  folderId: string;
  name: string;
  path: string;
  bookmarkCount: number;
  subfolderCount: number;
  avgVisits: number;
  lastActivity: number;
  size: number;             // 虚拟大小（基于书签数）
  depth: number;            // 文件夹深度
  growthRate: number;       // 增长率（百分比）
}

// 域名统计
export interface DomainStats {
  domain: string;
  count: number;
  percentage: number;       // 占比
  lastVisited: number;
  avgResponseTime?: number; // 平均响应时间（毫秒）
  favicon?: string;
  bookmarkSample: Array<{
    id: string;
    title: string;
    url: string;
  }>;
}

// 活跃度统计
export interface ActivityStats {
  mostVisited: Array<{
    bookmarkId: string;
    title: string;
    url: string;
    visits: number;
    lastVisited: number;
  }>;
  recentlyAdded: Array<{
    bookmarkId: string;
    title: string;
    url: string;
    createdAt: number;
  }>;
  neglected: Array<{
    bookmarkId: string;
    title: string;
    url: string;
    daysSinceVisit: number;
    lastVisited: number;
  }>;
  favorites: Array<{
    bookmarkId: string;
    title: string;
    url: string;
    visits: number;
  }>;
  frequent: Array<{
    bookmarkId: string;
    title: string;
    url: string;
    visitFrequency: number; // 每天访问次数
  }>;
}

// 分类效果统计
export interface ClassificationStats {
  totalClassified: number;
  accuracy: number;
  acceptedSuggestions: number;
  rejectedSuggestions: number;
  confidenceDistribution: Array<{
    range: string;      // "0.0-0.2", "0.2-0.4", etc.
    count: number;
  }>;
  ruleMatches: Array<{
    ruleId: string;
    ruleName: string;
    count: number;
    accuracy: number;
  }>;
  topConfidenceRules: Array<{
    ruleId: string;
    avgConfidence: number;
  }>;
}

// 内容类型分布
export interface ContentTypeDistribution {
  contentType: string;
  count: number;
  percentage: number;
  trend: 'up' | 'down' | 'stable';
}

// 书签健康度
export interface BookmarkHealth {
  total: number;
  healthy: number;         // 可访问
  broken: number;          // 404/超时
  pending: number;         // 未检查
  avgResponseTime: number; // 平均响应时间
  lastChecked: number;
  issues: Array<{
    bookmarkId: string;
    title: string;
    issue: '404' | 'timeout' | 'redirect' | 'server_error';
    url: string;
  }>;
}

// 使用模式统计
export interface UsagePatterns {
  peakAddHours: number[];    // [0-23] 每小时添加次数
  peakVisitHours: number[];   // [0-23] 每小时访问次数
  mostActiveDay: string;      // 星期几最活跃
  avgSessionLength: number;   // 平均会话时长（分钟）
  typicalWorkflow: string[];  // 典型工作流
}

// 统计报告
export interface StatsReport {
  id: string;
  generatedAt: number;
  period: TimePeriod;
  summary: OverallStats;
  trends: {
    additionTrend: TimeTrend[];
    contentTypeDistribution: ContentTypeDistribution[];
    tagTrends: TagStats[];
    domainDistribution: DomainStats[];
  };
  activity: ActivityStats;
  health: BookmarkHealth;
  classification: ClassificationStats;
  patterns: UsagePatterns;
  insights: string[];         // AI 生成的洞察
  recommendations: string[];  // 改进建议
}

// 缓存统计
export interface StatsCache {
  id: string;
  type: 'overall' | 'tags' | 'folders' | 'domains' | 'trends';
  data: any;
  createdAt: number;
  expiresAt: number;
  ttl: number;               // 生存时间（毫秒）
}

// 图表数据
export interface ChartData {
  type: 'line' | 'bar' | 'pie' | 'area';
  title: string;
  data: {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      color?: string;
    }>;
  };
  metadata?: {
    period: TimePeriod;
    generatedAt: number;
  };
}

// 对比数据
export interface ComparisonData {
  period1: {
    label: string;
    stats: OverallStats;
  };
  period2: {
    label: string;
    stats: OverallStats;
  };
  differences: {
    added: number;
    removed: number;
    growthRate: number;
    topChanges: Array<{
      type: 'folder' | 'tag' | 'domain';
      name: string;
      change: number;
    }>;
  };
}

// 热力图数据
export interface HeatmapData {
  type: 'addition' | 'visit' | 'modification';
  data: Array<{
    date: string;        // YYYY-MM-DD
    hour: number;        // 0-23
    count: number;
  }>;
  maxCount: number;
  period: TimePeriod;
}
