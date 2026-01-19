// 书签列表组件

import * as React from 'react';
import { BookmarkCard } from './BookmarkCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Bookmark as BookmarkIcon } from 'lucide-react';
import type { Bookmark } from '@/types';

interface BookmarkListProps {
  bookmarks: Bookmark[];
  isLoading?: boolean;
  selectedIds?: Set<string>;
  onSelect?: (id: string) => void;
  onFavorite?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onOpen?: (id: string) => void;
  emptyMessage?: string;
  compact?: boolean;
  maxHeight?: string;
}

export function BookmarkList({
  bookmarks,
  isLoading = false,
  selectedIds = new Set(),
  onSelect,
  onFavorite,
  onEdit,
  onDelete,
  onOpen,
  emptyMessage = '暂无书签',
  compact = false,
  maxHeight = '400px',
}: BookmarkListProps) {
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
        description="添加一些书签开始使用吧"
      />
    );
  }

  return (
    <ScrollArea style={{ maxHeight }} className="pr-2">
      <div className="space-y-2 p-1">
        {bookmarks.map((bookmark) => (
          <BookmarkCard
            key={bookmark.id}
            bookmark={bookmark}
            isSelected={selectedIds.has(bookmark.id)}
            onSelect={() => onSelect?.(bookmark.id)}
            onFavorite={() => onFavorite?.(bookmark.id)}
            onEdit={() => onEdit?.(bookmark.id)}
            onDelete={() => onDelete?.(bookmark.id)}
            onOpen={() => onOpen?.(bookmark.id)}
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
        <div className="flex gap-1">
          <Skeleton className="h-4 w-12 rounded-md" />
          <Skeleton className="h-4 w-12 rounded-md" />
        </div>
      </div>
    </div>
  );
}
