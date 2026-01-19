// 内容类型徽章组件

import * as React from 'react';
import {
  FileText,
  Video,
  Book,
  Wrench,
  Users,
  ShoppingBag,
  GitBranch,
  Newspaper,
  MessageSquare,
  File,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import type { ContentType } from '@/types';

interface ContentTypeBadgeProps {
  type: ContentType;
  showLabel?: boolean;
  className?: string;
}

const typeConfig: Record<ContentType, { icon: React.ElementType; label: string; color: string }> = {
  article: { icon: FileText, label: '文章', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  video: { icon: Video, label: '视频', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
  documentation: { icon: Book, label: '文档', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  tool: { icon: Wrench, label: '工具', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' },
  social: { icon: Users, label: '社交', color: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300' },
  shopping: { icon: ShoppingBag, label: '购物', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' },
  repository: { icon: GitBranch, label: '代码库', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  blog: { icon: Newspaper, label: '博客', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300' },
  forum: { icon: MessageSquare, label: '论坛', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
  other: { icon: File, label: '其他', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
};

export function ContentTypeBadge({ type, showLabel = true, className }: ContentTypeBadgeProps) {
  const config = typeConfig[type] || typeConfig.other;
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={cn('gap-1 border-0', config.color, className)}>
      <Icon className="h-3 w-3" />
      {showLabel && <span>{config.label}</span>}
    </Badge>
  );
}

export function getContentTypeIcon(type: ContentType): React.ElementType {
  return typeConfig[type]?.icon || File;
}

export function getContentTypeLabel(type: ContentType): string {
  return typeConfig[type]?.label || '其他';
}
