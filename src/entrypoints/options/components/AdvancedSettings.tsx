// 高级设置页面

import * as React from 'react';
import { DebugPanel } from '@/components/debug';

export function AdvancedSettings() {
  return React.createElement('div', { className: 'space-y-6' },
    React.createElement('h2', { className: 'text-2xl font-bold text-gray-900' }, '高级设置'),
    React.createElement('p', { className: 'text-gray-600 mb-4' }, '调试信息和高级功能'),

    // 完整调试面板
    React.createElement(DebugPanel)
  );
}
