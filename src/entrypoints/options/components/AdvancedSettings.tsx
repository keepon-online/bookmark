// 高级设置页面

import * as React from 'react';

export function AdvancedSettings() {
  return React.createElement('div', { className: 'space-y-6' },
    React.createElement('h2', { className: 'text-2xl font-bold text-gray-900' }, '高级设置'),
    React.createElement('p', { className: 'text-gray-600' }, '高级功能设置')
  );
}
