// DeepSeek AI 服务 - LLM 驱动的书签分类

import { createDeepSeekClient, type ChatMessage } from '@/lib/deepseekClient';
import { db } from '@/lib/database';
import { aiService } from './aiService';
import type {
  Bookmark,
  DeepSeekConfig,
  LLMClassificationResult,
  PromptTemplate,
  ClassificationCache,
  BatchClassifyOptions,
  CostStats,
  ContentType,
} from '@/types';

/**
 * 默认 Prompt 模板
 */
const DEFAULT_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'default-classify',
    name: '默认分类',
    description: '通用的书签分类 Prompt',
    systemPrompt: `你是一个专业的书签分类助手。你的任务是根据书签的 URL、标题和描述，为书签推荐合适的标签和文件夹。

分类规则：
1. 标签应该简洁明了，2-4 个字为佳
2. 文件夹路径使用 "/" 分隔，如 "技术/前端/React"
3. 置信度范围 0.0-1.0，表示你对分类的把握程度
4. 必须提供推理过程

返回格式（JSON）：
{
  "suggestedTags": ["标签1", "标签2", "标签3"],
  "suggestedFolder": "一级分类/二级分类",
  "contentType": "article|video|documentation|tool|social|shopping|repository|blog|forum|other",
  "confidence": 0.85,
  "reasoning": "分类依据...",
  "alternativeTags": ["备选1", "备选2"],
  "alternativeFolders": ["备选路径1", "备选路径2"]
}`,
    userPromptTemplate: `请为以下书签进行分类：

URL: {url}
标题: {title}
描述: {description}

请返回 JSON 格式的分类结果。`,
    temperature: 0.3,
    maxTokens: 500,
  },
  {
    id: 'tech-classify',
    name: '技术文档分类',
    description: '专门用于技术文档和教程的分类',
    systemPrompt: `你是一个技术专家，专门分类技术相关的书签。

技术分类规则：
1. 识别技术栈（如 React, Vue, Python, Go）
2. 区分文档类型（API文档、教程、博客、代码仓库）
3. 精确的技术标签（如 "前端", "后端", "AI", "数据库"）
4. 文件夹结构：技术/{语言/框架}/{类型}

返回 JSON 格式。`,
    userPromptTemplate: `分类这个技术书签：

URL: {url}
标题: {title}
描述: {description}

请提供技术分类建议。`,
    temperature: 0.2,
    maxTokens: 400,
  },
  {
    id: 'shopping-classify',
    name: '购物分类',
    description: '电商和购物网站分类',
    systemPrompt: `你是购物分类助手。

购物分类规则：
1. 识别商品类别（电子产品、服装、书籍等）
2. 识别平台（淘宝、京东、亚马逊等）
3. 标签简洁，如 "数码", "家电", "图书"
4. 文件夹：购物/{类别}

返回 JSON 格式。`,
    userPromptTemplate: `分类这个购物网站：

URL: {url}
标题: {title}

请提供购物分类建议。`,
    temperature: 0.2,
    maxTokens: 300,
  },
];

/**
 * Token 价格（DeepSeek 定价）
 * deepseek-chat: ¥1/百万 tokens
 */
const TOKEN_PRICE = 0.000001; // 每个人民币能买的 tokens

/**
 * DeepSeek AI 服务
 */
export class DeepSeekAIService {
  private client: ReturnType<typeof createDeepSeekClient> | null = null;
  private config: DeepSeekConfig | null = null;
  private cache: Map<string, ClassificationCache> = new Map();
  private costStats: CostStats = {
    totalTokens: 0,
    totalCost: 0,
    classifyCount: 0,
    avgCostPerClassify: 0,
    dailyStats: [],
  };

  /**
   * 初始化服务
   */
  async initialize(config: DeepSeekConfig): Promise<void> {
    this.config = config;
    if (config.enabled && config.apiKey) {
      this.client = createDeepSeekClient(config);
      await this.loadCache();
      await this.loadCostStats();
    }
  }

