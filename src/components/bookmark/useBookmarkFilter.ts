// 书签过滤与搜索 Hook
// 基于 browserBookmarkStore 的视图状态派生展示列表：文件夹范围、快速过滤、
// 标签过滤、Fuse.js 模糊搜索，全部在内存快照上完成（零数据库往返）。
//
// 性能设计（数千书签规模）：
// - 过滤管道按依赖分阶段 memo：搜索词变化只重跑搜索，meta 变化在无相关
//   过滤/搜索时原样返回上一阶段引用，避免下游全列表重渲染
// - Fuse 索引与查询分离：击键只调 fuse.search，不重建索引
// - 有搜索词时跳过排序（Fuse 按相关度返回）

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

  const query = searchQuery.trim();
  const hasQuery = query.length > 0;

  // 阶段 1：文件夹范围（含子文件夹）
  const scoped = useMemo(() => {
    if (!currentFolderId) {
      return bookmarks;
    }
    const folderIds = collectFolderIds(folders, currentFolderId);
    return bookmarks.filter((bookmark) => folderIds.has(bookmark.parentId));
  }, [bookmarks, folders, currentFolderId]);

  // 阶段 2：依赖 meta 的快速过滤。无关过滤模式下 meta 变化直接返回
  // 上一阶段引用（recordVisit/收藏切换不再触发下游全量重算）
  const filtered = useMemo(() => {
    if (filter === 'favorites') {
      return scoped.filter((bookmark) => meta[bookmark.id]?.isFavorite);
    }
    if (filter === 'broken') {
      return scoped.filter((bookmark) => {
        const status = meta[bookmark.id]?.linkStatus;
        return status === 'broken' || status === 'unreachable';
      });
    }
    if (filter === 'tag' && selectedTag) {
      return scoped.filter((bookmark) => meta[bookmark.id]?.tags.includes(selectedTag));
    }
    return scoped;
  }, [scoped, meta, filter, selectedTag]);

  // 阶段 3：排序（recent 截取依赖顺序）；有搜索词时 Fuse 会按相关度
  // 重排，跳过整段排序
  const sorted = useMemo(() => {
    if (hasQuery) {
      return filtered;
    }
    const list = [...filtered].sort((a, b) => (b.dateAdded ?? 0) - (a.dateAdded ?? 0));
    if (filter === 'recent') {
      return list.slice(0, RECENT_LIMIT);
    }
    return list;
  }, [filtered, hasQuery, filter]);

  // 阶段 4：搜索。索引构建依赖列表身份（与查询解耦），击键只执行搜索
  const fuse = useMemo(() => {
    if (!hasQuery) {
      return null;
    }
    const records: SearchRecord[] = sorted.map((node) => ({
      node,
      title: node.title,
      url: node.url ?? '',
      path: node.path,
      tags: meta[node.id]?.tags ?? [],
    }));
    return new Fuse(records, {
      keys: [
        { name: 'title', weight: 0.45 },
        { name: 'url', weight: 0.25 },
        { name: 'tags', weight: 0.2 },
        { name: 'path', weight: 0.1 },
      ],
      threshold: 0.35,
      ignoreLocation: true,
    });
  }, [sorted, meta, hasQuery]);

  return useMemo(() => {
    if (!fuse) {
      return sorted;
    }
    return fuse.search(query).map((result) => result.item.node);
  }, [fuse, query, sorted]);
}
