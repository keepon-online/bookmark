// 浏览器书签列表组件

import { BrowserBookmarkCard } from './BrowserBookmarkCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Bookmark as BookmarkIcon } from 'lucide-react';
import type { AuxBookmarkMeta, BrowserBookmarkNode } from '@/types';

interface BrowserBookmarkListProps {
  bookmarks: BrowserBookmarkNode[];
  meta: Record<string, AuxBookmarkMeta>;
  isLoading?: boolean;
  selectedIds?: Set<string>;
  isSelectable?: boolean;
  onSelect?: (id: string) => void;
  onFavorite?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onOpen?: (id: string) => void;
  onTagClick?: (tag: string) => void;
  emptyMessage?: string;
  compact?: boolean;
  maxHeight?: string;
}

export function BrowserBookmarkList({
  bookmarks,
  meta,
  isLoading = false,
  selectedIds = new Set(),
  isSelectable = false,
  onSelect,
  onFavorite,
  onEdit,
  onDelete,
  onOpen,
  onTagClick,
  emptyMessage = '暂无书签',
  compact = false,
  maxHeight = '400px',
}: BrowserBookmarkListProps) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <BookmarkSkeleton key={i} compact={compact} />
        ))}
      </div>
    );
  }

  if (bookmarks.length === 0) {
    return (
      <EmptyState
        icon={<BookmarkIcon className="h-12 w-12" />}
        title={emptyMessage}
        description="书签直接保存在浏览器中，添加后立即可见"
      />
    );
  }

  return (
    <ScrollArea style={{ maxHeight }} className="pr-2">
      <div className="space-y-2 p-1">
        {bookmarks.map((node) => (
          <BrowserBookmarkCard
            key={node.id}
            node={node}
            meta={meta[node.id]}
            isSelected={selectedIds.has(node.id)}
            isSelectable={isSelectable}
            onSelect={() => onSelect?.(node.id)}
            onFavorite={() => onFavorite?.(node.id)}
            onEdit={onEdit ? () => onEdit(node.id) : undefined}
            onDelete={onDelete ? () => onDelete(node.id) : undefined}
            onOpen={onOpen ? () => onOpen(node.id) : undefined}
            onTagClick={onTagClick}
            compact={compact}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

function BookmarkSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <Skeleton className="h-5 w-5 rounded" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        {!compact && <Skeleton className="h-3 w-full" />}
      </div>
    </div>
  );
}
