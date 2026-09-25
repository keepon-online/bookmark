// 清理空文件夹组件（v0.6：直接扫描浏览器书签树）

import * as React from 'react';
import { FolderX, Trash2, Search, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { useBrowserBookmarkStore } from '@/stores';
import { BrowserBookmarksService } from '@/services/browserBookmarksService';
import type { BrowserBookmarkNode } from '@/types';
import { formatRelativeTime } from '@/lib/utils';

const RECENT_FOLDER_MS = 24 * 3600_000; // 新建文件夹保护窗口

export function EmptyFolderCleanup({ className }: { className?: string }) {
  const folders = useBrowserBookmarkStore((state) => state.folders);
  const bookmarks = useBrowserBookmarkStore((state) => state.bookmarks);
  const removeFolder = useBrowserBookmarkStore((state) => state.removeFolder);

  const [emptyFolders, setEmptyFolders] = React.useState<BrowserBookmarkNode[] | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleScan = () => {
    const now = Date.now();
    // 只清理叶子空文件夹，且跳过 24 小时内新建的（防止误删使用中的临时文件夹）
    const found = BrowserBookmarksService.findEmptyFolders(folders, bookmarks).filter(
      (folder) => !folder.dateAdded || now - folder.dateAdded > RECENT_FOLDER_MS
    );
    setEmptyFolders(found);
    setSelected(new Set(found.map((folder) => folder.id)));
  };

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

  const handleDelete = async () => {
    if (selected.size === 0 || !emptyFolders) return;
    setIsDeleting(true);
    setError(null);
    try {
      for (const id of selected) {
        await removeFolder(id);
      }
      setEmptyFolders(null);
      setSelected(new Set());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FolderX className="h-4 w-4 text-rose-600" />
          空文件夹清理
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          只清理既无书签也无子文件夹的叶子文件夹；24 小时内新建的会被跳过
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleScan}>
            <Search className="h-4 w-4 mr-1" />
            扫描空文件夹
          </Button>
          {emptyFolders && emptyFolders.length > 0 && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting || selected.size === 0}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1" />
              )}
              删除所选（{selected.size}）
            </Button>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}

        {emptyFolders && emptyFolders.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">没有空文件夹 🎉</p>
        )}

        {emptyFolders && emptyFolders.length > 0 && (
          <ScrollArea style={{ maxHeight: '320px' }}>
            <div className="space-y-1">
              {emptyFolders.map((folder) => (
                <label
                  key={folder.id}
                  className="flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(folder.id)}
                    onChange={() => toggle(folder.id)}
                    className="rounded"
                  />
                  <span className="flex-1 truncate">{folder.title}</span>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {folder.path || '书签栏'}
                  </Badge>
                  {folder.dateAdded && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      创建于 {formatRelativeTime(folder.dateAdded)}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
