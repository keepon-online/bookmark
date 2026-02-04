// 趋势图组件

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { TrendDataPoint } from '@/types/profile';

interface TrendChartProps {
  data: TrendDataPoint[];
  title: string;
  color?: string;
  height?: number;
  className?: string;
}

export function TrendChart({
  data,
  title,
  color = '#3B82F6',
  height = 160,
  className,
}: TrendChartProps) {
  if (data.length === 0) {
    return React.createElement('div', {
      className: cn('text-center text-gray-500 py-8', className),
    }, '暂无趋势数据');
  }

  const maxCount = Math.max(...data.map(d => d.count), 1);
  const padding = 40;
  const chartWidth = Math.max(data.length * 60, 300);
  const chartHeight = height - padding * 2;

  // 生成柱状图
  const barWidth = Math.min(40, (chartWidth - padding * 2) / data.length - 8);

  return React.createElement('div', { className: cn('space-y-2', className) },
    React.createElement('h4', { className: 'text-sm font-medium text-gray-700' }, title),
    React.createElement('div', {
      className: 'overflow-x-auto',
      style: { maxWidth: '100%' },
    },
      React.createElement('svg', {
        width: chartWidth,
        height: height,
        className: 'min-w-full',
      },
        // Y 轴网格线
        ...[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
          const y = padding + chartHeight * (1 - ratio);
          return React.createElement('g', { key: `grid-${i}` },
            React.createElement('line', {
              x1: padding,
              y1: y,
              x2: chartWidth - padding,
              y2: y,
              stroke: '#E5E7EB',
              strokeDasharray: ratio === 0 ? 'none' : '4,4',
            }),
            React.createElement('text', {
              x: padding - 8,
              y: y + 4,
              textAnchor: 'end',
              className: 'text-xs fill-gray-400',
            }, Math.round(maxCount * ratio))
          );
        }),
        // 柱状图
        ...data.map((point, index) => {
          const x = padding + index * (barWidth + 8) + barWidth / 2;
          const barHeight = (point.count / maxCount) * chartHeight;
          const y = padding + chartHeight - barHeight;

          return React.createElement('g', { key: point.period },
            // 柱子
            React.createElement('rect', {
              x: x - barWidth / 2,
              y: y,
              width: barWidth,
              height: barHeight,
              rx: 4,
              fill: color,
              opacity: 0.8,
              className: 'hover:opacity-100 transition-opacity cursor-pointer',
            },
              React.createElement('title', null, `${point.period}: ${point.count}`)
            ),
            // X 轴标签
            React.createElement('text', {
              x: x,
              y: height - 8,
              textAnchor: 'middle',
              className: 'text-xs fill-gray-500',
            }, point.period.length > 7 ? point.period.slice(5) : point.period),
            // 数值标签
            point.count > 0 && React.createElement('text', {
              x: x,
              y: y - 4,
              textAnchor: 'middle',
              className: 'text-xs fill-gray-600 font-medium',
            }, point.count)
          );
        })
      )
    )
  );
}
