// 语义搜索相关类型定义

export type EmbeddingModel = 'openai' | 'cohere' | 'local';

// 文档嵌入向量
export interface DocumentEmbedding {
  id: string; // 书签 ID
  embedding: number[]; // 向量（通常 384 维或 1536 维）
  model: string;
  createdAt: number;
  updatedAt: number;
}

// 搜索结果（带分数）
export interface SemanticSearchResult {
  bookmarkId: string;
  score: number; // 相似度分数 (0-1)
  reason?: string; // 匹配原因
}

// 搜索配置
export interface SemanticSearchConfig {
  enabled: boolean;
  model: EmbeddingModel;
  provider: 'openai' | 'cohere' | 'local';
  apiKey?: string;
  threshold: number; // 相似度阈值 (0-1)
  topK: number; // 返回结果数量
}

// 文本块（用于分块索引）
export interface TextChunk {
  id: string;
  bookmarkId: string;
  text: string;
  chunkIndex: number;
  metadata: {
    title: string;
    url: string;
    tags: string[];
  };
}

// API 密钥配置
export interface APIKeyConfig {
  provider: 'openai' | 'cohere';
  apiKey: string;
  model: string;
  endpoint?: string;
}

// 批量嵌入请求
export interface BatchEmbeddingRequest {
  texts: string[];
  model?: string;
}

// 批量嵌入响应
export interface BatchEmbeddingResponse {
  embeddings: number[][];
  model: string;
}
