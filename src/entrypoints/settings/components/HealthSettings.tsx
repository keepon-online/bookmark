// 链接健康设置页面

import * as React from 'react';
import { HealthReport } from '@/components/linkHealth';

export function HealthSettings() {
  return React.createElement('div', { className: 'space-y-6' },
    React.createElement('h2', { className: 'text-2xl font-bold text-gray-900' }, '链接健康'),
    React.createElement(HealthReport, {
      onCheckAll: () => console.log('Health check completed')
    })
  );
}
