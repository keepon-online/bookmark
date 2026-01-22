// AI 相关类型定义

import type { Bookmark } from './bookmark';

export type AIProvider = 'local' | 'openai' | 'claude' | 'deepseek';
export type ClassificationMethod = 'rule' | 'nlp' | 'hybrid' | 'llm';

// 分类结果
export interface ClassificationResult {
  // 建议的文件夹 ID 或名称
  suggestedFolder?: string;
  // 建议的标签列表
  suggestedTags: string[];
  // 内容类型
  contentType: ContentType;
  // 置信度 (0-1)
  confidence: number;
  // 分类方法
  method: ClassificationMethod;
  // 匹配的规则 ID (如果适用)
  matchedRuleId?: string;
}

// URL 分析信息
export interface UrlInfo {
  // 原始 URL
  url: string;
  // 域名
  domain: string;
  // 路径
  path: string;
  // 查询参数
  query: string;
  // 是否是 GitHub
  isGitHub: boolean;
  // 是否是 Stack Overflow
  isStackOverflow: boolean;
  // 是否是 YouTube
  isYouTube: boolean;
  // 是否是文档
  isDocumentation: boolean;
  // 是否是博客
  isBlog: boolean;
}

// 分类规则
export interface ClassificationRule {
  id: string;
  name: string;
  description?: string;
  priority: number;
  enabled: boolean;
  conditions: RuleCondition[];
  actions: RuleAction;
}

// 规则条件
export interface RuleCondition {
  type: 'url' | 'title' | 'domain' | 'path' | 'query';
  operator: 'contains' | 'startsWith' | 'endsWith' | 'regex' | 'exact';
  value: string;
  caseSensitive?: boolean;
}

// 规则动作
export interface RuleAction {
  tags: string[];
  folder?: string;
  contentType: ContentType;
}

// 内容类型
export type ContentType =
  | 'article'
  | 'video'
  | 'documentation'
  | 'tool'
  | 'social'
  | 'shopping'
  | 'repository'
  | 'blog'
  | 'forum'
  | 'other';

// AI 配置
export interface AIConfig {
  provider: AIProvider;
  enabled: boolean;
  autoClassify: boolean;
  autoTagSuggestion: boolean;
  minConfidence: number; // 最低置信度阈值
  customRules: ClassificationRule[];
}

// 学习数据
export interface LearningData {
  bookmarkId: string;
  url: string;
  originalTags: string[];
  originalFolder?: string;
  userTags: string[];
  userFolder?: string;
  timestamp: number;
}

// 分类统计 - 从 stats.ts 导入完整定义
// import type { ClassificationStats } from './stats';

// DeepSeek 配置
export interface DeepSeekConfig {
  apiKey: string;
  baseURL?: string;
  model?: 'deepseek-chat' | 'deepseek-coder';
  enabled?: boolean;
  temperature?: number;
  maxTokens?: number;
}

// LLM 分类结果（扩展）
export interface LLMClassificationResult extends ClassificationResult {
  // LLM 特定字段
  reasoning?: string; // LLM 的推理过程
  alternativeTags?: string[]; // 备选标签
  alternativeFolders?: string[]; // 备选文件夹
  modelUsed?: string; // 使用的模型
  tokensUsed?: number; // 使用的 token 数量
  cost?: number; // 成本（元）
}

// Prompt 模板类型
export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  userPromptTemplate: string;
  temperature?: number;
  maxTokens?: number;
}

// 缓存条目
export interface ClassificationCache {
  url: string;
  title: string;
  result: LLMClassificationResult;
  timestamp: number;
  expiresAt: number;
  hitCount: number;
}

// 批量分类选项
export interface BatchClassifyOptions {
  batchSize?: number; // 批处理大小
  useCache?: boolean; // 是否使用缓存
  onProgress?: (current: number, total: number) => void; // 进度回调
  fallbackToLocal?: boolean; // 失败时是否回退到本地分类
}

// 成本统计
export interface CostStats {
  totalTokens: number;
  totalCost: number; // 总成本（元）
  classifyCount: number;
  avgCostPerClassify: number;
  dailyStats: Array<{
    date: string;
    tokens: number;
    cost: number;
    count: number;
  }>;
}
