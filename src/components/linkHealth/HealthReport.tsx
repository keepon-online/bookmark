// 健康报告组件（v0.6：检查浏览器书签，结果写 aux）

import * as React from 'react';
import { Activity, CheckCircle, XCircle, Clock, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { useBrowserBookmarkStore } from '@/stores';
import { linkHealthService } from '@/services/linkHealthService';
import type { LinkHealthReport, CheckProgress } from '@/types';
import {
  ScanSettingsPanel,
  loadScanSettings,
  saveScanSettings,
  toBatchCheckOptions,
  DEFAULT_SCAN_SETTINGS,
  type ScanSettings,
} from './ScanSettingsPanel';

interface HealthReportProps {
  onCheckAll?: () => void;
  className?: string;
}

export function HealthReport({ onCheckAll, className }: HealthReportProps) {
  const bookmarks = useBrowserBookmarkStore((state) => state.bookmarks);
  const meta = useBrowserBookmarkStore((state) => state.meta);

  const [report, setReport] = React.useState<LinkHealthReport | null>(null);
  const [isChecking, setIsChecking] = React.useState(false);
  const [progress, setProgress] = React.useState<CheckProgress | null>(null);
  const [scanSettings, setScanSettings] = React.useState<ScanSettings>(DEFAULT_SCAN_SETTINGS);

  // 加载报告和设置
  const loadReport = React.useCallback(async () => {
    const data = await linkHealthService.getHealthReport(bookmarks, meta);
    setReport(data);
  }, [bookmarks, meta]);

  React.useEffect(() => {
    void loadReport();
    void loadScanSettings().then(setScanSettings);
  }, [loadReport]);

  // 执行全量检查
  const handleCheckAll = async () => {
    setIsChecking(true);
    try {
      const options = toBatchCheckOptions(scanSettings);
      await useBrowserBookmarkStore.getState().init();
      const nodes = useBrowserBookmarkStore.getState().bookmarks;
      await linkHealthService.checkBookmarks(nodes, options, setProgress);
      // 检查结果写入了 aux，刷新 store 的 meta 映射
      await useBrowserBookmarkStore.getState().refresh();
      await loadReport();
      onCheckAll?.();
    } catch (error) {
      console.error('Check all failed:', error);
    } finally {
      setIsChecking(false);
      setProgress(null);
    }
  };

  // 停止检查
  const handleStop = () => {
    linkHealthService.stopCheck();
  };

  // 更新设置
  const handleSettingsChange = (newSettings: ScanSettings) => {
    setScanSettings(newSettings);
    void saveScanSettings(newSettings);
  };

  if (!report) {
    return null;
  }

  const healthPercentage = report.total > 0 ? Math.round((report.healthy / report.total) * 100) : 100;

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-5 w-5" />
            链接健康
          </CardTitle>
          {isChecking ? (
            <Button size="sm" variant="outline" onClick={handleStop}>
              停止
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={handleCheckAll} disabled={bookmarks.length === 0}>
              <RefreshCw className="h-4 w-4 mr-1" />
              检查全部（{bookmarks.length}）
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* 进度条 */}
        {isChecking && progress && (
          <div className="mb-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="truncate">{progress.current}</span>
              <span>
                {progress.completed} / {progress.total}
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${(progress.completed / Math.max(progress.total, 1)) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                ✓ {progress.success} / ✗ {progress.failed}
                {progress.skipped > 0 ? ` / 跳过 ${progress.skipped}` : ''}
              </span>
              {progress.estimatedRemaining && (
                <span>剩余 ~{Math.ceil(progress.estimatedRemaining / 1000)}s</span>
              )}
            </div>
          </div>
        )}

        {/* 统计卡片 */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            icon={<CheckCircle className="h-4 w-4 text-green-500" />}
            label="正常"
            value={report.healthy}
            total={report.total}
            color="text-green-600"
          />
          <StatCard
            icon={<XCircle className="h-4 w-4 text-red-500" />}
            label="失效"
            value={report.broken}
            total={report.total}
            color="text-red-600"
          />
          <StatCard
            icon={<Clock className="h-4 w-4 text-gray-400" />}
            label="待检查"
            value={report.pending}
            total={report.total}
            color="text-gray-600"
          />
        </div>

        {/* 健康度 */}
        <div className="mt-4 pt-4 border-t">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">健康度</span>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'text-lg font-bold',
                  healthPercentage >= 80
                    ? 'text-green-600'
                    : healthPercentage >= 50
                      ? 'text-yellow-600'
                      : 'text-red-600'
                )}
              >
                {healthPercentage}%
              </span>
              {healthPercentage >= 80 ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
            </div>
          </div>

          {report.avgResponseTime > 0 && (
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm text-muted-foreground">平均响应</span>
              <span className="text-sm font-medium">{Math.round(report.avgResponseTime)}ms</span>
            </div>
          )}

          {report.lastCheckedAt > 0 && (
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm text-muted-foreground">最后检查</span>
              <span className="text-sm">{formatLastChecked(report.lastCheckedAt)}</span>
            </div>
          )}
        </div>

        {/* 扫描设置面板 */}
        <ScanSettingsPanel settings={scanSettings} onChange={handleSettingsChange} disabled={isChecking} />
      </CardContent>
    </Card>
  );
}

// 统计卡片
function StatCard({
  icon,
  label,
  value,
  total,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div className="p-3 rounded-lg bg-muted/50">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className={cn('text-xl font-bold', color)}>{value}</div>
      <div className="text-xs text-muted-foreground">{percentage}%</div>
    </div>
  );
}

// 格式化最后检查时间
function formatLastChecked(timestamp: number): string {
  const diff = Date.now() - timestamp;

  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return `${Math.floor(diff / 86400000)}天前`;
}
