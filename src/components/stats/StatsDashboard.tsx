// 统计仪表板组件

import { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  Tag,
  Folder,
  Globe,
  Activity,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { statsService } from '@/services';
import type {
  OverallStats,
  TagStats,
  FolderStats,
  DomainStats,
  ActivityStats,
} from '@/types';

interface StatsDashboardProps {
  className?: string;
}

export function StatsDashboard({ className = '' }: StatsDashboardProps) {
  const [stats, setStats] = useState<OverallStats | null>(null);
  const [popularTags, setPopularTags] = useState<TagStats[]>([]);
  const [folderStats, setFolderStats] = useState<FolderStats[]>([]);
  const [domainStats, setDomainStats] = useState<DomainStats[]>([]);
  const [activity, setActivity] = useState<ActivityStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'tags' | 'folders' | 'domains' | 'activity'>('overview');

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setIsLoading(true);
    try {
      const [overallStats, tags, folders, domains, activityStats] = await Promise.all([
        statsService.getOverallStats(),
        statsService.getPopularTags(10),
        statsService.getFolderStats(),
        statsService.getDomainStats(10),
        statsService.getBookmarkActivity(),
      ]);

      setStats(overallStats);
      setPopularTags(tags);
      setFolderStats(folders.slice(0, 10));
      setDomainStats(domains);
      setActivity(activityStats);
    } catch (error) {
      console.error('加载统计数据失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className={`bg-white rounded-lg shadow-sm p-6 ${className}`}>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className={`bg-white rounded-lg shadow-sm p-6 ${className}`}>
        <div className="text-center py-12 text-gray-500">
          无法加载统计数据
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm ${className}`}>
      {/* 头部 */}
      <div className="p-6 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">数据统计</h3>
              <p className="text-sm text-gray-500">书签使用情况分析</p>
            </div>
          </div>

          <button
            onClick={loadStats}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            disabled={isLoading}
          >
            <RefreshCw className={`w-5 h-5 text-gray-600 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* 标签切换 */}
        <div className="flex gap-2 mt-4">
          <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
            概览
          </TabButton>
          <TabButton active={activeTab === 'tags'} onClick={() => setActiveTab('tags')}>
            标签
          </TabButton>
          <TabButton active={activeTab === 'folders'} onClick={() => setActiveTab('folders')}>
            文件夹
          </TabButton>
          <TabButton active={activeTab === 'domains'} onClick={() => setActiveTab('domains')}>
            域名
          </TabButton>
          <TabButton active={activeTab === 'activity'} onClick={() => setActiveTab('activity')}>
            活跃度
          </TabButton>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="p-6">
        {activeTab === 'overview' && <OverviewTab stats={stats} />}
        {activeTab === 'tags' && <TagsTab tags={popularTags} />}
        {activeTab === 'folders' && <FoldersTab folders={folderStats} />}
        {activeTab === 'domains' && <DomainsTab domains={domainStats} />}
        {activeTab === 'activity' && <ActivityTab activity={activity} />}
      </div>
    </div>
  );
}

// 标签按钮
function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );
}

// 概览标签页
function OverviewTab({ stats }: { stats: OverallStats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard
        icon={BarChart3}
        label="总书签"
        value={stats.totalBookmarks}
        color="blue"
      />
      <StatCard
        icon={Folder}
        label="文件夹"
        value={stats.totalFolders}
        color="purple"
      />
      <StatCard
        icon={Tag}
        label="标签"
        value={stats.totalTags}
        color="green"
      />
      <StatCard
        icon={Activity}
        label="收藏"
        value={stats.favorites}
        color="yellow"
      />

      <StatCard
        icon={TrendingUp}
        label="最近7天新增"
        value={stats.recentAdditions}
        color="indigo"
      />
      <StatCard
        label="失效链接"
        value={stats.broken}
        color="red"
        subtitle="需要处理"
      />
      <StatCard
        label="未分类"
        value={stats.uncategorized}
        color="orange"
        subtitle="待整理"
      />
      <StatCard
        label="重复书签"
        value={stats.duplicates}
        color="pink"
        subtitle="可清理"
      />
    </div>
  );
}

