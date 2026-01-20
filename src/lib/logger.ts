// 统一日志工具

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

// 日志级别映射
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 4,
};

// 当前日志级别（可以通过配置动态修改）
let currentLogLevel: LogLevel =
  (import.meta.env.VITE_LOG_LEVEL as LogLevel) ||
  (import.meta.env.MODE === 'development' ? 'debug' : 'error');

/**
 * 设置日志级别
 */
export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

/**
 * 获取当前日志级别
 */
export function getLogLevel(): LogLevel {
  return currentLogLevel;
}

/**
 * 判断是否应该输出日志
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLogLevel];
}

/**
 * 格式化日志前缀
 */
function formatPrefix(level: LogLevel, context?: string): string {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  const prefix = context ? `[${context}]` : '';
  const levelEmoji = {
    debug: '🐛',
    info: 'ℹ️',
    warn: '⚠️',
    error: '❌',
  };
  return `${timestamp} ${levelEmoji[level]} ${prefix}`;
}

/**
 * 调试日志
 */
export function debug(message: string, context?: string, ...args: unknown[]): void {
  if (shouldLog('debug')) {
    const prefix = formatPrefix('debug', context);
    console.log(prefix, message, ...args);
  }
}

/**
 * 信息日志
 */
export function info(message: string, context?: string, ...args: unknown[]): void {
  if (shouldLog('info')) {
    const prefix = formatPrefix('info', context);
    console.log(prefix, message, ...args);
  }
}

/**
 * 警告日志
 */
export function warn(message: string, context?: string, ...args: unknown[]): void {
  if (shouldLog('warn')) {
    const prefix = formatPrefix('warn', context);
    console.warn(prefix, message, ...args);
  }
}

/**
 * 错误日志
 */
export function error(message: string, context?: string, ...args: unknown[]): void {
  if (shouldLog('error')) {
    const prefix = formatPrefix('error', context);
    console.error(prefix, message, ...args);
  }
}

/**
 * 创建带上下文的日志记录器
 */
export function createLogger(context: string) {
  return {
    debug: (message: string, ...args: unknown[]) => debug(message, context, ...args),
    info: (message: string, ...args: unknown[]) => info(message, context, ...args),
    warn: (message: string, ...args: unknown[]) => warn(message, context, ...args),
    error: (message: string, ...args: unknown[]) => error(message, context, ...args),
  };
}
