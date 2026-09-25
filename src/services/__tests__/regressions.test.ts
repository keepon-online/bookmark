import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '@/lib/database';
import { getUrlKey } from '@/lib/utils';
import { folderService } from '@/services/folderService';
import { httpChecker } from '@/lib/httpChecker';
import { linkHealthService } from '@/services/linkHealthService';

describe('regressions', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    await db.delete();
    await db.open();
  });

  it('findEmptyFolders only returns folders without bookmarks', async () => {
    await db.folders.bulkAdd([
      {
        id: 'folder-empty',
        name: 'Empty',
        icon: '📁',
        parentId: 'root',
        order: 0,
        isSmartFolder: false,
        createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
        updatedAt: Date.now(),
      },
      {
        id: 'folder-with-bookmark',
        name: 'Has Bookmark',
        icon: '📁',
        parentId: 'root',
        order: 1,
        isSmartFolder: false,
        createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
        updatedAt: Date.now(),
      },
    ]);

    await db.bookmarks.add({
      id: 'bookmark-1',
      url: 'https://example.com',
      urlKey: getUrlKey('https://example.com'),
      title: 'Example',
      folderId: 'folder-with-bookmark',
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      visitCount: 0,
      isFavorite: false,
      isArchived: false,
      status: 'active',
      aiGenerated: false,
    });

    const emptyFolders = await folderService.findEmptyFolders({
      excludeRoot: true,
      minAge: 0,
    });

    expect(emptyFolders.map((info) => info.folder.id)).toEqual(['folder-empty']);
    expect(emptyFolders.every((info) => info.isEmpty)).toBe(true);
  });

  it('opaque fetch responses are not treated as healthy links', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      type: 'opaque',
      ok: false,
      status: 0,
      url: 'https://example.com',
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await httpChecker.check('https://example.com');

    expect(result.isAccessible).toBe(false);
    expect(result.status).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com',
      expect.not.objectContaining({ mode: 'no-cors' })
    );
  });

  it('link health marks opaque responses as broken', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      type: 'opaque',
      ok: false,
      status: 0,
      url: 'https://broken.example.com',
    }));

    await db.bookmarks.add({
      id: 'bookmark-health',
      url: 'https://broken.example.com',
      urlKey: getUrlKey('https://broken.example.com'),
      title: 'Broken',
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      visitCount: 0,
      isFavorite: false,
      isArchived: false,
      status: 'pending',
      aiGenerated: false,
    });

    await linkHealthService.checkBookmark('bookmark-health');

    const updated = await db.bookmarks.get('bookmark-health');
    expect(updated?.status).toBe('broken');
  });
});
