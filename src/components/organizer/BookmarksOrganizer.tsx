// AI 智能整理组件（v0.6：预览-确认模式）
// 生成建议 → 勾选确认 → 应用（移动写 chrome.bookmarks，标签写 aux）

import * as React from 'react';
import { Wand2, Loader2, CheckCircle2, AlertTriangle, Play, RotateCcw, CheckSquare } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { useBrowserBookmarkStore } from '@/stores';
import { collectFolderIds } from '@/components/bookmark/useBookmarkFilter';
import { organizerService, isDeepSeekEnabled, type OrganizeSuggestion } from '@/services/organizerService';
import type { ApplyResult } from '@/services/organizerService';
import { cn } from '@/lib/utils';

interface BookmarksOrganizerProps {
  onComplete?: (result: ApplyResult) => void;
  className?: string;
}

export function BookmarksOrganizer({ onComplete, className }: BookmarksOrganizerProps) {
  const bookmarks = useBrowserBookmarkStore((state) => state.bookmarks);
  const folders = useBrowserBookmarkStore((state) => state.folders);
  const meta = useBrowserBookmarkStore((state) => state.meta);

  const [scope, setScope] = React.useState<string>('all'); // 'all' 或文件夹 id
  const [engine, setEngine] = React.useState<'auto' | 'rule'>('auto');
  const [minConfidence, setMinConfidence] = React.useState<number>(0.6);
  const [deepSeekOn, setDeepSeekOn] = React.useState(false);

  const [suggestions, setSuggestions] = React.useState<OrganizeSuggestion[] | null>(null);
  const [excluded, setExcluded] = React.useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isApplying, setIsApplying] = React.useState(false);
  const [result, setResult] = React.useState<ApplyResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    void isDeepSeekEnabled().then(setDeepSeekOn);
  }, []);

  const scopeNodes = React.useMemo(() => {
    if (scope === 'all') return bookmarks;
    const folderIds = collectFolderIds(folders, scope);
    return bookmarks.filter((bookmark) => folderIds.has(bookmark.parentId));
  }, [bookmarks, folders, scope]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setResult(null);
    setError(null);
    try {
      const data = await organizerService.suggest(scopeNodes, meta, {
        minConfidence,
        engine,
      });
      setSuggestions(data);
      setExcluded(new Set());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleExcluded = (id: string) => {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setExcluded(new Set());
  };

  const handleDeselectAll = () => {
    if (!suggestions) return;
    setExcluded(new Set(suggestions.map((s) => s.node.id)));
  };

  const handleApply = async () => {
    if (!suggestions) return;
    const selected = suggestions.filter((suggestion) => !excluded.has(suggestion.node.id));
    if (selected.length === 0) return;

    setIsApplying(true);
    setError(null);
    try {
      const applyResult = await organizerService.apply(selected);
      setResult(applyResult);
      onComplete?.(applyResult);
      setSuggestions(null);
      await useBrowserBookmarkStore.getState().refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsApplying(false);
    }
  };

  const selectedCount = suggestions ? suggestions.length - excluded.size : 0;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wand2 className="h-4 w-4 text-primary" />
          AI 智能整理
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          AI 只生成建议，你确认后才会执行移动/打标。引擎：{engine === 'auto'
            ? deepSeekOn ? 'DeepSeek（已配置）' : 'DeepSeek 未配置，使用本地规则'
            : '本地规则'}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 配置 */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">范围</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="all">全部书签（{bookmarks.length}）</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.path ? `${folder.path}/` : ''}
                  {folder.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">引擎</label>
            <select
              value={engine}
              onChange={(e) => setEngine(e.target.value as 'auto' | 'rule')}
              className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="auto">自动（优先 DeepSeek）</option>
              <option value="rule">仅本地规则</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              最小置信度 ≥ {minConfidence.toFixed(1)}
            </label>
            <input
              type="range"
              min={0.3}
              max={0.9}
              step={0.1}
              value={minConfidence}
              onChange={(e) => setMinConfidence(Number(e.target.value))}
              className="w-full mt-3"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-1" />
            )}
            生成建议
          </Button>
          {suggestions && suggestions.length > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                disabled={excluded.size === 0}
                className="text-xs h-9"
              >
                <CheckSquare className="h-3.5 w-3.5 mr-1" />
                全选
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeselectAll}
                disabled={selectedCount === 0}
                className="text-xs h-9"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                取消全选
              </Button>
              <Button
                variant="default"
                onClick={handleApply}
                disabled={isApplying || selectedCount === 0}
              >
                {isApplying ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                )}
                应用所选（{selectedCount}）
              </Button>
              <Button variant="outline" onClick={() => setSuggestions(null)} disabled={isApplying}>
                <RotateCcw className="h-4 w-4 mr-1" />
                放弃
              </Button>
            </>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* 结果横幅 */}
        {result && (
          <div className="rounded-lg border bg-green-50 dark:bg-green-950/30 p-3 text-sm">
            <div className="font-medium text-green-800 dark:text-green-300">
              已应用 {result.applied} 条建议：移动 {result.moved}、打标 {result.tagged}
            </div>
            {result.errors.length > 0 && (
              <div className="text-xs text-destructive mt-1">
                {result.errors.slice(0, 3).join('；')}
                {result.errors.length > 3 ? ` 等 ${result.errors.length} 条` : ''}
              </div>
            )}
          </div>
        )}

        {/* 建议预览 */}
        {suggestions && (
          <div>
            {suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                当前范围内没有满足置信度的整理建议
              </p>
            ) : (
              <>
                <div className="text-xs text-muted-foreground mb-2">
                  共 {suggestions.length} 条建议，取消勾选可跳过对应书签
                </div>
                <ScrollArea style={{ maxHeight: '360px' }}>
                  <div className="space-y-1">
                    {suggestions.map((suggestion) => {
                      const checked = !excluded.has(suggestion.node.id);
                      return (
                        <label
                          key={suggestion.node.id}
                          className={cn(
                            'flex items-center gap-3 rounded-md border p-2 text-sm cursor-pointer',
                            checked ? 'bg-background' : 'opacity-50'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleExcluded(suggestion.node.id)}
                            className="rounded"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="truncate font-medium">{suggestion.node.title || suggestion.node.url}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {suggestion.node.path || '书签栏'} →{' '}
                              {suggestion.suggestedFolderPath ?? '（不移动）'}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {suggestion.suggestedTags.map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0 w-10 text-right">
                            {suggestion.confidence.toFixed(2)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </ScrollArea>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
