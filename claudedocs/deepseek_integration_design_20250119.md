# DeepSeek AI 智能书签分类系统设计

**版本**: v0.6.0
**日期**: 2025-01-19
**状态**: 设计阶段

---

## 1. 系统概述

### 1.1 设计目标

集成 DeepSeek 大模型 API，实现更智能的书签分类和整理功能：

1. **智能分类**: 使用 DeepSeek 理解书签内容，提供更准确的分类建议
2. **标签生成**: 自动提取关键词，生成有意义的标签
3. **内容摘要**: 生成书签内容的简短摘要
4. **智能推荐**: 基于用户习惯推荐相关书签
5. **多轮对话**: 支持与用户对话优化分类结果

### 1.2 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                    用户界面层                              │
├─────────────────────────────────────────────────────────────┤
│  BookmarkCard │  AddBookmarkForm │  ChatAssistant        │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                    业务逻辑层                               │
├─────────────────────────────────────────────────────────────┤
│  EnhancedAIService │  ChatService │  RecommendationEngine │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   DeepSeek API 层                          │
├─────────────────────────────────────────────────────────────┤
│  API Client │  Prompt Manager │  Response Parser          │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   DeepSeek API                              │
├─────────────────────────────────────────────────────────────┤
│  /v1/chat/completions │  /v1/embeddings                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 核心 API 设计

### 2.1 DeepSeek API 集成

#### API 端点

```typescript
// DeepSeek API 配置
interface DeepSeekConfig {
  apiKey: string;
  baseURL: string;
  model: 'deepseek-chat' | 'deepseek-coder';
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

// API 客户端
class DeepSeekClient {
  private config: DeepSeekConfig;

  constructor(config: DeepSeekConfig) {
    this.config = config;
  }

  // 聊天完成 API
  async chat(messages: ChatMessage[]): Promise<ChatResponse>;

  // 嵌入 API (用于语义搜索)
  async embed(text: string): Promise<number[]>;

  // 流式聊天
  async chatStream(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void
  ): Promise<ChatResponse>;
}
```

#### 请求/响应格式

```typescript
// 聊天消息
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// 聊天响应
interface ChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

### 2.2 Prompt 工程设计

#### 系统提示词（System Prompt）

```typescript
const BOOKMARK_CLASSIFICATION_SYSTEM_PROMPT = `你是一个智能书签管理助手，专门帮助用户对书签进行分类和整理。

## 你的能力
1. 分析书签的 URL、标题和描述，理解其内容类型
2. 为书签推荐合适的标签（3-5 个）
3. 建议书签应该存放的文件夹
4. 生成简洁的内容摘要（1-2 句话）
5. 识别书签的重要性等级

## 标签推荐原则
- 标签应该简洁明了，通常 2-6 个字符
- 优先使用领域专业术语（如：React, TypeScript, 算法）
- 使用中文标签，兼顾英文技术术语
- 标签应具有分类价值和检索价值
- 避免过于宽泛的标签（如：网站、文章）

## 文件夹组织原则
- 按主题领域分类（技术、设计、产品、工具等）
- 考虑用户的浏览场景和使用频率
- 保持层级结构清晰，避免过深
- 常用文件夹应靠前

## 输出格式
请严格按照以下 JSON 格式输出（不要包含其他文字）：
\`\`\`json
{
  "tags": ["标签1", "标签2", "标签3"],
  "folder": "推荐文件夹路径",
  "contentType": "内容类型",
  "importance": "high" | "medium" | "low",
  "summary": "内容摘要"
}
\`\`\`

## 示例
输入：
{
  "url": "https://react.dev/blog/2024/12/10/react-19",
  "title": "React 19: 新特性介绍",
  "description": "React 19 版本的新功能详细说明"
}

输出：
{
  "tags": ["React", "前端", "框架", "更新日志"],
  "folder": "技术/前端/React",
  "contentType": "documentation",
  "importance": "high",
  "summary": "React 19 版本发布，引入了新的编译器和并发渲染特性"
}
`;
```

#### 书签分析 Prompt

```typescript
function buildBookmarkAnalysisPrompt(bookmark: Bookmark): string {
  return `请分析以下书签，给出分类建议：

URL: ${bookmark.url}
标题: ${bookmark.title}
描述: ${bookmark.description || '无'}
现有标签: ${bookmark.tags.join(', ') || '无'}

请按以下 JSON 格式输出分类建议：
{
  "tags": ["标签1", "标签2", "标签3"],
  "folder": "文件夹路径",
  "contentType": "内容类型",
  "importance": "high" | "medium" | "low",
  "summary": "内容摘要",
  "confidence": 0.8,
  "reasoning": "分类理由"
}`;
}
```

#### 批量分类 Prompt

```typescript
function buildBatchClassifyPrompt(bookmarks: Bookmark[]): string {
  const bookmarksInfo = bookmarks.map((b, i) =>
    `${i + 1}. URL: ${b.url}\n   标题: ${b.title}\n   描述: ${b.description || '无'}`
  ).join('\n\n');

  return `请批量分析以下 ${bookmarks.length} 个书签，为每个书签推荐标签和文件夹：

${bookmarksInfo}

请按以下 JSON 格式输出，返回一个数组：
[
  {
    "index": 1,
    "bookmarkId": "${bookmarks[0].id}",
    "tags": ["标签1", "标签2"],
    "folder": "文件夹路径",
    "contentType": "内容类型",
    "importance": "high" | "medium" | "low",
    "summary": "内容摘要"
  },
  ...
]`;
}
```

---

## 3. 增强的 AI 服务

### 3.1 服务架构

```typescript
export class EnhancedAIService {
  private ruleService: RuleBasedService;
  private llmService: DeepSeekAIService;
  private hybridService: HybridAIService;

