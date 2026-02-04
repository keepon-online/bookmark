// 域名分布图组件

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { DomainStats } from '@/types/profile';
import { CATEGORY_COLORS } from '@/types/profile';

interface DomainChartProps {
  domains: DomainStats[];
  className?: string;
}

export function DomainChart({ domains, className }: DomainChartProps) {
  if (domains.length === 0) {
    return React.createElement('div', {
      className: cn('text-center text-gray-500 py-8', className),
    }, '暂无域名数据');
  }

  // 取前 8 个域名
  const topDomains = domains.slice(0, 8);
  const maxCount = Math.max(...topDomains.map(d => d.count));

  return React.createElement('div', { className: cn('space-y-3', className) },
    ...topDomains.map((domain, index) => {
      const percentage = Math.round(domain.percentage * 100);
      const barWidth = (domain.count / maxCount) * 100;
      const color = domain.category ? CATEGORY_COLORS[domain.category] : '#6B7280';

      return React.createElement('div', {
        key: domain.domain,
        className: 'flex items-center gap-3',
      },
        // 排名
        React.createElement('div', {
          className: cn(
            'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
            index < 3 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
          ),
        }, index + 1),
        // 域名和进度条
        React.createElement('div', { className: 'flex-1 min-w-0' },
          React.createElement('div', { className: 'flex items-center justify-between mb-1' },
            React.createElement('span', {
              className: 'text-sm font-medium text-gray-700 truncate',
              title: domain.domain,
            }, domain.domain),
            React.createElement('span', {
              className: 'text-xs text-gray-500 tabular-nums ml-2',
            }, `${domain.count} (${percentage}%)`)
          ),
          React.createElement('div', {
            className: 'h-2 bg-gray-100 rounded-full overflow-hidden',
          },
            React.createElement('div', {
              className: 'h-full rounded-full transition-all duration-500',
              style: {
                width: `${barWidth}%`,
                backgroundColor: color,
              },
            })
          )
        )
      );
    })
  );
}
