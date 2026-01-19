// 标签类型定义

export interface Tag {
  id: string;
  name: string;
  color?: string;
  usageCount: number;
  createdAt: number;
}

export interface CreateTagDTO {
  name: string;
  color?: string;
}

export interface UpdateTagDTO {
  name?: string;
  color?: string;
}
