// 同步设置页面

import * as React from 'react';
import { SyncSettings } from '@/components/sync/SyncSettings';

export function SyncSettings() {
  return React.createElement('div', { className: 'space-y-6' },
    React.createElement('h2', { className: 'text-2xl font-bold text-gray-900' }, '云端同步'),
    React.createElement(SyncSettings)
  );
}
