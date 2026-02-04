// 组织度评分组件

import * as React from 'react';
import { cn } from '@/lib/utils';
import { CircularProgress } from '@/components/ui/CircularProgress';

interface OrganizationScoreProps {
  score: number;
  className?: string;
}

export function OrganizationScore({ score, className }: OrganizationScoreProps) {
  const getScoreColor = (s: number) => {
    if (s >= 80) return '#10B981'; // green
    if (s >= 60) return '#3B82F6'; // blue
    if (s >= 40) return '#F59E0B'; // amber
    return '#EF4444'; // red
  };

  const getScoreLabel = (s: number) => {
    if (s >= 80) return '优秀';
    if (s >= 60) return '良好';
    if (s >= 40) return '一般';
    return '待改进';
  };

  const color = getScoreColor(score);
  const label = getScoreLabel(score);

  return React.createElement('div', {
    className: cn('flex items-center gap-4', className),
  },
    React.createElement(CircularProgress, {
      progress: score,
      size: 80,
      strokeWidth: 6,
      color: color,
    },
      React.createElement('div', { className: 'text-center' },
        React.createElement('div', {
          className: 'text-xl font-bold tabular-nums',
          style: { color },
        }, score),
        React.createElement('div', { className: 'text-xs text-gray-400' }, '分')
      )
    ),
    React.createElement('div', { className: 'flex flex-col' },
      React.createElement('div', { className: 'text-sm font-medium text-gray-700' }, '组织度评分'),
      React.createElement('div', {
        className: 'text-lg font-bold',
        style: { color },
      }, label),
      React.createElement('div', { className: 'text-xs text-gray-400 mt-1' },
        '基于文件夹使用、标签覆盖等指标'
      )
    )
  );
}
