// 分类标签组件

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { BookmarkCategory } from '@/types/profile';
import { CATEGORY_CONFIGS } from '@/types/profile';

interface CategoryTagsProps {
  distribution: Record<BookmarkCategory, number>;
  primaryCategory: BookmarkCategory;
  totalBookmarks: number;
  className?: string;
}

export function CategoryTags({
  distribution,
  primaryCategory,
  totalBookmarks,
  className,
}: CategoryTagsProps) {
  // 按数量排序，过滤掉数量为 0 的分类
  const sortedCategories = Object.entries(distribution)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6); // 最多显示 6 个

  if (sortedCategories.length === 0) {
    return React.createElement('div', {
      className: cn('text-center text-gray-500 py-4', className),
    }, '暂无分类数据');
  }

  return React.createElement('div', { className: cn('space-y-3', className) },
    React.createElement('div', { className: 'flex flex-wrap gap-2' },
      ...sortedCategories.map(([category, count]) => {
        const config = CATEGORY_CONFIGS.find(c => c.id === category);
        if (!config) return null;

        const percentage = totalBookmarks > 0 ? Math.round((count / totalBookmarks) * 100) : 0;
        const isPrimary = category === primaryCategory;

        return React.createElement('div', {
          key: category,
          className: cn(
            'flex items-center gap-2 px-3 py-2 rounded-full border transition-all',
            isPrimary ? 'border-2 shadow-sm' : 'border'
          ),
          style: {
            borderColor: config.color,
            backgroundColor: isPrimary ? `${config.color}10` : 'white',
          },
        },
          React.createElement('span', { className: 'text-base' }, config.icon),
          React.createElement('span', {
            className: cn('font-medium', isPrimary && 'font-bold'),
            style: { color: config.color },
          }, config.name.zh),
          React.createElement('span', {
            className: 'text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 tabular-nums',
          }, `${count} (${percentage}%)`)
        );
      })
    )
  );
}
