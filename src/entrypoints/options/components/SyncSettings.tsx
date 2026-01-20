// 同步设置页面

import * as React from 'react';
import { SyncSettings as SyncSettingsComponent } from '@/components/sync/SyncSettings';

export function SyncSettings() {
  const [Component, setComponent] = React.useState<typeof SyncSettingsComponent | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    // 懒加载组件，避免初始化时卡死
    const timer = setTimeout(() => {
      try {
        setComponent(() => SyncSettingsComponent);
        setIsLoading(false);
      } catch (err) {
        setError('加载同步设置失败');
        setIsLoading(false);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return React.createElement('div', { className: 'space-y-6' },
      React.createElement('h2', { className: 'text-2xl font-bold text-gray-900' }, '云端同步'),
      React.createElement('div', {
        className: 'bg-gray-50 border border-gray-200 rounded-lg p-6 text-center',
      },
        React.createElement('p', { className: 'text-gray-600' }, '加载中...')
      )
    );
  }

  if (error) {
    return React.createElement('div', { className: 'space-y-6' },
      React.createElement('h2', { className: 'text-2xl font-bold text-gray-900' }, '云端同步'),
      React.createElement('div', {
        className: 'bg-red-50 border border-red-200 rounded-lg p-4',
      },
        React.createElement('p', { className: 'text-red-800' }, error)
      )
    );
  }

  return React.createElement('div', { className: 'space-y-6' },
    React.createElement('h2', { className: 'text-2xl font-bold text-gray-900' }, '云端同步'),
    Component && React.createElement(Component)
  );
}
