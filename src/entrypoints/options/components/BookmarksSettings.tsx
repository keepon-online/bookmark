// 书签管理设置页面
// v0.6：书签本体即浏览器书签（无需导入/清空），
// 这里管理扩展的增强元数据（标签/收藏/备注/检查记录）与备份

import * as React from 'react';
import { useBrowserBookmarkStore, selectAllTags } from '@/stores';
import { exportAuxData, importAuxData, auxDb, type AuxExportData } from '@/lib/auxDatabase';

export function BookmarksSettings() {
  const bookmarks = useBrowserBookmarkStore((state) => state.bookmarks);
  const folders = useBrowserBookmarkStore((state) => state.folders);
  const meta = useBrowserBookmarkStore((state) => state.meta);

  const [isExporting, setIsExporting] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    void useBrowserBookmarkStore.getState().init();
  }, []);

  const tagCount = React.useMemo(() => selectAllTags(meta).length, [meta]);
  const metaCount = React.useMemo(
    () => Object.values(meta).filter((record) => record.tags.length > 0 || record.isFavorite || record.notes).length,
    [meta]
  );

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = await exportAuxData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `smart-bookmark-aux-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(`已导出 ${data.bookmarkMeta.length} 条增强元数据`);
    } catch (error) {
      setMessage(`导出失败: ${(error as Error).message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text) as AuxExportData;
      await importAuxData(data);
      await useBrowserBookmarkStore.getState().refresh();
      setMessage(`已导入 ${data.bookmarkMeta?.length ?? 0} 条增强元数据（合并写入）`);
    } catch (error) {
      setMessage(`导入失败: ${(error as Error).message}`);
    }
  };

  const handleClearAux = async () => {
    if (!confirm('确定清空所有增强元数据（标签/收藏/备注/检查记录）吗？浏览器书签不受影响。')) {
      return;
    }
    try {
      await auxDb.bookmarkMeta.clear();
      await auxDb.linkChecks.clear();
      await useBrowserBookmarkStore.getState().refresh();
      setMessage('增强元数据已清空（浏览器书签不受影响）');
    } catch (error) {
      setMessage(`清空失败: ${(error as Error).message}`);
    }
  };

  return React.createElement('div', { className: 'space-y-6' },
    React.createElement('h2', { className: 'text-2xl font-bold text-gray-900' }, '书签管理'),

    // 统计信息（来自浏览器书签树）
    React.createElement('div', { className: 'bg-white p-6 rounded-lg shadow-sm border' },
      React.createElement('h3', { className: 'text-lg font-semibold mb-4' }, '数据统计'),
      React.createElement('p', { className: 'text-sm text-gray-500 mb-4' },
        '书签保存在浏览器中，由 Chrome 账号自动跨设备同步'),
      React.createElement('div', { className: 'grid grid-cols-4 gap-4' },
        React.createElement('div', { className: 'text-center' },
          React.createElement('div', { className: 'text-3xl font-bold text-purple-600' }, bookmarks.length),
          React.createElement('div', { className: 'text-sm text-gray-600' }, '书签')
        ),
        React.createElement('div', { className: 'text-center' },
          React.createElement('div', { className: 'text-3xl font-bold text-blue-600' }, folders.length),
          React.createElement('div', { className: 'text-sm text-gray-600' }, '文件夹')
        ),
        React.createElement('div', { className: 'text-center' },
          React.createElement('div', { className: 'text-3xl font-bold text-green-600' }, tagCount),
          React.createElement('div', { className: 'text-sm text-gray-600' }, '标签')
        ),
        React.createElement('div', { className: 'text-center' },
          React.createElement('div', { className: 'text-3xl font-bold text-amber-600' }, metaCount),
          React.createElement('div', { className: 'text-sm text-gray-600' }, '有元数据的书签')
        )
      )
    ),

    // 增强元数据管理
    React.createElement('div', { className: 'bg-white p-6 rounded-lg shadow-sm border' },
      React.createElement('h3', { className: 'text-lg font-semibold mb-4' }, '增强元数据备份'),
      React.createElement('p', { className: 'text-sm text-gray-500 mb-4' },
        '标签、收藏、备注、死链记录等元数据保存在本扩展中，不随 Chrome 账号同步，可用 JSON 备份'),
      React.createElement('div', { className: 'space-y-3' },
        React.createElement('div', { className: 'flex items-center justify-between p-4 border rounded-lg' },
          React.createElement('div', null,
            React.createElement('div', { className: 'font-medium' }, '导出元数据'),
            React.createElement('div', { className: 'text-sm text-gray-500' }, '导出为 JSON 文件备份')
          ),
          React.createElement('button', {
            onClick: handleExport,
            disabled: isExporting,
            className: 'px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300',
          }, isExporting ? '导出中...' : '导出')
        ),
        React.createElement('div', { className: 'flex items-center justify-between p-4 border rounded-lg' },
          React.createElement('div', null,
            React.createElement('div', { className: 'font-medium' }, '导入元数据'),
            React.createElement('div', { className: 'text-sm text-gray-500' }, '从备份 JSON 合并导入')
          ),
          React.createElement('input', {
            type: 'file',
            accept: 'application/json',
            className: 'text-sm',
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
              e.target.value = '';
            },
          })
        ),
        React.createElement('div', { className: 'flex items-center justify-between p-4 border border-red-200 rounded-lg' },
          React.createElement('div', null,
            React.createElement('div', { className: 'font-medium text-red-600' }, '清空元数据'),
            React.createElement('div', { className: 'text-sm text-gray-500' }, '仅删除增强元数据，浏览器书签不受影响')
          ),
          React.createElement('button', {
            onClick: handleClearAux,
            className: 'px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700',
          }, '清空')
        )
      ),
      message && React.createElement('div', {
        className: 'mt-3 p-3 bg-blue-50 text-blue-900 rounded-lg text-sm',
      }, message)
    )
  );
}
