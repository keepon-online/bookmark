// 死链扫描设置
//
// 从 ScanSettingsPanel 抽出来，因为后台（Service Worker）的定时自动扫描也要读它；
// 组件文件里带着 React，后台不能引。存储键与字段保持不变。

import type { BatchCheckOptions } from '@/types/linkHealth';
import { createLogger } from './logger';

const logger = createLogger('ScanSettings');

// 扫描设置
export interface ScanSettings {
  timeout: number;          // 超时时间 (秒)
  concurrency: number;      // 并发数
  retries: number;          // 重试次数
  skipRecentHours: number;  // 跳过最近检查过的 (小时)
  whitelist: string[];      // 白名单域名
}

// 默认设置
export const DEFAULT_SCAN_SETTINGS: ScanSettings = {
  timeout: 10,
  concurrency: 5,
  retries: 2,
  skipRecentHours: 24,
  whitelist: [],
};

// 存储键（保持历史值，别改，否则老用户的设置会丢）
export const SCAN_SETTINGS_KEY = 'scan_settings';

// 加载设置
export async function loadScanSettings(): Promise<ScanSettings> {
  try {
    const result = await chrome.storage.local.get(SCAN_SETTINGS_KEY);
    if (result[SCAN_SETTINGS_KEY]) {
      return { ...DEFAULT_SCAN_SETTINGS, ...result[SCAN_SETTINGS_KEY] };
    }
  } catch (e) {
    logger.error('Failed to load', e);
  }
  return DEFAULT_SCAN_SETTINGS;
}

// 保存设置
export async function saveScanSettings(settings: ScanSettings): Promise<void> {
  try {
    await chrome.storage.local.set({ [SCAN_SETTINGS_KEY]: settings });
  } catch (e) {
    logger.error('Failed to save', e);
  }
}

// 转换为 BatchCheckOptions
export function toBatchCheckOptions(settings: ScanSettings): BatchCheckOptions {
  return {
    timeout: settings.timeout * 1000,
    concurrency: settings.concurrency,
    retries: settings.retries,
    skipRecentHours: settings.skipRecentHours,
    whitelist: settings.whitelist,
  };
}
