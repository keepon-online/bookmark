// Sidepanel 主应用组件
// v0.6：数据来自 chrome.bookmarks（唯一数据源），文件夹树/标签/搜索全部
// 基于内存快照派生；增删改移直写浏览器书签。

import * as React from 'react';
import {
  Plus,
  Settings,
  Bookmark,
  Heart,
  Clock,
  AlertTriangle,
  FolderOpen,
  ChevronRight,
  RefreshCw,
  Tag as TagIcon,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { SearchBar } from '@/components/search/SearchBar';
import { BrowserBookmarkList } from '@/components/bookmark/BrowserBookmarkList';
import { BrowserBookmarkForm } from '@/components/bookmark/BrowserBookmarkForm';
import { useFilteredBookmarks } from '@/components/bookmark/useBookmarkFilter';
import { useBookmarkEditor } from '@/components/bookmark/useBookmarkEditor';
import { useBrowserBookmarkStore, selectAllTags, initializeTheme } from '@/stores';
import { cn } from '@/lib/utils';
import type { BrowserTreeNode } from '@/types';
import '@/styles/globals.css';

type ViewType = 'all' | 'favorites' | 'recent' | 'broken' | 'folder' | 'tag';

export function App() {
  const [isAddOpen, setIsAddOpen] = React.useState(false);

  const isInitialized = useBrowserBookmarkStore((state) => state.isInitialized);
  const isLoading = useBrowserBookmarkStore((state) => state.isLoading);
  const tree = useBrowserBookmarkStore((state) => state.tree);
  const bookmarks = useBrowserBookmarkStore((state) => state.bookmarks);
  const meta = useBrowserBookmarkStore((state) => state.meta);
  const selectedIds = useBrowserBookmarkStore((state) => state.selectedIds);
  const currentFolderId = useBrowserBookmarkStore((state) => state.currentFolderId);
  const filter = useBrowserBookmarkStore((state) => state.filter);
  const selectedTag = useBrowserBookmarkStore((state) => state.selectedTag);
  const searchQuery = useBrowserBookmarkStore((state) => state.searchQuery);

  const setSearchQuery = useBrowserBookmarkStore((state) => state.setSearchQuery);
  const setCurrentFolder = useBrowserBookmarkStore((state) => state.setCurrentFolder);
  const setFilter = useBrowserBookmarkStore((state) => state.setFilter);
  const toggleSelect = useBrowserBookmarkStore((state) => state.toggleSelect);
  const clearSelection = useBrowserBookmarkStore((state) => state.clearSelection);
  const toggleFavorite = useBrowserBookmarkStore((state) => state.toggleFavorite);
  const removeBookmarks = useBrowserBookmarkStore((state) => state.removeBookmarks);
  const refresh = useBrowserBookmarkStore((state) => state.refresh);

  const editor = useBookmarkEditor();

  const filtered = useFilteredBookmarks();
  const tags = React.useMemo(() => selectAllTags(meta).slice(0, 30), [meta]);
  const brokenCount = React.useMemo(
    () =>
      bookmarks.filter((b) => {
        const status = meta[b.id]?.linkStatus;
        return status === 'broken' || status === 'unreachable';
      }).length,
    [bookmarks, meta]
  );
  const favoriteCount = React.useMemo(
    () => bookmarks.filter((b) => meta[b.id]?.isFavorite).length,
    [bookmarks, meta]
  );

  // 初始化：加载树 + 订阅浏览器书签事件 + 应用主题
  React.useEffect(() => {
    initializeTheme();
    void useBrowserBookmarkStore.getState().init();
  }, []);

  const activeView: ViewType =
    filter === 'tag' && selectedTag
      ? 'tag'
      : currentFolderId
        ? 'folder'
        : filter === 'broken' || filter === 'favorites' || filter === 'recent'
          ? filter
          : 'all';

  const handleQuickView = (view: 'all' | 'recent' | 'favorites' | 'broken') => {
    setFilter(view);
  };

  const handleTagSelect = (tag: string) => {
    setFilter('tag', tag);
  };

  // 添加书签（写 chrome.bookmarks，标签写 aux）
  const handleAddSubmit = async (value: {
    url: string;
    title: string;
    folderId?: string;
    tags: string[];
  }) => {
    const store = useBrowserBookmarkStore.getState();
    await store.addBookmark({ url: value.url, title: value.title, parentId: value.folderId });
    if (value.tags.length > 0) {
      const created = store.bookmarks.find((bookmark) => bookmark.url === value.url);
      if (created) {
        await store.addTags([created.id], value.tags);
      }
    }
    setIsAddOpen(false);
  };

  if (!isInitialized) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">加载中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Bookmark className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm">智能书签</span>
        </div>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="刷新"
          onClick={() => void refresh()}
        >
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="设置"
          onClick={() => chrome.runtime.openOptionsPage()}
        >
          <Settings className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => setIsAddOpen(true)}>
          <Plus className="h-4 w-4" />
          添加
        </Button>
      </header>

      {/* 搜索栏 */}
      <div className="px-3 py-2 border-b">
        <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="搜索书签..." />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 侧栏：快速视图 + 文件夹树 + 标签 */}
        <aside className="w-48 border-r bg-muted/30 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-2 space-y-4">
              <div className="space-y-0.5">
                <SidebarItem
                  icon={<FolderOpen className="h-4 w-4" />}
                  label="全部书签"
                  count={bookmarks.length}
                  active={activeView === 'all'}
                  onClick={() => handleQuickView('all')}
                />
                <SidebarItem
                  icon={<Clock className="h-4 w-4" />}
                  label="最近添加"
                  active={activeView === 'recent'}
                  onClick={() => handleQuickView('recent')}
                />
                <SidebarItem
                  icon={<Heart className="h-4 w-4" />}
                  label="收藏"
                  count={favoriteCount > 0 ? favoriteCount : undefined}
                  active={activeView === 'favorites'}
                  onClick={() => handleQuickView('favorites')}
                />
                <SidebarItem
                  icon={<AlertTriangle className="h-4 w-4" />}
                  label="失效链接"
                  count={brokenCount > 0 ? brokenCount : undefined}
                  active={activeView === 'broken'}
                  onClick={() => handleQuickView('broken')}
                />
              </div>

              {/* 文件夹树 */}
              <div>
                <div className="px-2 py-1 text-xs font-medium text-muted-foreground">文件夹</div>
                <div className="space-y-0.5">
                  {tree.map((node) => (
                    <FolderTreeItem
                      key={node.id}
                      node={node}
                      activeFolderId={currentFolderId}
                      onSelect={setCurrentFolder}
                    />
                  ))}
                </div>
              </div>

              {/* 标签 */}
              {tags.length > 0 && (
                <div>
                  <div className="px-2 py-1 text-xs font-medium text-muted-foreground">标签</div>
                  <div className="flex flex-wrap gap-1 px-1">
                    {tags.map((tag) => (
                      <Badge
                        key={tag.name}
                        variant={selectedTag === tag.name ? 'default' : 'secondary'}
                        className="cursor-pointer text-xs"
                        onClick={() => handleTagSelect(tag.name)}
                      >
                        <TagIcon className="h-3 w-3 mr-0.5" />
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* 主内容区 */}
        <main className="flex-1 overflow-hidden p-2">
          <BrowserBookmarkList
            bookmarks={filtered}
            meta={meta}
            isLoading={isLoading}
            selectedIds={selectedIds}
            onSelect={toggleSelect}
            onFavorite={toggleFavorite}
            onEdit={editor.beginEdit}
            onDelete={(id) => void removeBookmarks([id])}
            onOpen={(id) => void useBrowserBookmarkStore.getState().recordVisit(id)}
            onTagClick={handleTagSelect}
            emptyMessage={getEmptyMessage(activeView, selectedTag)}
            maxHeight="100%"
          />
        </main>
      </div>

      {/* 底部：批量操作 */}
      {selectedIds.size > 0 && (
        <footer className="border-t px-3 py-2 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">已选 {selectedIds.size} 项</span>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearSelection}>
            取消选择
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              void removeBookmarks([...selectedIds]);
              clearSelection();
            }}
          >
            删除所选
          </Button>
        </footer>
      )}

      {/* 编辑书签对话框 */}
      {editor.editingNode && (
        <Dialog title="编辑书签" onClose={editor.cancelEdit}>
          <BrowserBookmarkForm
            initial={editor.editingNode}
            initialTags={editor.editingTags}
            folders={editor.folderOptions}
            onSubmit={editor.submitEdit}
            onCancel={editor.cancelEdit}
          />
        </Dialog>
      )}

      {/* 添加书签对话框 */}
      {isAddOpen && (
        <Dialog title="添加书签" onClose={() => setIsAddOpen(false)}>
          <BrowserBookmarkForm
            folders={editor.folderOptions}
            onSubmit={handleAddSubmit}
            onCancel={() => setIsAddOpen(false)}
          />
        </Dialog>
      )}
    </div>
  );
}

