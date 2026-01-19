// 仪表盘设置页面

import * as React from 'react';
import { initDatabase, db } from '@/lib/database';
import { useState, useEffect } from 'react';

export function DashboardSettings() {
  const [stats, setStats] = useState({ bookmarks: 0, folders: 0, tags: 0 });
  const [aiGenerated, setAiGenerated] = useState(0);
  const [withTags, setWithTags] = useState(0);
  const [withFolder, setWithFolder] = useState(0);
  const [lastOrganize, setLastOrganize] = useState<any>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      await initDatabase();

      // 基础统计
      const [bookmarks, folders, tags] = await Promise.all([
        db.bookmarks.count(),
        db.folders.count(),
        db.tags.count(),
      ]);
      setStats({ bookmarks, folders, tags });

      // AI 分类统计
      const allBookmarks = await db.bookmarks.toArray();
      setAiGenerated(allBookmarks.filter((b) => b.aiGenerated).length);
      setWithTags(allBookmarks.filter((b) => b.tags.length > 0).length);
      setWithFolder(allBookmarks.filter((b) => b.folderId).length);

      // 最后整理结果
      const stored = await chrome.storage.local.get([
        'lastOrganizeResult',
        'lastOrganizeTime',
        'lastSyncResult',
      ]);
      setLastOrganize(stored);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    }
  };

  const handleQuickOrganize = async () => {
    try {
      const { organizerService } = await import('@/services');
      const result = await organizerService.organizeAll({
        strategy: 'auto',
        createNewFolders: true,
        applyTags: true,
        moveBookmarks: true,
        removeDuplicates: false,
        minConfidence: 0.3,
      });

      await chrome.storage.local.set({
        lastOrganizeResult: result,
        lastOrganizeTime: Date.now(),
      });

      await loadDashboardData();
      alert(`整理完成！\n已处理: ${result.processed}\n已分类: ${result.classified}`);
    } catch (error) {
      console.error('Quick organize failed:', error);
      alert(`整理失败: ${(error as Error).message}`);
    }
  };

  return React.createElement('div', { className: 'space-y-6' },
    // 标题
    React.createElement('div', {
      className: 'flex items-center justify-between',
    },
      React.createElement('div', null,
        React.createElement('h2', { className: 'text-2xl font-bold text-gray-900' }, '仪表盘')
      ),
      React.createElement('button', {
        onClick: loadDashboardData,
        className: 'p-2 hover:bg-gray-100 rounded-lg',
        title: '刷新',
      }, '🔄')
    ),

    // 统计卡片
    React.createElement('div', {
      className: 'grid grid-cols-4 gap-4',
    },
      React.createElement('div', {
        className: 'bg-white p-6 rounded-lg shadow-sm border',
      },
        React.createElement('div', { className: 'text-3xl font-bold text-purple-600' }, stats.bookmarks),
        React.createElement('div', { className: 'text-sm text-gray-600 mt-1' }, '总书签')
      ),
      React.createElement('div', {
        className: 'bg-white p-6 rounded-lg shadow-sm border',
      },
        React.createElement('div', { className: 'text-3xl font-bold text-green-600' }, aiGenerated),
        React.createElement('div', { className: 'text-sm text-gray-600 mt-1' }, 'AI 分类')
      ),
      React.createElement('div', {
        className: 'bg-white p-6 rounded-lg shadow-sm border',
      },
        React.createElement('div', { className: 'text-3xl font-bold text-blue-600' }, stats.folders),
        React.createElement('div', { className: 'text-sm text-gray-600 mt-1' }, '文件夹')
      ),
      React.createElement('div', {
        className: 'bg-white p-6 rounded-lg shadow-sm border',
      },
        React.createElement('div', { className: 'text-3xl font-bold text-orange-600' }, stats.tags),
        React.createElement('div', { className: 'text-sm text-gray-600 mt-1' }, '标签')
      )
    ),

    // 快速操作
    React.createElement('div', {
      className: 'bg-white p-6 rounded-lg shadow-sm border',
    },
      React.createElement('h3', { className: 'text-lg font-semibold mb-4' }, '快速操作'),
      React.createElement('div', { className: 'grid grid-cols-3 gap-3' },
        React.createElement('button', {
          onClick: handleQuickOrganize,
          className: 'px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium',
        }, '🪄 整理书签'),
        React.createElement('button', {
          onClick: () => { window.location.hash = 'organizer'; },
          className: 'px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium',
        }, '🗂️ 高级整理'),
        React.createElement('button', {
          onClick: () => { window.location.hash = 'advanced'; },
          className: 'px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium',
        }, '🔧 高级设置')
      )
    ),

    // 最后整理结果
    lastOrganize?.lastOrganizeResult && React.createElement('div', {
      className: 'bg-green-50 p-6 rounded-lg border border-green-200',
    },
      React.createElement('h3', { className: 'text-lg font-semibold text-green-900 mb-4' }, '上次整理结果'),
      React.createElement('div', { className: 'grid grid-cols-4 gap-4 mb-4' },
        React.createElement('div', null,
          React.createElement('div', { className: 'text-2xl font-bold text-green-700' }, lastOrganize.lastOrganizeResult.processed),
          React.createElement('div', { className: 'text-sm text-gray-600' }, '已处理')
        ),
        React.createElement('div', null,
          React.createElement('div', { className: 'text-2xl font-bold text-green-700' }, lastOrganize.lastOrganizeResult.classified),
          React.createElement('div', { className: 'text-sm text-gray-600' }, '已分类')
        ),
        React.createElement('div', null,
          React.createElement('div', { className: 'text-2xl font-bold text-green-700' }, lastOrganize.lastOrganizeResult.tagged),
          React.createElement('div', { className: 'text-sm text-gray-600' }, '已加标签')
        ),
        React.createElement('div', null,
          React.createElement('div', { className: 'text-2xl font-bold text-green-700' }, lastOrganize.lastOrganizeResult.moved),
          React.createElement('div', { className: 'text-sm text-gray-600' }, '已移动')
        )
      ),
      lastOrganize.lastOrganizeTime && React.createElement('div', {
        className: 'text-sm text-gray-600',
      }, `整理时间: ${new Date(lastOrganize.lastOrganizeTime).toLocaleString()}`)
    ),

    // 状态提示
    React.createElement('div', {
      className: 'bg-blue-50 p-4 rounded-lg border border-blue-200',
    },
      React.createElement('h3', { className: 'font-semibold text-blue-900 mb-2' }, '💡 使用提示'),
      React.createElement('ul', { className: 'space-y-1 text-sm text-blue-800' },
        React.createElement('li', null, '点击左侧导航栏切换不同设置页面'),
        React.createElement('li', null, '在 "智能整理" 页面中可以使用高级整理功能'),
        React.createElement('li', null, '在 "AI 设置" 中配置 DeepSeek API'),
        React.createElement('li', null, '在 "高级设置" 中查看调试信息')
      )
    )
  );
}
