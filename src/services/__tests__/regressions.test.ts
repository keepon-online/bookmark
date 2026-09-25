import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '@/lib/database';
import { auxDb } from '@/lib/auxDatabase';
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
    await auxDb.delete();
    await auxDb.open();
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

    const node = {
      id: 'bookmark-health',
      parentId: '1',
      title: 'Broken',
      url: 'https://broken.example.com',
      index: 0,
      dateAdded: 100,
      path: '书签栏',
    };

    const results = await linkHealthService.checkBookmarks([node]);

    expect(results[0].isAccessible).toBe(false);

    const meta = await auxDb.bookmarkMeta.get('bookmark-health');
    expect(meta?.linkStatus).toBe('broken');

    const report = await linkHealthService.getHealthReport([node], { 'bookmark-health': meta! });
    expect(report.broken).toBe(1);
    expect(report.total).toBe(1);
  });
});
