// 重复书签管理组件（v0.6：直接扫描浏览器书签树）

import * as React from 'react';
import { Copy, Trash2, AlertCircle, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { useBrowserBookmarkStore } from '@/stores';
import { BrowserBookmarksService } from '@/services/browserBookmarksService';
import type { BrowserDuplicateGroup } from '@/types';
import { formatRelativeTime, getDomain } from '@/lib/utils';

export function DuplicateManager({ className }: { className?: string }) {
  const bookmarks = useBrowserBookmarkStore((state) => state.bookmarks);
  const removeBookmarks = useBrowserBookmarkStore((state) => state.removeBookmarks);

  const [groups, setGroups] = React.useState<BrowserDuplicateGroup[] | null>(null);
  const [isScanning, setIsScanning] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  // 每组内要删除的书签 id（默认 = 组内除建议保留项外的全部）
  const [toDelete, setToDelete] = React.useState<Set<string>>(new Set());

  const handleScan = () => {
    setIsScanning(true);
    try {
      const found = BrowserBookmarksService.groupDuplicates(bookmarks);
      setGroups(found);
      setToDelete(
        new Set(found.flatMap((group) => group.bookmarks.slice(1).map((node) => node.id)))
      );
    } finally {
      setIsScanning(false);
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

  const handleDelete = async () => {
    if (toDelete.size === 0) return;
    // 防误删：最近访问过的书签不自动勾选（默认已排除，这里再校验一次）
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
          按 URL 规范化分组（忽略协议/www/末尾斜杠差异），默认保留最新添加且最近访问过的书签
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleScan} disabled={isScanning}>
            {isScanning ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Search className="h-4 w-4 mr-1" />
            )}
            扫描重复书签
          </Button>
          {groups && groups.length > 0 && (
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting || toDelete.size === 0}>
              {isDeleting ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1" />
              )}
              删除所选（{toDelete.size}）
            </Button>
          )}
        </div>

        {groups && groups.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">没有发现重复书签 🎉</p>
        )}

        {groups && groups.length > 0 && (
          <ScrollArea style={{ maxHeight: '420px' }}>
            <div className="space-y-3">
              {groups.map((group) => (
                <div key={group.urlKey} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    <span className="font-medium">{getDomain(group.url)}</span>
                    <Badge variant="secondary" className="text-xs">
                      {group.bookmarks.length} 条重复
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {group.bookmarks.map((node) => {
                      const isKeep = node.id === group.keepId;
                      const checked = toDelete.has(node.id);
                      return (
                        <label
                          key={node.id}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(node.id)}
                            className="rounded"
                          />
                          <span className="flex-1 truncate">{node.title || node.url}</span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {node.path || '书签栏'}
                            {node.dateAdded ? ` · ${formatRelativeTime(node.dateAdded)}添加` : ''}
                          </span>
                          {isKeep && (
                            <Badge variant="outline" className="text-xs shrink-0">
                              建议保留
                            </Badge>
                          )}
                        </label>
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
