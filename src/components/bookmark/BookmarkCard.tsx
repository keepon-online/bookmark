// 书签卡片组件

import * as React from 'react';
import { Heart, MoreHorizontal, ExternalLink, Trash2, Edit, FolderInput } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn, formatRelativeTime, getDomain, truncate } from '@/lib/utils';
import type { Bookmark } from '@/types';

interface BookmarkCardProps {
  bookmark: Bookmark;
  isSelected?: boolean;
  onSelect?: () => void;
  onFavorite?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onOpen?: () => void;
  compact?: boolean;
}

export function BookmarkCard({
  bookmark,
  isSelected = false,
  onSelect,
  onFavorite,
  onEdit,
  onDelete,
  onOpen,
  compact = false,
}: BookmarkCardProps) {
  const [showActions, setShowActions] = React.useState(false);

  const handleOpen = () => {
    window.open(bookmark.url, '_blank');
    onOpen?.();
  };

  return (
    <div
      className={cn(
        'group relative flex items-start gap-3 rounded-lg border p-3 transition-all',
        'hover:bg-accent/50 hover:shadow-sm',
        isSelected && 'bg-primary/10 border-primary',
        bookmark.status === 'broken' && 'opacity-60'
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Favicon */}
      <div className="flex-shrink-0 mt-0.5">
        {bookmark.favicon ? (
          <img
            src={bookmark.favicon}
            alt=""
            className="h-5 w-5 rounded"
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://www.google.com/s2/favicons?domain=${getDomain(bookmark.url)}&sz=32`;
            }}
          />
        ) : (
          <div className="h-5 w-5 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
            🔗
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0" onClick={onSelect}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {/* Title */}
            <h3
              className={cn(
                'font-medium text-sm leading-tight cursor-pointer hover:text-primary transition-colors',
                'line-clamp-1'
              )}
              onClick={handleOpen}
              title={bookmark.title}
            >
              {bookmark.title}
            </h3>

            {/* URL */}
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {getDomain(bookmark.url)}
            </p>

            {/* Description (non-compact mode) */}
            {!compact && bookmark.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {truncate(bookmark.description, 100)}
              </p>
            )}

            {/* Tags */}
            {bookmark.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {bookmark.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs px-1.5 py-0">
                    {tag}
                  </Badge>
                ))}
                {bookmark.tags.length > 3 && (
                  <Badge variant="outline" className="text-xs px-1.5 py-0">
                    +{bookmark.tags.length - 3}
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className={cn(
            'flex items-center gap-1 transition-opacity',
            showActions ? 'opacity-100' : 'opacity-0'
          )}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                onFavorite?.();
              }}
            >
              <Heart
                className={cn(
                  'h-4 w-4',
                  bookmark.isFavorite && 'fill-red-500 text-red-500'
                )}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                handleOpen();
              }}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                onEdit?.();
              }}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.();
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
          <span>{formatRelativeTime(bookmark.createdAt)}</span>
          {bookmark.status === 'broken' && (
            <Badge variant="destructive" className="text-xs px-1 py-0">
              失效
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
