// 链接健康设置页面

import * as React from 'react';
import { HealthReport } from '@/components/linkHealth';
import { useBrowserBookmarkStore } from '@/stores';
import { createLogger } from '@/lib/logger';

const logger = createLogger('HealthSettings');

export function HealthSettings() {
  // 直达本页（#health 刷新/链接跳转）时没有别的组件会初始化 store：
  // 不 init 的话 HealthReport 在空数据上算出全零报告、按钮永久禁用
  React.useEffect(() => {
    void useBrowserBookmarkStore.getState().init();
  }, []);

  return React.createElement('div', { className: 'space-y-6' },
    React.createElement('h2', { className: 'text-2xl font-bold text-gray-900 dark:text-gray-100' }, '链接健康'),
    React.createElement(HealthReport, {
      onCheckAll: () => logger.debug('Health check completed')
    })
  );
}
