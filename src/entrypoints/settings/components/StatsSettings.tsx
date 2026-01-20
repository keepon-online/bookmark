// 数据统计设置页面

import * as React from 'react';
import { StatsDashboard } from '@/components/stats';

export function StatsSettings() {
  return React.createElement('div', { className: 'space-y-6' },
    React.createElement('h2', { className: 'text-2xl font-bold text-gray-900' }, '数据统计'),
    React.createElement(StatsDashboard)
  );
}
