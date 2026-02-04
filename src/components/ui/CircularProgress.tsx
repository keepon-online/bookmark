// 圆形进度环组件

import * as React from 'react';
import { cn } from '@/lib/utils';

interface CircularProgressProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  bgColor?: string;
  showValue?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function CircularProgress({
  progress,
  size = 120,
  strokeWidth = 8,
  color = '#3B82F6',
  bgColor = '#E5E7EB',
  showValue = false,
  className,
  children,
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (Math.min(100, Math.max(0, progress)) / 100) * circumference;

  return React.createElement('div', {
    className: cn('relative inline-flex items-center justify-center', className),
    style: { width: size, height: size },
  },
    React.createElement('svg', {
      width: size,
      height: size,
      className: 'transform -rotate-90',
    },
      // 背景圆环
      React.createElement('circle', {
        cx: size / 2,
        cy: size / 2,
        r: radius,
        fill: 'transparent',
        stroke: bgColor,
        strokeWidth: strokeWidth,
      }),
      // 进度圆环
      React.createElement('circle', {
        cx: size / 2,
        cy: size / 2,
        r: radius,
        fill: 'transparent',
        stroke: color,
        strokeWidth: strokeWidth,
        strokeLinecap: 'round',
        strokeDasharray: circumference,
        strokeDashoffset: offset,
        className: 'transition-all duration-500 ease-out',
      })
    ),
    // 中心内容
    React.createElement('div', {
      className: 'absolute inset-0 flex items-center justify-center',
    },
      children || (showValue && React.createElement('span', {
        className: 'text-2xl font-bold tabular-nums',
        style: { color },
      }, Math.round(progress)))
    )
  );
}
