// 错误类型定义

export enum ErrorCode {
  // 存储错误 (1xxx)
  STORAGE_QUOTA_EXCEEDED = 1001,
  STORAGE_READ_ERROR = 1002,
  STORAGE_WRITE_ERROR = 1003,

  // 网络错误 (2xxx)
  NETWORK_OFFLINE = 2001,
  NETWORK_TIMEOUT = 2002,
  NETWORK_REQUEST_FAILED = 2003,

  // AI 错误 (3xxx)
  AI_SERVICE_UNAVAILABLE = 3001,
  AI_RATE_LIMITED = 3002,
  AI_INVALID_RESPONSE = 3003,

  // 同步错误 (4xxx)
  SYNC_CONFLICT = 4001,
  SYNC_AUTH_FAILED = 4002,
  SYNC_SERVER_ERROR = 4003,

  // 数据错误 (5xxx)
  DATA_VALIDATION_FAILED = 5001,
  DATA_NOT_FOUND = 5002,
  DATA_DUPLICATE = 5003,

  // 未知错误
  UNKNOWN_ERROR = 9999,
}

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// 错误码到用户友好消息的映射
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.STORAGE_QUOTA_EXCEEDED]: '存储空间不足，请清理部分书签',
  [ErrorCode.STORAGE_READ_ERROR]: '读取数据失败，请重试',
  [ErrorCode.STORAGE_WRITE_ERROR]: '保存数据失败，请重试',
  [ErrorCode.NETWORK_OFFLINE]: '网络连接已断开，请检查网络设置',
  [ErrorCode.NETWORK_TIMEOUT]: '网络请求超时，请重试',
  [ErrorCode.NETWORK_REQUEST_FAILED]: '网络请求失败，请重试',
  [ErrorCode.AI_SERVICE_UNAVAILABLE]: 'AI 服务不可用，请稍后重试',
  [ErrorCode.AI_RATE_LIMITED]: 'AI 服务繁忙，请稍后重试',
  [ErrorCode.AI_INVALID_RESPONSE]: 'AI 响应无效，请重试',
  [ErrorCode.SYNC_CONFLICT]: '同步冲突，请选择保留的版本',
  [ErrorCode.SYNC_AUTH_FAILED]: '同步认证失败，请重新登录',
  [ErrorCode.SYNC_SERVER_ERROR]: '同步服务器错误，请稍后重试',
  [ErrorCode.DATA_VALIDATION_FAILED]: '数据验证失败，请检查输入',
  [ErrorCode.DATA_NOT_FOUND]: '数据不存在',
  [ErrorCode.DATA_DUPLICATE]: '该书签已存在',
  [ErrorCode.UNKNOWN_ERROR]: '发生未知错误，请重试',
};

export function getErrorMessage(code: ErrorCode): string {
  return ERROR_MESSAGES[code] || ERROR_MESSAGES[ErrorCode.UNKNOWN_ERROR];
}