  // 分类单个书签
  async classifyBookmark(
    bookmark: Bookmark,
    options: ClassificationOptions
  ): Promise<ClassificationResult>

  // 批量分类
  async batchClassify(
    bookmarks: Bookmark[],
    options?: BatchClassifyOptions
  ): Promise<ClassificationResult[]>

  // 生成摘要
  async generateSummary(bookmark: Bookmark): Promise<string>

  // 对话式分类
  async chatClassify(
    bookmark: Bookmark,
    userContext?: string
  ): Promise<ClassificationResult>

  // 学习用户偏好
  async learnFromUser(
    bookmarkId: string,
    userChoice: UserChoice
  ): Promise<void>
}
```

### 3.2 混合分类策略

```typescript
interface ClassificationOptions {
  // 优先使用的分类方法
  preferredMethod?: 'rule' | 'llm' | 'hybrid';

  // LLM 配置
  llmConfig?: {
    temperature?: number;
    maxTokens?: number;
    enableReasoning?: boolean;
  };

  // 回退策略
  fallbackStrategy?: 'rule' | 'local';

  // 缓存策略
  useCache?: boolean;
  cacheTTL?: number;
}

// 混合分类流程
async function classifyWithHybrid(
  bookmark: Bookmark,
  options: ClassificationOptions
): Promise<ClassificationResult> {
  // 1. 快速规则匹配（优先级 100）
  const ruleResult = await ruleService.match(bookmark);
  if (ruleResult.confidence > 0.9) {
    return ruleResult; // 高置信度规则直接返回
  }

  // 2. LLM 深度分析
  const llmResult = await llmService.classify(bookmark, options.llmConfig);

  // 3. 融合规则和 LLM 结果
  if (llmResult.confidence >= 0.7) {
    return llmResult;
  }

  // 4. 回退到规则或本地方法
  return fallbackClassification(bookmark);
}
```

---

## 4. 数据模型设计

### 4.1 新增类型定义

```typescript
// DeepSeek AI 提供商
export type AIProvider = 'local' | 'openai' | 'claude' | 'deepseek';

