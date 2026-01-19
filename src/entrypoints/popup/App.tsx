// Popup 主应用组件

import * as React from 'react';
import { Plus, Settings, Bookmark, Heart, Clock, AlertTriangle, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SearchBar } from '@/components/search/SearchBar';
import { BookmarkList } from '@/components/bookmark/BookmarkList';
import { AddBookmarkForm } from '@/components/bookmark/AddBookmarkForm';
import { useBookmarkStore, useFolderStore, useTagStore, useUIStore, initializeTheme } from '@/stores';
import { initDatabase } from '@/lib/database';
import { cn } from '@/lib/utils';
import '@/styles/globals.css';

type ViewType = 'all' | 'favorites' | 'recent' | 'broken' | 'add';

export function App() {
  const [currentView, setCurrentView] = React.useState<ViewType>('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isInitialized, setIsInitialized] = React.useState(false);

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
    clearFilters,
  } = useBookmarkStore();

  const { loadFolders } = useFolderStore();
  const { loadTags } = useTagStore();
  const { openEditBookmark } = useUIStore();

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

    if (view === 'add') return;

    clearFilters();

    switch (view) {
      case 'favorites':
        setFilters({ isFavorite: true });
        break;
      case 'recent':
        // 最近添加的书签（默认排序）
        break;
      case 'broken':
        setFilters({ status: 'broken' });
        break;
      default:
        break;
    }
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

  // 获取过滤后的书签
  const getFilteredBookmarks = () => {
    if (currentView === 'recent') {
      return [...bookmarks].sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
    }
    return bookmarks;
  };

  if (!isInitialized) {
    return (
      <div className="popup-container flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">加载中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="popup-container flex flex-col bg-background">
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
          onClick={() => chrome.runtime.openOptionsPage()}
        >
          <Settings className="h-4 w-4" />
        </Button>
        <Button
          variant={currentView === 'add' ? 'default' : 'outline'}
          size="icon"
          className="h-8 w-8"
          onClick={() => handleViewChange(currentView === 'add' ? 'all' : 'add')}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </header>

      {/* Quick Actions */}
      {currentView !== 'add' && (
        <div className="flex items-center gap-1 border-b px-3 py-2">
          <QuickAction
            icon={<FolderOpen className="h-4 w-4" />}
            label="全部"
            active={currentView === 'all'}
            onClick={() => handleViewChange('all')}
          />
          <QuickAction
            icon={<Clock className="h-4 w-4" />}
            label="最近"
            active={currentView === 'recent'}
            onClick={() => handleViewChange('recent')}
          />
          <QuickAction
            icon={<Heart className="h-4 w-4" />}
            label="收藏"
            active={currentView === 'favorites'}
            onClick={() => handleViewChange('favorites')}
          />
          <QuickAction
            icon={<AlertTriangle className="h-4 w-4" />}
            label="失效"
            active={currentView === 'broken'}
            onClick={() => handleViewChange('broken')}
          />
        </div>
      )}

      {/* Search Bar */}
      {currentView !== 'add' && (
        <div className="px-3 py-2">
          <SearchBar
            value={searchQuery}
            onChange={handleSearch}
            placeholder="搜索书签..."
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden px-2">
        {currentView === 'add' ? (
          <AddBookmarkForm
            onSubmit={handleAddBookmark}
            onCancel={() => setCurrentView('all')}
            className="p-2"
          />
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
            compact
            maxHeight="320px"
          />
        )}
      </div>

      {/* Footer */}
      <footer className="border-t px-3 py-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {bookmarks.length} 个书签
          </span>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => chrome.sidePanel?.open?.({ windowId: chrome.windows?.WINDOW_ID_CURRENT })}
          >
            打开侧边栏
          </Button>
        </div>
      </footer>
    </div>
  );
}

// 快捷操作按钮
function QuickAction({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={active ? 'secondary' : 'ghost'}
      size="sm"
      className={cn('h-8 gap-1.5 px-2.5', active && 'bg-primary/10')}
      onClick={onClick}
    >
      {icon}
      <span className="text-xs">{label}</span>
    </Button>
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
      return '没有失效的链接';
    default:
      return '暂无书签';
  }
}

export default App;
