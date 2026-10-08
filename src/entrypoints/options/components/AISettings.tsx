// AI 设置页面

import * as React from 'react';
import { DeepSeekConfig, LearnedRulesPanel } from '@/components/ai';
import { createLogger } from '@/lib/logger';

const logger = createLogger('AISettings');

export function AISettings() {
  const [Component, setComponent] = React.useState<typeof DeepSeekConfig | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    // 懒加载组件，避免初始化时卡死
    const timer = setTimeout(() => {
      try {
        setComponent(() => DeepSeekConfig);
        setIsLoading(false);
      } catch (err) {
        setError('加载 AI 设置失败');
        setIsLoading(false);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return React.createElement('div', { className: 'space-y-6' },
      React.createElement('h2', { className: 'text-2xl font-bold text-gray-900 dark:text-gray-100' }, 'AI 设置'),
      React.createElement('div', {
        className: 'bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg p-6 text-center',
      },
        React.createElement('p', { className: 'text-gray-600 dark:text-gray-400' }, '加载中...')
      )
    );
  }

  if (error) {
    return React.createElement('div', { className: 'space-y-6' },
      React.createElement('h2', { className: 'text-2xl font-bold text-gray-900 dark:text-gray-100' }, 'AI 设置'),
      React.createElement('div', {
        className: 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-4',
      },
        React.createElement('p', { className: 'text-red-800 dark:text-red-300' }, error)
      )
    );
  }

  return React.createElement('div', { className: 'space-y-6' },
    React.createElement('h2', { className: 'text-2xl font-bold text-gray-900 dark:text-gray-100' }, 'AI 设置'),
    Component && React.createElement(Component, {
      className: '',
      onConfigChange: (config) => {
        logger.debug('AI config changed', config);
      },
    }),
    React.createElement(LearnedRulesPanel, { className: '' })
  );
}