// 统计卡片
function StatCard({
  icon: Icon,
  label,
  value,
  color,
  subtitle,
}: {
  icon?: any;
  label: string;
  value: number;
  color: string;
  subtitle?: string;
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    red: 'bg-red-50 text-red-600',
    orange: 'bg-orange-50 text-orange-600',
    pink: 'bg-pink-50 text-pink-600',
  };

  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-600">{label}</span>
        {Icon && (
          <div className={`p-1.5 rounded-lg ${colorClasses[color as keyof typeof colorClasses]}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {subtitle && (
        <div className="text-xs text-gray-500 mt-1">{subtitle}</div>
      )}
    </div>
  );
}

// 标签标签页
function TagsTab({ tags }: { tags: TagStats[] }) {
  return (
    <div>
      <h4 className="text-lg font-semibold text-gray-900 mb-4">热门标签</h4>
      <div className="space-y-2">
        {tags.map((tag, i) => (
          <div
            key={tag.tag}
            className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center justify-center w-8 h-8 bg-green-100 rounded-full text-green-600 font-semibold">
              {i + 1}
            </div>
            <div className="flex-1">
              <div className="font-medium text-gray-900">{tag.tag}</div>
              <div className="text-xs text-gray-500">
                使用 {tag.count} 次 • 平均 {tag.avgUsage.toFixed(2)}/天
              </div>
            </div>
            <div className="text-sm text-gray-600">{tag.count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 文件夹标签页
function FoldersTab({ folders }: { folders: FolderStats[] }) {
  return (
    <div>
      <h4 className="text-lg font-semibold text-gray-900 mb-4">文件夹统计</h4>
      <div className="space-y-2">
        {folders.map((folder) => (
          <div
            key={folder.folderId}
            className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Folder className="w-5 h-5 text-purple-600" />
            <div className="flex-1">
              <div className="font-medium text-gray-900 truncate">{folder.name}</div>
              <div className="text-xs text-gray-500">{folder.path}</div>
            </div>
            <div className="text-sm text-gray-600">{folder.bookmarkCount} 个书签</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 域名标签页
function DomainsTab({ domains }: { domains: DomainStats[] }) {
  return (
    <div>
      <h4 className="text-lg font-semibold text-gray-900 mb-4">热门域名</h4>
      <div className="space-y-2">
        {domains.map((domain, i) => (
          <div
            key={domain.domain}
            className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-full text-blue-600 font-semibold">
              {i + 1}
            </div>
            <div className="flex-1">
              <div className="font-medium text-gray-900">{domain.domain}</div>
              <div className="text-xs text-gray-500">
                占比 {domain.percentage}%
              </div>
            </div>
            <div className="text-sm text-gray-600">{domain.count} 个书签</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 活跃度标签页
function ActivityTab({ activity }: { activity: ActivityStats | null }) {
  if (!activity) {
    return <div className="text-center py-8 text-gray-500">暂无数据</div>;
  }

  return (
    <div>
      <h4 className="text-lg font-semibold text-gray-900 mb-4">活跃度分析</h4>

      <div className="space-y-6">
        {/* 最常访问 */}
        <div>
          <h5 className="font-medium text-gray-700 mb-2">最常访问</h5>
          <div className="space-y-1">
            {activity.mostVisited.slice(0, 5).map((item) => (
              <div
                key={item.bookmarkId}
                className="flex items-center gap-2 text-sm p-2 hover:bg-gray-50 rounded"
              >
                <span className="flex-1 truncate">{item.title}</span>
                <span className="text-purple-600 font-medium">{item.visits} 次</span>
              </div>
            ))}
          </div>
        </div>

        {/* 最近添加 */}
        <div>
          <h5 className="font-medium text-gray-700 mb-2">最近添加</h5>
          <div className="space-y-1">
            {activity.recentlyAdded.slice(0, 5).map((item) => (
              <div
                key={item.bookmarkId}
                className="flex items-center gap-2 text-sm p-2 hover:bg-gray-50 rounded"
              >
                <span className="flex-1 truncate">{item.title}</span>
                <span className="text-gray-500">
                  {new Date(item.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 长期未访问 */}
        {activity.neglected.length > 0 && (
          <div>
            <h5 className="font-medium text-gray-700 mb-2">长期未访问</h5>
            <div className="space-y-1">
              {activity.neglected.slice(0, 5).map((item) => (
                <div
                  key={item.bookmarkId}
                  className="flex items-center gap-2 text-sm p-2 hover:bg-gray-50 rounded"
                >
                  <span className="flex-1 truncate">{item.title}</span>
                  <span className="text-orange-600">{item.daysSinceVisit} 天</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
