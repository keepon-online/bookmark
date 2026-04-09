// 消息类型定义
import type { CreateBookmarkDTO, UpdateBookmarkDTO } from './bookmark';
import type { CreateFolderDTO, UpdateFolderDTO } from './folder';
import type { CreateTagDTO, UpdateTagDTO } from './tag';

export type MessageType =
  // 书签操作
  | 'BOOKMARK_CREATE'
  | 'BOOKMARK_UPDATE'
  | 'BOOKMARK_DELETE'
  | 'BOOKMARK_BATCH_DELETE'
  | 'BOOKMARK_IMPORT'
  | 'BOOKMARK_EXPORT'
  | 'BOOKMARK_GET_ALL'
  | 'BOOKMARK_SEARCH'

  // 文件夹操作
  | 'FOLDER_CREATE'
  | 'FOLDER_UPDATE'
  | 'FOLDER_DELETE'
  | 'FOLDER_GET_ALL'

  // 标签操作
  | 'TAG_CREATE'
  | 'TAG_UPDATE'
  | 'TAG_DELETE'
  | 'TAG_GET_ALL'

  // AI 操作
  | 'AI_CLASSIFY'
  | 'AI_SUGGEST_TAGS'
  | 'AI_BATCH_CLASSIFY'

  // 同步操作
  | 'SYNC_START'
  | 'SYNC_STATUS'
  | 'SYNC_COMPLETE'

  // 链接检查
  | 'LINK_CHECK_START'
  | 'LINK_CHECK_RESULT'
  | 'LINK_CHECK_COMPLETE'

  // 设置
  | 'SETTINGS_GET'
  | 'SETTINGS_UPDATE'

  // 通用
  | 'GET_STATE'
  | 'GET_CURRENT_TAB'
  | 'STATE_UPDATED'
  | 'ERROR'

  // 浏览器书签栏清理
  | 'SCAN_BROWSER_BOOKMARKS'
  | 'CLEANUP_BROWSER_BOOKMARKS';

export interface MessagePayloadMap {
  BOOKMARK_CREATE: CreateBookmarkDTO;
  BOOKMARK_UPDATE: { id: string } & UpdateBookmarkDTO;
  BOOKMARK_DELETE: string;
  BOOKMARK_BATCH_DELETE: string[];
  BOOKMARK_IMPORT: undefined;
  BOOKMARK_GET_ALL: {
    folderId?: string;
    isFavorite?: boolean;
    isArchived?: boolean;
    status?: string;
    limit?: number;
    offset?: number;
    sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'visitCount';
    sortOrder?: 'asc' | 'desc';
  } | undefined;
  BOOKMARK_SEARCH: string;
  FOLDER_CREATE: CreateFolderDTO;
  FOLDER_UPDATE: { id: string } & UpdateFolderDTO;
  FOLDER_DELETE: { id: string; moveBookmarksTo?: string };
  FOLDER_GET_ALL: undefined;
  TAG_CREATE: CreateTagDTO;
  TAG_UPDATE: { id: string } & UpdateTagDTO;
  TAG_DELETE: string;
  TAG_GET_ALL: undefined;
  GET_CURRENT_TAB: undefined;
}

export type MessagePayload<TType extends MessageType> =
  TType extends keyof MessagePayloadMap ? MessagePayloadMap[TType] : unknown;

export interface Message<TType extends MessageType = MessageType> {
  type: TType;
  payload?: MessagePayload<TType>;
  requestId?: string;
}

export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  requestId?: string;
}

// 便捷函数：创建消息
export function createMessage<TType extends MessageType>(
  type: TType,
  payload?: MessagePayload<TType>,
  requestId?: string
): Message<TType> {
  return { type, payload, requestId };
}

// 便捷函数：创建成功响应
export function createSuccessResponse<T>(data?: T, requestId?: string): MessageResponse<T> {
  return { success: true, data, requestId };
}

// 便捷函数：创建错误响应
export function createErrorResponse(error: string, requestId?: string): MessageResponse {
  return { success: false, error, requestId };
}
