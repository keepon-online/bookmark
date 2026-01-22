// 设置类型定义

import type { AIProvider } from './ai';
import type { SyncProvider } from './sync';

export type Theme = 'light' | 'dark' | 'system';
export type ViewMode = 'list' | 'card' | 'compact';
export type ExportFormat = 'json' | 'html';

export interface Settings {
  // 通用设置
  theme: Theme;
  language: string;

  // AI 设置
  aiEnabled: boolean;
  aiProvider: AIProvider;
  aiApiKey?: string;
  autoClassify: boolean;
  autoTagSuggestion: boolean;

  // 同步设置
  syncEnabled: boolean;
  syncProvider?: SyncProvider;
  syncInterval: number; // 分钟

  // 链接健康设置
  linkCheckEnabled: boolean;
  linkCheckInterval: number; // 小时

  // 导入导出设置
  exportFormat: ExportFormat;

  // 界面设置
  defaultView: ViewMode;
  showFavicons: boolean;
  showScreenshots: boolean;
  itemsPerPage: number;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  language: 'zh-CN',
  aiEnabled: true,
  aiProvider: 'local',
  autoClassify: true,
  autoTagSuggestion: true,
  syncEnabled: false,
  syncInterval: 30,
  linkCheckEnabled: true,
  linkCheckInterval: 24,
  exportFormat: 'json',
  defaultView: 'list',
  showFavicons: true,
  showScreenshots: false,
  itemsPerPage: 20,
};
