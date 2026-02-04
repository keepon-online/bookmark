// 书签档案主组件

import * as React from 'react';
import { cn } from '@/lib/utils';
import { RefreshCw, Share2, FileText } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { profileService } from '@/services/profileService';
import type { BookmarkProfile as ProfileType } from '@/types/profile';
import { CollectorBadge } from './CollectorBadge';
import { ProfileStats } from './ProfileStats';
import { CategoryTags } from './CategoryTags';
import { DomainChart } from './DomainChart';
import { TrendChart } from './TrendChart';
import { OrganizationScore } from './OrganizationScore';

interface BookmarkProfileProps {
  className?: string;
  onShare?: (profile: ProfileType) => void;
}

export function BookmarkProfile({ className, onShare }: BookmarkProfileProps) {
  const [profile, setProfile] = React.useState<ProfileType | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadProfile = React.useCallback(async (forceRefresh = false) => {
    try {
      if (forceRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const data = await profileService.getProfile(forceRefresh);
      setProfile(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleRefresh = () => {
    loadProfile(true);
  };

  const handleShare = () => {
    if (profile && onShare) {
      onShare(profile);
    }
  };

  // 加载状态
  if (isLoading) {
    return React.createElement(Card, { className },
      React.createElement(CardHeader, null,
        React.createElement(CardTitle, { className: 'flex items-center gap-2' },
          React.createElement(FileText, { size: 20 }),
          '书签档案'
        )
      ),
      React.createElement(CardContent, { className: 'space-y-4' },
        React.createElement(Skeleton, { className: 'h-24 w-full' }),
        React.createElement('div', { className: 'grid grid-cols-4 gap-4' },
          ...Array(4).fill(null).map((_, i) =>
            React.createElement(Skeleton, { key: i, className: 'h-20' })
          )
        ),
        React.createElement(Skeleton, { className: 'h-40 w-full' })
      )
    );
  }

  // 错误状态
  if (error) {
    return React.createElement(Card, { className },
      React.createElement(CardHeader, null,
        React.createElement(CardTitle, { className: 'flex items-center gap-2' },
          React.createElement(FileText, { size: 20 }),
          '书签档案'
        )
      ),
      React.createElement(CardContent, null,
        React.createElement('div', { className: 'text-center py-8' },
          React.createElement('p', { className: 'text-red-500 mb-4' }, `加载失败: ${error}`),
          React.createElement(Button, { onClick: () => loadProfile() }, '重试')
        )
      )
    );
  }

  // 无数据状态
  if (!profile || profile.totalBookmarks === 0) {
    return React.createElement(Card, { className },
      React.createElement(CardHeader, null,
        React.createElement(CardTitle, { className: 'flex items-center gap-2' },
          React.createElement(FileText, { size: 20 }),
          '书签档案'
        )
      ),
      React.createElement(CardContent, null,
        React.createElement('div', { className: 'text-center py-8 text-gray-500' },
          '暂无书签数据，开始收藏你的第一个书签吧！'
        )
      )
    );
  }

  return React.createElement(Card, { className },
    // 头部
    React.createElement(CardHeader, null,
      React.createElement('div', { className: 'flex items-center justify-between' },
        React.createElement(CardTitle, { className: 'flex items-center gap-2' },
          React.createElement(FileText, { size: 20 }),
          '书签档案'
        ),
        React.createElement('div', { className: 'flex items-center gap-2' },
          React.createElement(Button, {
            variant: 'outline',
            size: 'sm',
            onClick: handleRefresh,
            disabled: isRefreshing,
          },
            React.createElement(RefreshCw, {
              size: 16,
              className: cn(isRefreshing && 'animate-spin'),
            }),
            '刷新'
          ),
          onShare && React.createElement(Button, {
            variant: 'outline',
            size: 'sm',
            onClick: handleShare,
          },
            React.createElement(Share2, { size: 16 }),
            '分享'
          )
        )
      )
    ),

    // 内容
    React.createElement(CardContent, { className: 'space-y-6' },
      // 收藏家徽章
      React.createElement(CollectorBadge, {
        level: profile.collectorLevel,
        score: profile.collectorScore,
        title: profile.collectorTitle,
        size: 'md',
      }),

      // 统计卡片
      React.createElement('div', null,
        React.createElement('h3', { className: 'text-sm font-medium text-gray-500 mb-3' }, '基础统计'),
        React.createElement(ProfileStats, { profile })
      ),

      // 组织度评分
      React.createElement('div', { className: 'p-4 bg-gray-50 rounded-xl' },
        React.createElement(OrganizationScore, { score: profile.organizationScore })
      ),

      // 分类分布
      React.createElement('div', null,
        React.createElement('h3', { className: 'text-sm font-medium text-gray-500 mb-3' }, '分类分布'),
        React.createElement(CategoryTags, {
          distribution: profile.categoryDistribution,
          primaryCategory: profile.primaryCategory,
          totalBookmarks: profile.totalBookmarks,
        })
      ),

      // 常用域名
      React.createElement('div', null,
        React.createElement('h3', { className: 'text-sm font-medium text-gray-500 mb-3' }, '常用域名 Top 8'),
        React.createElement(DomainChart, { domains: profile.topDomains })
      ),

      // 年度趋势
      profile.yearlyTrend.length > 1 && React.createElement('div', null,
        React.createElement(TrendChart, {
          data: profile.yearlyTrend,
          title: '年度收藏趋势',
          color: '#3B82F6',
        })
      ),

      // 月度趋势
      profile.monthlyTrend.length > 1 && React.createElement('div', null,
        React.createElement(TrendChart, {
          data: profile.monthlyTrend,
          title: '近12个月收藏趋势',
          color: '#10B981',
        })
      ),

      // 生成时间
      React.createElement('div', { className: 'text-xs text-gray-400 text-right' },
        `档案生成于 ${new Date(profile.generatedAt).toLocaleString()}`
      )
    )
  );
}
