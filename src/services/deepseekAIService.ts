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
 * 默认 Prompt 模板（优化版 - 减少过度分类）
 */
const DEFAULT_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'default-classify',
    name: '默认分类（优化版）',
    description: '通用的书签分类 Prompt - 避免过度细分',
    systemPrompt: `你是一个专业的书签分类助手。你的任务是根据书签的 URL、标题和描述，为书签推荐合适的标签和文件夹。

重要规则：
1. **标签精简原则**：只推荐 2-3 个最核心的标签
   - 优先选择内容类型标签（如：视频、文章、工具）
   - 避免从 URL 中提取无意义的词（如：raw、master、githubusercontent、aptv、m3u、iptv 等）
   - 避免添加技术术语作为标签（如：git、api、app、web 等）
   - 避免添加文件扩展名或路径组件

2. **文件夹分类原则**：扁平化优于层次化
   - 优先使用一级或二级分类（如："技术" 而非 "技术/前端/React"）
   - 使用通用分类，避免创建过多细分目录
   - 常用分类：技术、学习、娱乐、工具、购物、社交、其他
   - 不要为每个网站创建单独的文件夹

3. **内容类型判断**：
   - 文章：博客文章、新闻、教程
   - 视频：视频网站、直播、电影
   - 工具：在线工具、实用网站
   - 文档：API 文档、技术文档
   - 仓库：GitHub、GitLab 代码仓库
   - 其他：无法明确分类的

4. **置信度评估**：
   - 0.9-1.0：非常确定
   - 0.7-0.9：比较确定
   - 0.5-0.7：不太确定
   - < 0.5：不确定，不建议自动应用

返回格式（JSON）：
{
  "suggestedTags": ["标签1", "标签2"],           // 只给 2-3 个标签
  "suggestedFolder": "一级分类",                // 扁平化分类
  "contentType": "article|video|documentation|tool|social|shopping|repository|blog|forum|other",
  "confidence": 0.85,
  "reasoning": "分类依据..."
}`,
    userPromptTemplate: `请为以下书签进行分类：

URL: {url}
标题: {title}
描述: {description}

要求：
- 只推荐 2-3 个最相关的标签
- 使用简单的文件夹分类（最多一级或二级）
- 避免从 URL 中提取无意义的词
- 如果不确定，使用 "其他" 分类

请返回 JSON 格式的分类结果。`,
    temperature: 0.3,
    maxTokens: 300,
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
   * 批量分类书签 - 单个API请求处理多个URL
   */
  async batchClassify(
    bookmarks: Bookmark[],
    options: BatchClassifyOptions = {}
  ): Promise<LLMClassificationResult[]> {
    const {
      batchSize = 20, // 默认每批20个URL（可在10-50之间调整）
      onProgress,
      fallbackToLocal = true,
    } = options;

    this.checkInitialized();

    const results: LLMClassificationResult[] = [];
    const total = bookmarks.length;

    // 验证批次大小范围（10-50）
    const validBatchSize = Math.max(10, Math.min(50, batchSize));
    if (validBatchSize !== batchSize) {
      logger.warn(`Batch size adjusted from ${batchSize} to ${validBatchSize} (valid range: 10-50)`);
    }

    logger.info(`Starting batch classification: ${total} bookmarks, batch size: ${validBatchSize}`);

    // 先检查缓存，分离已缓存和未缓存的书签
    const uncachedBookmarks: { index: number; bookmark: Bookmark }[] = [];
    for (let i = 0; i < bookmarks.length; i++) {
      const bookmark = bookmarks[i];
      const cacheKey = this.getCacheKey(bookmark.url, bookmark.title);
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        cached.hitCount++;
        results[i] = cached.result;
      } else {
        uncachedBookmarks.push({ index: i, bookmark });
      }
    }

    // 批量处理未缓存的书签
    for (let i = 0; i < uncachedBookmarks.length; i += validBatchSize) {
      const batch = uncachedBookmarks.slice(i, i + validBatchSize);

      try {
        // 构建批量分类的提示
        const batchPrompt = this.buildBatchPrompt(batch.map(b => b.bookmark));

        // 单个API请求处理多个URL
        const response = await this.client!.chatCompletions({
          model: this.config!.model || 'deepseek-chat',
          messages: [
            { role: 'system', content: this.getBatchSystemPrompt() },
            { role: 'user', content: batchPrompt },
          ],
          temperature: this.config!.temperature ?? 0.3,
          max_tokens: Math.min(validBatchSize * 300, 4000), // 每个书签约300 tokens
        });

        // 解析批量响应
        const content = response.choices[0]?.message?.content || '';
        const batchResults = this.parseBatchClassificationResponse(content, batch.length);

        // 更新成本统计（整批的tokens）
        const tokensPerItem = Math.ceil(response.usage.total_tokens / batch.length);
        const costPerItem = (response.usage.total_tokens * TOKEN_PRICE) / batch.length;

        // 应用结果到对应位置
        for (let j = 0; j < batch.length; j++) {
          const { index, bookmark } = batch[j];
          const result = batchResults[j] || this.getDefaultResult();

          result.tokensUsed = tokensPerItem;
          result.cost = costPerItem;
          result.modelUsed = response.model;

          results[index] = result;

          // 缓存结果
          const cacheKey = this.getCacheKey(bookmark.url, bookmark.title);
          this.cache.set(cacheKey, {
            url: bookmark.url,
            title: bookmark.title,
            result,
            timestamp: Date.now(),
            expiresAt: Date.now() + 24 * 60 * 60 * 1000,
            hitCount: 0,
          });
        }

        // 更新总成本统计
        this.updateCostStats(response.usage.total_tokens, response.usage.total_tokens * TOKEN_PRICE);

      } catch (error) {
        console.error('[DeepSeek] Batch classification failed:', error);
        // 回退到本地分类
        if (fallbackToLocal) {
          for (const { index, bookmark } of batch) {
            const localResult = await aiService.classifyBookmark(bookmark);
            results[index] = {
              ...localResult,
              reasoning: 'LLM批量调用失败，使用本地分类',
            } as LLMClassificationResult;
          }
        }
      }

      // 进度回调
      if (onProgress) {
        const processed = Math.min(i + batchSize, uncachedBookmarks.length);
        onProgress(results.filter(r => r).length, total);
      }

      // 避免速率限制，批次间延迟
      if (i + batchSize < uncachedBookmarks.length) {
        await this.delay(500);
      }
    }

    await this.saveCache();
    return results;
  }

  /**
   * 构建批量分类的用户提示
   */
  private buildBatchPrompt(bookmarks: Bookmark[]): string {
    const bookmarkList = bookmarks.map((b, i) =>
      `[${i + 1}]\nURL: ${b.url}\n标题: ${b.title}\n描述: ${b.description || '无'}`
    ).join('\n\n');

    return `请为以下 ${bookmarks.length} 个书签进行分类：\n\n${bookmarkList}\n\n请返回一个JSON数组，每个元素对应一个书签的分类结果。`;
  }

  /**
   * 获取批量分类的系统提示
   */
  private getBatchSystemPrompt(): string {
    return `你是一个专业的书签批量分类助手。你的任务是根据书签的 URL、标题和描述，为多个书签同时推荐合适的标签和文件夹。

分类规则：
1. 标签应该简洁明了，2-4 个字为佳
2. 文件夹路径使用 "/" 分隔，如 "技术/前端/React"
3. 置信度范围 0.0-1.0
4. 为每个书签提供分类结果

返回格式（JSON数组）：
[
  {
    "index": 1,
    "suggestedTags": ["标签1", "标签2"],
    "suggestedFolder": "一级分类/二级分类",
    "contentType": "article|video|documentation|tool|social|shopping|repository|blog|forum|other",
    "confidence": 0.85,
    "reasoning": "简短分类依据"
  },
  ...
]

重要：必须按顺序为每个书签返回结果，数组长度必须与输入书签数量一致。`;
  }

  /**
   * 解析批量分类响应
   */
  private parseBatchClassificationResponse(content: string, expectedCount: number): LLMClassificationResult[] {
    try {
      // 尝试提取 JSON 数组
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No JSON array found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (!Array.isArray(parsed)) {
        throw new Error('Response is not an array');
      }

      return parsed.map((item: any) => ({
        suggestedTags: item.suggestedTags || [],
        suggestedFolder: item.suggestedFolder,
        contentType: item.contentType || 'other',
        confidence: item.confidence || 0.5,
        reasoning: item.reasoning || '',
        alternativeTags: item.alternativeTags || [],
        alternativeFolders: item.alternativeFolders || [],
        method: 'llm' as const,
      }));
    } catch (error) {
      console.error('[DeepSeek] Failed to parse batch response:', content);
      // 返回默认结果数组
      return Array(expectedCount).fill(null).map(() => this.getDefaultResult());
    }
  }

  /**
   * 获取默认分类结果
   */
  private getDefaultResult(): LLMClassificationResult {
    return {
      suggestedTags: [],
      contentType: 'other' as ContentType,
      confidence: 0,
      method: 'llm',
      reasoning: '解析失败',
    };
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
