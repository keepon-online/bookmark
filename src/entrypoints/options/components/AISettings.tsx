// AI 设置页面

import * as React from 'react';
import { DeepSeekConfig, LearnedRulesPanel } from '@/components/ai';
import { createLogger } from '@/lib/logger';

const logger = createLogger('AISettings');

export function AISettings() {
  return React.createElement('div', { className: 'space-y-6' },
    React.createElement('h2', { className: 'text-2xl font-bold text-gray-900 dark:text-gray-100' }, 'AI 设置'),
    React.createElement(DeepSeekConfig, {
      className: '',
      onConfigChange: (config) => {
        logger.debug('AI config changed', config);
      },
    }),
    React.createElement(LearnedRulesPanel, { className: '' })
  );
}
