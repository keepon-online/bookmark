// 浏览器书签卡片组件（基于 BrowserBookmarkNode + AuxBookmarkMeta）

import * as React from 'react';
import { Heart, CheckCircle2, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn, formatRelativeTime, getDomain, getFaviconUrl } from '@/lib/utils';
import type { AuxBookmarkMeta, BrowserBookmarkNode } from '@/types';

interface BrowserBookmarkCardProps {
  node: BrowserBookmarkNode;
  meta?: AuxBookmarkMeta;
  isSelected?: boolean;
  isSelectable?: boolean;
  onSelect?: () => void;
  onFavorite?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onOpen?: () => void;
  onTagClick?: (tag: string) => void;
  compact?: boolean;
}

export function BrowserBookmarkCard({
  node,
  meta,
  isSelected = false,
  isSelectable = false,
  onSelect,
  onFavorite,
  onEdit,
  onDelete,
  onOpen,
  onTagClick,
  compact = false,
}: BrowserBookmarkCardProps) {
  const [showActions, setShowActions] = React.useState(false);

  const url = node.url ?? '';
  const tags = meta?.tags ?? [];
  const isFavorite = meta?.isFavorite ?? false;
  const isBroken = meta?.linkStatus === 'broken';
  const isUnreachable = meta?.linkStatus === 'unreachable';

  const handleOpen = () => {
    window.open(url, '_blank');
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
        (isBroken || isUnreachable) && 'opacity-60'
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Favicon */}
      <div className="flex-shrink-0 mt-0.5">
        <img
          src={getFaviconUrl(url, 32)}
          alt=""
          className="h-5 w-5 rounded"
          onError={(e) => {
            (e.target as HTMLImageElement).style.visibility = 'hidden';
          }}
        />
      </div>

      {/* 选择框（仅可选择模式） */}
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

      {/* 内容 */}
      <div
        className={cn('flex-1 min-w-0', isSelectable && 'cursor-pointer')}
        onClick={handleClick}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3
              className="font-medium text-sm leading-tight cursor-pointer hover:text-primary transition-colors line-clamp-1"
              onClick={handleOpen}
              title={node.title}
            >
              {node.title || url}
            </h3>

            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-muted-foreground line-clamp-1">{getDomain(url)}</p>
              {isBroken && (
                <Badge variant="destructive" className="text-xs px-1 py-0">
                  失效
                </Badge>
              )}
              {isUnreachable && (
                <Badge variant="outline" className="text-xs px-1 py-0 text-orange-600">
                  无法连接
                </Badge>
              )}
            </div>

            {/* 所在文件夹路径 */}
            {!compact && node.path && (
              <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground/80">
                <FolderOpen className="h-3 w-3" />
                <span className="line-clamp-1">{node.path}</span>
              </div>
            )}

            {/* 标签 */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.slice(0, 3).map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-xs px-1.5 py-0 cursor-pointer hover:bg-secondary/80"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTagClick?.(tag);
                    }}
                  >
                    {tag}
                  </Badge>
                ))}
                {tags.length > 3 && (
                  <Badge variant="outline" className="text-xs px-1.5 py-0">
                    +{tags.length - 3}
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* 悬浮操作 */}
          <div
            className={cn(
              'flex items-center gap-1 transition-opacity',
              showActions ? 'opacity-100' : 'opacity-0'
            )}
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                onFavorite?.();
              }}
            >
              <Heart className={cn('h-4 w-4', isFavorite && 'fill-red-500 text-red-500')} />
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
                <PencilIcon />
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
                <TrashIcon />
              </Button>
            )}
          </div>
        </div>

        {/* 底部信息 */}
        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
          {node.dateAdded && <span>添加于 {formatRelativeTime(node.dateAdded)}</span>}
          {meta?.visitCount ? <span>· 访问 {meta.visitCount} 次</span> : null}
        </div>
      </div>
    </div>
  );
}

function PencilIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-3l4.586-4.586a2 2 0 012.828 0z"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 011-1h2a1 1 0 011 1v3a1 1 0 01-1 1h-3z"
      />
    </svg>
  );
}
