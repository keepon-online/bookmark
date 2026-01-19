// Sidepanel 主应用组件

import * as React from 'react';
import {
  Plus,
  Settings,
  Bookmark,
  Heart,
  Clock,
  AlertTriangle,
  FolderOpen,
  Tag,
  Search,
  ChevronRight,
  ChevronDown,
  Import,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { SearchBar } from '@/components/search/SearchBar';
import { BookmarkList } from '@/components/bookmark/BookmarkList';
import { AddBookmarkForm } from '@/components/bookmark/AddBookmarkForm';
import {
  useBookmarkStore,
  useFolderStore,
  useTagStore,
  useUIStore,
  initializeTheme,
} from '@/stores';
import { initDatabase } from '@/lib/database';
import { cn } from '@/lib/utils';
import type { FolderTreeNode } from '@/types';
import '@/styles/globals.css';

type ViewType = 'all' | 'favorites' | 'recent' | 'broken' | 'folder' | 'tag' | 'add';

export function App() {
  const [currentView, setCurrentView] = React.useState<ViewType>('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedFolderId, setSelectedFolderId] = React.useState<string | undefined>();
  const [selectedTag, setSelectedTag] = React.useState<string | undefined>();
  const [isInitialized, setIsInitialized] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);

  const {
    bookmarks,
    isLoading,
    selectedIds,
    loadBookmarks,
    search,
    toggleSelect,
    toggleFavorite,
    deleteBookmark,
    createBookmark,
    setFilters,
    setCurrentFolder,
    clearFilters,
    refresh,
  } = useBookmarkStore();

  const { folderTree, loadFolders } = useFolderStore();
  const { tags, popularTags, loadTags } = useTagStore();
  const { openEditBookmark, sidebarCollapsed, toggleSidebar } = useUIStore();
  const { importFromBrowser } = useBookmarkStore.getState();

  // 初始化
  React.useEffect(() => {
    const init = async () => {
      try {
        await initDatabase();
        initializeTheme();
        await Promise.all([loadBookmarks(), loadFolders(), loadTags()]);
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize:', error);
      }
    };
    init();
  }, []);

  // 处理视图切换
  const handleViewChange = (view: ViewType) => {
    setCurrentView(view);
    setSearchQuery('');
    setSelectedFolderId(undefined);
    setSelectedTag(undefined);

    if (view === 'add') return;

    clearFilters();

    switch (view) {
      case 'favorites':
        setFilters({ isFavorite: true });
        break;
      case 'recent':
        break;
      case 'broken':
        setFilters({ status: 'broken' });
        break;
      default:
        break;
    }
  };

  // 处理文件夹选择
  const handleFolderSelect = (folderId: string) => {
    setCurrentView('folder');
    setSelectedFolderId(folderId);
    setSelectedTag(undefined);
    setCurrentFolder(folderId);
  };

  // 处理标签选择
  const handleTagSelect = (tag: string) => {
    setCurrentView('tag');
    setSelectedTag(tag);
    setSelectedFolderId(undefined);
    clearFilters();
    // 过滤包含该标签的书签
    const filtered = bookmarks.filter((b) => b.tags.includes(tag));
    // 由于 store 不直接支持标签过滤，我们在本地处理
  };

  // 处理搜索
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      search(query);
    } else {
      loadBookmarks();
    }
  };

  // 处理添加书签
  const handleAddBookmark = async (dto: Parameters<typeof createBookmark>[0]) => {
    await createBookmark(dto);
    setCurrentView('all');
  };

  // 处理导入
  const handleImport = async () => {
    setIsImporting(true);
    try {
      const { bookmarkService } = await import('@/services');
      const result = await bookmarkService.importFromBrowser();
      console.log('Import result:', result);
      await refresh();
    } catch (error) {
      console.error('Import failed:', error);
    } finally {
      setIsImporting(false);
    }
  };

  // 获取过滤后的书签
  const getFilteredBookmarks = () => {
    let filtered = bookmarks;

    if (currentView === 'recent') {
      filtered = [...bookmarks].sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
    }

    if (currentView === 'tag' && selectedTag) {
      filtered = bookmarks.filter((b) => b.tags.includes(selectedTag));
    }

    return filtered;
  };

  // 获取视图标题
  const getViewTitle = () => {
    switch (currentView) {
      case 'all':
        return '全部书签';
      case 'favorites':
        return '收藏';
      case 'recent':
        return '最近添加';
      case 'broken':
        return '失效链接';
      case 'folder':
        return '文件夹';
      case 'tag':
        return `标签: ${selectedTag}`;
      case 'add':
        return '添加书签';
      default:
        return '书签';
    }
  };

  if (!isInitialized) {
    return (
      <div className="sidepanel-container flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">加载中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="sidepanel-container flex bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col border-r bg-muted/30 transition-all duration-200',
          sidebarCollapsed ? 'w-12' : 'w-56'
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 border-b px-3 py-3">
          <Bookmark className="h-5 w-5 text-primary flex-shrink-0" />
          {!sidebarCollapsed && <span className="font-semibold text-sm">智能书签</span>}
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {/* Quick Links */}
            <SidebarItem
              icon={<FolderOpen className="h-4 w-4" />}
              label="全部"
              active={currentView === 'all'}
              collapsed={sidebarCollapsed}
              onClick={() => handleViewChange('all')}
            />
            <SidebarItem
              icon={<Clock className="h-4 w-4" />}
              label="最近"
              active={currentView === 'recent'}
              collapsed={sidebarCollapsed}
              onClick={() => handleViewChange('recent')}
            />
            <SidebarItem
              icon={<Heart className="h-4 w-4" />}
              label="收藏"
              active={currentView === 'favorites'}
              collapsed={sidebarCollapsed}
              onClick={() => handleViewChange('favorites')}
            />
            <SidebarItem
              icon={<AlertTriangle className="h-4 w-4" />}
              label="失效"
              active={currentView === 'broken'}
              collapsed={sidebarCollapsed}
              onClick={() => handleViewChange('broken')}
            />

            {/* Divider */}
            <div className="my-2 h-px bg-border" />

            {/* Folders */}
            {!sidebarCollapsed && (
              <div className="space-y-1">
                <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                  文件夹
                </div>
                {folderTree.length > 0 ? (
                  folderTree.map((folder) => (
                    <FolderTreeItem
                      key={folder.id}
                      folder={folder}
                      selectedId={selectedFolderId}
                      onSelect={handleFolderSelect}
                    />
                  ))
                ) : (
                  <div className="px-2 py-1 text-xs text-muted-foreground">
                    暂无文件夹
                  </div>
                )}
              </div>
            )}

            {/* Divider */}
            {!sidebarCollapsed && <div className="my-2 h-px bg-border" />}

            {/* Tags */}
            {!sidebarCollapsed && (
              <div className="space-y-1">
                <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                  热门标签
                </div>
                <div className="flex flex-wrap gap-1 px-2">
                  {popularTags.slice(0, 8).map((tag) => (
                    <Badge
                      key={tag.id}
                      variant={selectedTag === tag.name ? 'default' : 'secondary'}
                      className="cursor-pointer text-xs"
                      onClick={() => handleTagSelect(tag.name)}
                    >
                      {tag.name}
                      <span className="ml-1 text-[10px] opacity-60">{tag.usageCount}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Sidebar Footer */}
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={toggleSidebar}
          >
            <ChevronRight
              className={cn('h-4 w-4 transition-transform', !sidebarCollapsed && 'rotate-180')}
            />
            {!sidebarCollapsed && <span className="text-xs">收起</span>}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <h1 className="font-semibold">{getViewTitle()}</h1>
          <div className="flex-1" />

          {currentView !== 'add' && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={handleImport}
                disabled={isImporting}
              >
                <Import className="h-4 w-4" />
                {isImporting ? '导入中...' : '导入'}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => refresh()}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => chrome.runtime.openOptionsPage()}
              >
                <Settings className="h-4 w-4" />
              </Button>
              <Button
                variant={currentView === 'add' ? 'default' : 'default'}
                size="sm"
                className="gap-1"
                onClick={() => handleViewChange('add')}
              >
                <Plus className="h-4 w-4" />
                添加
              </Button>
            </>
          )}
        </header>

        {/* Search Bar */}
        {currentView !== 'add' && (
          <div className="px-4 py-3 border-b">
            <SearchBar
              value={searchQuery}
              onChange={handleSearch}
              placeholder="搜索书签..."
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {currentView === 'add' ? (
            <div className="p-4">
              <AddBookmarkForm
                onSubmit={handleAddBookmark}
                onCancel={() => handleViewChange('all')}
              />
            </div>
          ) : (
            <BookmarkList
              bookmarks={getFilteredBookmarks()}
              isLoading={isLoading}
              selectedIds={selectedIds}
              onSelect={toggleSelect}
              onFavorite={toggleFavorite}
              onEdit={openEditBookmark}
              onDelete={deleteBookmark}
              emptyMessage={getEmptyMessage(currentView)}
              maxHeight="calc(100vh - 180px)"
            />
          )}
        </div>

        {/* Footer */}
        <footer className="border-t px-4 py-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{getFilteredBookmarks().length} 个书签</span>
            {selectedIds.size > 0 && (
              <span className="text-primary">已选择 {selectedIds.size} 项</span>
            )}
          </div>
        </footer>
      </main>
    </div>
  );
}

// 侧边栏项目
function SidebarItem({
  icon,
  label,
  active,
  collapsed,
  onClick,
  count,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
  count?: number;
}) {
  return (
    <Button
      variant={active ? 'secondary' : 'ghost'}
      size="sm"
      className={cn(
        'w-full justify-start gap-2',
        collapsed && 'justify-center px-0',
        active && 'bg-primary/10'
      )}
      onClick={onClick}
      title={collapsed ? label : undefined}
    >
      {icon}
      {!collapsed && (
        <>
          <span className="flex-1 text-left text-sm">{label}</span>
          {count !== undefined && (
            <span className="text-xs text-muted-foreground">{count}</span>
          )}
        </>
      )}
    </Button>
  );
}

// 文件夹树项目
function FolderTreeItem({
  folder,
  selectedId,
  onSelect,
  level = 0,
}: {
  folder: FolderTreeNode;
  selectedId?: string;
  onSelect: (id: string) => void;
  level?: number;
}) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const hasChildren = folder.children.length > 0;

  return (
    <div>
      <Button
        variant={selectedId === folder.id ? 'secondary' : 'ghost'}
        size="sm"
        className={cn(
          'w-full justify-start gap-1 h-8',
          selectedId === folder.id && 'bg-primary/10'
        )}
        style={{ paddingLeft: `${8 + level * 12}px` }}
        onClick={() => onSelect(folder.id)}
      >
        {hasChildren ? (
          <button
            className="p-0.5 hover:bg-accent rounded"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          >
            <ChevronRight
              className={cn('h-3 w-3 transition-transform', isExpanded && 'rotate-90')}
            />
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span className="text-sm">{folder.icon || '📁'}</span>
        <span className="flex-1 text-left text-sm truncate">{folder.name}</span>
        <span className="text-xs text-muted-foreground">{folder.bookmarkCount}</span>
      </Button>

      {isExpanded && hasChildren && (
        <div>
          {folder.children.map((child) => (
            <FolderTreeItem
              key={child.id}
              folder={child}
              selectedId={selectedId}
              onSelect={onSelect}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// 获取空状态消息
function getEmptyMessage(view: ViewType): string {
  switch (view) {
    case 'favorites':
      return '暂无收藏的书签';
    case 'recent':
      return '暂无最近添加的书签';
    case 'broken':
      return '没有失效的链接 🎉';
    case 'folder':
      return '该文件夹暂无书签';
    case 'tag':
      return '没有带此标签的书签';
    default:
      return '暂无书签，点击"导入"从浏览器导入';
  }
}

export default App;
