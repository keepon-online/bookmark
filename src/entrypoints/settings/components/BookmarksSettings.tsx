// 书签管理设置页面

import * as React from 'react';
import { db, exportDatabase, clearDatabase } from '@/lib/database';
import { bookmarkService } from '@/services';

export function BookmarksSettings() {
  const [stats, setStats] = React.useState({ bookmarks: 0, folders: 0, tags: 0 });
  const [isExporting, setIsExporting] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
  const [importResult, setImportResult] = React.useState<string | null>(null);

  React.useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    const [bookmarks, folders, tags] = await Promise.all([
      db.bookmarks.count(),
      db.folders.count(),
      db.tags.count(),
    ]);
    setStats({ bookmarks, folders, tags });
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = await exportDatabase();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `smart-bookmark-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    setIsImporting(true);
    setImportResult(null);
    try {
      const result = await bookmarkService.importFromBrowser();
      setImportResult(
        `导入完成:成功 ${result.imported} 个,重复 ${result.duplicates} 个,失败 ${result.errors.length} 个`
      );
      await loadStats();
    } catch (error) {
      setImportResult(`导入失败:${(error as Error).message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleClear = async () => {
    if (!confirm('确定要清空所有数据吗?此操作不可恢复!')) {
      return;
    }
    try {
      await clearDatabase();
      await loadStats();
      alert('数据已清空');
    } catch (error) {
      console.error('Clear failed:', error);
    }
  };

  return React.createElement('div', { className: 'space-y-6' },
    React.createElement('h2', { className: 'text-2xl font-bold text-gray-900' }, '书签管理'),

    // 统计信息
    React.createElement('div', {
      className: 'bg-white p-6 rounded-lg shadow-sm border',
    },
      React.createElement('h3', { className: 'text-lg font-semibold mb-4' }, '数据统计'),
      React.createElement('div', { className: 'grid grid-cols-3 gap-4' },
        React.createElement('div', { className: 'text-center' },
          React.createElement('div', { className: 'text-3xl font-bold text-purple-600' }, stats.bookmarks),
          React.createElement('div', { className: 'text-sm text-gray-600' }, '书签')
        ),
        React.createElement('div', { className: 'text-center' },
          React.createElement('div', { className: 'text-3xl font-bold text-blue-600' }, stats.folders),
          React.createElement('div', { className: 'text-sm text-gray-600' }, '文件夹')
        ),
        React.createElement('div', { className: 'text-center' },
          React.createElement('div', { className: 'text-3xl font-bold text-green-600' }, stats.tags),
          React.createElement('div', { className: 'text-sm text-gray-600' }, '标签')
        )
      )
    ),

    // 导入导出
    React.createElement('div', {
      className: 'bg-white p-6 rounded-lg shadow-sm border',
    },
      React.createElement('h3', { className: 'text-lg font-semibold mb-4' }, '数据管理'),
      React.createElement('div', { className: 'space-y-3' },
        React.createElement('div', {
          className: 'flex items-center justify-between p-4 border rounded-lg',
        },
          React.createElement('div', null,
            React.createElement('div', { className: 'font-medium' }, '从浏览器导入'),
            React.createElement('div', { className: 'text-sm text-gray-500' }, '导入浏览器中的书签到智能书签')
          ),
          React.createElement('button', {
            onClick: handleImport,
            disabled: isImporting,
            className: 'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300',
          }, isImporting ? '导入中...' : '导入')
        ),
        importResult && React.createElement('div', {
          className: 'p-3 bg-blue-50 text-blue-900 rounded-lg text-sm',
        }, importResult),
        React.createElement('div', {
          className: 'flex items-center justify-between p-4 border rounded-lg',
        },
          React.createElement('div', null,
            React.createElement('div', { className: 'font-medium' }, '导出数据'),
            React.createElement('div', { className: 'text-sm text-gray-500' }, '将所有数据导出为 JSON 文件')
          ),
          React.createElement('button', {
            onClick: handleExport,
            disabled: isExporting,
            className: 'px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300',
          }, isExporting ? '导出中...' : '导出')
        ),
        React.createElement('div', {
          className: 'flex items-center justify-between p-4 border border-red-200 rounded-lg',
        },
          React.createElement('div', null,
            React.createElement('div', { className: 'font-medium text-red-600' }, '清空数据'),
            React.createElement('div', { className: 'text-sm text-gray-500' }, '删除所有书签、文件夹和标签数据')
          ),
          React.createElement('button', {
            onClick: handleClear,
            className: 'px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700',
          }, '清空')
        )
      )
    )
  );
}
