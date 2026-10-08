// 扩展自身信息
//
// UI 里的版本号一律从这里取（manifest.version，即 wxt.config.ts 里那一处），
// 不要在组件里写死——否则每次发版都会漏改。

import { createLogger } from './logger';

const logger = createLogger('ExtensionInfo');

/**
 * 当前扩展版本号，取自 manifest；非扩展环境（如单测）返回 'unknown'。
 */
export function getExtensionVersion(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch (error) {
    logger.warn('Failed to read manifest version', error);
    return 'unknown';
  }
}
