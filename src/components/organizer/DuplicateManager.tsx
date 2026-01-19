// 重复书签管理组件

import { useState, useEffect } from 'react';
import {
  Copy,
  Trash2,
  Eye,
  AlertCircle,
  Check,
  ExternalLink,
} from 'lucide-react';
import { organizerService } from '@/services';
import type { DuplicateGroup } from '@/types';

interface DuplicateManagerProps {
  className?: string;
}

export function DuplicateManager({ className = '' }: DuplicateManagerProps) {
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    loadDuplicates();
  }, []);

  const loadDuplicates = async () => {
    setIsLoading(true);
    try {
      const result = await organizerService.detectDuplicates();
      setDuplicates(result);
    } catch (error) {
      console.error('加载重复书签失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = (groupId: string, bookmarkId: string) => {
    const newSelected = new Set(selectedIds);
    const key = `${groupId}-${bookmarkId}`;
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedIds(newSelected);
  };

  const handleKeep = async (groupId: string, bookmarkId: string) => {
    try {
      // 删除组内其他书签
      const group = duplicates.find((g) => g.id === groupId);
      if (!group) return;

      for (const dup of group.duplicates) {
        if (dup.id !== bookmarkId) {
          // TODO: 调用删除 API
        }
      }

      await loadDuplicates();
    } catch (error) {
      console.error('删除失败:', error);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;

    if (!confirm(`确定要删除选中的 ${selectedIds.size} 个重复书签吗？`)) {
      return;
    }

    try {
      // TODO: 批量删除
      await loadDuplicates();
      setSelectedIds(new Set());
    } catch (error) {
      console.error('批量删除失败:', error);
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm p-6 ${className}`}>
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 rounded-lg">
            <Copy className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">重复书签</h3>
            <p className="text-sm text-gray-500">
              {duplicates.length} 组重复书签待处理
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setPreviewMode(!previewMode)}
            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {previewMode ? '收起' : '展开'}详情
          </button>

          {selectedIds.size > 0 && (
            <button
              onClick={handleBatchDelete}
              className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              删除选中 ({selectedIds.size})
            </button>
          )}
        </div>
      </div>

      {/* 加载状态 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
        </div>
      ) : duplicates.length === 0 ? (
        <div className="text-center py-12">
          <Check className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-gray-600">没有发现重复书签</p>
        </div>
      ) : (
        <div className="space-y-4">
          {duplicates.map((group) => (
            <div
              key={group.id}
              className="border border-gray-200 rounded-lg p-4 hover:border-orange-300 transition-colors"
            >
              {/* URL 和统计 */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="w-4 h-4 text-orange-500" />
                    <span className="font-medium text-gray-900 truncate">
                      {group.url}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">{group.reason}</p>
                </div>

                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">
                    {group.bookmarks.length} 个副本
                  </div>
                </div>
              </div>

              {/* 书签列表 */}
              <div className="space-y-2">
                {group.bookmarks.map((bookmark) => {
                  const isRecommended = bookmark.id === group.keep;
                  const isSelected = selectedIds.has(
                    `${group.id}-${bookmark.id}`
                  );

                  return (
                    <div
                      key={bookmark.id}
                      className={`flex items-center gap-3 p-2 rounded ${
                        isRecommended ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
                      }`}
                    >
                      {/* 复选框 */}
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleSelect(group.id, bookmark.id)}
                        className="rounded border-gray-300"
                      />

                      {/* 推荐标记 */}
                      {isRecommended && (
                        <div className="flex items-center gap-1 px-2 py-1 bg-green-100 rounded-full">
                          <Check className="w-3 h-3 text-green-600" />
                          <span className="text-xs font-medium text-green-700">
                            推荐保留
                          </span>
                        </div>
                      )}

                      {/* 书签信息 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 truncate">
                            {bookmark.title}
                          </span>
                          <a
                            href={bookmark.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>

                        {previewMode && (
                          <div className="flex gap-4 mt-1 text-xs text-gray-500">
                            <span>创建于: {new Date(bookmark.createdAt).toLocaleDateString()}</span>
                            {bookmark.lastVisited && (
                              <span>
                                访问于: {new Date(bookmark.lastVisited).toLocaleDateString()}
                              </span>
                            )}
                            {bookmark.visitCount > 0 && (
                              <span>访问次数: {bookmark.visitCount}</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 操作按钮 */}
                      {!isRecommended && (
                        <button
                          onClick={() => handleKeep(group.id, bookmark.id)}
                          className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        >
                          保留此个
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 批量操作栏 */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t shadow-lg">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <span className="text-gray-700">
              已选择 {selectedIds.size} 个书签
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                取消选择
              </button>
              <button
                onClick={handleBatchDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                删除选中
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
