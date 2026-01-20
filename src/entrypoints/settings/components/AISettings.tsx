// AI 设置页面

import * as React from 'react';
import { DeepSeekConfig } from '@/components/ai';

export function AISettings() {
  return React.createElement('div', { className: 'space-y-6' },
    React.createElement('h2', { className: 'text-2xl font-bold text-gray-900' }, 'AI 设置'),

    // DeepSeek 配置
    React.createElement(DeepSeekConfig, {
      className: '',
      onConfigChange: (config) => {
        console.log('AI config changed:', config);
      },
    })
  );
}
