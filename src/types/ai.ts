// AI 相关类型定义

import type { Bookmark } from './bookmark';

export type AIProvider = 'local' | 'openai' | 'claude';
export type ClassificationMethod = 'rule' | 'nlp' | 'hybrid';

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

// 分类统计
export interface ClassificationStats {
  totalClassified: number;
  acceptedSuggestions: number;
  rejectedSuggestions: number;
  accuracy: number;
  mostUsedTags: Array<{ tag: string; count: number }>;
  mostActiveRules: Array<{ ruleId: string; count: number }>;
}
