// 链接健康设置页面

import * as React from 'react';

export function HealthSettings() {
  return React.createElement('div', { className: 'space-y-6' },
    React.createElement('h2', { className: 'text-2xl font-bold text-gray-900' }, '链接健康'),
    React.createElement('div', {
      className: 'bg-yellow-50 border border-yellow-200 rounded-lg p-4',
    },
      React.createElement('p', { className: 'text-yellow-800' },
        '链接健康检查功能正在开发中，敬请期待...'
      )
    )
  );
}
