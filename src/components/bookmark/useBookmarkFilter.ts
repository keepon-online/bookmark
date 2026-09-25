// 书签过滤与搜索 Hook
// 基于 browserBookmarkStore 的视图状态派生展示列表：文件夹范围、快速过滤、
// 标签过滤、Fuse.js 模糊搜索，全部在内存快照上完成（零数据库往返）。

import { useMemo } from 'react';
import Fuse from 'fuse.js';
import { useBrowserBookmarkStore } from '@/stores/browserBookmarkStore';
import type { BrowserBookmarkNode } from '@/types';

const RECENT_LIMIT = 50;

// 收集文件夹及其全部后代文件夹 id
export function collectFolderIds(
  folders: BrowserBookmarkNode[],
  rootId: string
): Set<string> {
  const ids = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

interface SearchRecord {
  node: BrowserBookmarkNode;
  title: string;
  url: string;
  path: string;
  tags: string[];
}

export function useFilteredBookmarks(): BrowserBookmarkNode[] {
  const bookmarks = useBrowserBookmarkStore((state) => state.bookmarks);
  const folders = useBrowserBookmarkStore((state) => state.folders);
  const meta = useBrowserBookmarkStore((state) => state.meta);
  const searchQuery = useBrowserBookmarkStore((state) => state.searchQuery);
  const currentFolderId = useBrowserBookmarkStore((state) => state.currentFolderId);
  const filter = useBrowserBookmarkStore((state) => state.filter);
  const selectedTag = useBrowserBookmarkStore((state) => state.selectedTag);

  return useMemo(() => {
    let list = bookmarks;

    // 文件夹范围（含子文件夹）
    if (currentFolderId) {
      const folderIds = collectFolderIds(folders, currentFolderId);
      list = list.filter((bookmark) => folderIds.has(bookmark.parentId));
    }

    // 快速过滤
    if (filter === 'favorites') {
      list = list.filter((bookmark) => meta[bookmark.id]?.isFavorite);
    } else if (filter === 'broken') {
      list = list.filter((bookmark) => meta[bookmark.id]?.linkStatus === 'broken');
    } else if (filter === 'tag' && selectedTag) {
      list = list.filter((bookmark) => meta[bookmark.id]?.tags.includes(selectedTag));
    }

    // 按添加时间倒序
    list = [...list].sort((a, b) => (b.dateAdded ?? 0) - (a.dateAdded ?? 0));

    if (filter === 'recent') {
      list = list.slice(0, RECENT_LIMIT);
    }

    // 模糊搜索
    const query = searchQuery.trim();
    if (query) {
      const records: SearchRecord[] = list.map((node) => ({
        node,
        title: node.title,
        url: node.url ?? '',
        path: node.path,
        tags: meta[node.id]?.tags ?? [],
      }));
      const fuse = new Fuse(records, {
        keys: [
          { name: 'title', weight: 0.45 },
          { name: 'url', weight: 0.25 },
          { name: 'tags', weight: 0.2 },
          { name: 'path', weight: 0.1 },
        ],
        threshold: 0.35,
        ignoreLocation: true,
      });
      list = fuse.search(query).map((result) => result.item.node);
    }

    return list;
  }, [bookmarks, folders, meta, searchQuery, currentFolderId, filter, selectedTag]);
}
