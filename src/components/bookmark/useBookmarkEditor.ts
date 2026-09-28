// 书签编辑 Hook：标题/URL 走 chrome.bookmarks，文件夹走 move，标签走 aux

import * as React from 'react';
import { useBrowserBookmarkStore } from '@/stores';
import type { BookmarkFormValue } from './BrowserBookmarkForm';

export function useBookmarkEditor() {
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const bookmarks = useBrowserBookmarkStore((state) => state.bookmarks);
  const folders = useBrowserBookmarkStore((state) => state.folders);
  const meta = useBrowserBookmarkStore((state) => state.meta);

  const editingNode = editingId ? bookmarks.find((bookmark) => bookmark.id === editingId) : null;

  const submit = async (value: BookmarkFormValue) => {
    if (!editingNode) return;
    const store = useBrowserBookmarkStore.getState();
    await store.updateBookmark(editingNode.id, { title: value.title, url: value.url });
    if (value.folderId && value.folderId !== editingNode.parentId) {
      await store.moveBookmarks([editingNode.id], value.folderId);
    }
    const currentTags = meta[editingNode.id]?.tags ?? [];
    if (JSON.stringify([...currentTags].sort()) !== JSON.stringify([...value.tags].sort())) {
      await store.addTags([editingNode.id], value.tags);
      for (const tag of currentTags) {
        if (!value.tags.includes(tag)) {
          await store.removeTag(editingNode.id, tag);
        }
      }
    }
    setEditingId(null);
  };

  return {
    editingNode,
    editingTags: editingNode ? meta[editingNode.id]?.tags ?? [] : [],
    folderOptions: folders.map((folder) => ({
      id: folder.id,
      title: folder.title,
      path: folder.path,
    })),
    beginEdit: setEditingId,
    cancelEdit: () => setEditingId(null),
    submitEdit: submit,
  };
}
