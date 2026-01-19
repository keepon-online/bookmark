// 书签卡片组件

import * as React from 'react';
import { Heart, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ContentTypeBadge } from '@/components/ai';
import { LinkStatusIndicator } from '@/components/linkHealth';
import { cn, formatRelativeTime, getDomain, truncate } from '@/lib/utils';
import type { Bookmark } from '@/types';

interface BookmarkCardProps {
  bookmark: Bookmark;
  isSelected?: boolean;
  isSelectable?: boolean;
  onSelect?: () => void;
  onFavorite?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onOpen?: () => void;
  onStatusChange?: (status: Bookmark['status']) => void;
  compact?: boolean;
  showContentType?: boolean;
  showLinkStatus?: boolean;
}

export function BookmarkCard({
  bookmark,
  isSelected = false,
  isSelectable = false,
  onSelect,
  onFavorite,
  onEdit,
  onDelete,
  onOpen,
  onStatusChange,
  compact = false,
  showContentType = false,
  showLinkStatus = false,
}: BookmarkCardProps) {
  const [showActions, setShowActions] = React.useState(false);

  const handleOpen = () => {
    window.open(bookmark.url, '_blank');
    onOpen?.();
  };

  const handleClick = () => {
    if (isSelectable) {
      onSelect?.();
    }
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

      {/* Selection Checkbox (仅在可选择模式) */}
      {isSelectable && (
        <div className="flex-shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
          <button
            className={cn(
              'h-5 w-5 rounded border-2 flex items-center justify-center transition-colors',
              isSelected
                ? 'bg-primary border-primary'
                : 'border-muted-foreground/30 hover:border-primary/50'
            )}
            onClick={onSelect}
          >
            {isSelected && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
          </button>
        </div>
      )}

      {/* Content */}
      <div
        className={cn(
          'flex-1 min-w-0',
          isSelectable && 'cursor-pointer',
          !isSelectable && 'onClick={onSelect}'
        )}
        onClick={handleClick}
      >
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

            {/* URL + 状态指示器 */}
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-muted-foreground line-clamp-1">
                {getDomain(bookmark.url)}
              </p>
              {showContentType && (
                <ContentTypeBadge type={bookmark.meta?.contentType || 'other'} showLabel={false} />
              )}
              {showLinkStatus && (
                <LinkStatusIndicator
                  bookmarkId={bookmark.id}
                  status={bookmark.status}
                  url={bookmark.url}
                  onStatusChange={onStatusChange}
                  size="sm"
                />
              )}
            </div>

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
            {onEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-3h2v3h3l-1.714-5.714a2 2 0 01-2.828 0z" />
                </svg>
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 011-1h2a1 1 0 011 1v3a1 1 0 001 1h1a1 1 0 001-1v-3a1 1 0 011-1v-3a1 1 0 011-1h2a1 1 0 011 1v10" />
                </svg>
              </Button>
            )}
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
