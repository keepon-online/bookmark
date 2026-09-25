// 定时任务
// v0.6：浏览器书签为唯一数据源后，原 cleanup-tags/auto-organize
// （操作扩展自有库）已移除；link-health-check 由阶段 3 填充实现

type AlarmsApi = {
  create: (name: string, alarmInfo: chrome.alarms.AlarmCreateInfo) => void;
  onAlarm: {
    addListener: (callback: (alarm: chrome.alarms.Alarm) => void | Promise<void>) => void;
  };
};

type LoggerLike = Pick<Console, 'log'>;

interface AlarmDeps {
  alarms?: AlarmsApi;
  logger?: LoggerLike;
}

export function setupAlarms({ alarms, logger = console }: AlarmDeps): void {
  if (!alarms) {
    return;
  }

  alarms.create('link-health-check', {
    periodInMinutes: 60 * 24,
  });

  alarms.onAlarm.addListener((alarm) => {
    logger.log('[Background] Alarm triggered:', alarm.name);
  });
}
