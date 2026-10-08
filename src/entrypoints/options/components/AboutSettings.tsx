// 关于页面

import * as React from 'react';
import { getExtensionVersion } from '@/lib/extensionInfo';

export function AboutSettings() {
  return React.createElement('div', { className: 'space-y-6' },
    React.createElement('h2', { className: 'text-2xl font-bold text-gray-900 dark:text-gray-100' }, '关于智能书签'),

    // 版本信息
    React.createElement('div', {
      className: 'bg-white dark:bg-zinc-900 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-zinc-800',
    },
      React.createElement('h3', { className: 'text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100' }, '版本信息'),
      React.createElement('div', { className: 'space-y-2 text-sm text-gray-700 dark:text-gray-300' },
        React.createElement('div', { className: 'flex justify-between' },
          React.createElement('span', { className: 'text-gray-500 dark:text-gray-400' }, '版本'),
          React.createElement('span', null, getExtensionVersion())
        ),
        React.createElement('div', { className: 'flex justify-between' },
          React.createElement('span', { className: 'text-gray-500 dark:text-gray-400' }, '技术栈'),
          React.createElement('span', null, 'WXT + React + TypeScript + TailwindCSS')
        ),
        React.createElement('div', { className: 'flex justify-between' },
          React.createElement('span', { className: 'text-gray-500 dark:text-gray-400' }, '数据源'),
          React.createElement('span', null, 'Chrome 书签树 + IndexedDB 本地元数据')
        ),
        React.createElement('div', { className: 'flex justify-between' },
          React.createElement('span', { className: 'text-gray-500 dark:text-gray-400' }, 'AI 模型'),
          React.createElement('span', null, 'DeepSeek V3 + 本地智能规则')
        )
      )
    ),

    // 快捷键
    React.createElement('div', {
      className: 'bg-white dark:bg-zinc-900 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-zinc-800',
    },
      React.createElement('h3', { className: 'text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100' }, '快捷键'),
      React.createElement('div', { className: 'space-y-2 text-sm' },
        React.createElement('div', { className: 'flex justify-between items-center' },
          React.createElement('span', { className: 'text-gray-500 dark:text-gray-400' }, '打开侧边栏'),
          React.createElement('kbd', { className: 'px-2 py-1 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded text-xs border border-gray-200 dark:border-zinc-700' }, 'Alt + Shift + S')
        ),
        React.createElement('div', { className: 'flex justify-between items-center' },
          React.createElement('span', { className: 'text-gray-500 dark:text-gray-400' }, '快速添加'),
          React.createElement('kbd', { className: 'px-2 py-1 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded text-xs border border-gray-200 dark:border-zinc-700' }, 'Alt + Shift + A')
        ),
        React.createElement('div', { className: 'flex justify-between items-center' },
          React.createElement('span', { className: 'text-gray-500 dark:text-gray-400' }, '切换收藏'),
          React.createElement('kbd', { className: 'px-2 py-1 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded text-xs border border-gray-200 dark:border-zinc-700' }, 'Alt + Shift + K')
        )
      )
    ),

    // 功能说明
    React.createElement('div', {
      className: 'bg-white dark:bg-zinc-900 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-zinc-800',
    },
      React.createElement('h3', { className: 'text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100' }, '功能说明'),
      React.createElement('ul', { className: 'space-y-2 text-sm text-gray-700 dark:text-gray-300' },
        React.createElement('li', null, '🤖 AI 智能分类：自动分析书签并给出结构化整理建议'),
        React.createElement('li', null, '🗂️ 智能整理：预览-确认模式，批量整理与移动书签'),
        React.createElement('li', null, '🧹 重复书签清理：智能评分推荐保留，支持自定义保留与防误删'),
        React.createElement('li', null, '📁 空文件夹清理：扫描叶子空文件夹并提供保护窗口'),
        React.createElement('li', null, '🔗 链接健康检查：并发批量检测失效、超时或停放域名'),
        React.createElement('li', null, '📊 统一仪表盘：可视化洞察收藏趋势、分类分布与质量指标')
      )
    ),

    // 问题反馈
    React.createElement('div', {
      className: 'bg-white dark:bg-zinc-900 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-zinc-800',
    },
      React.createElement('h3', { className: 'text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100' }, '问题反馈'),
      React.createElement('div', { className: 'space-y-3 text-sm' },
        React.createElement('div', null,
          React.createElement('a', {
            href: 'https://github.com/keepon-online/bookmark/issues',
            target: '_blank',
            rel: 'noopener noreferrer',
            className: 'text-primary hover:underline'
          }, '📝 提交问题 - GitHub Issues')
        ),
        React.createElement('div', null,
          React.createElement('a', {
            href: 'https://github.com/keepon-online/bookmark',
            target: '_blank',
            rel: 'noopener noreferrer',
            className: 'text-primary hover:underline'
          }, '⭐ 给个 Star - GitHub 仓库')
        )
      )
    )
  );
}
