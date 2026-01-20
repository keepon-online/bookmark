// 设置页面布局组件

import * as React from 'react';
import { SidebarNav } from './SidebarNav';

interface SettingsLayoutProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  children: React.ReactNode;
}

export function SettingsLayout({ activeTab, setActiveTab, children }: SettingsLayoutProps) {
  return React.createElement('div', {
    className: 'flex h-screen bg-gray-50',
  },
    // 侧边栏
    React.createElement(SidebarNav, { activeTab, setActiveTab }),

    // 主内容区
    React.createElement('main', {
      className: 'flex-1 overflow-y-auto',
    },
      React.createElement('div', {
        className: 'container mx-auto p-6 max-w-7xl',
      },
        children
      )
    )
  );
}
