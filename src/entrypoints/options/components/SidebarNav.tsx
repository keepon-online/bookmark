// 设置页面侧边栏导航

import * as React from 'react';
import {
  LayoutDashboard,
  Bookmark,
  Sparkles,
  Wand2,
  HeartPulse,
  Settings,
  Info,
} from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  icon: any;
  badge?: number;
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: '仪表盘', icon: LayoutDashboard },
  { id: 'bookmarks', label: '书签管理', icon: Bookmark },
  { id: 'ai', label: 'AI 设置', icon: Sparkles },
  { id: 'organizer', label: '智能整理', icon: Wand2 },
  { id: 'health', label: '链接健康', icon: HeartPulse },
  { id: 'advanced', label: '高级设置', icon: Settings },
  { id: 'about', label: '关于', icon: Info },
];

interface SidebarNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function SidebarNav({ activeTab, setActiveTab }: SidebarNavProps) {
  const handleNavClick = (id: string) => {
    setActiveTab(id);
    window.location.hash = id;
  };

  return React.createElement('nav', {
    className: 'w-64 bg-white dark:bg-zinc-900 border-r border-gray-200 dark:border-zinc-800 p-4 flex flex-col h-full transition-colors',
  },
    // 标题
    React.createElement('div', {
      className: 'mb-6',
    },
      React.createElement('h1', {
        className: 'text-xl font-bold text-gray-900 dark:text-gray-100',
      }, '智能书签'),
      React.createElement('p', {
        className: 'text-sm text-gray-500 dark:text-gray-400',
      }, '设置管理中心')
    ),

    // 导航列表
    React.createElement('ul', {
      className: 'space-y-1 flex-1',
    },
      ...navItems.map((item) =>
        React.createElement('li', { key: item.id },
          React.createElement('button', {
            onClick: () => handleNavClick(item.id),
            className: `w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              activeTab === item.id
                ? 'bg-primary/10 text-primary font-medium dark:bg-primary/20'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800'
            }`,
          },
            React.createElement(item.icon, {
              className: 'w-5 h-5',
            }),
            React.createElement('span', {
              className: 'flex-1 text-left',
            }, item.label),
            item.badge && React.createElement('span', {
              className: 'px-2 py-0.5 bg-red-500 text-white text-xs rounded-full',
            }, item.badge)
          )
        )
      ),

      // 底部版本信息
      React.createElement('div', {
        className: 'pt-4 border-t border-gray-200 dark:border-zinc-800 text-xs text-gray-500 dark:text-gray-400',
      },
        'v0.6.0'
      )
    )
  );
}
