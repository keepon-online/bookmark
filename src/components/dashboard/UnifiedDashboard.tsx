// 统一仪表盘组件 - 整合书签档案、数据统计、健康评分与快捷操作

import * as React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LayoutDashboard,
  RefreshCw,
  Wand2,
  TrendingUp,
  Folder,
  Tag,
  Activity,
  Globe,
  Star,
  Sparkles,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  HeartPulse,
  Database,
  Calendar,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { CircularProgress } from '@/components/ui/CircularProgress';
import { cn } from '@/lib/utils';
import { profileService } from '@/services/profileService';
import { useBrowserBookmarkStore } from '@/stores';
import type { BookmarkProfile } from '@/types/profile';
import { COLLECTOR_LEVELS, CATEGORY_CONFIGS } from '@/types/profile';

export function UnifiedDashboard() {
  const [profile, setProfile] = useState<BookmarkProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trendView, setTrendView] = useState<'yearly' | 'monthly'>('yearly');

  const [expandedSections, setExpandedSections] = useState({
    categories: true,
    domains: true,
    trends: true,
  });

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // 确保浏览器书签快照就绪，然后纯计算档案
      await useBrowserBookmarkStore.getState().init();
      const store = useBrowserBookmarkStore.getState();
      const profileData = profileService.getProfile({
        bookmarks: store.bookmarks,
        folders: store.folders,
        meta: store.meta,
      });
      setProfile(profileData);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // init() 内部会 refresh 全量快照，无需在此重复拉取
      await loadData();
    } finally {
      setIsRefreshing(false);
    }
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // 组织度维度细分指标：全部直接读档案（profileService 单趟已算好），
  // 不再对书签数组做额外扫描
  const healthMetrics = useMemo(() => {
    if (!profile || profile.totalBookmarks === 0) {
      return { folderedRate: 0, taggedRate: 0, healthyRate: 100, duplicateRate: 0 };
    }
    return {
      folderedRate: profile.folderedRate,
      taggedRate: profile.taggedRate,
      healthyRate: Math.max(
        0,
        Math.round(((profile.totalBookmarks - profile.brokenCount) / profile.totalBookmarks) * 100)
      ),
      duplicateRate: Math.min(
        100,
        Math.round((profile.duplicateCount / profile.totalBookmarks) * 100)
      ),
    };
  }, [profile]);

  // 加载骨架屏
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">仪表盘</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array(8)
            .fill(null)
            .map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  // 错误提示
  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">仪表盘</h2>
        </div>
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-6 text-center space-y-3">
          <p className="text-red-800 dark:text-red-300 text-sm">仪表盘数据加载失败：{error}</p>
          <Button onClick={() => void loadData()} variant="outline" size="sm">
            重新加载
          </Button>
        </div>
      </div>
    );
  }

  const levelConfig = profile
    ? COLLECTOR_LEVELS.find((c) => c.level === profile.collectorLevel) ?? COLLECTOR_LEVELS[0]
    : COLLECTOR_LEVELS[0];

  const trendPoints =
    trendView === 'yearly' ? profile?.yearlyTrend ?? [] : profile?.monthlyTrend.slice(-12) ?? [];
  const maxTrendCount = Math.max(...trendPoints.map((p) => p.count), 1);

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">仪表盘</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="h-8 gap-1.5"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
          刷新数据
        </Button>
      </div>

      {/* 收藏家徽章 + 组织度健康评分 */}
      {profile && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 收藏家等级卡片 */}
          <Card className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800">
            <CardContent className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-inner border border-black/5 dark:border-white/10 shrink-0"
                  style={{ backgroundColor: `${levelConfig.color}20` }}
                >
                  {levelConfig.icon}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold" style={{ color: levelConfig.color }}>
                      Lv.{profile.collectorLevel} {profile.collectorTitle}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {profile.collectorScore} 积分
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground dark:text-zinc-400">
                    已累计收藏 {profile.collectionDays} 天 · 月均新增 {profile.averagePerMonth} 条
                  </p>
                  {profile.collectionStartDate > 0 && (
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground/80 dark:text-zinc-500">
                      <Calendar className="h-3 w-3" />
                      首次收藏于 {new Date(profile.collectionStartDate).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 组织度健康评分卡片 */}
          <Card className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <CircularProgress
                  progress={profile.organizationScore}
                  size={70}
                  strokeWidth={6}
                  color={
                    profile.organizationScore >= 80
                      ? '#10B981'
                      : profile.organizationScore >= 60
                        ? '#3B82F6'
                        : '#F59E0B'
                  }
                >
                  <span className="text-xl font-bold tabular-nums">
                    {profile.organizationScore}
                  </span>
                </CircularProgress>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      组织健康度
                    </span>
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor:
                          profile.organizationScore >= 80
                            ? 'rgba(16, 185, 129, 0.15)'
                            : profile.organizationScore >= 60
                              ? 'rgba(59, 130, 246, 0.15)'
                              : 'rgba(245, 158, 11, 0.15)',
                        color:
                          profile.organizationScore >= 80
                            ? '#10B981'
                            : profile.organizationScore >= 60
                              ? '#3B82F6'
                              : '#F59E0B',
                      }}
                    >
                      {profile.organizationScore >= 80
                        ? '结构优秀'
                        : profile.organizationScore >= 60
                          ? '结构良好'
                          : '建议整理'}
                    </span>
                  </div>
                  {/* 四维指标进度条 */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground dark:text-zinc-400">
                    <div className="flex justify-between">
                      <span>分类整理率:</span>
                      <span className="font-medium text-foreground">{healthMetrics.folderedRate}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>标签标注率:</span>
                      <span className="font-medium text-foreground">{healthMetrics.taggedRate}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>链接正常率:</span>
                      <span className="font-medium text-foreground">{healthMetrics.healthyRate}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>重复冗余率:</span>
                      <span className="font-medium text-foreground">{healthMetrics.duplicateRate}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 核心指标矩阵卡片 */}
      {profile && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <StatCard
            icon={Activity}
            label="书签总数"
            value={profile.totalBookmarks}
            color="#3B82F6"
          />
          <StatCard
            icon={Folder}
            label="目录分类"
            value={profile.totalFolders}
            color="#8B5CF6"
          />
          <StatCard
            icon={Tag}
            label="自定义标签"
            value={profile.totalTags}
            color="#10B981"
          />
          <StatCard
            icon={TrendingUp}
            label="月均新增"
            value={profile.averagePerMonth}
            color="#F59E0B"
          />
          <StatCard
            icon={Globe}
            label="独立域名"
            value={profile.uniqueDomains}
            color="#06B6D4"
            subValue={`HTTPS 占比 ${Math.round(profile.httpsRatio * 100)}%`}
          />
          <StatCard
            icon={Star}
            label="特别收藏"
            value={profile.favoriteCount}
            color="#EAB308"
          />
          <StatCard
            icon={Sparkles}
            label="AI 整理书签"
            value={profile.aiGeneratedCount}
            color="#EC4899"
          />
          <StatCard
            icon={AlertCircle}
            label="失效/超时链接"
            value={profile.brokenCount}
            color={profile.brokenCount > 0 ? '#EF4444' : '#10B981'}
            subValue={profile.brokenCount > 0 ? '建议复查清理' : '链接状态健康'}
          />
        </div>
      )}

      {/* 快捷操作导航卡片 */}
      <Card className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-gray-900 dark:text-gray-100 flex items-center justify-between">
            <span>常用快捷操作</span>
            <span className="text-xs font-normal text-muted-foreground">直达对应设置模块</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Button
              variant="outline"
              className="h-16 flex flex-col items-center justify-center gap-1.5 border-dashed hover:border-primary hover:bg-primary/5 transition-all text-xs"
              onClick={() => {
                window.location.hash = 'organizer';
              }}
            >
              <Wand2 className="h-5 w-5 text-primary" />
              <span>AI 智能分类整理</span>
            </Button>
            <Button
              variant="outline"
              className="h-16 flex flex-col items-center justify-center gap-1.5 border-dashed hover:border-amber-500 hover:bg-amber-500/5 transition-all text-xs"
              onClick={() => {
                window.location.hash = 'organizer';
              }}
            >
              <div className="flex items-center gap-1">
                <Copy className="h-5 w-5 text-amber-500" />
                {profile && profile.duplicateCount > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                    {profile.duplicateCount}
                  </Badge>
                )}
              </div>
              <span>重复书签清理</span>
            </Button>
            <Button
              variant="outline"
              className="h-16 flex flex-col items-center justify-center gap-1.5 border-dashed hover:border-rose-500 hover:bg-rose-500/5 transition-all text-xs"
              onClick={() => {
                window.location.hash = 'health';
              }}
            >
              <div className="flex items-center gap-1">
                <HeartPulse className="h-5 w-5 text-rose-500" />
                {profile && profile.brokenCount > 0 && (
                  <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">
                    {profile.brokenCount}
                  </Badge>
                )}
              </div>
              <span>链接健康检查</span>
            </Button>
            <Button
              variant="outline"
              className="h-16 flex flex-col items-center justify-center gap-1.5 border-dashed hover:border-emerald-500 hover:bg-emerald-500/5 transition-all text-xs"
              onClick={() => {
                window.location.hash = 'bookmarks';
              }}
            >
              <Database className="h-5 w-5 text-emerald-500" />
              <span>备份与导出 JSON</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 分类分布 (可折叠) */}
      {profile && (
        <CollapsibleSection
          title="分类分布"
          badge={`${Object.values(profile.categoryDistribution).filter((c) => c > 0).length} 个分类`}
          expanded={expandedSections.categories}
          onToggle={() => toggleSection('categories')}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {Object.entries(profile.categoryDistribution)
              .filter(([, count]) => count > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([category, count]) => {
                const config = CATEGORY_CONFIGS.find((c) => c.id === category);
                if (!config) return null;
                const percentage = Math.round((count / profile.totalBookmarks) * 100);
                return (
                  <div
                    key={category}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-gray-200 dark:border-zinc-800 bg-background/50 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base shrink-0">{config.icon}</span>
                      <span className="text-xs font-medium truncate text-gray-800 dark:text-gray-200">
                        {config.name.zh}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-bold tabular-nums text-foreground">
                        {count}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-1">
                        ({percentage}%)
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </CollapsibleSection>
      )}

      {/* 常用域名 Top 5 (可折叠) */}
      {profile && profile.topDomains.length > 0 && (
        <CollapsibleSection
          title="常用域名 Top 5"
          badge={`涵盖 ${profile.uniqueDomains} 个独立域名`}
          expanded={expandedSections.domains}
          onToggle={() => toggleSection('domains')}
        >
          <div className="space-y-2.5">
            {profile.topDomains.slice(0, 5).map((domain, i) => (
              <div
                key={domain.domain}
                className="flex items-center gap-3 p-2 rounded-lg border border-gray-100 dark:border-zinc-800/80 bg-gray-50/50 dark:bg-zinc-800/30"
              >
                <span
                  className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                    i === 0 && 'bg-amber-400 text-amber-950 font-black shadow-sm',
                    i === 1 && 'bg-slate-300 text-slate-900 font-bold',
                    i === 2 && 'bg-amber-600/30 text-amber-600 dark:text-amber-400 font-bold',
                    i > 2 && 'bg-muted text-muted-foreground'
                  )}
                >
                  {i + 1}
                </span>
                <span className="flex-1 text-sm font-medium truncate text-gray-900 dark:text-gray-100">
                  {domain.domain}
                </span>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="w-24 h-2 bg-muted rounded-full overflow-hidden hidden sm:block">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${Math.round(domain.percentage * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-foreground">
                    {domain.count} 篇
                  </span>
                  <span className="text-xs text-muted-foreground w-12 text-right">
                    {Math.round(domain.percentage * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* 收藏趋势 (可折叠) */}
      {profile && (
        <CollapsibleSection
          title="收藏趋势"
          expanded={expandedSections.trends}
          onToggle={() => toggleSection('trends')}
          action={
            <div className="flex items-center gap-1 bg-muted p-0.5 rounded-md text-xs">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setTrendView('yearly');
                }}
                className={cn(
                  'px-2 py-0.5 rounded text-xs transition-colors',
                  trendView === 'yearly'
                    ? 'bg-background text-foreground shadow-sm font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                年度
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setTrendView('monthly');
                }}
                className={cn(
                  'px-2 py-0.5 rounded text-xs transition-colors',
                  trendView === 'monthly'
                    ? 'bg-background text-foreground shadow-sm font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                近12个月
              </button>
            </div>
          }
        >
          {trendPoints.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">暂无时间趋势数据</p>
          ) : (
            <div className="pt-2">
              <div className="flex items-end gap-2 h-32 px-2">
                {trendPoints.map((point) => {
                  const height = maxTrendCount > 0 ? (point.count / maxTrendCount) * 100 : 0;
                  return (
                    <div
                      key={point.period}
                      className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group"
                    >
                      <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">
                        {point.count}
                      </span>
                      <div
                        className="w-full max-w-[32px] bg-primary/80 hover:bg-primary rounded-t transition-all"
                        style={{ height: `${height}%`, minHeight: point.count > 0 ? '4px' : '0' }}
                        title={`${point.period}: ${point.count} 条`}
                      />
                      <span className="text-[10px] text-muted-foreground font-mono truncate w-full text-center">
                        {point.period.length > 4 ? point.period.slice(5) : point.period}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* 底部生成时间 */}
      {profile && (
        <div className="text-xs text-muted-foreground text-right pt-2">
          数据更新于 {new Date(profile.generatedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}

// 统计卡片组件
function StatCard({
  icon: Icon,
  label,
  value,
  color,
  subValue,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: number | string;
  color: string;
  subValue?: string;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm hover:shadow transition-shadow">
      <div className="flex items-center gap-2 mb-2">
        <div
          className="p-1.5 rounded-lg shrink-0"
          style={{ backgroundColor: `${color}18` }}
        >
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium truncate">
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold tabular-nums" style={{ color }}>
        {value}
      </div>
      {subValue && (
        <div className="text-[11px] text-muted-foreground dark:text-zinc-500 mt-1 truncate">
          {subValue}
        </div>
      )}
    </div>
  );
}

// 可折叠区块组件
function CollapsibleSection({
  title,
  badge,
  expanded,
  onToggle,
  action,
  children,
}: {
  title: string;
  badge?: string;
  expanded: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Card className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 overflow-hidden">
      <div className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer select-none" onClick={onToggle}>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{title}</span>
          {badge && (
            <Badge variant="outline" className="text-xs font-normal">
              {badge}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>
      {expanded && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  );
}
