// 统计卡片组件

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Bookmark, Folder, Calendar, TrendingUp, Star, Archive, Sparkles, Globe } from 'lucide-react';
import type { BookmarkProfile } from '@/types/profile';

interface ProfileStatsProps {
  profile: BookmarkProfile;
  className?: string;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subValue?: string;
  color: string;
}

function StatCard({ icon, label, value, subValue, color }: StatCardProps) {
  return React.createElement('div', {
    className: 'flex flex-col items-center p-4 rounded-xl bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow',
  },
    React.createElement('div', {
      className: 'p-2 rounded-lg mb-2',
      style: { backgroundColor: `${color}15` },
    },
      React.createElement('span', { style: { color } }, icon)
    ),
    React.createElement('div', {
      className: 'text-2xl font-bold tabular-nums',
      style: { color },
    }, value),
    React.createElement('div', { className: 'text-sm text-gray-500' }, label),
    subValue && React.createElement('div', { className: 'text-xs text-gray-400 mt-1' }, subValue)
  );
}

export function ProfileStats({ profile, className }: ProfileStatsProps) {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  };

  return React.createElement('div', {
    className: cn('grid grid-cols-2 md:grid-cols-4 gap-4', className),
  },
    React.createElement(StatCard, {
      icon: React.createElement(Bookmark, { size: 20 }),
      label: '书签总数',
      value: profile.totalBookmarks.toLocaleString(),
      color: '#3B82F6',
    }),
    React.createElement(StatCard, {
      icon: React.createElement(Folder, { size: 20 }),
      label: '文件夹',
      value: profile.totalFolders,
      color: '#8B5CF6',
    }),
    React.createElement(StatCard, {
      icon: React.createElement(Calendar, { size: 20 }),
      label: '收藏天数',
      value: profile.collectionDays,
      subValue: `始于 ${formatDate(profile.collectionStartDate)}`,
      color: '#10B981',
    }),
    React.createElement(StatCard, {
      icon: React.createElement(TrendingUp, { size: 20 }),
      label: '月均收藏',
      value: profile.averagePerMonth,
      color: '#F59E0B',
    }),
    React.createElement(StatCard, {
      icon: React.createElement(Globe, { size: 20 }),
      label: '独立域名',
      value: profile.uniqueDomains,
      subValue: `HTTPS ${Math.round(profile.httpsRatio * 100)}%`,
      color: '#06B6D4',
    }),
    React.createElement(StatCard, {
      icon: React.createElement(Star, { size: 20 }),
      label: '收藏夹',
      value: profile.favoriteCount,
      color: '#EAB308',
    }),
    React.createElement(StatCard, {
      icon: React.createElement(Archive, { size: 20 }),
      label: '已归档',
      value: profile.archivedCount,
      color: '#6B7280',
    }),
    React.createElement(StatCard, {
      icon: React.createElement(Sparkles, { size: 20 }),
      label: 'AI 生成',
      value: profile.aiGeneratedCount,
      color: '#EC4899',
    })
  );
}
