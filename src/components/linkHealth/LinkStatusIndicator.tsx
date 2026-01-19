// 链接状态指示器组件

import * as React from 'react';
import { CheckCircle, XCircle, Clock, AlertTriangle, HelpCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { linkHealthService } from '@/services/linkHealthService';
import { httpChecker } from '@/lib/httpChecker';
import type { BookmarkStatus } from '@/types';

interface LinkStatusIndicatorProps {
  bookmarkId: string;
  status: BookmarkStatus;
  url: string;
  onStatusChange?: (newStatus: BookmarkStatus) => void;
  showCheckButton?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function LinkStatusIndicator({
  bookmarkId,
  status,
  url,
  onStatusChange,
  showCheckButton = false,
  size = 'sm',
  className,
}: LinkStatusIndicatorProps) {
  const [isChecking, setIsChecking] = React.useState(false);
  const [currentStatus, setCurrentStatus] = React.useState(status);

  // 执行检查
  const handleCheck = async () => {
    setIsChecking(true);
    try {
      const result = await linkHealthService.checkBookmark(bookmarkId);
      if (result) {
        const newStatus = result.isAccessible ? 'active' : 'broken';
        setCurrentStatus(newStatus);
        onStatusChange?.(newStatus);
      }
    } catch (error) {
      console.error('Check failed:', error);
    } finally {
      setIsChecking(false);
    }
  };

  const iconSize = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  const statusConfig: Record<BookmarkStatus, { icon: React.ElementType; color: string; label: string }> = {
    active: {
      icon: CheckCircle,
      color: 'text-green-500',
      label: '正常',
    },
    broken: {
      icon: XCircle,
      color: 'text-red-500',
      label: '失效',
    },
    pending: {
      icon: HelpCircle,
      color: 'text-gray-400',
      label: '未检查',
    },
  };

  const config = statusConfig[currentStatus];
  const Icon = isChecking ? Loader2 : config.icon;

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Icon
        className={cn(
          iconSize,
          isChecking ? 'animate-spin text-muted-foreground' : config.color
        )}
      />
      {showCheckButton && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={handleCheck}
          disabled={isChecking}
        >
          {isChecking ? '检查中' : '检查'}
        </Button>
      )}
    </div>
  );
}

// 状态徽章版本
interface LinkStatusBadgeProps {
  status: BookmarkStatus;
  responseTime?: number;
  className?: string;
}

export function LinkStatusBadge({ status, responseTime, className }: LinkStatusBadgeProps) {
  const config: Record<BookmarkStatus, { bg: string; text: string; label: string }> = {
    active: {
      bg: 'bg-green-100 dark:bg-green-900/30',
      text: 'text-green-700 dark:text-green-400',
      label: '正常',
    },
    broken: {
      bg: 'bg-red-100 dark:bg-red-900/30',
      text: 'text-red-700 dark:text-red-400',
      label: '失效',
    },
    pending: {
      bg: 'bg-gray-100 dark:bg-gray-800',
      text: 'text-gray-600 dark:text-gray-400',
      label: '未检查',
    },
  };

  const { bg, text, label } = config[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
        bg,
        text,
        className
      )}
    >
      {label}
      {responseTime !== undefined && responseTime > 0 && (
        <span className="opacity-70">({responseTime}ms)</span>
      )}
    </span>
  );
}
