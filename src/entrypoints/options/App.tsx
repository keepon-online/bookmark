// Options 页面

import * as React from 'react';
import {
  Settings,
  Moon,
  Sun,
  Monitor,
  Database,
  Download,
  Upload,
  Trash2,
  RefreshCw,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { HealthReport } from '@/components/linkHealth';
import { SyncSettings } from '@/components/sync/SyncSettings';
import { SemanticSearchSettings } from '@/components/semanticSearch/SemanticSearchSettings';
import { BookmarksOrganizer, DuplicateManager } from '@/components/organizer';
import { StatsDashboard } from '@/components/stats';
import { useUIStore, initializeTheme } from '@/stores';
import { initDatabase, db, exportDatabase, clearDatabase } from '@/lib/database';
import { bookmarkService } from '@/services';
import { linkHealthService } from '@/services/linkHealthService';
import { cn } from '@/lib/utils';
import type { Theme, ViewMode } from '@/types';
import '@/styles/globals.css';

export function App() {
  const [isInitialized, setIsInitialized] = React.useState(false);
  const [stats, setStats] = React.useState({ bookmarks: 0, folders: 0, tags: 0 });
  const [isExporting, setIsExporting] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
  const [importResult, setImportResult] = React.useState<string | null>(null);

  const { theme, setTheme, viewMode, setViewMode } = useUIStore();

  // 初始化
  React.useEffect(() => {
    const init = async () => {
      try {
        await initDatabase();
        initializeTheme();
        await loadStats();
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize:', error);
      }
    };
    init();
  }, []);

  // 加载统计信息
  const loadStats = async () => {
    const [bookmarks, folders, tags] = await Promise.all([
      db.bookmarks.count(),
      db.folders.count(),
      db.tags.count(),
    ]);
    setStats({ bookmarks, folders, tags });
  };

  // 导出数据
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = await exportDatabase();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `smart-bookmark-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // 从浏览器导入
  const handleImportFromBrowser = async () => {
    setIsImporting(true);
    setImportResult(null);
    try {
      const result = await bookmarkService.importFromBrowser();
      setImportResult(
        `导入完成：成功 ${result.imported} 个，重复 ${result.duplicates} 个，失败 ${result.errors.length} 个`
      );
      await loadStats();
    } catch (error) {
      setImportResult(`导入失败：${(error as Error).message}`);
    } finally {
      setIsImporting(false);
    }
  };

  // 清空数据
  const handleClearData = async () => {
    if (!confirm('确定要清空所有书签数据吗？此操作不可恢复！')) {
      return;
    }
    try {
      await clearDatabase();
      await loadStats();
    } catch (error) {
      console.error('Clear failed:', error);
    }
  };

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">加载中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Settings className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">智能书签设置</h1>
            <p className="text-muted-foreground">管理您的书签和扩展设置</p>
          </div>
        </div>

        <div className="grid gap-6">
          {/* 智能整理 */}
          <BookmarksOrganizer />

          {/* 重复书签管理 */}
          <DuplicateManager />

          {/* 数据统计仪表板 */}
          <StatsDashboard />

          {/* 云端同步 */}
          <SyncSettings />

          {/* 语义搜索 */}
          <SemanticSearchSettings />

          {/* 链接健康 */}
          <HealthReport onCheckAll={loadStats} />

          {/* 统计信息 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                数据统计
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 rounded-lg bg-muted">
                  <div className="text-3xl font-bold text-primary">{stats.bookmarks}</div>
                  <div className="text-sm text-muted-foreground">书签</div>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted">
                  <div className="text-3xl font-bold text-primary">{stats.folders}</div>
                  <div className="text-sm text-muted-foreground">文件夹</div>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted">
                  <div className="text-3xl font-bold text-primary">{stats.tags}</div>
                  <div className="text-sm text-muted-foreground">标签</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 外观设置 */}
          <Card>
            <CardHeader>
              <CardTitle>外观</CardTitle>
              <CardDescription>自定义扩展的显示方式</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 主题 */}
              <div>
                <label className="text-sm font-medium mb-2 block">主题</label>
                <div className="flex gap-2">
                  <ThemeButton
                    theme="light"
                    current={theme}
                    icon={<Sun className="h-4 w-4" />}
                    label="浅色"
                    onClick={() => setTheme('light')}
                  />
                  <ThemeButton
                    theme="dark"
                    current={theme}
                    icon={<Moon className="h-4 w-4" />}
                    label="深色"
                    onClick={() => setTheme('dark')}
                  />
                  <ThemeButton
                    theme="system"
                    current={theme}
                    icon={<Monitor className="h-4 w-4" />}
                    label="跟随系统"
                    onClick={() => setTheme('system')}
                  />
                </div>
              </div>

              {/* 默认视图 */}
              <div>
                <label className="text-sm font-medium mb-2 block">默认视图</label>
                <div className="flex gap-2">
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                  >
                    列表
                  </Button>
                  <Button
                    variant={viewMode === 'card' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('card')}
                  >
                    卡片
                  </Button>
                  <Button
                    variant={viewMode === 'compact' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('compact')}
                  >
                    紧凑
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 数据管理 */}
          <Card>
            <CardHeader>
              <CardTitle>数据管理</CardTitle>
              <CardDescription>导入、导出和管理您的书签数据</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 导入 */}
              <div className="flex items-center justify-between p-4 rounded-lg border">
                <div>
                  <div className="font-medium">从浏览器导入</div>
                  <div className="text-sm text-muted-foreground">
                    导入浏览器中的书签到智能书签
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={handleImportFromBrowser}
                  disabled={isImporting}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {isImporting ? '导入中...' : '导入'}
                </Button>
              </div>

              {importResult && (
                <div className="p-3 rounded-lg bg-muted text-sm">{importResult}</div>
              )}

              {/* 导出 */}
              <div className="flex items-center justify-between p-4 rounded-lg border">
                <div>
                  <div className="font-medium">导出数据</div>
                  <div className="text-sm text-muted-foreground">
                    将所有书签数据导出为 JSON 文件
                  </div>
                </div>
                <Button variant="outline" onClick={handleExport} disabled={isExporting}>
                  <Download className="h-4 w-4 mr-2" />
                  {isExporting ? '导出中...' : '导出'}
                </Button>
              </div>

              {/* 清空数据 */}
              <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/50">
                <div>
                  <div className="font-medium text-destructive">清空数据</div>
                  <div className="text-sm text-muted-foreground">
                    删除所有书签、文件夹和标签数据
                  </div>
                </div>
                <Button variant="destructive" onClick={handleClearData}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  清空
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 关于 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                关于
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">版本</span>
                  <span>0.5.0 (Beta)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">技术栈</span>
                  <span>WXT + React + TypeScript</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">存储</span>
                  <span>IndexedDB (Dexie.js)</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// 主题按钮
function ThemeButton({
  theme,
  current,
  icon,
  label,
  onClick,
}: {
  theme: Theme;
  current: Theme;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant={current === theme ? 'default' : 'outline'}
      size="sm"
      className="gap-2"
      onClick={onClick}
    >
      {icon}
      {label}
    </Button>
  );
}

export default App;
