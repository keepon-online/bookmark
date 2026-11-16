// scanSettings.ts 单元测试：默认值合并、存取、BatchCheckOptions 换算

import { describe, it, expect, beforeEach, type Mock } from 'vitest';
import {
  DEFAULT_SCAN_SETTINGS,
  SCAN_SETTINGS_KEY,
  loadScanSettings,
  saveScanSettings,
  toBatchCheckOptions,
} from '../scanSettings';

describe('loadScanSettings', () => {
  beforeEach(() => {
    (chrome.storage.local.get as Mock).mockReset();
    (chrome.storage.local.get as Mock).mockResolvedValue({});
  });

  it('无存储时返回默认设置', async () => {
    expect(await loadScanSettings()).toEqual(DEFAULT_SCAN_SETTINGS);
    expect(chrome.storage.local.get).toHaveBeenCalledWith(SCAN_SETTINGS_KEY);
  });

  it('存储了部分字段时与默认值合并（老配置缺新字段不丢）', async () => {
    (chrome.storage.local.get as Mock).mockResolvedValue({
      [SCAN_SETTINGS_KEY]: { timeout: 20, whitelist: ['example.com'] },
    });
    const loaded = await loadScanSettings();
    expect(loaded).toEqual({
      ...DEFAULT_SCAN_SETTINGS,
      timeout: 20,
      whitelist: ['example.com'],
    });
  });

  it('存储读取抛错时回退默认设置', async () => {
    (chrome.storage.local.get as Mock).mockRejectedValue(new Error('storage broken'));
    expect(await loadScanSettings()).toEqual(DEFAULT_SCAN_SETTINGS);
  });
});

describe('saveScanSettings', () => {
  it('以固定键保存设置', async () => {
    (chrome.storage.local.set as Mock).mockResolvedValue(undefined);
    const settings = { ...DEFAULT_SCAN_SETTINGS, timeout: 30 };
    await saveScanSettings(settings);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ [SCAN_SETTINGS_KEY]: settings });
  });

  it('保存抛错时不向外传播', async () => {
    (chrome.storage.local.set as Mock).mockRejectedValue(new Error('quota'));
    await expect(saveScanSettings(DEFAULT_SCAN_SETTINGS)).resolves.toBeUndefined();
  });
});

describe('toBatchCheckOptions', () => {
  it('超时秒转毫秒，其余字段原样透传', () => {
    const settings = {
      ...DEFAULT_SCAN_SETTINGS,
      timeout: 15,
      concurrency: 8,
      retries: 1,
      skipRecentHours: 72,
      whitelist: ['a.dev'],
    };
    expect(toBatchCheckOptions(settings)).toEqual({
      timeout: 15000,
      concurrency: 8,
      retries: 1,
      skipRecentHours: 72,
      whitelist: ['a.dev'],
    });
  });
});
