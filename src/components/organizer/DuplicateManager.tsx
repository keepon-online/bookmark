// 重复书签管理组件（v0.6：直接扫描浏览器书签树）

import * as React from 'react';
import {
  Copy,
  Trash2,
  AlertCircle,
  Loader2,
  Search,
  Heart,
  RotateCcw,
  CheckSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { useBrowserBookmarkStore } from '@/stores';
import { BrowserBookmarksService } from '@/services/browserBookmarksService';
import type { BrowserDuplicateGroup, DuplicateRetentionStrategy } from '@/types';
import { formatRelativeTime, getDomain } from '@/lib/utils';

export function DuplicateManager({ className }: { className?: string }) {
  const bookmarks = useBrowserBookmarkStore((state) => state.bookmarks);
  const meta = useBrowserBookmarkStore((state) => state.meta);
  const removeBookmarks = useBrowserBookmarkStore((state) => state.removeBookmarks);

  const [groups, setGroups] = React.useState<BrowserDuplicateGroup[] | null>(null);
  const [strategy, setStrategy] = React.useState<DuplicateRetentionStrategy>('smart');
  const [isScanning, setIsScanning] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  // 每组内要删除的书签 id（默认 = 组内除建议保留项外的全部）
  const [toDelete, setToDelete] = React.useState<Set<string>>(new Set());

  const runGrouping = (
    currentBookmarks = bookmarks,
    currentMeta = meta,
    currentStrategy = strategy
  ) => {
    const found = BrowserBookmarksService.groupDuplicates(
      currentBookmarks,
      currentMeta,
      currentStrategy
    );
    setGroups(found);
    setToDelete(
      new Set(
        found.flatMap((group) =>
          group.bookmarks.filter((node) => node.id !== group.keepId).map((node) => node.id)
        )
      )
    );
  };

  const handleScan = async () => {
    setIsScanning(true);
    try {
      // 先让出主线程让 spinner 完成一帧绘制，再执行同步分组计算
      await new Promise((resolve) => setTimeout(resolve, 0));
      runGrouping();
    } finally {
      setIsScanning(false);
    }
  };

  const handleStrategyChange = (newStrategy: DuplicateRetentionStrategy) => {
    setStrategy(newStrategy);
    if (groups !== null) {
      runGrouping(bookmarks, meta, newStrategy);
    }
  };

  const toggle = (id: string) => {
    setToDelete((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 手动设置某项为当前组的保留项
  const handleSetKeep = (urlKey: string, keepNodeId: string) => {
    setGroups((current) => {
      if (!current) return current;
      return current.map((g) => (g.urlKey === urlKey ? { ...g, keepId: keepNodeId } : g));
    });
    setToDelete((current) => {
      const next = new Set(current);
      next.delete(keepNodeId);
      const targetGroup = groups?.find((g) => g.urlKey === urlKey);
      if (targetGroup) {
        targetGroup.bookmarks.forEach((b) => {
          if (b.id !== keepNodeId) {
            next.add(b.id);
          }
        });
      }
      return next;
    });
  };

  // 全选建议删除
  const handleSelectAllSuggested = () => {
    if (!groups) return;
    const allSuggested = new Set<string>();
    groups.forEach((g) => {
      g.bookmarks.forEach((b) => {
        if (b.id !== g.keepId) {
          allSuggested.add(b.id);
        }
      });
    });
    setToDelete(allSuggested);
  };

  // 清空选择
  const handleClearSelection = () => {
    setToDelete(new Set());
  };

  // 恢复保留项（解除全组删除隐患）
  const handleRestoreKeepInAllGroups = () => {
    if (!groups) return;
    setToDelete((current) => {
      const next = new Set(current);
      groups.forEach((g) => {
        next.delete(g.keepId);
      });
      return next;
    });
  };

  // 检测是否有任何组所有书签均被勾选删除（全删风险）
  const totalDeletionGroupCount = React.useMemo(() => {
    if (!groups) return 0;
    return groups.filter(
      (g) => g.bookmarks.length > 0 && g.bookmarks.every((b) => toDelete.has(b.id))
    ).length;
  }, [groups, toDelete]);

  const handleDelete = async () => {
    if (toDelete.size === 0) return;
    if (
      totalDeletionGroupCount > 0 &&
      !window.confirm(
        `检测到 ${totalDeletionGroupCount} 个重复组被全选删除（不保留任何副本），执行后将彻底丢失该网址的书签，确定要继续吗？`
      )
    ) {
      return;
    }

    setIsDeleting(true);
    try {
      await removeBookmarks([...toDelete]);
      setGroups(null);
      setToDelete(new Set());
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Copy className="h-4 w-4 text-amber-600" />
          重复书签清理
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          按 URL 规范化分组（忽略协议/www/末尾斜杠差异），支持智能评估及自定义保留项
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 策略与操作栏 */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground shrink-0">保留策略：</label>
            <select
              value={strategy}
              onChange={(e) => handleStrategyChange(e.target.value as DuplicateRetentionStrategy)}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
            >
              <option value="smart">智能推荐（收藏/标签/常用/目录优先）</option>
              <option value="newest">保留最新添加</option>
              <option value="oldest">保留最早添加</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleScan} disabled={isScanning}>
              {isScanning ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5 mr-1" />
              )}
              扫描重复书签
            </Button>
            {groups && groups.length > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAllSuggested}
                  className="text-xs h-8"
                >
                  <CheckSquare className="h-3.5 w-3.5 mr-1" />
                  全选建议删除
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearSelection}
                  disabled={toDelete.size === 0}
                  className="text-xs h-8"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  清空选择
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isDeleting || toDelete.size === 0}
                  className="h-8"
                >
                  {isDeleting ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                  )}
                  删除所选（{toDelete.size}）
                </Button>
              </>
            )}
          </div>
        </div>

        {/* 全选删除风险提示 */}
        {totalDeletionGroupCount > 0 && (
          <div className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2.5 text-xs text-amber-800 dark:text-amber-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
              <span>
                警告：检测到 {totalDeletionGroupCount} 个重复组内的所有书签均被勾选删除，执行后该网址书签将彻底丢失！
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs bg-white dark:bg-zinc-900 border-amber-300"
              onClick={handleRestoreKeepInAllGroups}
            >
              一键恢复保留项
            </Button>
          </div>
        )}

        {groups && groups.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">没有发现重复书签 🎉</p>
        )}

        {groups && groups.length > 0 && (
          <ScrollArea style={{ maxHeight: '420px' }}>
            <div className="space-y-3">
              {groups.map((group) => (
                <div key={group.urlKey} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                      <span className="font-medium truncate">{getDomain(group.url)}</span>
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {group.bookmarks.length} 条重复
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {group.bookmarks.map((node) => {
                      const isKeep = node.id === group.keepId;
                      const checked = toDelete.has(node.id);
                      const m = meta[node.id];
                      return (
                        <div
                          key={node.id}
                          className="flex items-center gap-2 text-sm p-1 rounded hover:bg-muted/50 transition-colors"
                        >
                          <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(node.id)}
                              className="rounded"
                            />
                            {m?.isFavorite && (
                              <Heart className="h-3.5 w-3.5 text-rose-500 fill-rose-500 shrink-0" />
                            )}
                            <span className="truncate font-medium">
                              {node.title || node.url}
                            </span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {node.path || '书签栏'}
                              {node.dateAdded ? ` · ${formatRelativeTime(node.dateAdded)}添加` : ''}
                            </span>
                            {m?.tags && m.tags.length > 0 && (
                              <div className="flex items-center gap-1 shrink-0">
                                {m.tags.map((tag) => (
                                  <Badge key={tag} variant="outline" className="text-[10px] px-1 py-0 h-4">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </label>
                          <div className="flex items-center gap-1 shrink-0">
                            {isKeep ? (
                              <Badge
                                variant="outline"
                                className="text-xs bg-amber-50 dark:bg-amber-950/40 border-amber-400 text-amber-700 dark:text-amber-300"
                              >
                                当前保留
                              </Badge>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => handleSetKeep(group.urlKey, node.id)}
                              >
                                设为保留
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