// DeepSeek 配置
export interface DeepSeekConfig {
  apiKey: string;
  baseURL?: string;
  model: 'deepseek-chat' | 'deepseek-coder';
  enabled: boolean;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

// 分类选项
export interface ClassificationOptions {
  preferredMethod?: 'rule' | 'llm' | 'hybrid';
  llmConfig?: {
    temperature?: number;
    maxTokens?: number;
    enableReasoning?: boolean;
  };
  fallbackStrategy?: 'rule' | 'local';
  useCache?: boolean;
  cacheTTL?: number;
}

// LLM 分类结果
export interface LLMClassificationResult {
  tags: string[];
  folder: string;
  contentType: ContentType;
  importance: 'high' | 'medium' | 'low';
  summary: string;
  confidence: number;
  reasoning: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// 用户选择
export interface UserChoice {
  bookmarkId: string;
  originalSuggestion: ClassificationResult;
  userTags?: string[];
  userFolder?: string;
  accepted: boolean;
  timestamp: number;
}

// 分类缓存
export interface ClassificationCache {
  bookmarkId: string;
  result: LLMClassificationResult;
  createdAt: number;
  expiresAt: number;
  hitCount: number;
}
```

### 4.2 数据库 Schema

```typescript
// 分类缓存表
db.version(4).stores({
  llmCache: 'bookmarkId, createdAt, expiresAt',
  userChoices: 'bookmarkId, timestamp',
  classificationHistory: 'bookmarkId, timestamp, method',
});

// LLM 分类缓存
interface LLMCacheRecord {
  id: string;
  bookmarkId: string;
  url: string;  // URL 作为缓存键
  result: LLMClassificationResult;
  createdAt: number;
  expiresAt: number;
  hitCount: number;
}

// 用户选择记录
interface UserChoiceRecord {
  id: string;
  bookmarkId: string;
  originalTags: string[];
  userTags: string[];
  originalFolder?: string;
  userFolder?: string;
  accepted: boolean;
  timestamp: number;
}

// 分类历史
interface ClassificationHistoryRecord {
  id: string;
  bookmarkId: string;
  method: 'rule' | 'llm' | 'hybrid';
  result: ClassificationResult;
  duration: number;
  timestamp: number;
}
```

---

## 5. 功能模块设计

### 5.1 DeepSeek API 客户端

```typescript
// src/lib/deepseekClient.ts

export class DeepSeekClient {
  private config: DeepSeekConfig;

  constructor(config: DeepSeekConfig) {
    this.config = {
      baseURL: config.baseURL || 'https://api.deepseek.com',
      model: config.model || 'deepseek-chat',
      temperature: config.temperature || 0.7,
      maxTokens: config.maxTokens || 2000,
      timeout: config.timeout || 30000,
      ...config,
    };
  }

  async chat(messages: ChatMessage[]): Promise<ChatResponse> {
    const response = await fetch(`${this.config.baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        stream: false,
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DeepSeek API error: ${error}`);
    }

    return response.json();
  }

