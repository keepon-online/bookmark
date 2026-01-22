// 浏览器书签栏清理组件

import * as React from 'react';
import { useState } from 'react';
import {
  FolderX,
  Search,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Info,
  RefreshCw,
} from 'lucide-react';
import type {
  EmptyBrowserFolder,
  BrowserCleanupResult,
} from '@/types';

interface BrowserBookmarkCleanupProps {
  className?: string;
  onComplete?: (result: BrowserCleanupResult) => void;
}

export function BrowserBookmarkCleanup({
  className = '',
  onComplete,
}: BrowserBookmarkCleanupProps) {
  const [browserFolders, setBrowserFolders] = useState<EmptyBrowserFolder[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [result, setResult] = useState<BrowserCleanupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 扫描浏览器书签栏
  const handleScan = async () => {
    setIsScanning(true);
    console.log("[BrowserCleanup] Starting scan...");
    setError(null);
    setBrowserFolders([]);
    setShowPreview(false);
    setSelectedFolders(new Set());

    try {
      // 包装为 Promise 的消息发送
      const scanPromise = new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: 'SCAN_BROWSER_BOOKMARKS' },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (!response) {
              reject(new Error('No response from background'));
            } else {
              resolve(response);
            }
          }
        );
      }) as Promise<any>;

      // 60秒超时
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout (60s), check background console')), 60000)
      );

      const response = await Promise.race([scanPromise, timeoutPromise]) as any;
      console.log("[BrowserCleanup] Got response:", response);

      if (!response || !response.success) {
        throw new Error(response?.error || 'Scan failed');
      }

      console.log("[BrowserCleanup] Found " + (response.folders?.length || 0) + " empty folders");

      setBrowserFolders(response.folders || []);
      setShowPreview(true);

      if (response.folders.length === 0) {
        setError('No empty folders found in browser bookmarks');
      } else {
        setSelectedFolders(new Set(response.folders.map((f: any) => f.id)));
      }
    } catch (err) {
      console.error('[BrowserCleanup] Scan error:', err);
      setError("Scan failed: " + (err as Error).message);
    } finally {
      setIsScanning(false);
    }
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedFolders.size === browserFolders.length) {
      setSelectedFolders(new Set());
    } else {
      setSelectedFolders(new Set(browserFolders.map(f => f.id)));
    }
  };

  // 切换单个文件夹选择
  const toggleFolder = (folderId: string) => {
    const newSelected = new Set(selectedFolders);
    if (newSelected.has(folderId)) {
      newSelected.delete(folderId);
    } else {
      newSelected.add(folderId);
    }
    setSelectedFolders(newSelected);
  };

  // 执行清理
  // 执行清理
  const handleCleanup = async () => {
    if (selectedFolders.size === 0) {
      setError('请至少选择一个文件夹');
      return;
    }

    const confirmed = confirm(
      "确认删除选中的 " + selectedFolders.size + " 个空文件夹吗？\n\n" +
      "此操作将直接从浏览器书签栏中删除，不可撤销！"
    );

    if (!confirmed) return;

    setIsDeleting(true);
    setError(null);

    try {
      // 包装为 Promise 的消息发送
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: 'CLEANUP_BROWSER_BOOKMARKS',
            payload: { folderIds: Array.from(selectedFolders) }
          },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (!response) {
              reject(new Error('No response from background'));
            } else {
              resolve(response);
            }
          }
        );
      }) as any;

      if (!response || !response.success) {
        throw new Error(response?.error || 'Cleanup failed');
      }

      setResult(response.result);
      setShowPreview(false);
      onComplete?.(response.result);

      if (response.result.deleted > 0) {
        alert("Cleanup complete! Deleted " + response.result.deleted + " empty folders");
      }
    } catch (err) {
      setError("Cleanup failed: " + (err as Error).message);
    } finally {
      setIsDeleting(false);
    }
  };
  // 刷新按钮
  const handleRefresh = () => {
    setShowPreview(false);
    setBrowserFolders([]);
    setSelectedFolders(new Set());
    setResult(null);
    setError(null);
  };

  // 格式化时间
  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString();
  };

  return React.createElement('div', { className: `bg-white rounded-lg shadow p-6 ${className}` },
    // 标题栏
    React.createElement('div', { className: 'flex items-center justify-between mb-6' },
      React.createElement('div', { className: 'flex items-center gap-2' },
        React.createElement(FolderX, { className: 'w-6 h-6 text-orange-500' }),
        React.createElement('h3', { className: 'text-xl font-semibold text-gray-900' }, '清理浏览器书签栏'),
        React.createElement('span', { className: 'text-sm text-gray-500 ml-2' },
          '(直接操作浏览器书签栏)'
        )
      ),
      result ? React.createElement('button', {
        onClick: handleRefresh,
        className: 'p-2 hover:bg-gray-100 rounded-lg transition-colors',
        title: '重新扫描',
      },
        React.createElement(RefreshCw, { className: 'w-5 h-5 text-gray-600' })
      ) : null
    ),

    // 说明文字
    React.createElement('p', { className: 'text-gray-600 mb-6' },
      '直接清理浏览器书签栏中的空文件夹，无需导入到扩展。删除后立即生效。'
    ),

    // 操作按钮
    !showPreview ? React.createElement('div', { className: 'flex gap-3' },
      React.createElement('button', {
        onClick: handleScan,
        disabled: isScanning,
        className: 'flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
      },
        isScanning ? React.createElement(Loader2, { className: 'w-5 h-5 animate-spin' })
          : React.createElement(Search, { className: 'w-5 h-5' }),
        isScanning ? '扫描中...' : '扫描书签栏'
      )
    ) : null,

    // 预览和操作界面
    showPreview && browserFolders.length > 0 ? React.createElement('div', { className: 'space-y-4' },
      // 统计信息
      React.createElement('div', { className: 'grid grid-cols-3 gap-4' },
        React.createElement('div', { className: 'bg-orange-50 border border-orange-200 rounded-lg p-4 text-center' },
        React.createElement('div', { className: 'text-2xl font-bold text-orange-600' }, browserFolders.length),
        React.createElement('div', { className: 'text-sm text-orange-600' }, '空文件夹')
        ),
        React.createElement('div', { className: 'bg-blue-50 border border-blue-200 rounded-lg p-4 text-center' },
        React.createElement('div', { className: 'text-2xl font-bold text-blue-600' }, selectedFolders.size),
        React.createElement('div', { className: 'text-sm text-blue-600' }, '已选择')
        ),
        React.createElement('div', { className: 'bg-gray-50 border border-gray-200 rounded-lg p-4 text-center' },
        React.createElement('div', { className: 'text-lg font-bold text-gray-900' },
          browserFolders.length - selectedFolders.size
        ),
        React.createElement('div', { className: 'text-sm text-gray-600' }, '未选择')
        )
      ),

      // 全选/取消全选
      React.createElement('div', { className: 'flex items-center justify-between bg-gray-50 p-3 rounded-lg' },
        React.createElement('div', { className: 'text-sm text-gray-700' },
          `已选择 ${selectedFolders.size} / ${browserFolders.length} 个`
        ),
        React.createElement('button', {
          onClick: toggleSelectAll,
          className: 'text-sm text-blue-600 hover:text-blue-700 font-medium',
        },
          selectedFolders.size === browserFolders.length ? '取消全选' : '全选'
        )
      ),

      // 文件夹列表
      React.createElement('div', { className: 'border border-gray-200 rounded-lg overflow-hidden' },
        React.createElement('div', { className: 'bg-gray-50 px-4 py-3 border-b border-gray-200' },
          React.createElement('div', { className: 'flex items-center gap-2' },
            React.createElement(Info, { className: 'w-5 h-5 text-gray-600' }),
            React.createElement('span', { className: 'font-medium text-gray-900' },
              '文件夹列表 (按路径分组显示)'
            )
          )
        ),

        // 按父路径分组
        [...Object.entries(
          browserFolders.reduce((groups, folder) => {
            const parentPath = folder.path.substring(0, folder.path.lastIndexOf(' > ')) || '书签栏';
            if (!groups[parentPath]) {
              groups[parentPath] = [];
            }
            groups[parentPath].push(folder);
            return groups;
          }, {} as Record<string, EmptyBrowserFolder[]>)
        )].sort(([a, b]) => a.localeCompare(b)).map(([path, folders]) =>
          React.createElement('div', { key: path, className: 'border-b border-gray-200 last:border-0' },
            React.createElement('div', { className: 'bg-gray-100 px-4 py-2 font-medium text-gray-700 text-sm' },
              path
            ),

            // 文件夹列表
            React.createElement('div', { className: 'p-2 space-y-1' },
              ...folders.map((folder) =>
                React.createElement('div', {
                  key: folder.id,
                  className: 'flex items-start gap-3 px-3 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors',
                  onClick: () => toggleFolder(folder.id),
                },
                  // 选择框
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: selectedFolders.has(folder.id),
                    onChange: () => toggleFolder(folder.id),
                    className: 'mt-1 w-4 h-4 text-blue-600 rounded',
                    onClick: (e) => {
                      e.stopPropagation();
                      toggleFolder(folder.id);
                    },
                  }),

                  // 文件夹信息
                  React.createElement('div', { className: 'flex-1 min-w-0' },
                    React.createElement('div', { className: 'font-medium text-gray-900' }, folder.title),
                    React.createElement('div', { className: 'text-sm text-gray-500 flex items-center gap-2' },
                      folder.path,
                      folder.dateAdded ? `(${formatDate(folder.dateAdded)})` : null
                    )
                  )
                )
              )
            )
          )
        )
      ),

      // 操作按钮
      React.createElement('div', { className: 'flex gap-3' },
        React.createElement('button', {
          onClick: () => {
            setShowPreview(false);
            setSelectedFolders(new Set());
            setError(null);
          },
          className: 'flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors',
        }, '取消'),
        React.createElement('button', {
          onClick: handleCleanup,
          disabled: isDeleting || selectedFolders.size === 0,
          className: 'flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
        },
          isDeleting ? React.createElement(Loader2, { className: 'w-5 h-5 animate-spin' })
            : React.createElement(Trash2, { className: 'w-5 h-5' }),
          isDeleting ? '删除中...' : `删除选中的 (${selectedFolders.size})`
        )
      )
    ) : null,

    // 清理结果
    result ? React.createElement('div', { className: 'mt-6 p-4 bg-gray-50 rounded-lg' },
      React.createElement('div', { className: 'flex items-center gap-2 mb-3' },
        result.deleted > 0 ? React.createElement(CheckCircle2, { className: 'w-5 h-5 text-green-600' })
          : React.createElement(AlertCircle, { className: 'w-5 h-5 text-yellow-600' }),
        React.createElement('div', { className: 'font-medium text-gray-900' },
          result.deleted > 0 ? '清理完成！' : '清理完成（无操作）'
        )
      ),
      React.createElement('div', { className: 'grid grid-cols-3 gap-4 text-center' },
        React.createElement('div', null,
          React.createElement('div', { className: 'text-2xl font-bold text-gray-900' }, result.deleted),
          React.createElement('div', { className: 'text-sm text-gray-500' }, '已删除')
        ),
        React.createElement('div', null,
          React.createElement('div', { className: 'text-2xl font-bold text-gray-900' }, result.errors.length),
          React.createElement('div', { className: 'text-sm text-gray-500' }, '失败')
        ),
        React.createElement('div', null,
          React.createElement('div', { className: 'text-2xl font-bold text-gray-900' },
            `${result.duration}ms`
          ),
          React.createElement('div', { className: 'text-sm text-gray-500' }, '耗时')
        )
      ),
      result.errors.length > 0 ? React.createElement('div', { className: 'mt-3 text-sm text-red-700' },
        '错误详情:',
        ...result.errors.map((err, i) =>
          React.createElement('div', { key: i }, `⚠️  ${err}`)
        )
      ) : null
    ) : null,

    // 错误提示
    error ? React.createElement('div', { className: 'mt-4 p-4 bg-red-50 border border-red-200 rounded-lg' },
      React.createElement('div', { className: 'flex items-center gap-2 text-red-800' },
        React.createElement(AlertCircle, { className: 'w-5 h-5 flex-shrink-0' }),
        React.createElement('div', null, error)
      )
    ) : null,

    // 使用提示
    !result ? React.createElement('div', { className: 'mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg' },
      React.createElement('div', { className: 'flex items-start gap-2' },
        React.createElement(Info, { className: 'w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5' }),
        React.createElement('div', { className: 'text-sm text-blue-800' },
          React.createElement('div', { className: 'font-medium mb-2' }, '使用说明'),
          React.createElement('ul', { className: 'list-disc list-inside space-y-1' },
            React.createElement('li', null,
              '直接操作浏览器书签栏，无需导入到扩展数据库'
            ),
            React.createElement('li', null,
              '删除会立即生效，操作不可撤销'
            ),
            React.createElement('li', null,
              '建议先扫描查看预览，再选择要删除的文件夹'
            ),
            React.createElement('li', null,
              '删除父文件夹会同时删除其所有空的子文件夹'
            )
          )
        )
      )
    ) : null,
    // 刷新按钮（有结果时显示）
    result ? React.createElement('div', { className: 'mt-4 text-center' },
      React.createElement('button', {
        onClick: handleRefresh,
        className: 'text-sm text-blue-600 hover:text-blue-700 font-medium',
      }, '重新扫描')
    ) : null
  );
}
