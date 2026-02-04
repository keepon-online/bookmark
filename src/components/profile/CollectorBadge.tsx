// 收藏家徽章组件

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { CollectorLevel } from '@/types/profile';
import { COLLECTOR_LEVELS } from '@/types/profile';

interface CollectorBadgeProps {
  level: CollectorLevel;
  score: number;
  title: string;
  size?: 'sm' | 'md' | 'lg';
  showScore?: boolean;
  className?: string;
}

export function CollectorBadge({
  level,
  score,
  title,
  size = 'md',
  showScore = true,
  className,
}: CollectorBadgeProps) {
  const config = COLLECTOR_LEVELS.find(c => c.level === level) || COLLECTOR_LEVELS[0];

  const sizeClasses = {
    sm: { container: 'p-3', icon: 'text-2xl', title: 'text-sm', score: 'text-xs' },
    md: { container: 'p-4', icon: 'text-4xl', title: 'text-base', score: 'text-sm' },
    lg: { container: 'p-6', icon: 'text-6xl', title: 'text-lg', score: 'text-base' },
  };

  const classes = sizeClasses[size];

  return React.createElement('div', {
    className: cn(
      'flex items-center gap-4 rounded-xl border-2 bg-gradient-to-br from-white to-gray-50',
      classes.container,
      className
    ),
    style: { borderColor: config.color },
  },
    // 图标
    React.createElement('div', {
      className: cn(
        'flex items-center justify-center rounded-full bg-gradient-to-br from-white to-gray-100 shadow-inner',
        size === 'sm' ? 'w-12 h-12' : size === 'md' ? 'w-16 h-16' : 'w-20 h-20'
      ),
      style: { boxShadow: `inset 0 2px 4px ${config.color}20` },
    },
      React.createElement('span', { className: classes.icon }, config.icon)
    ),
    // 信息
    React.createElement('div', { className: 'flex flex-col' },
      React.createElement('div', {
        className: cn('font-bold', classes.title),
        style: { color: config.color },
      }, `Lv.${level} ${title}`),
      showScore && React.createElement('div', {
        className: cn('text-gray-500', classes.score),
      }, `收藏家积分: ${score}`)
    )
  );
}