  async chatStream(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void
  ): Promise<ChatResponse> {
    const response = await fetch(`${this.config.baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        stream: true,
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${await response.text()}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body is null');

    const decoder = new TextDecoder();
    let fullContent = '';
    let result: ChatResponse | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

      for (const line of lines) {
        const data = line.replace('data: ', '');
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          if (parsed.choices?.[0]?.delta?.content) {
            const content = parsed.choices[0].delta.content;
            fullContent += content;
            onChunk(content);
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }

    // 返回完整响应
    return JSON.parse(fullContent) as ChatResponse;
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.config.baseURL}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-embedder',
        input: text,
        encoding_format: 'float',
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek Embedding API error: ${await response.text()}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }
}
```

### 5.2 DeepSeek AI 服务

```typescript
// src/services/deepseekAIService.ts

export class DeepSeekAIService {
  private client: DeepSeekClient;
  private cache: Map<string, LLMClassificationResult> = new Map();
  private cacheEnabled = true;

  constructor(client: DeepSeekClient) {
    this.client = client;
  }

  // 分类单个书签
  async classifyBookmark(
    bookmark: Bookmark,
    options?: ClassificationOptions
  ): Promise<LLMClassificationResult> {
    // 检查缓存
    const cacheKey = this.buildCacheKey(bookmark);
    if (this.cacheEnabled && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      if (cached.expiresAt > Date.now()) {
        cached.hitCount++;
        return cached;
      }
    }

    // 构建提示词
    const prompt = this.buildClassificationPrompt(bookmark);

    // 调用 DeepSeek API
    const response = await this.client.chat([
      {
        role: 'system',
        content: BOOKMARK_CLASSIFICATION_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: prompt,
      },
    ]);

    // 解析响应
    const result = this.parseClassificationResponse(response);

    // 缓存结果
    if (this.cacheEnabled) {
      this.cache.set(cacheKey, {
        ...result,
        createdAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7天
        hitCount: 0,
      });
    }

    return result;
  }

  // 批量分类
  async batchClassify(
    bookmarks: Bookmark[],
    options?: BatchClassifyOptions
  ): Promise<Map<string, LLMClassificationResult>> {
    const results = new Map<string, LLMClassificationResult>();
    const batchSize = 10; // DeepSeek API 限制

    for (let i = 0; i < bookmarks.length; i += batchSize) {
      const batch = bookmarks.slice(i, i + batchSize);
      const batchPrompt = this.buildBatchClassificationPrompt(batch);

      const response = await this.client.chat([
        {
          role: 'system',
          content: BOOKMARK_CLASSIFICATION_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: batchPrompt,
        },
      ]);

      const batchResults = this.parseBatchClassificationResponse(response, batch);
      batchResults.forEach((r) => results.set(r.bookmarkId, r));
    }

    return results;
  }

  // 生成摘要
  async generateSummary(bookmark: Bookmark): Promise<string> {
    const prompt = `请为以下书签生成简洁的摘要（1-2 句话）：

URL: ${bookmark.url}
标题: ${bookmark.title}
描述: ${bookmark.description || '无'}

摘要应该：
- 突出书签的核心内容
- 提及主要特点或价值
- 简洁明了，30-50 字

请直接输出摘要内容，不要包含其他文字。`;

    const response = await this.client.chat([
      {
        role: 'system',
        content: '你是一个专业的摘要生成助手，擅长提取关键信息并生成简洁准确的摘要。',
      },
      {
        role: 'user',
        content: prompt,
      },
    ]);

    return response.choices[0].message.content.trim();
  }

  // 对话式分类
  async chatClassify(
    bookmark: Bookmark,
    userContext?: string,
    onProgress?: (message: string) => void
  ): Promise<ClassificationResult> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: BOOKMARK_CLASSIFICATION_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: this.buildClassificationPrompt(bookmark),
      },
    ];

    // 如果有用户上下文，添加到对话中
    if (userContext) {
      messages.push({
        role: 'user',
        content: userContext,
      });
    }

    // 流式响应
    const fullResponse = await this.client.chatStream(messages, (chunk) => {
      onProgress?.(chunk);
    });

    return this.parseClassificationResponse(fullResponse);
  }

  // 学习用户选择
  async learnFromUser(
    bookmarkId: string,
    userChoice: UserChoice
  ): Promise<void> {
    // 保存到数据库
    await db.userChoices.add({
      id: generateId(),
      bookmarkId,
      originalTags: userChoice.originalSuggestion.suggestedTags,
      userTags: userChoice.userTags || [],
      originalFolder: userChoice.originalSuggestion.suggestedFolder,
      userFolder: userChoice.userFolder,
      accepted: userChoice.accepted,
      timestamp: Date.now(),
    });

    // 分析用户偏好模式
    await this.analyzeUserPreferences();
  }

  // 分析用户偏好
  private async analyzeUserPreferences(): Promise<void> {
    const choices = await db.userChoices.toArray();

    // 统计用户接受的标签
    const acceptedTags = new Map<string, number>();
    for (const choice of choices) {
      if (choice.accepted && choice.userTags) {
        for (const tag of choice.userTags) {
          acceptedTags.set(tag, (acceptedTags.get(tag) || 0) + 1);
        }
      }
    }

    // 保存用户偏好
    await chrome.storage.local.set({
      userTagPreferences: Object.fromEntries(acceptedTags),
    });
  }

  // 获取用户偏好
  async getUserPreferences(): Promise<Map<string, number>> {
    const stored = await chrome.storage.local.get('userTagPreferences');
    return new Map(Object.entries(stored.userTagPreferences || {}));
  }

  // 清除缓存
  clearCache(): void {
    this.cache.clear();
  }

  // 私有辅助方法
  private buildCacheKey(bookmark: Bookmark): string {
    return `${bookmark.url}|${bookmark.title}`;
  }

  private buildClassificationPrompt(bookmark: Bookmark): string {
    return `请分析以下书签，给出分类建议：

URL: ${bookmark.url}
标题: ${bookmark.title}
描述: ${bookmark.description || '无'}
现有标签: ${bookmark.tags.join(', ') || '无'}

请按以下 JSON 格式输出分类建议：
{
  "tags": ["标签1", "标签2", "标签3"],
  "folder": "文件夹路径",
  "contentType": "内容类型",
  "importance": "high" | "medium" | "low",
  "summary": "内容摘要",
  "confidence": 0.8,
  "reasoning": "分类理由"
}`;
  }

  private buildBatchClassificationPrompt(bookmarks: Bookmark[]): string {
    const bookmarksInfo = bookmarks.map((b, i) =>
      `${i + 1}. URL: ${b.url}\n   标题: ${b.title}\n   描述: ${b.description || '无'}`
    ).join('\n\n');

    return `请批量分析以下 ${bookmarks.length} 个书签，为每个书签推荐标签和文件夹：

${bookmarksInfo}

请按以下 JSON 格式输出，返回一个数组：
[
  {
    "index": 1,
    "bookmarkId": "${bookmarks[0].id}",
    "tags": ["标签1", "标签2"],
    "folder": "文件夹路径",
    "contentType": "内容类型",
    "importance": "high" | "medium" | "low",
    "summary": "内容摘要"
  },
  ...
]`;
  }

  private parseClassificationResponse(response: ChatResponse): LLMClassificationResult {
    const content = response.choices[0].message.content;
    const jsonMatch = content.match(/```json\n([\s\S]+?)\n```/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      return {
        ...parsed,
        tokenUsage: response.usage,
      };
    }

    // 尝试直接解析
    try {
      const parsed = JSON.parse(content);
      return {
        ...parsed,
        tokenUsage: response.usage,
      };
    } catch {
      throw new Error('Failed to parse DeepSeek response');
    }
  }

  private parseBatchClassificationResponse(
    response: ChatResponse,
    bookmarks: Bookmark[]
  ): LLMClassificationResult[] {
    const content = response.choices[0].message.content;
    const results = JSON.parse(content);

    return results.map((r: any, i: number) => ({
      ...r,
      bookmarkId: r.bookmarkId || bookmarks[i].id,
      tokenUsage: response.usage,
    }));
  }
}
```

### 5.3 混合 AI 服务

```typescript
// src/services/enhancedAIService.ts

export class EnhancedAIService {
  private deepSeekService: DeepSeekAIService;
  private ruleService: RuleBasedService;

  constructor(deepSeekConfig: DeepSeekConfig) {
    const client = new DeepSeekClient(deepSeekConfig);
    this.deepSeekService = new DeepSeekAIService(client);
    this.ruleService = new RuleBasedService();
  }

  async classifyBookmark(
    bookmark: Bookmark,
    options: ClassificationOptions = {}
  ): Promise<ClassificationResult> {
    const method = options.preferredMethod || 'hybrid';

    switch (method) {
      case 'rule':
        return this.ruleClassify(bookmark);

      case 'llm':
        return this.llmClassify(bookmark, options);

      case 'hybrid':
        return this.hybridClassify(bookmark, options);

      default:
        return this.hybridClassify(bookmark, options);
    }
  }

  private async ruleClassify(bookmark: Bookmark): Promise<ClassificationResult> {
    return this.ruleService.classify(bookmark);
  }

  private async llmClassify(
    bookmark: Bookmark,
    options: ClassificationOptions
  ): Promise<ClassificationResult> {
    const llmResult = await this.deepSeekService.classifyBookmark(bookmark, options);

    return {
      suggestedFolder: llmResult.folder,
      suggestedTags: llmResult.tags,
      contentType: llmResult.contentType,
      confidence: llmResult.confidence,
      method: 'nlp',
      reasoning: llmResult.reasoning,
    };
  }

  private async hybridClassify(
    bookmark: Bookmark,
    options: ClassificationOptions
  ): Promise<ClassificationResult> {
    // 1. 快速规则匹配
    const ruleResult = await this.ruleService.classify(bookmark);

    // 如果规则置信度高，直接返回
    if (ruleResult.confidence >= 0.9) {
      return ruleResult;
    }

    // 2. LLM 深度分析
    const llmResult = await this.deepSeekService.classifyBookmark(bookmark, options);

    // 3. 如果 LLM 置信度高，使用 LLM 结果
    if (llmResult.confidence >= 0.7) {
      return {
        suggestedFolder: llmResult.folder,
        suggestedTags: llmResult.tags,
        contentType: llmResult.contentType,
        confidence: llmResult.confidence,
        method: 'hybrid',
        reasoning: `LLM analysis: ${llmResult.reasoning}`,
      };
    }

    // 4. 融合结果（标签取并集，文件夹用 LLM 的）
    const combinedTags = [...new Set([
      ...ruleResult.suggestedTags,
      ...llmResult.tags,
    ])].slice(0, 5);

    return {
      suggestedFolder: llmResult.suggestedFolder || ruleResult.suggestedFolder,
      suggestedTags: combinedTags,
      contentType: llmResult.contentType,
      confidence: Math.max(ruleResult.confidence, llmResult.confidence),
      method: 'hybrid',
      reasoning: `Hybrid: rules (${ruleResult.confidence.toFixed(2)}) + LLM (${llmResult.confidence.toFixed(2)})`,
    };
  }

  // 生成书签摘要
  async generateSummary(bookmark: Bookmark): Promise<string> {
    return this.deepSeekService.generateSummary(bookmark);
  }

  // 获取统计信息
  async getStats(): Promise<ClassificationStats> {
    const history = await db.classificationHistory.toArray();

    const methodCounts = new Map<string, number>();
    for (const record of history) {
      methodCounts.set(record.method, (methodCounts.get(record.method) || 0) + 1);
    }

    return {
      totalClassified: history.length,
      accuracy: 0, // TODO: 计算实际准确率
      acceptedSuggestions: 0, // TODO: 从 userChoices 计算
      rejectedSuggestions: 0,
      mostUsedTags: [],
      mostActiveRules: [],
    };
  }
}
```

---

## 6. UI 组件设计

### 6.1 AI 配置组件

```typescript
// src/components/ai/DeepSeekConfig.tsx

export function DeepSeekConfig() {
  const [config, setConfig] = useState<DeepSeekConfig>({
    apiKey: '',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    enabled: false,
    temperature: 0.7,
    maxTokens: 2000,
  });

  const [testResult, setTestResult] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const client = new DeepSeekClient(config);
      const response = await client.chat([
        {
          role: 'user',
          content: '你好，请简短介绍一下你自己。',
        },
      ]);

      setTestResult(response.choices[0].message.content);
    } catch (error) {
      setTestResult(`错误: ${(error as Error).message}`);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h3 className="text-lg font-semibold mb-4">DeepSeek AI 配置</h3>

      <div className="space-y-4">
        {/* API Key */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            API Key
          </label>
          <input
            type="password"
            value={config.apiKey}
            onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            placeholder="输入您的 DeepSeek API Key"
          />
          <p className="text-xs text-gray-500 mt-1">
            获取 API Key:{' '}
            <a
              href="https://platform.deepseek.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              platform.deepseek.com
            </a>
          </p>
        </div>

        {/* 模型选择 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            模型
          </label>
          <select
            value={config.model}
            onChange={(e) => setConfig({ ...config, model: e.target.value as any })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="deepseek-chat">DeepSeek-V3 (通用)</option>
            <option value="deepseek-coder">DeepSeek-Coder (编程)</option>
          </select>
        </div>

        {/* 参数配置 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Temperature: {config.temperature}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={config.temperature}
              onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Tokens: {config.maxTokens}
            </label>
            <input
              type="number"
              value={config.maxTokens}
              onChange={(e) => setConfig({ ...config, maxTokens: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        {/* 启用开关 */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <div className="font-medium text-gray-900">启用 DeepSeek AI</div>
            <div className="text-sm text-gray-500">
              启用后将使用 LLM 进行智能分类
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>

        {/* 测试连接 */}
        <div>
          <button
            onClick={handleTest}
            disabled={isTesting || !config.apiKey}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {isTesting ? '测试中...' : '测试连接'}
          </button>

          {testResult && (
            <div className={`mt-2 p-3 rounded text-sm ${
              testResult.startsWith('错误') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
            }`}>
              {testResult}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

### 6.2 对话式分类组件

```typescript
// src/components/ai/ChatClassifyDialog.tsx

export function ChatClassifyDialog({
  bookmark,
  open,
  onClose,
  onComplete,
}: ChatClassifyDialogProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ClassificationResult | null>(null);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: input,
    };

    setMessages([...messages, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // 调用流式 API
      const response = await deepSeekService.chatClassify(
        bookmark,
        input,
        (chunk) => {
          setMessages((prev) => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage?.role === 'assistant') {
              return [
                ...prev.slice(0, -1),
                { ...lastMessage, content: lastMessage.content + chunk },
              ];
            }
            return [...prev, { role: 'assistant', content: chunk }];
          });
        }
      );

      setResult(response);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `抱歉，出现错误：${(error as Error).message}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = async () => {
    if (!result) return;

    // 应用分类结果
    await bookmarkService.update(bookmark.id, {
      tags: result.suggestedTags,
      folderId: result.suggestedFolder,
    });

    onComplete?.(result);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI 智能分类</DialogTitle>
          <DialogDescription>
            与 DeepSeek AI 对话，优化书签分类
          </DialogDescription>
        </DialogHeader>

        {/* 聊天历史 */}
        <div className="max-h-96 overflow-y-auto mb-4 p-4 bg-gray-50 rounded-lg">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`mb-2 ${
                msg.role === 'user' ? 'text-right' : 'text-left'
              }`}
            >
              <div
                className={`inline-block px-3 py-2 rounded-lg ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-900 border'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="text-center text-gray-500">
              正在思考...
            </div>
          )}
        </div>

