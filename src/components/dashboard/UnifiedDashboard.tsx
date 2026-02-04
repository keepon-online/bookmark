// 统一仪表盘组件 - 整合书签档案、数据统计、快速操作

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  RefreshCw,
  Wand2,
  Settings,
  TrendingUp,
  Folder,
  Tag,
  Activity,
  Globe,
  Star,
  Archive,
  Sparkles,
  AlertCircle,
  Copy,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { CircularProgress } from '@/components/ui/CircularProgress';
import { cn } from '@/lib/utils';
import { profileService } from '@/services/profileService';
import type { BookmarkProfile } from '@/types/profile';
import { COLLECTOR_LEVELS, CATEGORY_CONFIGS } from '@/types/profile';

export function UnifiedDashboard() {
  const [profile, setProfile] = useState<BookmarkProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastOrganize, setLastOrganize] = useState<any>(null);
  const [expandedSections, setExpandedSections] = useState({
    categories: true,
    domains: false,
    trends: false,
  });

  const loadData = useCallback(async (forceRefresh = false) => {
    try {
      if (forceRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const [profileData, stored] = await Promise.all([
        profileService.getProfile(forceRefresh),
        chrome.storage.local.get(['lastOrganizeResult', 'lastOrganizeTime']),
      ]);

      setProfile(profileData);
      setLastOrganize(stored);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => loadData(true);

  const handleQuickOrganize = async () => {
    try {
      const { organizerService } = await import('@/services');
      const result = await organizerService.organizeAll({
        strategy: 'auto',
        createNewFolders: true,
        applyTags: true,
        moveBookmarks: true,
        removeDuplicates: false,
        minConfidence: 0.3,
      });

      await chrome.storage.local.set({
        lastOrganizeResult: result,
        lastOrganizeTime: Date.now(),
      });

      await loadData(true);
      alert(`整理完成！\n已处理: ${result.processed}\n已分类: ${result.classified}`);
    } catch (error) {
      alert(`整理失败: ${(error as Error).message}`);
    }
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // 加载状态
  if (isLoading) {
    return React.createElement('div', { className: 'space-y-6' },
      React.createElement('div', { className: 'flex items-center justify-between' },
        React.createElement('h2', { className: 'text-2xl font-bold text-gray-900 flex items-center gap-2' },
          React.createElement(LayoutDashboard, { size: 24 }),
          '仪表盘'
        )
      ),
      React.createElement('div', { className: 'grid grid-cols-4 gap-4' },
        ...Array(4).fill(null).map((_, i) =>
          React.createElement(Skeleton, { key: i, className: 'h-24' })
        )
      ),
      React.createElement(Skeleton, { className: 'h-48' })
    );
  }

  // 错误状态
  if (error) {
    return React.createElement('div', { className: 'space-y-6' },
      React.createElement('h2', { className: 'text-2xl font-bold text-gray-900' }, '仪表盘'),
      React.createElement('div', { className: 'bg-red-50 border border-red-200 rounded-lg p-4' },
        React.createElement('p', { className: 'text-red-800' }, `加载失败: ${error}`),
        React.createElement(Button, { onClick: () => loadData(), className: 'mt-2' }, '重试')
      )
    );
  }

  const levelConfig = profile ? COLLECTOR_LEVELS.find(c => c.level === profile.collectorLevel) : COLLECTOR_LEVELS[0];

  return React.createElement('div', { className: 'space-y-6' },
    // 头部
    React.createElement('div', { className: 'flex items-center justify-between' },
      React.createElement('h2', { className: 'text-2xl font-bold text-gray-900 flex items-center gap-2' },
        React.createElement(LayoutDashboard, { size: 24 }),
        '仪表盘'
      ),
      React.createElement('div', { className: 'flex items-center gap-2' },
        React.createElement(Button, {
          variant: 'outline',
          size: 'sm',
          onClick: handleRefresh,
          disabled: isRefreshing,
        },
          React.createElement(RefreshCw, { size: 16, className: cn(isRefreshing && 'animate-spin') }),
          '刷新'
        )
      )
    ),

    // 收藏家徽章 + 组织度
    profile && React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-2 gap-4' },
      // 收藏家徽章
      React.createElement(Card, null,
        React.createElement(CardContent, { className: 'p-4' },
          React.createElement('div', { className: 'flex items-center gap-4' },
            React.createElement('div', {
              className: 'w-16 h-16 rounded-full flex items-center justify-center text-3xl',
              style: { backgroundColor: `${levelConfig?.color}20` },
            }, levelConfig?.icon),
            React.createElement('div', null,
              React.createElement('div', {
                className: 'text-lg font-bold',
                style: { color: levelConfig?.color },
              }, `Lv.${profile.collectorLevel} ${profile.collectorTitle}`),
              React.createElement('div', { className: 'text-sm text-gray-500' },
                `收藏家积分: ${profile.collectorScore}`
              )
            )
          )
        )
      ),
      // 组织度评分
      React.createElement(Card, null,
        React.createElement(CardContent, { className: 'p-4' },
          React.createElement('div', { className: 'flex items-center gap-4' },
            React.createElement(CircularProgress, {
              progress: profile.organizationScore,
              size: 64,
              strokeWidth: 5,
              color: profile.organizationScore >= 80 ? '#10B981' : profile.organizationScore >= 60 ? '#3B82F6' : '#F59E0B',
            },
              React.createElement('span', { className: 'text-lg font-bold' }, profile.organizationScore)
            ),
            React.createElement('div', null,
              React.createElement('div', { className: 'text-sm font-medium text-gray-700' }, '组织度评分'),
              React.createElement('div', {
                className: 'text-lg font-bold',
                style: { color: profile.organizationScore >= 80 ? '#10B981' : profile.organizationScore >= 60 ? '#3B82F6' : '#F59E0B' },
              }, profile.organizationScore >= 80 ? '优秀' : profile.organizationScore >= 60 ? '良好' : '待改进')
            )
          )
        )
      )
    ),

    // 核心统计
    profile && React.createElement('div', { className: 'grid grid-cols-2 md:grid-cols-4 gap-4' },
      React.createElement(StatCard, { icon: Activity, label: '书签总数', value: profile.totalBookmarks, color: '#3B82F6' }),
      React.createElement(StatCard, { icon: Folder, label: '文件夹', value: profile.totalFolders, color: '#8B5CF6' }),
      React.createElement(StatCard, { icon: Tag, label: '标签', value: profile.totalTags, color: '#10B981' }),
      React.createElement(StatCard, { icon: TrendingUp, label: '月均收藏', value: profile.averagePerMonth, color: '#F59E0B' }),
      React.createElement(StatCard, { icon: Globe, label: '独立域名', value: profile.uniqueDomains, color: '#06B6D4', subValue: `HTTPS ${Math.round(profile.httpsRatio * 100)}%` }),
      React.createElement(StatCard, { icon: Star, label: '收藏夹', value: profile.favoriteCount, color: '#EAB308' }),
      React.createElement(StatCard, { icon: Sparkles, label: 'AI 生成', value: profile.aiGeneratedCount, color: '#EC4899' }),
      React.createElement(StatCard, { icon: AlertCircle, label: '失效链接', value: profile.brokenCount, color: '#EF4444' })
    ),

    // 快速操作
    React.createElement(Card, null,
      React.createElement(CardHeader, { className: 'pb-2' },
        React.createElement(CardTitle, { className: 'text-base' }, '快速操作')
      ),
      React.createElement(CardContent, null,
        React.createElement('div', { className: 'grid grid-cols-3 gap-3' },
          React.createElement(Button, {
            onClick: handleQuickOrganize,
            className: 'bg-purple-600 hover:bg-purple-700',
          },
            React.createElement(Wand2, { size: 16 }),
            '整理书签'
          ),
          React.createElement(Button, {
            variant: 'outline',
            onClick: () => { window.location.hash = 'organizer'; },
          },
            React.createElement(Settings, { size: 16 }),
            '高级整理'
          ),
          React.createElement(Button, {
            variant: 'outline',
            onClick: () => { window.location.hash = 'health'; },
          },
            React.createElement(Activity, { size: 16 }),
            '链接检查'
          )
        )
      )
    ),

    // 分类分布 (可折叠)
    profile && React.createElement(CollapsibleSection, {
      title: '分类分布',
      expanded: expandedSections.categories,
      onToggle: () => toggleSection('categories'),
    },
      React.createElement('div', { className: 'flex flex-wrap gap-2' },
        ...Object.entries(profile.categoryDistribution)
          .filter(([, count]) => count > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([category, count]) => {
            const config = CATEGORY_CONFIGS.find(c => c.id === category);
            if (!config) return null;
            const percentage = Math.round((count / profile.totalBookmarks) * 100);
            return React.createElement('div', {
              key: category,
              className: 'flex items-center gap-2 px-3 py-2 rounded-full border',
              style: { borderColor: config.color, backgroundColor: `${config.color}10` },
            },
              React.createElement('span', null, config.icon),
              React.createElement('span', { style: { color: config.color }, className: 'font-medium' }, config.name.zh),
              React.createElement('span', { className: 'text-xs text-gray-500' }, `${count} (${percentage}%)`)
            );
          })
      )
    ),

    // 常用域名 (可折叠)
    profile && profile.topDomains.length > 0 && React.createElement(CollapsibleSection, {
      title: '常用域名 Top 5',
      expanded: expandedSections.domains,
      onToggle: () => toggleSection('domains'),
    },
      React.createElement('div', { className: 'space-y-2' },
        ...profile.topDomains.slice(0, 5).map((domain, i) =>
          React.createElement('div', {
            key: domain.domain,
            className: 'flex items-center gap-3',
          },
            React.createElement('span', {
              className: cn('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                i < 3 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'),
            }, i + 1),
            React.createElement('span', { className: 'flex-1 text-sm truncate' }, domain.domain),
            React.createElement('span', { className: 'text-xs text-gray-500' },
              `${domain.count} (${Math.round(domain.percentage * 100)}%)`
            )
          )
        )
      )
    ),

    // 收藏趋势 (可折叠)
    profile && profile.yearlyTrend.length > 1 && React.createElement(CollapsibleSection, {
      title: '年度收藏趋势',
      expanded: expandedSections.trends,
      onToggle: () => toggleSection('trends'),
    },
      React.createElement('div', { className: 'flex items-end gap-2 h-24' },
        ...profile.yearlyTrend.map(point => {
          const maxCount = Math.max(...profile.yearlyTrend.map(p => p.count));
          const height = maxCount > 0 ? (point.count / maxCount) * 100 : 0;
          return React.createElement('div', {
            key: point.period,
            className: 'flex-1 flex flex-col items-center gap-1',
          },
            React.createElement('span', { className: 'text-xs text-gray-600' }, point.count),
            React.createElement('div', {
              className: 'w-full bg-blue-500 rounded-t',
              style: { height: `${height}%`, minHeight: point.count > 0 ? '4px' : '0' },
            }),
            React.createElement('span', { className: 'text-xs text-gray-500' }, point.period)
          );
        })
      )
    ),

    // 上次整理结果
    lastOrganize?.lastOrganizeResult && React.createElement(Card, { className: 'bg-green-50 border-green-200' },
      React.createElement(CardHeader, { className: 'pb-2' },
        React.createElement(CardTitle, { className: 'text-base text-green-900' }, '上次整理结果')
      ),
      React.createElement(CardContent, null,
        React.createElement('div', { className: 'grid grid-cols-4 gap-4 mb-2' },
          React.createElement(MiniStat, { label: '已处理', value: lastOrganize.lastOrganizeResult.processed }),
          React.createElement(MiniStat, { label: '已分类', value: lastOrganize.lastOrganizeResult.classified }),
          React.createElement(MiniStat, { label: '已加标签', value: lastOrganize.lastOrganizeResult.tagged }),
          React.createElement(MiniStat, { label: '已移动', value: lastOrganize.lastOrganizeResult.moved })
        ),
        lastOrganize.lastOrganizeTime && React.createElement('div', { className: 'text-xs text-gray-600' },
          `整理时间: ${new Date(lastOrganize.lastOrganizeTime).toLocaleString()}`
        )
      )
    ),

    // 生成时间
    profile && React.createElement('div', { className: 'text-xs text-gray-400 text-right' },
      `数据更新于 ${new Date(profile.generatedAt).toLocaleString()}`
    )
  );
}

// 统计卡片
function StatCard({ icon: Icon, label, value, color, subValue }: {
  icon: any;
  label: string;
  value: number | string;
  color: string;
  subValue?: string;
}) {
  return React.createElement('div', {
    className: 'bg-white p-4 rounded-xl border shadow-sm',
  },
    React.createElement('div', { className: 'flex items-center gap-2 mb-2' },
      React.createElement('div', {
        className: 'p-1.5 rounded-lg',
        style: { backgroundColor: `${color}15` },
      },
        React.createElement(Icon, { size: 16, style: { color } })
      ),
      React.createElement('span', { className: 'text-sm text-gray-600' }, label)
    ),
    React.createElement('div', { className: 'text-2xl font-bold tabular-nums', style: { color } }, value),
    subValue && React.createElement('div', { className: 'text-xs text-gray-400 mt-1' }, subValue)
  );
}

// 迷你统计
function MiniStat({ label, value }: { label: string; value: number }) {
  return React.createElement('div', null,
    React.createElement('div', { className: 'text-xl font-bold text-green-700' }, value),
    React.createElement('div', { className: 'text-xs text-gray-600' }, label)
  );
}

// 可折叠区块
function CollapsibleSection({ title, expanded, onToggle, children }: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return React.createElement(Card, null,
    React.createElement('button', {
      onClick: onToggle,
      className: 'w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors',
    },
      React.createElement('span', { className: 'font-medium text-gray-900' }, title),
      expanded
        ? React.createElement(ChevronUp, { size: 20, className: 'text-gray-400' })
        : React.createElement(ChevronDown, { size: 20, className: 'text-gray-400' })
    ),
    expanded && React.createElement(CardContent, { className: 'pt-0' }, children)
  );
}
