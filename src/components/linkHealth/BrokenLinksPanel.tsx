// 失效链接管理面板：检查完成后的处理闭环
// 列出被判失效的书签，支持单条/批量重新检查、打开、删除

import * as React from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { useBrowserBookmarkStore } from '@/stores';
import { linkHealthService } from '@/services/linkHealthService';
import type { ScanSettings } from './ScanSettingsPanel';
import { toBatchCheckOptions } from './ScanSettingsPanel';
import { cn, formatRelativeTime, getDomain } from '@/lib/utils';

interface BrokenLinksPanelProps {
  scanSettings: ScanSettings;
  className?: string;
}

export function BrokenLinksPanel({ scanSettings, className }: BrokenLinksPanelProps) {
  const bookmarks = useBrowserBookmarkStore((state) => state.bookmarks);
  const meta = useBrowserBookmarkStore((state) => state.meta);
  const removeBookmarks = useBrowserBookmarkStore((state) => state.removeBookmarks);
  const refresh = useBrowserBookmarkStore((state) => state.refresh);

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [isWorking, setIsWorking] = React.useState(false);

  const broken = React.useMemo(
    () => bookmarks.filter((node) => meta[node.id]?.linkStatus === 'broken'),
    [bookmarks, meta]
  );

  // 失效列表变化后清掉已不在列表中的选中项
  React.useEffect(() => {
    setSelected((current) => {
      const valid = new Set([...current].filter((id) => broken.some((node) => node.id === id)));
      return valid.size === current.size ? current : valid;
    });
  }, [broken]);

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((current) =>
      current.size === broken.length ? new Set() : new Set(broken.map((node) => node.id))
    );
  };

  // 重新检查指定书签（强制：忽略跳过窗口与人工标记）
  const recheck = async (ids: string[]) => {
    if (ids.length === 0 || isWorking) return;
    setIsWorking(true);
    try {
      const idSet = new Set(ids);
      const nodes = bookmarks.filter((node) => idSet.has(node.id));
      await linkHealthService.checkBookmarks(nodes, {
        ...toBatchCheckOptions(scanSettings),
        skipRecentHours: 0,
        force: true,
      });
      await refresh();
      setSelected(new Set());
    } catch (error) {
      console.error('Recheck failed:', error);
    } finally {
      setIsWorking(false);
    }
  };

  // 人工标记为正常：后续自动扫描不再改判
  const markHealthy = async (ids: string[]) => {
    if (ids.length === 0 || isWorking) return;
    setIsWorking(true);
    try {
      await linkHealthService.markAsHealthy(ids);
      await refresh();
      setSelected(new Set());
    } catch (error) {
      console.error('Mark healthy failed:', error);
    } finally {
      setIsWorking(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0 || isWorking) return;
    setIsWorking(true);
    try {
      await removeBookmarks([...selected]);
      setSelected(new Set());
    } finally {
      setIsWorking(false);
    }
  };

  if (broken.length === 0) {
    return null;
  }

  return (
    <div className={cn('mt-4 pt-4 border-t space-y-3', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <AlertCircle className="h-4 w-4 text-red-500" />
          失效链接（{broken.length}）
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={toggleAll}
            disabled={isWorking}
          >
            {selected.size === broken.length ? '取消全选' : '全选'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void recheck(selected.size > 0 ? [...selected] : broken.map((n) => n.id))}
            disabled={isWorking}
          >
            {isWorking ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            重新检查{selected.size > 0 ? `所选（${selected.size}）` : '全部'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void markHealthy(selected.size > 0 ? [...selected] : broken.map((n) => n.id))}
            disabled={isWorking}
            title="人工确认这些链接正常，后续自动扫描不再改判"
          >
            <CheckCircle2 className="h-3 w-3 mr-1" />
            标记正常{selected.size > 0 ? `所选（${selected.size}）` : '全部'}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void handleDeleteSelected()}
            disabled={isWorking || selected.size === 0}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            删除所选（{selected.size}）
          </Button>
        </div>
      </div>

      <ScrollArea style={{ maxHeight: '360px' }}>
        <div className="space-y-1">
          {broken.map((node) => {
            const record = meta[node.id];
            const isChecked = selected.has(node.id);
            return (
              <div
                key={node.id}
                className={cn(
                  'flex items-center gap-2 rounded-md border p-2 text-sm',
                  isChecked && 'bg-destructive/5'
                )}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(node.id)}
                  className="rounded shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <a
                      href={node.url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate font-medium hover:text-primary flex items-center gap-1"
                      title={node.title || node.url}
                    >
                      {node.title || node.url}
                      <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
                    </a>
                    {record?.lastStatusCode !== undefined && (
                      <Badge variant="destructive" className="text-xs shrink-0">
                        HTTP {record.lastStatusCode}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {getDomain(node.url ?? '')} · {node.path || '书签栏'}
                    {record?.linkCheckedAt ? ` · 检查于 ${formatRelativeTime(record.linkCheckedAt)}` : ''}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-green-600 hover:text-green-700"
                  title="人工标记为正常（后续自动扫描不再改判）"
                  disabled={isWorking}
                  onClick={() => void markHealthy([node.id])}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  title="重新检查此链接"
                  disabled={isWorking}
                  onClick={() => void recheck([node.id])}
                >
                  {isWorking ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                  title="删除此书签"
                  disabled={isWorking}
                  onClick={() => void removeBookmarks([node.id])}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
