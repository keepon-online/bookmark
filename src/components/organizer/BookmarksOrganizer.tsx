// AI 智能整理组件（v0.7：预览-确认-撤销与细粒度编辑）
// 范围筛选（支持仅未整理根书签）→ 生成建议 → 搜索/过滤/行内微调 → 确认应用 → 历史与一键撤销

import * as React from 'react';
import {
  Wand2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  CheckSquare,
  History,
  Undo2,
  Search,
  Trash2,
  Edit2,
  X,
  ChevronDown,
  ChevronUp,
  Folder,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { useBrowserBookmarkStore } from '@/stores';
import { collectFolderIds } from '@/components/bookmark/useBookmarkFilter';
import { organizerService, isDeepSeekEnabled, type OrganizeSuggestion } from '@/services/organizerService';
import type { ApplyResult } from '@/services/organizerService';
import type { OrganizeHistory } from '@/types/organizer';
import { cn } from '@/lib/utils';

interface BookmarksOrganizerProps {
  onComplete?: (result: ApplyResult) => void;
  className?: string;
}

export function BookmarksOrganizer({ onComplete, className }: BookmarksOrganizerProps) {
  const bookmarks = useBrowserBookmarkStore((state) => state.bookmarks);
  const folders = useBrowserBookmarkStore((state) => state.folders);
  const meta = useBrowserBookmarkStore((state) => state.meta);

  // 范围：'all' | 'root-only' | folderId
  const [scope, setScope] = React.useState<string>('all');
  const [engine, setEngine] = React.useState<'auto' | 'rule'>('auto');
  const [minConfidence, setMinConfidence] = React.useState<number>(0.6);
  const [deepSeekOn, setDeepSeekOn] = React.useState(false);

  const [suggestions, setSuggestions] = React.useState<OrganizeSuggestion[] | null>(null);
  const [excluded, setExcluded] = React.useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isApplying, setIsApplying] = React.useState(false);
  const [result, setResult] = React.useState<ApplyResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // 筛选与微调状态
  const [searchQuery, setSearchQuery] = React.useState('');
  const [filterType, setFilterType] = React.useState<'all' | 'move' | 'tag'>('all');
  const [editingFolderId, setEditingFolderId] = React.useState<string | null>(null);
  const [editingFolderValue, setEditingFolderValue] = React.useState('');

  // 整理历史与撤销
  const [showHistory, setShowHistory] = React.useState(false);
  const [historyList, setHistoryList] = React.useState<OrganizeHistory[]>([]);
  const [isRollingBack, setIsRollingBack] = React.useState<string | null>(null);
  const [rollbackSuccess, setRollbackSuccess] = React.useState<string | null>(null);

  React.useEffect(() => {
    void isDeepSeekEnabled().then(setDeepSeekOn);
  }, []);

  const loadHistory = React.useCallback(async () => {
    try {
      const list = await organizerService.getHistory(15);
      setHistoryList(list);
    } catch {
      // 忽略读取历史错误
    }
  }, []);

  React.useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // 根目录直接放置的书签（未放入任何子文件夹的散落书签）
  const rootBookmarks = React.useMemo(() => {
    return bookmarks.filter(
      (b) =>
        b.parentId === '1' ||
        b.parentId === '2' ||
        !b.path ||
        b.path === '书签栏' ||
        b.path === '其他书签' ||
        b.path === 'Bookmarks Bar' ||
        b.path === 'Other Bookmarks'
    );
  }, [bookmarks]);

  const scopeNodes = React.useMemo(() => {
    if (scope === 'all') return bookmarks;
    if (scope === 'root-only') return rootBookmarks;
    const folderIds = collectFolderIds(folders, scope);
    return bookmarks.filter((bookmark) => folderIds.has(bookmark.parentId));
  }, [bookmarks, folders, rootBookmarks, scope]);

  // 用户现有文件夹完整路径（相对书签栏），作为 AI 分类的目标结构
  const folderPaths = React.useMemo(
    () =>
      [
        ...new Set(
          folders
            .map((f) =>
              `${f.path}/${f.title}`
                .replace(/^书签栏\/?/, '')
                .replace(/^其他书签\/?/, '')
                .replace(/\/$/, '')
                .trim()
            )
            .filter((p) => p && p !== '书签栏' && p !== '其他书签')
        ),
      ].sort(),
    [folders]
  );

  const handleGenerate = async () => {
    setIsGenerating(true);
    setResult(null);
    setRollbackSuccess(null);
    setError(null);
    try {
      const data = await organizerService.suggest(scopeNodes, meta, {
        minConfidence,
        engine,
        folderPaths,
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

  // 过滤后的建议列表
  const filteredSuggestions = React.useMemo(() => {
    if (!suggestions) return [];
    return suggestions.filter((s) => {
      if (filterType === 'move' && !s.suggestedFolderPath) return false;
      if (filterType === 'tag' && s.suggestedFolderPath) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const title = (s.node.title || '').toLowerCase();
      const url = (s.node.url || '').toLowerCase();
      const folder = (s.suggestedFolderPath || '').toLowerCase();
      const tags = s.suggestedTags.join(' ').toLowerCase();
      return title.includes(q) || url.includes(q) || folder.includes(q) || tags.includes(q);
    });
  }, [suggestions, filterType, searchQuery]);

  const handleSelectAll = () => {
    setExcluded((current) => {
      const next = new Set(current);
      filteredSuggestions.forEach((s) => next.delete(s.node.id));
      return next;
    });
  };

  const handleDeselectAll = () => {
    setExcluded((current) => {
      const next = new Set(current);
      filteredSuggestions.forEach((s) => next.add(s.node.id));
      return next;
    });
  };

  // 行内调整建议目标文件夹
  const handleStartEditFolder = (nodeId: string, currentPath?: string) => {
    setEditingFolderId(nodeId);
    setEditingFolderValue(currentPath ?? '');
  };

  const handleSaveEditFolder = (nodeId: string) => {
    const trimmed = editingFolderValue.trim();
    setSuggestions((prev) =>
      prev
        ? prev.map((s) =>
            s.node.id === nodeId ? { ...s, suggestedFolderPath: trimmed || undefined } : s
          )
        : null
    );
    setEditingFolderId(null);
  };

  // 移除建议中的某单个标签
  const handleRemoveSuggestedTag = (nodeId: string, tagToRemove: string) => {
    setSuggestions((prev) =>
      prev
        ? prev.map((s) =>
            s.node.id === nodeId
              ? { ...s, suggestedTags: s.suggestedTags.filter((t) => t !== tagToRemove) }
              : s
          )
        : null
    );
  };

  const handleApply = async () => {
    if (!suggestions) return;
    const selected = suggestions.filter((suggestion) => !excluded.has(suggestion.node.id));
    if (selected.length === 0) return;

    setIsApplying(true);
    setError(null);
    setRollbackSuccess(null);
    try {
      const applyResult = await organizerService.apply(selected);
      setResult(applyResult);
      onComplete?.(applyResult);
      setSuggestions(null);
      await loadHistory();
      await useBrowserBookmarkStore.getState().refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsApplying(false);
    }
  };

  // 一键回滚/撤销
  const handleRollback = async (historyId: string) => {
    if (!window.confirm('确定要撤销本次整理吗？相关书签将移回原文件夹，并移除本次自动添加的标签。')) {
      return;
    }
    setIsRollingBack(historyId);
    setError(null);
    setRollbackSuccess(null);
    try {
      const rollbackResult = await organizerService.rollback(historyId);
      await loadHistory();
      await useBrowserBookmarkStore.getState().refresh();
      setRollbackSuccess(`成功撤销！已还原 ${rollbackResult.restored} 项变更。`);
      if (rollbackResult.errors.length > 0) {
        setError(`部分还原遇到问题：${rollbackResult.errors.join('；')}`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsRollingBack(null);
    }
  };

  // 删除单条历史记录
  const handleDeleteHistory = async (historyId: string) => {
    try {
      await organizerService.deleteHistory(historyId);
      await loadHistory();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const selectedCount = suggestions ? suggestions.length - excluded.size : 0;
  const moveSuggestionsCount = suggestions?.filter((s) => s.suggestedFolderPath).length ?? 0;
  const tagOnlySuggestionsCount = suggestions?.filter((s) => !s.suggestedFolderPath).length ?? 0;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wand2 className="h-4 w-4 text-primary" />
            AI 智能整理
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHistory((prev) => !prev)}
            className="text-xs h-8 text-muted-foreground hover:text-foreground"
          >
            <History className="h-3.5 w-3.5 mr-1" />
            整理历史 {historyList.length > 0 && `(${historyList.length})`}
            {showHistory ? (
              <ChevronUp className="h-3.5 w-3.5 ml-1" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 ml-1" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          AI 仅生成建议供您勾选与微调，确认后才会执行移动与打标，并全程支持一键撤销。引擎：{engine === 'auto'
            ? deepSeekOn ? 'DeepSeek（已配置）' : 'DeepSeek 未配置，使用本地规则'
            : '本地规则'}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 历史记录与撤销面板 */}
        {showHistory && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between pb-1 border-b border-border/50">
              <span className="font-medium text-foreground">最近整理历史记录</span>
              <span className="text-muted-foreground">支持一键还原移动与标签</span>
            </div>
            {historyList.length === 0 ? (
              <p className="text-muted-foreground py-2 text-center">暂无整理记录</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {historyList.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 p-2 rounded bg-background border text-xs"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">
                          {new Date(item.timestamp).toLocaleString()}
                        </span>
                        {item.rolledBack ? (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            已撤销
                          </Badge>
                        ) : (
                          <Badge variant="default" className="text-[10px] bg-green-600 text-white">
                            已应用
                          </Badge>
                        )}
                      </div>
                      <div className="text-muted-foreground mt-0.5">
                        处理 {item.result.processed} 项（移动 {item.result.moved}，打标 {item.result.tagged}）
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!item.rolledBack && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isRollingBack === item.id}
                          onClick={() => handleRollback(item.id)}
                          className="h-7 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                        >
                          {isRollingBack === item.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                          ) : (
                            <Undo2 className="h-3.5 w-3.5 mr-1" />
                          )}
                          一键撤销
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteHistory(item.id)}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 配置区 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">整理范围</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="all">全部书签（{bookmarks.length}）</option>
              <option value="root-only">仅根目录未整理书签（{rootBookmarks.length}）</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.path ? `${folder.path}/` : ''}
                  {folder.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">推荐引擎</label>
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

        {/* 操作栏 */}
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
                disabled={filteredSuggestions.every((s) => !excluded.has(s.node.id))}
                className="text-xs h-9"
              >
                <CheckSquare className="h-3.5 w-3.5 mr-1" />
                全选当前
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeselectAll}
                disabled={filteredSuggestions.every((s) => excluded.has(s.node.id))}
                className="text-xs h-9"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                取消当前
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

        {/* 提示信息 */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-2.5 rounded-md">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {rollbackSuccess && (
          <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/30 p-2.5 rounded-md border border-green-200 dark:border-green-900">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{rollbackSuccess}</span>
          </div>
        )}

        {/* 整理成功横幅 */}
        {result && (
          <div className="rounded-lg border bg-green-50 dark:bg-green-950/30 p-3 text-sm">
            <div className="font-medium text-green-800 dark:text-green-300">
              已成功应用 {result.applied} 条建议：移动 {result.moved} 项、打标 {result.tagged} 项
            </div>
            {result.errors.length > 0 && (
              <div className="text-xs text-destructive mt-1">
                {result.errors.slice(0, 3).join('；')}
                {result.errors.length > 3 ? ` 等 ${result.errors.length} 条` : ''}
              </div>
            )}
          </div>
        )}

        {/* 建议列表与搜索筛选区 */}
        {suggestions && (
          <div className="space-y-3">
            {suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center border rounded-lg bg-muted/10">
                当前范围内没有满足置信度要求的整理建议，可尝试调低最小置信度或选择其他范围
              </p>
            ) : (
              <>
                {/* 搜索与分类 Tab */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setFilterType('all')}
                      className={cn(
                        'px-2.5 py-1 text-xs rounded-full font-medium transition-colors',
                        filterType === 'all'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      )}
                    >
                      全部 ({suggestions.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterType('move')}
                      className={cn(
                        'px-2.5 py-1 text-xs rounded-full font-medium transition-colors',
                        filterType === 'move'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      )}
                    >
                      建议移动 ({moveSuggestionsCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterType('tag')}
                      className={cn(
                        'px-2.5 py-1 text-xs rounded-full font-medium transition-colors',
                        filterType === 'tag'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      )}
                    >
                      仅新增标签 ({tagOnlySuggestionsCount})
                    </button>
                  </div>
                  <div className="relative w-full sm:w-56">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="搜索建议..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full h-8 pl-8 pr-3 text-xs rounded-md border border-input bg-transparent placeholder:text-muted-foreground"
                    />
                  </div>
                </div>

                <div className="text-xs text-muted-foreground flex items-center justify-between">
                  <span>
                    显示 {filteredSuggestions.length} / 共 {suggestions.length} 条建议，已选中 {selectedCount} 条
                  </span>
                  <span className="text-[11px]">点击标签 × 可剔除单项，点击文件夹可直接修改目标目录</span>
                </div>

                <ScrollArea style={{ maxHeight: '380px' }}>
                  <div className="space-y-1.5 pr-2">
                    {filteredSuggestions.map((suggestion) => {
                      const checked = !excluded.has(suggestion.node.id);
                      const isEditingFolder = editingFolderId === suggestion.node.id;

                      return (
                        <div
                          key={suggestion.node.id}
                          className={cn(
                            'flex flex-col sm:flex-row sm:items-center gap-2 rounded-md border p-2.5 text-sm transition-colors',
                            checked ? 'bg-background hover:border-primary/40' : 'opacity-50 bg-muted/20'
                          )}
                        >
                          <div className="flex items-center gap-2.5 flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleExcluded(suggestion.node.id)}
                              className="rounded border-input text-primary shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="truncate font-medium text-foreground text-xs sm:text-sm">
                                {suggestion.node.title || suggestion.node.url}
                              </div>
                              {/* 文件夹变动展示与微调 */}
                              <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1">
                                <span className="truncate max-w-[120px]">{suggestion.node.path || '根书签'}</span>
                                <span>→</span>
                                {isEditingFolder ? (
                                  <div className="inline-flex items-center gap-1">
                                    <input
                                      type="text"
                                      value={editingFolderValue}
                                      onChange={(e) => setEditingFolderValue(e.target.value)}
                                      placeholder="例如 开发/文档"
                                      className="h-6 px-1.5 text-xs rounded border border-input bg-background w-32"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveEditFolder(suggestion.node.id);
                                        if (e.key === 'Escape') setEditingFolderId(null);
                                      }}
                                    />
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6"
                                      onClick={() => handleSaveEditFolder(suggestion.node.id)}
                                    >
                                      <CheckCircle2 className="h-3 w-3 text-green-600" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6"
                                      onClick={() => setEditingFolderId(null)}
                                    >
                                      <X className="h-3 w-3 text-muted-foreground" />
                                    </Button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleStartEditFolder(suggestion.node.id, suggestion.suggestedFolderPath)}
                                    className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                                    title="点击修改目标文件夹"
                                  >
                                    <Folder className="h-3 w-3" />
                                    <span>{suggestion.suggestedFolderPath ?? '（保持原位置）'}</span>
                                    <Edit2 className="h-2.5 w-2.5 opacity-60 ml-0.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* 标签与置信度 */}
                          <div className="flex items-center justify-between sm:justify-end gap-2 pl-6 sm:pl-0 shrink-0">
                            <div className="flex flex-wrap items-center gap-1">
                              {suggestion.suggestedTags.map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="secondary"
                                  className="text-[11px] h-5 pl-1.5 pr-1 inline-flex items-center gap-0.5 group"
                                >
                                  <span>{tag}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveSuggestedTag(suggestion.node.id, tag);
                                    }}
                                    className="opacity-50 hover:opacity-100 hover:text-destructive"
                                    title={`移除标签 "${tag}"`}
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                            <span
                              className="text-[11px] text-muted-foreground font-mono w-9 text-right"
                              title={`推荐理由: ${suggestion.reason} (置信度: ${(suggestion.confidence * 100).toFixed(0)}%)`}
                            >
                              {(suggestion.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
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

