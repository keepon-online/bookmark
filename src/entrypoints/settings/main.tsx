// 设置页面主入口

import * as React from 'react';
import { SettingsPage } from './SettingsPage';
import '@/styles/globals.css';

export default defineContentScript({
  matches: ['all'],
  include: ['settings.html'],
  runAt: 'document_idle',
  async main() {
    const root = document.getElementById('root');
    if (!root) return;

    // 创建 React 根节点
    const { createRoot } = await import('react-dom/client');
    const rootInstance = createRoot(root);
    rootInstance.render(
      React.createElement(SettingsPage)
    );
  },
});
