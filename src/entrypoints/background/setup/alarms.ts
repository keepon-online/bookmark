type AlarmsApi = {
  create: (name: string, alarmInfo: chrome.alarms.AlarmCreateInfo) => void;
  onAlarm: {
    addListener: (callback: (alarm: chrome.alarms.Alarm) => void | Promise<void>) => void;
  };
};

type StorageApi = {
  get: (keys?: string | string[] | Record<string, unknown> | null) => Promise<Record<string, any>>;
};

type TagServiceLike = {
  cleanupUnused: () => Promise<number>;
};

type OrganizerServiceLike = {
  organizeAll: (options?: Record<string, unknown>) => Promise<unknown>;
};

type BrowserSyncServiceLike = {
  syncToBrowser: (options: { moveBookmarks: boolean; applyTags: boolean }) => Promise<unknown>;
};

type LoggerLike = Pick<Console, 'log' | 'error'>;

interface AlarmDeps {
  alarms?: AlarmsApi;
  storage: StorageApi;
  tagService: TagServiceLike;
  organizerService: OrganizerServiceLike;
  browserSyncService: BrowserSyncServiceLike;
  logger?: LoggerLike;
}

export function setupAlarms({
  alarms,
  storage,
  tagService,
  organizerService,
  browserSyncService,
  logger = console,
}: AlarmDeps): void {
  if (!alarms) {
    return;
  }

  alarms.create('link-health-check', {
    periodInMinutes: 60 * 24,
  });

  alarms.create('cleanup-tags', {
    periodInMinutes: 60 * 24 * 7,
  });

  alarms.create('auto-organize', {
    periodInMinutes: 60 * 24,
  });

  alarms.onAlarm.addListener(async (alarm) => {
    logger.log('[Background] Alarm triggered:', alarm.name);

    switch (alarm.name) {
      case 'link-health-check':
        logger.log('[Background] Running link health check...');
        return;

      case 'cleanup-tags':
        try {
          const count = await tagService.cleanupUnused();
          logger.log('[Background] Cleaned up', count, 'unused tags');
        } catch (error) {
          logger.error('[Background] Failed to cleanup tags:', error);
        }
        return;

      case 'auto-organize':
        logger.log('[Background] Running auto-organize...');
        try {
          const config = await storage.get('autoOrganizeConfig');
          if (config.autoOrganizeConfig?.enabled) {
            const result = await organizerService.organizeAll({
              strategy: config.autoOrganizeConfig.strategy || 'auto',
              createNewFolders: true,
              applyTags: true,
              moveBookmarks: false,
              removeDuplicates: false,
              minConfidence: config.autoOrganizeConfig.minConfidence || 0.7,
              archiveUncategorized: false,
              handleBroken: 'ignore',
            });

            logger.log('[Background] Auto-organize completed:', result);

            try {
              const syncResult = await browserSyncService.syncToBrowser({
                moveBookmarks: false,
                applyTags: true,
              });
              logger.log('[Background] Browser sync completed:', syncResult);
            } catch (syncError) {
              logger.error('[Background] Browser sync failed:', syncError);
            }
          } else {
            logger.log('[Background] Auto-organize is disabled');
          }
        } catch (error) {
          logger.error('[Background] Auto-organize failed:', error);
        }
        return;

      default:
        return;
    }
  });
}
