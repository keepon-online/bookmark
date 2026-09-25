// Popup 主应用组件
// v0.6：数据来自 chrome.bookmarks（唯一数据源），通过 browserBookmarkStore 访问

import * as React from 'react';
import { Plus, Settings, Bookmark, Heart, Clock, AlertTriangle, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SearchBar } from '@/components/search/SearchBar';
import { BrowserBookmarkList } from '@/components/bookmark/BrowserBookmarkList';
import { BrowserBookmarkForm } from '@/components/bookmark/BrowserBookmarkForm';
import { useFilteredBookmarks } from '@/components/bookmark/useBookmarkFilter';
import { useBrowserBookmarkStore, initializeTheme } from '@/stores';
import { cn } from '@/lib/utils';
import '@/styles/globals.css';

type ViewType = 'all' | 'favorites' | 'recent' | 'broken' | 'add';

export function App() {
  const [currentView, setCurrentView] = React.useState<ViewType>('all');

  const isInitialized = useBrowserBookmarkStore((state) => state.isInitialized);
  const isLoading = useBrowserBookmarkStore((state) => state.isLoading);
  const bookmarks = useBrowserBookmarkStore((state) => state.bookmarks);
  const folders = useBrowserBookmarkStore((state) => state.folders);
  const meta = useBrowserBookmarkStore((state) => state.meta);
  const selectedIds = useBrowserBookmarkStore((state) => state.selectedIds);

  const setSearchQuery = useBrowserBookmarkStore((state) => state.setSearchQuery);
  const setFilter = useBrowserBookmarkStore((state) => state.setFilter);
  const toggleSelect = useBrowserBookmarkStore((state) => state.toggleSelect);
  const toggleFavorite = useBrowserBookmarkStore((state) => state.toggleFavorite);
  const removeBookmarks = useBrowserBookmarkStore((state) => state.removeBookmarks);
  const recordVisit = useBrowserBookmarkStore((state) => state.recordVisit);

  const filtered = useFilteredBookmarks();
  const searchQuery = useBrowserBookmarkStore((state) => state.searchQuery);

  // 初始化：加载树 + 订阅浏览器书签事件 + 应用主题
  React.useEffect(() => {
    initializeTheme();
    void useBrowserBookmarkStore.getState().init();
  }, []);

  // 处理视图切换
  const handleViewChange = (view: ViewType) => {
    setCurrentView(view);
    setSearchQuery('');
    if (view !== 'add') {
      const filter = view === 'all' ? 'all' : view === 'recent' ? 'recent' : view;
      setFilter(filter as 'all' | 'recent' | 'favorites' | 'broken');
    }
  };

  // 处理搜索
  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  // 处理添加书签（写 chrome.bookmarks，标签写 aux）
  const handleAddBookmark = async (value: {
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
    setCurrentView('all');
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

      {/* 快速过滤 */}
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

      {/* 搜索栏 */}
      {currentView !== 'add' && (
        <div className="px-3 py-2">
          <SearchBar value={searchQuery} onChange={handleSearch} placeholder="搜索书签..." />
        </div>
      )}

      {/* 内容 */}
      <div className="flex-1 overflow-hidden px-2">
        {currentView === 'add' ? (
          <BrowserBookmarkForm
            folders={folders.map((folder) => ({
              id: folder.id,
              title: folder.title,
              path: folder.path,
            }))}
            onSubmit={handleAddBookmark}
            onCancel={() => setCurrentView('all')}
            className="p-2"
          />
        ) : (
          <BrowserBookmarkList
            bookmarks={filtered}
            meta={meta}
            isLoading={isLoading}
            selectedIds={selectedIds}
            onSelect={toggleSelect}
            onFavorite={toggleFavorite}
            onDelete={(id) => void removeBookmarks([id])}
            onOpen={(id) => void recordVisit(id)}
            onTagClick={(tag) => {
              setFilter('tag', tag);
              setCurrentView('all');
            }}
            emptyMessage={getEmptyMessage(currentView)}
            compact
            maxHeight="320px"
          />
        )}
      </div>

      {/* Footer */}
      <footer className="border-t px-3 py-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{bookmarks.length} 个书签</span>
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
