// 定时任务
// 目前只有一项：定时自动死链检查。具体检查逻辑在 @/services/linkHealthAutoScan
// （分片执行、可续跑，避免 MV3 Service Worker 中途被杀导致整轮白做）。
// 周期闹钟本身跟随设置（开关 + 间隔），启动时对齐一次。

import { createLogger } from '@/lib/logger';
import {
  AUTO_SCAN_ALARM,
  AUTO_SCAN_CONTINUE_ALARM,
  ensureAutoScanAlarm,
  runAutoScanTick,
} from '@/services/linkHealthAutoScan';

type AlarmsApi = {
  create: (name: string, alarmInfo: chrome.alarms.AlarmCreateInfo) => void | Promise<void>;
  clear: (name: string) => void | Promise<boolean>;
  onAlarm: {
    addListener: (callback: (alarm: chrome.alarms.Alarm) => void | Promise<void>) => void;
  };
};

type LoggerLike = {
  debug: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
};

interface AlarmDeps {
  alarms?: AlarmsApi;
  logger?: LoggerLike;
  // 跑一批自动扫描（默认接真实实现，测试可替换）
  runTick?: (alarmName: string) => Promise<unknown>;
  // 启动时让闹钟与设置对齐（默认读设置后同步）
  syncAlarm?: () => Promise<void>;
}

export function setupAlarms({
  alarms,
  logger = createLogger('Background'),
  runTick = () => runAutoScanTick(),
  syncAlarm = ensureAutoScanAlarm,
}: AlarmDeps): void {
  if (!alarms) {
    return;
  }

  alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === AUTO_SCAN_ALARM || alarm.name === AUTO_SCAN_CONTINUE_ALARM) {
      logger.debug('Auto scan alarm triggered', alarm.name);
      runTick(alarm.name).catch((error) => {
        logger.error('Auto scan tick failed', error);
      });
      return;
    }
    logger.debug('Alarm triggered', alarm.name);
  });

  // 启动时对齐闹钟：设置里关掉自动检查就清掉，开着就按间隔重建
  void syncAlarm().catch((error) => {
    logger.error('Failed to sync auto scan alarm', error);
  });
}
