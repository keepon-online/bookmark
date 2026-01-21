// 智能整理设置页面

import * as React from 'react';
import { BookmarksOrganizer, DuplicateManager, EmptyFolderCleanup, BrowserBookmarkCleanup } from '@/components/organizer';

export function OrganizerSettings() {
  return React.createElement('div', { className: 'space-y-6' },
    React.createElement('h2', { className: 'text-2xl font-bold text-gray-900 mb-6' }, '智能整理'),

    // 书签整理器
    React.createElement(BookmarksOrganizer),

    // 重复书签管理
    React.createElement(DuplicateManager, {
      className: 'mt-6',
    }),

    // 清理空文件夹（扩展数据库）
    React.createElement(EmptyFolderCleanup, {
      className: 'mt-6',
    }),

    // 清理浏览器书签栏空文件夹
    React.createElement(BrowserBookmarkCleanup, {
      className: 'mt-6',
    })
  );
}
