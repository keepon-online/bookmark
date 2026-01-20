// 数据统计设置页面

import * as React from 'react';

export function StatsSettings() {
  return React.createElement('div', { className: 'space-y-6' },
    React.createElement('h2', { className: 'text-2xl font-bold text-gray-900' }, '数据统计'),
    React.createElement('div', {
      className: 'bg-yellow-50 border border-yellow-200 rounded-lg p-4',
    },
      React.createElement('p', { className: 'text-yellow-800' },
        '数据统计功能正在优化中，敬请期待...'
      )
    )
  );
}