  /**
   * 检查是否已初始化
   */
  private checkInitialized(): void {
    if (!this.client || !this.config?.enabled) {
      throw new Error('DeepSeek AI service is not initialized or disabled');
    }
  }

  /**
   * 分类单个书签
   */
  async classifyBookmark(
    bookmark: Bookmark,
    templateId?: string
  ): Promise<LLMClassificationResult> {
    this.checkInitialized();

    // 检查缓存
    const cacheKey = this.getCacheKey(bookmark.url, bookmark.title);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      cached.hitCount++;
      await this.saveCache();
      return cached.result;
    }

    // 选择 Prompt 模板
    const template = DEFAULT_PROMPT_TEMPLATES.find(
      (t) => t.id === templateId
    ) || DEFAULT_PROMPT_TEMPLATES[0];

    // 构建 Prompt
    const userPrompt = this.buildPrompt(template.userPromptTemplate, {
      url: bookmark.url,
      title: bookmark.title,
      description: bookmark.description || '',
    });

    try {
      // 调用 LLM
      const response = await this.client!.chatCompletions({
        model: this.config!.model || 'deepseek-chat',
        messages: [
          { role: 'system', content: template.systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: template.temperature ?? this.config!.temperature ?? 0.3,
        max_tokens: template.maxTokens ?? this.config!.maxTokens ?? 500,
      });

      // 解析响应
      const content = response.choices[0]?.message?.content || '';
      const result = this.parseClassificationResponse(content);

      // 添加元数据
      result.modelUsed = response.model;
      result.tokensUsed = response.usage.total_tokens;
      result.cost = response.usage.total_tokens * TOKEN_PRICE;

      // 更新成本统计
      this.updateCostStats(result.tokensUsed, result.cost);

      // 缓存结果（24小时有效期）
      this.cache.set(cacheKey, {
        url: bookmark.url,
        title: bookmark.title,
        result,
        timestamp: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        hitCount: 0,
      });
      await this.saveCache();

      return result;
    } catch (error) {
      console.error('[DeepSeek] Classification failed:', error);
      // 回退到本地分类
      const localResult = await aiService.classifyBookmark(bookmark);
      return {
        ...localResult,
        method: 'rule',
        reasoning: 'LLM 调用失败，使用本地规则分类',
      };
    }
  }

  /**
   * 批量分类书签
   */
  async batchClassify(
    bookmarks: Bookmark[],
    options: BatchClassifyOptions = {}
  ): Promise<LLMClassificationResult[]> {
    const {
      batchSize = 5,
      useCache = true,
      onProgress,
      fallbackToLocal = true,
    } = options;

    const results: LLMClassificationResult[] = [];
    const total = bookmarks.length;

    for (let i = 0; i < total; i += batchSize) {
      const batch = bookmarks.slice(i, i + batchSize);
      const batchPromises = batch.map(async (bookmark) => {
        try {
          return await this.classifyBookmark(bookmark);
        } catch (error) {
          console.error(`[DeepSeek] Failed to classify ${bookmark.url}:`, error);
          if (fallbackToLocal) {
            const localResult = await aiService.classifyBookmark(bookmark);
            return {
              ...localResult,
              reasoning: 'LLM 失败，使用本地分类',
            } as LLMClassificationResult;
          }
          throw error;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // 进度回调
      if (onProgress) {
        onProgress(Math.min(i + batchSize, total), total);
      }

      // 避免速率限制
      if (i + batchSize < total) {
        await this.delay(1000);
      }
    }

    return results;
  }

  /**
   * 构建 Prompt
   */
  private buildPrompt(template: string, variables: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (_, key) => variables[key] || '');
  }

  /**
   * 解析分类响应
   */
  private parseClassificationResponse(content: string): LLMClassificationResult {
    try {
      // 尝试提取 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        suggestedTags: parsed.suggestedTags || [],
        suggestedFolder: parsed.suggestedFolder,
        contentType: parsed.contentType || 'other',
        confidence: parsed.confidence || 0.5,
        reasoning: parsed.reasoning || '',
        alternativeTags: parsed.alternativeTags || [],
        alternativeFolders: parsed.alternativeFolders || [],
        method: 'llm',
      };
    } catch (error) {
      console.error('[DeepSeek] Failed to parse response:', content);
      // 返回默认结果
      return {
        suggestedTags: [],
        contentType: 'other' as ContentType,
        confidence: 0,
        method: 'llm',
        reasoning: '解析失败',
      };
    }
  }

  /**
   * 获取缓存键
   */
  private getCacheKey(url: string, title: string): string {
    return `${url}|${title}`;
  }

  /**
   * 加载缓存
   */
  private async loadCache(): Promise<void> {
    try {
      const cached = await chrome.storage.local.get('deepseekClassificationCache');
      if (cached.deepseekClassificationCache) {
        this.cache = new Map(
          Object.entries(cached.deepseekClassificationCache).map(([key, value]) => [
            key,
            value as ClassificationCache,
          ])
        );
      }
    } catch (error) {
      console.error('[DeepSeek] Failed to load cache:', error);
    }
  }

  /**
   * 保存缓存
   */
  private async saveCache(): Promise<void> {
    try {
      const cacheObj = Object.fromEntries(this.cache.entries());
      await chrome.storage.local.set({
        deepseekClassificationCache: cacheObj,
      });
    } catch (error) {
      console.error('[DeepSeek] Failed to save cache:', error);
    }
  }

  /**
   * 加载成本统计
   */
  private async loadCostStats(): Promise<void> {
    try {
      const stats = await chrome.storage.local.get('deepseekCostStats');
      if (stats.deepseekCostStats) {
        this.costStats = stats.deepseekCostStats;
      }
    } catch (error) {
      console.error('[DeepSeek] Failed to load cost stats:', error);
    }
  }

  /**
   * 保存成本统计
   */
  private async saveCostStats(): Promise<void> {
    try {
      await chrome.storage.local.set({
        deepseekCostStats: this.costStats,
      });
    } catch (error) {
      console.error('[DeepSeek] Failed to save cost stats:', error);
    }
  }

  /**
   * 更新成本统计
   */
  private updateCostStats(tokens: number, cost: number): void {
    this.costStats.totalTokens += tokens;
    this.costStats.totalCost += cost;
    this.costStats.classifyCount += 1;
    this.costStats.avgCostPerClassify =
      this.costStats.totalCost / this.costStats.classifyCount;

    // 更新每日统计
    const today = new Date().toISOString().split('T')[0];
    const todayStat = this.costStats.dailyStats.find((s) => s.date === today);
    if (todayStat) {
      todayStat.tokens += tokens;
      todayStat.cost += cost;
      todayStat.count += 1;
    } else {
      this.costStats.dailyStats.push({
        date: today,
        tokens,
        cost,
        count: 1,
      });
    }

    // 只保留最近30天的统计
    this.costStats.dailyStats = this.costStats.dailyStats.slice(-30);

    this.saveCostStats();
  }

  /**
   * 获取成本统计
   */
  getCostStats(): CostStats {
    return { ...this.costStats };
  }

  /**
   * 清空缓存
   */
  async clearCache(): Promise<void> {
    this.cache.clear();
    await chrome.storage.local.remove('deepseekClassificationCache');
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<boolean> {
    if (!this.client) return false;
    try {
      return await this.client.testConnection();
    } catch {
      return false;
    }
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 获取可用的 Prompt 模板
   */
  getPromptTemplates(): PromptTemplate[] {
    return DEFAULT_PROMPT_TEMPLATES;
  }
}

// 单例导出
export const deepSeekAIService = new DeepSeekAIService();
