// 语义搜索服务 - 基于嵌入向量的智能搜索

import type {
  DocumentEmbedding,
  SemanticSearchResult,
  SemanticSearchConfig,
  APIKeyConfig,
} from '@/types';
import { db } from '@/lib/database';
import type { Bookmark } from '@/types';

// 嵌入向量表
export interface EmbeddingRecord {
  id: string;
  bookmarkId: string;
  embedding: number[];
  model: string;
  createdAt: number;
  updatedAt: number;
}

// 计算余弦相似度
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 嵌入 API 接口
interface EmbeddingAPI {
  generateEmbedding(text: string): Promise<number[]>;
  generateBatchEmbeddings(texts: string[]): Promise<number[][]>;
}

// OpenAI 嵌入 API
class OpenAIEmbeddingAPI implements EmbeddingAPI {
  private apiKey: string;
  private model: string;
  private endpoint: string;

  constructor(config: APIKeyConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'text-embedding-3-small';
    this.endpoint = config.endpoint || 'https://api.openai.com/v1/embeddings';
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    return data.data.map((item: any) => item.embedding);
  }
}

// Cohere 嵌入 API
class CohereEmbeddingAPI implements EmbeddingAPI {
  private apiKey: string;
  private model: string;
  private endpoint: string;

  constructor(config: APIKeyConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'embed-english-v3.0';
    this.endpoint = config.endpoint || 'https://api.cohere.ai/v1/embed';
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        texts: [text],
        input_type: 'search_document',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cohere API error: ${error}`);
    }

    const data = await response.json();
    return data.embeddings[0];
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        texts: texts,
        input_type: 'search_document',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cohere API error: ${error}`);
    }

    const data = await response.json();
    return data.embeddings;
  }
}

// 本地向量生成（使用简单的 TF-IDF + 降维）
class LocalEmbeddingAPI implements EmbeddingAPI {
  private vocabulary: Map<string, number> = new Map();
  private vocabSize = 384; // 与 OpenAI 小模型维度一致

  constructor() {
    // 预定义一些常用词汇
    const commonWords = [
      'the', 'is', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'with', 'by', 'from', 'as', 'of', 'that', 'this', 'it', 'you', 'he',
      'she', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how',
      'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
      'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
      'can', 'will', 'just', 'should', 'now', 'then', 'also', 'are', 'was', 'were',
    ];
    commonWords.forEach((word, i) => this.vocabulary.set(word, i));
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);
  }

  private buildVocabulary(texts: string[]): void {
    const words = new Set<string>();
    texts.forEach(text => {
      this.tokenize(text).forEach(word => words.add(word));
    });
    words.forEach((word, i) => {
      if (!this.vocabulary.has(word)) {
        this.vocabulary.set(word, this.vocabulary.size);
      }
    });
  }

  private textToVector(text: string): number[] {
    const tokens = this.tokenize(text);
    const vector = new Array(this.vocabSize).fill(0);

    // 简单的词袋模型 + TF
    const termFreq = new Map<string, number>();
    tokens.forEach(token => {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    });

    termFreq.forEach((freq, term) => {
      const idx = this.vocabulary.get(term);
      if (idx !== undefined && idx < this.vocabSize) {
        vector[idx] = freq;
      }
    });

    return vector;
  }

  private normalize(vector: number[]): number[] {
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (norm === 0) return vector;
    return vector.map(val => val / norm);
  }

  async generateEmbedding(text: string): Promise<number[]> {
    return this.normalize(this.textToVector(text));
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    this.buildVocabulary(texts);
    return texts.map(text => this.generateEmbedding(text));
  }
}

export class SemanticSearchService {
  private config: SemanticSearchConfig | null = null;
  private api: EmbeddingAPI | null = null;
  private isIndexing = false;

  // 初始化配置
  async initialize(config: SemanticSearchConfig): Promise<void> {
    this.config = config;

    if (config.enabled && config.provider !== 'local') {
      const apiKeyConfig: APIKeyConfig = {
        provider: config.provider,
        apiKey: config.apiKey || '',
        model: config.model,
      };

      switch (config.provider) {
        case 'openai':
          this.api = new OpenAIEmbeddingAPI(apiKeyConfig);
          break;
        case 'cohere':
          this.api = new CohereEmbeddingAPI(apiKeyConfig);
          break;
        default:
          this.api = new LocalEmbeddingAPI();
      }
    } else {
      this.api = new LocalEmbeddingAPI();
    }
  }

