// 同步设置页面

import * as React from 'react';
import { SyncSettings as CloudSyncSettings } from '@/components/sync/SyncSettings';
import { FolderSyncSettingsPanel } from '@/components/sync/FolderSyncSettings';

export function SyncSettings() {
  return React.createElement('div', { className: 'space-y-6' },
    React.createElement('h2', { className: 'text-2xl font-bold text-gray-900' }, '同步设置'),
    // 文件夹浏览器同步
    React.createElement(FolderSyncSettingsPanel),
    // 云端同步
    React.createElement(CloudSyncSettings)
  );
}
