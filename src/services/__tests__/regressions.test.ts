import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '@/lib/database';
import { folderService } from '@/services/folderService';
import { semanticSearchService } from '@/services/semanticSearchService';
import { SyncService } from '@/services/syncService';
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

  it('local semantic indexing stores numeric vectors instead of promises', async () => {
    await semanticSearchService.initialize({
      enabled: true,
      provider: 'local',
      model: 'local',
      threshold: 0.6,
      topK: 10,
    });

    const bookmarks = [
      {
        id: 'bookmark-1',
        url: 'https://example.com/docs',
        title: 'Example Docs',
        folderId: undefined,
        tags: ['docs'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        visitCount: 0,
        isFavorite: false,
        isArchived: false,
        status: 'active' as const,
        aiGenerated: false,
      },
    ];

    await semanticSearchService.indexBookmarks(bookmarks);

    const stored = await db.embeddings.get('bookmark-1');
    expect(stored).toBeDefined();
    expect(Array.isArray(stored?.embedding)).toBe(true);
    expect(stored?.embedding.every((value) => typeof value === 'number')).toBe(true);
  });

  it('download sync accepts the same camelCase fields that upload writes', async () => {
    const syncService = new SyncService();
    const remoteRows = [
      {
        id: 'bookmark-remote',
        url: 'https://remote.example.com',
        title: 'Remote Bookmark',
        tags: [],
        createdAt: 100,
        updatedAt: 200,
        visitCount: 0,
        isFavorite: false,
        isArchived: false,
        status: 'active',
        syncMeta: {
          version: 1,
          hash: 'abc',
          deviceId: 'device-1',
        },
      },
    ];

    const order = vi.fn().mockResolvedValue({ data: remoteRows, error: null });
    const select = vi.fn(() => ({ order }));
    const from = vi.fn(() => ({ select }));

    (syncService as any).supabase = { from };
    (syncService as any).session = {
      accessToken: 'token',
      expiresAt: Date.now() + 60_000,
    };

    const result = await syncService.sync('download');

    expect(result.success).toBe(true);
    expect(result.downloaded).toBe(1);

    const bookmark = await db.bookmarks.get('bookmark-remote');
    const meta = await db.syncMeta.get('bookmark-bookmark-remote');

    expect(bookmark?.title).toBe('Remote Bookmark');
    expect(meta?.version).toBe(1);
    expect(order).toHaveBeenCalledWith('updatedAt', { ascending: false });
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

  it('folder moves sync the browser parent when auto-sync is enabled', async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation(async () => ({
      settings: {
        folderSync: {
          autoSyncToBrowser: true,
        },
      },
    }));

    vi.mocked(chrome.bookmarks.get).mockImplementation(async (id?: string | string[]) => {
      const key = Array.isArray(id) ? id[0] : id;
      if (key === 'browser-folder') {
        return [{
          id: 'browser-folder',
          title: 'Child',
          parentId: 'browser-parent-1',
        }] as chrome.bookmarks.BookmarkTreeNode[];
      }
      return [];
    });

    await db.folders.bulkAdd([
      {
        id: 'parent-1',
        name: 'Parent 1',
        icon: '📁',
        parentId: undefined,
        order: 0,
        isSmartFolder: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        browserFolderId: 'browser-parent-1',
        syncStatus: 'synced',
      },
      {
        id: 'parent-2',
        name: 'Parent 2',
        icon: '📁',
        parentId: undefined,
        order: 1,
        isSmartFolder: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        browserFolderId: 'browser-parent-2',
        syncStatus: 'synced',
      },
      {
        id: 'child',
        name: 'Child',
        icon: '📁',
        parentId: 'parent-1',
        order: 0,
        isSmartFolder: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        browserFolderId: 'browser-folder',
        syncStatus: 'synced',
      },
    ]);

    await db.folderMappings.bulkAdd([
      {
        id: 'mapping-parent-1',
        dbFolderId: 'parent-1',
        browserFolderId: 'browser-parent-1',
        browserParentId: '1',
        lastSyncedAt: Date.now(),
        syncDirection: 'bidirectional',
        syncStatus: 'synced',
        version: 1,
      },
      {
        id: 'mapping-parent-2',
        dbFolderId: 'parent-2',
        browserFolderId: 'browser-parent-2',
        browserParentId: '1',
        lastSyncedAt: Date.now(),
        syncDirection: 'bidirectional',
        syncStatus: 'synced',
        version: 1,
      },
      {
        id: 'mapping-child',
        dbFolderId: 'child',
        browserFolderId: 'browser-folder',
        browserParentId: 'browser-parent-1',
        lastSyncedAt: Date.now(),
        syncDirection: 'bidirectional',
        syncStatus: 'synced',
        version: 1,
      },
    ]);

    await folderService.move('child', 'parent-2');

    expect(chrome.bookmarks.move).toHaveBeenCalledWith('browser-folder', {
      parentId: 'browser-parent-2',
    });
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