        {/* 分类结果 */}
        {result && (
          <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">分类建议</h4>
            <div className="space-y-1 text-sm">
              <div><strong>标签:</strong> {result.suggestedTags.join(', ')}</div>
              <div><strong>文件夹:</strong> {result.suggestedFolder}</div>
              <div><strong>摘要:</strong> {result.reasoning}</div>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                onClick={handleApply}
                className="flex-1 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                应用建议
              </button>
              <button
                onClick={() => setResult(null)}
                className="flex-1 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                重新分类
              </button>
            </div>
          </div>
        )}

        {/* 输入框 */}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入你的要求或问题..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
          >
            发送
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 7. 使用流程

### 7.1 用户配置流程

1. **配置 DeepSeek API**
   - 在设置页面中打开 DeepSeek AI 配置
   - 输入 API Key
   - 选择模型（deepseek-chat 或 deepseek-coder）
   - 调整参数（temperature、maxTokens）
   - 点击"测试连接"验证配置

2. **启用自动分类**
   - 在整理工具页面开启自动整理
   - 选择分类策略（规则/LLM/混合）
   - 配置置信度阈值

### 7.2 分类流程

```
添加书签
    ↓
┌─────────────────────┐
│  1. 规则快速匹配     │ (置信度 > 0.9)
└──────────┬──────────┘
           │ No
           ↓
┌─────────────────────┐
│  2. DeepSeek LLM 分析 │
│  - 理解内容          │
│  - 生成标签          │
│  - 推荐文件夹        │
│  - 生成摘要          │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  3. 用户确认/调整     │
│  - 预览分类结果      │
│  - 对话优化          │
│  - 应用更改          │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  4. 学习用户偏好     │
│  - 记录用户选择      │
│  - 优化未来推荐      │
└─────────────────────┘
```

---

## 8. 成本优化

### 8.1 API 调用优化

```typescript
// 成本优化策略
interface CostOptimization {
  // 缓存策略
  enableCache: boolean;
  cacheTTL: number; // 7 天

  // 批量处理
  batchSize: number; // 10 个书签/次

  // 智能路由
  useHybrid: boolean; // 混合模式减少 LLM 调用

  // Token 优化
  maxTokens: number;
  temperature: number;
}

// 成本估算
async function estimateCost(bookmarks: Bookmark[]): Promise<CostEstimate> {
  const rulesCost = 0; // 规则免费
  const llmCost = bookmarks.length * 0.001; // DeepSeek 定价

  return {
    rules: rulesCost,
    llm: llmCost,
    total: rulesCost + llmCost,
    estimatedTime: bookmarks.length * 0.5, // 秒
  };
}
```

### 8.2 缓存策略

```typescript
// 多级缓存
interface MultiLevelCache {
  // L1: 内存缓存 (会话级别)
  memory: Map<string, LLMClassificationResult>;

  // L2: IndexedDB (持久化)
  indexedDB: IDBObjectStore;

  // L3: Chrome Storage (跨会话)
  chromeStorage: chrome.storage.Local;

  async get(key: string): Promise<LLMClassificationResult | null>;
  async set(key: string, value: LLMClassificationResult): Promise<void>;
  async clear(): Promise<void>;
}
```

---

## 9. 错误处理与重试

### 9.1 错误处理

```typescript
interface ErrorHandler {
  // API 错误
  handleAPIError(error: APIError): ClassificationResult;

  // 网络错误
  handleNetworkError(error: NetworkError): ClassificationResult;

  // 解析错误
  handleParseError(error: ParseError): ClassificationResult;

  // 降级策略
  fallbackToLocal(bookmark: Bookmark): ClassificationResult;
}

class RetryableDeepSeekService {
  private maxRetries = 3;
  private baseDelay = 1000;

  async classifyWithRetry(
    bookmark: Bookmark,
    attempt = 0
  ): Promise<ClassificationResult> {
    try {
      return await this.classifyBookmark(bookmark);
    } catch (error) {
      if (attempt < this.maxRetries) {
        const delay = this.baseDelay * Math.pow(2, attempt);
        await this.sleep(delay);
        return this.classifyWithRetry(bookmark, attempt + 1);
      }

      // 重试失败，使用本地方法
      return this.fallbackToLocal(bookmark);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

## 10. 实现优先级

### Phase 1: 核心 API 集成（高优先级）
- [ ] DeepSeek API 客户端实现
- [ ] DeepSeek AI 服务基础功能
- [ ] Prompt 模板定义
- [ ] 响应解析逻辑

### Phase 2: 混合分类（高优先级）
- [ ] 增强 AI 服务（规则 + LLM）
- [ ] 缓存机制
- [ ] 错误处理和降级
- [ ] 用户学习记录

### Phase 3: UI 组件（中优先级）
- [ ] DeepSeek 配置组件
- [ ] 对话式分类组件
- [ ] 分类结果展示优化

### Phase 4: 高级功能（中优先级）
- [ ] 批量分类优化
- [ ] 成本统计和优化
- [ ] 性能监控

### Phase 5: 增强功能（低优先级）
- [ ] 对话历史管理
- [ ] 高级分析报告
- [ ] 自定义 Prompt 模板

---

## 11. 技术约束与注意事项

### 11.1 API 限制

```typescript
// DeepSeek API 限制
const DEEPSEEK_LIMITS = {
  // 速率限制
  rateLimit: {
    requestsPerMinute: 50,
    requestsPerDay: 10000,
  },

  // Token 限制
  maxTokens: {
    deepseekChat: 4096,
    deepseekCoder: 8192,
  },

  // 超时设置
  timeout: 30000, // 30 秒
};

// 成本估算（DeepSeek 定价）
const PRICING = {
  deepseekChat: 0.001,  // 每 1K tokens
  deepseekCoder: 0.002, // 每 1K tokens
  // 平均每个书签约 500 tokens
  // 成本: 约 ¥0.0005/书签
};
```

### 11.2 隐私和安全

```typescript
// 数据隐私保护
interface PrivacyProtection {
  // API Key 加密存储
  apiKeyEncryption: boolean;

