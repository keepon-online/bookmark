// 智能整理设置页面

import * as React from 'react';
import { BookmarksOrganizer, DuplicateManager } from '@/components/organizer';
import { BookmarkProfile } from '@/components/profile';

export function OrganizerSettings() {
  return React.createElement('div', { className: 'space-y-6' },
    React.createElement('h2', { className: 'text-2xl font-bold text-gray-900 mb-6' }, '智能整理'),

    // 书签档案
    React.createElement(BookmarkProfile, {
      className: 'mb-6',
    }),

    // 书签整理器
    React.createElement(BookmarksOrganizer),

    // 重复书签管理
    React.createElement(DuplicateManager, {
      className: 'mt-6',
    })
  );
}
