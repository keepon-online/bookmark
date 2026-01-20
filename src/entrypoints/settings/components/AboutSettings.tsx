// 关于页面

import * as React from 'react';

export function AboutSettings() {
  return React.createElement('div', { className: 'space-y-6' },
    React.createElement('h2', { className: 'text-2xl font-bold text-gray-900' }, '关于智能书签'),

    // 版本信息
    React.createElement('div', {
      className: 'bg-white p-6 rounded-lg shadow-sm border',
    },
      React.createElement('h3', { className: 'text-lg font-semibold mb-4' }, '版本信息'),
      React.createElement('div', { className: 'space-y-2 text-sm' },
        React.createElement('div', { className: 'flex justify-between' },
          React.createElement('span', { className: 'text-gray-600' }, '版本'),
          React.createElement('span', null, '0.5.0 (Beta)')
        ),
        React.createElement('div', { className: 'flex justify-between' },
          React.createElement('span', { className: 'text-gray-600' }, '技术栈'),
          React.createElement('span', null, 'WXT + React + TypeScript')
        ),
        React.createElement('div', { className: 'flex justify-between' },
          React.createElement('span', { className: 'text-gray-600' }, '存储'),
          React.createElement('span', null, 'IndexedDB (Dexie.js)')
        ),
        React.createElement('div', { className: 'flex justify-between' },
          React.createElement('span', { className: 'text-gray-600' }, 'AI 模型'),
          React.createElement('span', null, 'DeepSeek V3 + 本地规则')
        )
      )
    ),

    // 快捷键
    React.createElement('div', {
      className: 'bg-white p-6 rounded-lg shadow-sm border',
    },
      React.createElement('h3', { className: 'text-lg font-semibold mb-4' }, '快捷键'),
      React.createElement('div', { className: 'space-y-2 text-sm' },
        React.createElement('div', { className: 'flex justify-between' },
          React.createElement('span', { className: 'text-gray-600' }, '打开侧边栏'),
          React.createElement('kbd', { className: 'px-2 py-1 bg-gray-100 rounded' }, 'Alt + Shift + S')
        ),
        React.createElement('div', { className: 'flex justify-between' },
          React.createElement('span', { className: 'text-gray-600' }, '快速添加'),
          React.createElement('kbd', { className: 'px-2 py-1 bg-gray-100 rounded' }, 'Alt + Shift + A')
        ),
        React.createElement('div', { className: 'flex justify-between' },
          React.createElement('span', { className: 'text-gray-600' }, '切换收藏'),
          React.createElement('kbd', { className: 'px-2 py-1 bg-gray-100 rounded' }, 'Alt + Shift + K')
        )
      )
    ),

    // 功能说明
    React.createElement('div', {
      className: 'bg-white p-6 rounded-lg shadow-sm border',
    },
      React.createElement('h3', { className: 'text-lg font-semibold mb-4' }, '功能说明'),
      React.createElement('ul', { className: 'space-y-2 text-sm text-gray-700' },
        React.createElement('li', null, '🤖 AI 智能分类：自动为书签添加标签和分类'),
        React.createElement('li', null, '🗂️ 智能整理：批量整理和分类书签'),
        React.createElement('li', null, '☁️ 云端同步：跨设备同步书签数据'),
        React.createElement('li', null, '🔍 语义搜索：智能搜索书签内容'),
        React.createElement('li', null, '🔗 健康检查：检测失效链接'),
        React.createElement('li', null, '📊 数据统计：可视化展示书签数据')
      )
    ),

    // 问题反馈
    React.createElement('div', {
      className: 'bg-white p-6 rounded-lg shadow-sm border',
    },
      React.createElement('h3', { className: 'text-lg font-semibold mb-4' }, '问题反馈'),
      React.createElement('div', { className: 'space-y-3 text-sm' },
        React.createElement('div', null,
          React.createElement('a', {
            href: 'https://github.com/keepon-online/bookmark/issues',
            target: '_blank',
            rel: 'noopener noreferrer',
            className: 'text-blue-600 hover:underline'
          }, '📝 提交问题 - GitHub Issues')
        ),
        React.createElement('div', null,
          React.createElement('a', {
            href: 'https://github.com/keepon-online/bookmark',
            target: '_blank',
            rel: 'noopener noreferrer',
            className: 'text-blue-600 hover:underline'
          }, '⭐ 给个 Star - GitHub 仓库')
        )
      )
    )
  );
}