  // 数据脱敏
  dataMasking: boolean;

  // 本地优先
  localFirst: boolean;

  // 用户数据不上传
  noDataUpload: boolean;
}

// 安全考虑
const SECURITY_CONSIDERATIONS = {
  // API Key 安全存储
  // 使用 chrome.storage.local 但加密

  // 请求签名
  // 添加时间戳和随机数防止重放

  // 内容过滤
  // 避免发送敏感信息到 LLM

  // 响应验证
  // 严格解析 JSON，避免注入攻击
};
```

---

## 12. 后续扩展

### 12.1 高级功能

1. **多模型支持**
   - 同时支持 OpenAI、Claude、DeepSeek
   - 根据书签类型自动选择最佳模型

2. **智能降级**
   - API 失败时自动使用本地方法
   - 网络错误时排队重试

3. **成本优化**
   - Token 使用优化
   - 批量处理减少 API 调用
   - 智能缓存策略

4. **性能提升**
   - 并发处理
   - 增量更新
   - 背景任务

---

## 13. 总结

通过集成 DeepSeek AI，智能书签系统将获得：

1. **更准确的分类** - 理解语义，提供精准标签
2. **更智能的推荐** - 基于内容理解，非简单规则
3. **更好的体验** - 对话式交互，自然优化结果
4. **持续学习** - 从用户反馈中改进

设计文档已保存至：`claudedocs/deepseek_integration_design_20250119.md`

**下一步**: 使用 `/sc:implement` 开始实现核心功能。