// 通用对话框
function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-background border shadow-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

// 侧栏快速视图项
function SidebarItem({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
        active ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-accent'
      )}
      onClick={onClick}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {count !== undefined && <span className="text-xs text-muted-foreground">{count}</span>}
    </button>
  );
}

// 文件夹树节点（递归）
function FolderTreeItem({
  node,
  activeFolderId,
  onSelect,
  depth = 0,
}: {
  node: BrowserTreeNode;
  activeFolderId?: string;
  onSelect: (folderId: string | undefined) => void;
  depth?: number;
}) {
  const [isExpanded, setIsExpanded] = React.useState(depth < 2);
  const childFolders = node.children.filter((child) => !child.url);
  const bookmarkCount = node.children.filter((child) => child.url).length;

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1.5 rounded-md text-sm cursor-pointer transition-colors',
          activeFolderId === node.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-accent'
        )}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        onClick={() => onSelect(activeFolderId === node.id ? undefined : node.id)}
      >
        {childFolders.length > 0 ? (
          <ChevronRight
            className={cn(
              'h-3.5 w-3.5 shrink-0 transition-transform',
              isExpanded && 'rotate-90'
            )}
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          />
        ) : (
          <span className="w-3.5" />
        )}
        <FolderOpen className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate text-left">{node.title}</span>
        {bookmarkCount > 0 && <span className="text-xs text-muted-foreground">{bookmarkCount}</span>}
      </div>
      {isExpanded &&
        childFolders.map((child) => (
          <FolderTreeItem
            key={child.id}
            node={child}
            activeFolderId={activeFolderId}
            onSelect={onSelect}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}

// 空状态文案
function getEmptyMessage(view: ViewType, selectedTag?: string): string {
  switch (view) {
    case 'favorites':
      return '暂无收藏的书签';
    case 'recent':
      return '暂无最近添加的书签';
    case 'broken':
      return '没有失效的链接';
    case 'tag':
      return `没有标签为 "${selectedTag}" 的书签`;
    case 'folder':
      return '此文件夹为空';
    default:
      return '暂无书签';
  }
}

export default App;
