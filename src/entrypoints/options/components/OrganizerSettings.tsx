// 智能整理设置页面

import * as React from 'react';
import { BookmarksOrganizer, DuplicateManager, EmptyFolderCleanup } from '@/components/organizer';
import { useBrowserBookmarkStore } from '@/stores';

export function OrganizerSettings() {
  // 直达本页（hash 刷新/链接跳转）时没有别的组件会初始化 store：
  // 不 init 的话整理/查重/空文件夹清理全部基于空数据工作
  React.useEffect(() => {
    void useBrowserBookmarkStore.getState().init();
  }, []);

  return React.createElement('div', { className: 'space-y-6' },
    React.createElement('h2', { className: 'text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6' }, '智能整理'),

    // AI 智能整理（预览-确认）
    React.createElement(BookmarksOrganizer),

    // 重复书签清理
    React.createElement(DuplicateManager, {
      className: 'mt-6',
    }),

    // 空文件夹清理
    React.createElement(EmptyFolderCleanup, {
      className: 'mt-6',
    })
  );
}
