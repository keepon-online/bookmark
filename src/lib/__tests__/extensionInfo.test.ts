// extensionInfo.ts 单元测试：版本号取自 manifest，异常环境兜底 unknown

import { vi, describe, it, expect } from 'vitest';
import { getExtensionVersion } from '../extensionInfo';

describe('getExtensionVersion', () => {
  it('返回 manifest 中的版本号', () => {
    (chrome.runtime as any).getManifest = vi.fn(() => ({ version: '0.7.0' }));
    expect(getExtensionVersion()).toBe('0.7.0');
  });

  it('非扩展环境（getManifest 抛错）返回 unknown', () => {
    (chrome.runtime as any).getManifest = vi.fn(() => {
      throw new Error('not in extension');
    });
    expect(getExtensionVersion()).toBe('unknown');
  });
});