  // 生成书签的搜索文本
  private generateSearchText(bookmark: Bookmark): string {
    const parts: string[] = [];

    // 标题（权重最高）
    parts.push(bookmark.title.repeat(3));

    // 描述
    if (bookmark.description) {
      parts.push(bookmark.description);
    }

    // URL 的域名和路径
    try {
      const url = new URL(bookmark.url);
      parts.push(url.hostname);
      parts.push(url.pathname.replace(/\//g, ' '));
    } catch {
      parts.push(bookmark.url);
    }

    // 标签
    if (bookmark.tags && bookmark.tags.length > 0) {
      parts.push(bookmark.tags.join(' '));
    }

    // 笔记
    if (bookmark.notes) {
      parts.push(bookmark.notes);
    }

    return parts.join(' ');
  }

  // 为单个书签生成嵌入向量
  async generateEmbedding(bookmark: Bookmark): Promise<DocumentEmbedding> {
    if (!this.api) {
      throw new Error('Search service not initialized');
    }

    const searchText = this.generateSearchText(bookmark);
    const embedding = await this.api.generateEmbedding(searchText);
    const now = Date.now();

    return {
      id: bookmark.id,
      embedding,
      model: this.config?.model || 'local',
      createdAt: now,
      updatedAt: now,
    };
  }

  // 批量生成嵌入向量
  async generateBatchEmbeddings(
    bookmarks: Bookmark[],
    onProgress?: (current: number, total: number) => void
  ): Promise<DocumentEmbedding[]> {
    if (!this.api) {
      throw new Error('Search service not initialized');
    }

    const searchTexts = bookmarks.map(b => this.generateSearchText(b));
    const embeddings = await this.api.generateBatchEmbeddings(searchTexts);
    const now = Date.now();

    return bookmarks.map((bookmark, i) => ({
      id: bookmark.id,
      embedding: embeddings[i],
      model: this.config?.model || 'local',
      createdAt: now,
      updatedAt: now,
    }));
  }

  // 为书签建立索引
  async indexBookmark(bookmark: Bookmark): Promise<void> {
    const docEmbedding = await this.generateEmbedding(bookmark);

    // 存储到 IndexedDB
    const record: EmbeddingRecord = {
      id: bookmark.id,
      bookmarkId: bookmark.id,
      embedding: docEmbedding.embedding,
      model: docEmbedding.model,
      createdAt: docEmbedding.createdAt,
      updatedAt: docEmbedding.updatedAt,
    };

    await db.embeddings.put(record);
  }

  // 批量建立索引
  async indexBookmarks(
    bookmarks: Bookmark[],
    onProgress?: (current: number, total: number) => void
  ): Promise<void> {
    if (this.isIndexing) {
      throw new Error('Indexing already in progress');
    }

    this.isIndexing = true;

    try {
      const batchSize = 50;
      const total = bookmarks.length;

      for (let i = 0; i < bookmarks.length; i += batchSize) {
        const batch = bookmarks.slice(i, i + batchSize);
        const embeddings = await this.generateBatchEmbeddings(batch);

        // 批量存储
        const records: EmbeddingRecord[] = embeddings.map((e, idx) => ({
          id: batch[idx].id,
          bookmarkId: batch[idx].id,
          embedding: e.embedding,
          model: e.model,
          createdAt: e.createdAt,
          updatedAt: e.updatedAt,
        }));

        await db.embeddings.bulkPut(records);

        onProgress?.(Math.min(i + batchSize, total), total);
      }
    } finally {
      this.isIndexing = false;
    }
  }

  // 语义搜索
  async search(query: string): Promise<SemanticSearchResult[]> {
    if (!this.api || !this.config) {
      throw new Error('Search service not initialized');
    }

    // 生成查询向量
    const queryEmbedding = await this.api.generateEmbedding(query);

    // 获取所有已索引的书签向量
    const allEmbeddings = await db.embeddings.toArray();

    // 计算相似度
    const results: SemanticSearchResult[] = allEmbeddings
      .map(record => ({
        bookmarkId: record.bookmarkId,
        score: cosineSimilarity(queryEmbedding, record.embedding),
      }))
      .filter(result => result.score >= this.config!.threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.topK);

    return results;
  }

  // 混合搜索（关键词 + 语义）
  async hybridSearch(
    query: string,
    keywordResults: Bookmark[]
  ): Promise<SemanticSearchResult[]> {
    if (!this.api || !this.config) {
      throw new Error('Search service not initialized');
    }

    // 先进行语义搜索
    const semanticResults = await this.search(query);

    // 合并关键词搜索结果
    const keywordMap = new Map(
      keywordResults.map(b => [b.id, { bookmark: b, score: 0.5 }])
    );

    // 调整分数：如果同时出现在两个结果中，提高分数
    const combinedResults: SemanticSearchResult[] = semanticResults.map(sr => {
      const keywordMatch = keywordMap.get(sr.bookmarkId);
      if (keywordMatch) {
        return {
          ...sr,
          score: Math.min(1, sr.score + 0.3), // 提升分数
          reason: 'Matched both semantic and keyword search',
        };
      }
      return sr;
    });

    // 添加只有关键词匹配的结果
    keywordResults.forEach(b => {
      if (!combinedResults.find(r => r.bookmarkId === b.id)) {
        combinedResults.push({
          bookmarkId: b.id,
          score: 0.4,
          reason: 'Keyword match only',
        });
      }
    });

    return combinedResults
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.topK);
  }

  // 删除索引
  async removeIndex(bookmarkId: string): Promise<void> {
    await db.embeddings.delete(bookmarkId);
  }

  // 清空所有索引
  async clearIndex(): Promise<void> {
    await db.embeddings.clear();
  }

  // 获取索引状态
  async getIndexStatus(): Promise<{
    indexed: number;
    total: number;
    model: string;
  }> {
    const indexed = await db.embeddings.count();
    const total = await db.bookmarks.count();

    return {
      indexed,
      total,
      model: this.config?.model || 'local',
    };
  }

  // 检查是否已索引
  async isIndexed(bookmarkId: string): Promise<boolean> {
    const record = await db.embeddings.get(bookmarkId);
    return record !== undefined;
  }

  // 更新索引
  async updateIndex(bookmark: Bookmark): Promise<void> {
    // 删除旧索引
    await this.removeIndex(bookmark.id);
    // 生成新索引
    await this.indexBookmark(bookmark);
  }

  // 重建所有索引
  async rebuildIndex(
    onProgress?: (current: number, total: number) => void
  ): Promise<void> {
    // 清空旧索引
    await this.clearIndex();

    // 获取所有书签
    const bookmarks = await db.bookmarks.toArray();

    // 重建索引
    await this.indexBookmarks(bookmarks, onProgress);
  }
}

// 单例实例
export const semanticSearchService = new SemanticSearchService();
