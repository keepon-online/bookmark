// 清理空文件夹组件

import * as React from 'react';
import { useState, useEffect } from 'react';
import {
  FolderX,
  Search,
  Trash2,
  Eye,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Settings,
  Info,
} from 'lucide-react';
import { folderService } from '@/services';
import type {
  FindEmptyFoldersOptions,
  EmptyFolderInfo,
  CleanupPreviewResult,
  CleanupEmptyFoldersResult,
} from '@/types';

interface EmptyFolderCleanupProps {
  className?: string;
  onComplete?: (result: CleanupEmptyFoldersResult) => void;
}

export function EmptyFolderCleanup({
  className = '',
  onComplete,
}: EmptyFolderCleanupProps) {
  const [options, setOptions] = useState<FindEmptyFoldersOptions>({
    recursive: true,
    excludeRoot: true,
    minAge: 24 * 60 * 60 * 1000, // 默认1天
  });

  const [preview, setPreview] = useState<CleanupPreviewResult | null>(null);
  const [result, setResult] = useState<CleanupEmptyFoldersResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载上次清理结果
  useEffect(() => {
    loadLastCleanupResult();
  }, []);

  const loadLastCleanupResult = async () => {
    const stored = await chrome.storage.local.get('lastEmptyFolderCleanup');
    if (stored.lastEmptyFolderCleanup) {
      setResult(stored.lastEmptyFolderCleanup);
    }
  };

  const saveLastCleanupResult = async (cleanupResult: CleanupEmptyFoldersResult) => {
    await chrome.storage.local.set({
      lastEmptyFolderCleanup: cleanupResult,
      lastEmptyFolderCleanupTime: Date.now(),
    });
  };

  // 扫描空文件夹
  const handleScan = async () => {
    setIsScanning(true);
    setError(null);
    setPreview(null);
    setShowPreview(false);

    try {
      const previewResult = await folderService.previewEmptyFolders(options);
      setPreview(previewResult);
      setShowPreview(true);

      if (previewResult.toDelete.length === 0) {
        setError('没有找到需要清理的空文件夹');
      }
    } catch (err) {
      setError(`扫描失败: ${(err as Error).message}`);
    } finally {
      setIsScanning(false);
    }
  };

  // 执行清理
  const handleCleanup = async () => {
    if (!preview) return;

    setIsCleaning(true);
    setError(null);

    try {
      const cleanupResult = await folderService.deleteEmptyFolders({
        ...options,
        dryRun: false,
      });

      setResult(cleanupResult);
      await saveLastCleanupResult(cleanupResult);
      setShowPreview(false);

      onComplete?.(cleanupResult);

      // 显示成功消息
      if (cleanupResult.deleted > 0) {
        alert(`✅ 清理完成！已删除 ${cleanupResult.deleted} 个空文件夹`);
      } else {
        setError('没有文件夹被删除');
      }
    } catch (err) {
      setError(`清理失败: ${(err as Error).message}`);
    } finally {
      setIsCleaning(false);
    }
  };

  // 格式化时间
  const formatAge = (ageMs: number): string => {
    const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
    const hours = Math.floor((ageMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

    if (days > 0) return `${days}天前创建`;
    if (hours > 0) return `${hours}小时前创建`;
    return '刚刚创建';
  };

  return React.createElement('div', { className: `bg-white rounded-lg shadow p-6 ${className}` },
    // 标题栏
    React.createElement('div', { className: 'flex items-center justify-between mb-6' },
      React.createElement('div', { className: 'flex items-center gap-2' },
        React.createElement(FolderX, { className: 'w-6 h-6 text-red-500' }),
        React.createElement('h3', { className: 'text-xl font-semibold text-gray-900' }, '清理空文件夹')
      ),
      React.createElement('button', {
        onClick: () => setShowOptions(!showOptions),
        className: 'p-2 hover:bg-gray-100 rounded-lg transition-colors',
      },
        React.createElement(Settings, { className: 'w-5 h-5 text-gray-600' })
      )
    ),

    // 说明文字
    React.createElement('p', { className: 'text-gray-600 mb-6' },
      '自动识别并清理空的文件夹，保持书签结构清晰。建议定期清理。'
    ),

    // 选项面板
    showOptions ? React.createElement('div', { className: 'mb-6 p-4 bg-gray-50 rounded-lg space-y-4' },
      // 递归清理
      React.createElement('label', { className: 'flex items-center gap-3 cursor-pointer' },
        React.createElement('input', {
          type: 'checkbox',
          checked: options.recursive,
          onChange: (e) => setOptions({ ...options, recursive: e.target.checked }),
          className: 'w-4 h-4 text-blue-600 rounded',
        }),
        React.createElement('div', null,
          React.createElement('div', { className: 'font-medium text-gray-900' }, '递归清理'),
          React.createElement('div', { className: 'text-sm text-gray-500' }, '同时清理子文件夹')
        )
      ),

      // 排除根目录
      React.createElement('label', { className: 'flex items-center gap-3 cursor-pointer' },
        React.createElement('input', {
          type: 'checkbox',
          checked: options.excludeRoot,
          onChange: (e) => setOptions({ ...options, excludeRoot: e.target.checked }),
          className: 'w-4 h-4 text-blue-600 rounded',
        }),
        React.createElement('div', null,
          React.createElement('div', { className: 'font-medium text-gray-900' }, '排除根目录'),
          React.createElement('div', { className: 'text-sm text-gray-500' }, '不清理顶级文件夹')
        )
      ),

      // 最小存在时间
      React.createElement('div', { className: 'space-y-2' },
        React.createElement('label', { className: 'text-sm font-medium text-gray-900' }, '最小存在时间'),
        React.createElement('select', {
          value: options.minAge,
          onChange: (e) => setOptions({ ...options, minAge: Number(e.target.value) }),
          className: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500',
        },
          React.createElement('option', { value: 0 }, '不限制'),
          React.createElement('option', { value: 60 * 60 * 1000 }, '1小时'),
          React.createElement('option', { value: 24 * 60 * 60 * 1000 }, '1天（推荐）'),
          React.createElement('option', { value: 7 * 24 * 60 * 60 * 1000 }, '7天'),
          React.createElement('option', { value: 30 * 24 * 60 * 60 * 1000 }, '30天')
        ),
        React.createElement('p', { className: 'text-xs text-gray-500' },
          '只清理超过此时间的文件夹，防止误删新创建的文件夹'
        )
      )
    ) : null,

    // 操作按钮
    !showPreview ? React.createElement('div', { className: 'flex gap-3' },
      React.createElement('button', {
        onClick: handleScan,
        disabled: isScanning,
        className: 'flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
      },
        isScanning ? React.createElement(Loader2, { className: 'w-5 h-5 animate-spin' })
          : React.createElement(Search, { className: 'w-5 h-5' }),
        isScanning ? '扫描中...' : '扫描空文件夹'
      )
    ) : null,

    // 预览结果
    showPreview && preview ? React.createElement('div', { className: 'space-y-4' },
      // 统计信息
      React.createElement('div', { className: 'grid grid-cols-2 gap-4' },
        React.createElement('div', { className: 'bg-red-50 border border-red-200 rounded-lg p-4' },
          React.createElement('div', { className: 'text-2xl font-bold text-red-600' }, preview.toDelete.length),
          React.createElement('div', { className: 'text-sm text-red-600' }, '将被删除')
        ),
        React.createElement('div', { className: 'bg-green-50 border border-green-200 rounded-lg p-4' },
          React.createElement('div', { className: 'text-2xl font-bold text-green-600' }, preview.toKeep.length),
          React.createElement('div', { className: 'text-sm text-green-600' }, '将被保留')
        )
      ),

      // 将被删除的文件夹列表
      preview.toDelete.length > 0 ? React.createElement('div', { className: 'border border-red-200 rounded-lg overflow-hidden' },
        React.createElement('div', { className: 'bg-red-50 px-4 py-3 border-b border-red-200' },
          React.createElement('div', { className: 'flex items-center gap-2 font-medium text-red-900' },
            React.createElement(Trash2, { className: 'w-5 h-5' }),
            `将被删除的文件夹 (${preview.toDelete.length})`
          )
        ),
        React.createElement('div', { className: 'max-h-64 overflow-y-auto p-2' },
          ...preview.toDelete.map((info) =>
            React.createElement('div', {
              key: info.folder.id,
              className: 'flex items-center justify-between px-3 py-2 hover:bg-gray-50 rounded-lg',
            },
              React.createElement('div', { className: 'flex-1' },
                React.createElement('div', { className: 'font-medium text-gray-900' }, info.folder.name),
                React.createElement('div', { className: 'text-sm text-gray-500' },
                  formatAge(info.age)
                )
              ),
              info.allDescendantsCount > 0 ? React.createElement('div', {
                className: 'text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded font-medium'
              },
                `包含 ${info.allDescendantsCount} 个子文件夹`
              ) : null
            )
          )
        ),

        // 添加说明：递归删除会同时删除子文件夹
        preview.toDelete.some(info => info.allDescendantsCount > 0) ? React.createElement('div', {
          className: 'bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3'
        },
          React.createElement('div', { className: 'flex items-start gap-2' },
            React.createElement(Info, { className: 'w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5' }),
            React.createElement('div', { className: 'text-sm text-blue-800' },
              React.createElement('div', { className: 'font-medium mb-1' }, '递归删除说明'),
              '删除包含子文件夹的父文件夹时，会同时删除所有空的子文件夹。例如：删除"技术/前端/React"时，如果"技术"和"前端"也是空的，会一并删除。'
            )
          )
        ) : null
      ) : null,

      // 将被保留的文件夹列表
      preview.toKeep.length > 0 ? React.createElement('div', { className: 'border border-green-200 rounded-lg overflow-hidden' },
        React.createElement('div', { className: 'bg-green-50 px-4 py-3 border-b border-green-200' },
          React.createElement('div', { className: 'flex items-center gap-2 font-medium text-green-900' },
            React.createElement(FolderX, { className: 'w-5 h-5' }),
            `将被保留的文件夹 (${preview.toKeep.length})`
          )
        ),
        React.createElement('div', { className: 'max-h-64 overflow-y-auto p-2 space-y-1' },
          ...preview.toKeep.map((info) =>
            React.createElement('div', {
              key: info.folder.id,
              className: 'flex items-start gap-2 px-3 py-2 bg-green-50 rounded-lg',
            },
              React.createElement(Info, { className: 'w-5 h-5 text-green-600 flex-shrink-0 mt-0.5' }),
              React.createElement('div', { className: 'flex-1 min-w-0' },
                React.createElement('div', { className: 'font-medium text-gray-900' }, info.folder.name),
                React.createElement('div', { className: 'text-sm text-green-700' },
                  preview.warnings.find(w => w.includes(info.folder.name)) || '受保护'
                )
              )
            )
          )
        )
      ) : null,

      // 警告信息
      preview.warnings.length > 0 ? React.createElement('div', { className: 'bg-yellow-50 border border-yellow-200 rounded-lg p-4' },
        React.createElement('div', { className: 'flex items-start gap-2' },
          React.createElement(AlertCircle, { className: 'w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5' }),
          React.createElement('div', { className: 'flex-1' },
            React.createElement('div', { className: 'font-medium text-yellow-900' }, '注意事项'),
            preview.warnings.slice(0, 3).map((warning, i) =>
              React.createElement('div', {
                key: i,
                className: 'text-sm text-yellow-800 mt-1'
              }, warning)
            ),
            preview.warnings.length > 3 ? React.createElement('div', { className: 'text-sm text-yellow-800 mt-1' },
              `...还有 ${preview.warnings.length - 3} 条警告`
            ) : null
          )
        )
      ) : null,

      // 操作按钮
      React.createElement('div', { className: 'flex gap-3' },
        React.createElement('button', {
          onClick: () => {
            setShowPreview(false);
            setPreview(null);
          },
          className: 'flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors',
        }, '取消'),
        React.createElement('button', {
          onClick: handleCleanup,
          disabled: isCleaning || preview.toDelete.length === 0,
          className: 'flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
        },
          isCleaning ? React.createElement(Loader2, { className: 'w-5 h-5 animate-spin' })
            : React.createElement(Trash2, { className: 'w-5 h-5' }),
          isCleaning ? '清理中...' : `确认清理 (${preview.toDelete.length})`
        )
      )
    ) : null,

    // 清理结果
    result ? React.createElement('div', { className: 'mt-6 p-4 bg-gray-50 rounded-lg' },
      React.createElement('div', { className: 'flex items-center gap-2 mb-3' },
        result.deleted > 0 ? React.createElement(CheckCircle2, { className: 'w-5 h-5 text-green-600' })
          : React.createElement(AlertCircle, { className: 'w-5 h-5 text-yellow-600' }),
        React.createElement('div', { className: 'font-medium text-gray-900' },
          result.deleted > 0 ? '清理完成' : '清理完成（无操作）'
        )
      ),
      React.createElement('div', { className: 'grid grid-cols-3 gap-4 text-center' },
        React.createElement('div', null,
          React.createElement('div', { className: 'text-2xl font-bold text-gray-900' }, result.deleted),
          React.createElement('div', { className: 'text-sm text-gray-500' }, '已删除')
        ),
        React.createElement('div', null,
          React.createElement('div', { className: 'text-2xl font-bold text-gray-900' }, result.kept),
          React.createElement('div', { className: 'text-sm text-gray-500' }, '已保留')
        ),
        React.createElement('div', null,
          React.createElement('div', { className: 'text-2xl font-bold text-gray-900' }, `${result.duration}ms`),
          React.createElement('div', { className: 'text-sm text-gray-500' }, '耗时')
        )
      ),
      result.warnings.length > 0 ? React.createElement('div', { className: 'mt-3 text-sm text-yellow-700' },
        ...result.warnings.map((w, i) =>
          React.createElement('div', { key: i }, `⚠️  ${w}`)
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

    // 上次清理信息
    result && !showPreview ? React.createElement('div', { className: 'mt-4 text-center' },
      React.createElement('button', {
        onClick: () => {
          setResult(null);
          setError(null);
        },
        className: 'text-sm text-blue-600 hover:text-blue-700',
      }, '重新扫描')
    ) : null
  );
}
