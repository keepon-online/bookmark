// 批量操作工具栏组件

import * as React from 'react';
import {
  Trash2,
  FolderInput,
  Tag,
  Archive,
  ArchiveRestore,
  CheckSquare,
  Square,
  X,
  MoreHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface BatchActionBarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onDelete: () => void;
  onMoveToFolder?: () => void;
  onAddTags?: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  isDeleting?: boolean;
  className?: string;
}

export function BatchActionBar({
  selectedCount,
  totalCount,
  onSelectAll,
  onDeselectAll,
  onDelete,
  onMoveToFolder,
  onAddTags,
  onArchive,
  onUnarchive,
  isDeleting = false,
  className,
}: BatchActionBarProps) {
  const allSelected = selectedCount === totalCount && totalCount > 0;
  const someSelected = selectedCount > 0;

  if (!someSelected) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/20 rounded-lg',
        'animate-fade-in',
        className
      )}
    >
      {/* 选择信息 */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={allSelected ? onDeselectAll : onSelectAll}
          title={allSelected ? '取消全选' : '全选'}
        >
          {allSelected ? (
            <CheckSquare className="h-4 w-4 text-primary" />
          ) : (
            <Square className="h-4 w-4" />
          )}
        </Button>
        <span className="text-sm font-medium">
          已选择 <span className="text-primary">{selectedCount}</span> / {totalCount}
        </span>
      </div>

      <div className="h-4 w-px bg-border mx-1" />

      {/* 操作按钮 */}
      <div className="flex items-center gap-1">
        {onMoveToFolder && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5"
            onClick={onMoveToFolder}
            title="移动到文件夹"
          >
            <FolderInput className="h-4 w-4" />
            <span className="hidden sm:inline">移动</span>
          </Button>
        )}

        {onAddTags && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5"
            onClick={onAddTags}
            title="添加标签"
          >
            <Tag className="h-4 w-4" />
            <span className="hidden sm:inline">标签</span>
          </Button>
        )}

        {onArchive && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5"
            onClick={onArchive}
            title="归档"
          >
            <Archive className="h-4 w-4" />
            <span className="hidden sm:inline">归档</span>
          </Button>
        )}

        {onUnarchive && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5"
            onClick={onUnarchive}
            title="取消归档"
          >
            <ArchiveRestore className="h-4 w-4" />
            <span className="hidden sm:inline">恢复</span>
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={onDelete}
          disabled={isDeleting}
          title="删除"
        >
          <Trash2 className="h-4 w-4" />
          <span className="hidden sm:inline">
            {isDeleting ? '删除中...' : '删除'}
          </span>
        </Button>
      </div>

      <div className="flex-1" />

      {/* 取消选择 */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onDeselectAll}
        title="取消选择"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
