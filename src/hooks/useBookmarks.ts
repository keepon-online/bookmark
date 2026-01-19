// 书签相关 Hooks

import { useEffect } from 'react';
import { useBookmarkStore, useFolderStore, useTagStore } from '@/stores';
import { initDatabase } from '@/lib/database';

// 初始化书签数据
export function useBookmarks() {
  const bookmarkStore = useBookmarkStore();
  const folderStore = useFolderStore();
  const tagStore = useTagStore();

  useEffect(() => {
    const init = async () => {
      try {
        await initDatabase();
        await Promise.all([
          bookmarkStore.loadBookmarks(),
          folderStore.loadFolders(),
          tagStore.loadTags(),
        ]);
      } catch (error) {
        console.error('Failed to initialize bookmarks:', error);
      }
    };
    init();
  }, []);

  return {
    bookmarks: bookmarkStore.bookmarks,
    folders: folderStore.folders,
    folderTree: folderStore.folderTree,
    tags: tagStore.tags,
    popularTags: tagStore.popularTags,
    isLoading: bookmarkStore.isLoading || folderStore.isLoading || tagStore.isLoading,
    error: bookmarkStore.error || folderStore.error || tagStore.error,
    refresh: async () => {
      await Promise.all([
        bookmarkStore.refresh(),
        folderStore.refresh(),
        tagStore.refresh(),
      ]);
    },
  };
}

// 单个书签操作
export function useBookmark(id: string) {
  const { bookmarks, updateBookmark, deleteBookmark, toggleFavorite } = useBookmarkStore();
  const bookmark = bookmarks.find((b) => b.id === id);

  return {
    bookmark,
    update: (dto: Parameters<typeof updateBookmark>[1]) => updateBookmark(id, dto),
    delete: () => deleteBookmark(id),
    toggleFavorite: () => toggleFavorite(id),
  };
}
