import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '@/lib/database';
import { bookmarkService } from '@/services/bookmarkService';

describe('bookmarkService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('creates bookmarks with normalized URLs and rejects normalized duplicates', async () => {
    const created = await bookmarkService.create(
      {
        url: 'https://www.example.com/docs/',
        title: 'Example Docs',
      },
      false
    );

    expect(created.url).toBe('https://www.example.com/docs');

    await expect(
      bookmarkService.create(
        {
          url: 'http://example.com/docs',
          title: 'Duplicate Example Docs',
        },
        false
      )
    ).rejects.toThrow('Bookmark already exists');
  });

  it('rejects URL updates that collide after normalization', async () => {
    const first = await bookmarkService.create(
      {
        url: 'https://example.com/a',
        title: 'A',
      },
      false
    );
    const second = await bookmarkService.create(
      {
        url: 'https://example.com/b',
        title: 'B',
      },
      false
    );

    await expect(
      bookmarkService.update(second.id, {
        url: 'http://www.example.com/a/',
      })
    ).rejects.toThrow('Bookmark already exists');

    const unchanged = await db.bookmarks.get(second.id);
    expect(unchanged?.url).toBe('https://example.com/b');
    expect(first.url).toBe('https://example.com/a');
  });

  it('returns structured duplicate groups with a recommended keep target', async () => {
    const oldBookmark = await bookmarkService.create(
      {
        url: 'https://example.com/repeat',
        title: 'Old',
      },
      false
    );
    const recentBookmark = await bookmarkService.create(
      {
        url: 'http://www.example.com/repeat/',
        title: 'Recent',
      },
      false
    ).catch(() => null);

    // Create a true duplicate group directly to avoid URL-normalization rejection in create().
    await db.bookmarks.put({
      ...oldBookmark,
      id: 'duplicate-older',
      title: 'Older Duplicate',
      createdAt: oldBookmark.createdAt - 10_000,
      updatedAt: oldBookmark.updatedAt - 10_000,
      lastVisited: oldBookmark.createdAt - 5_000,
    });
    await db.bookmarks.put({
      ...oldBookmark,
      id: 'duplicate-newer',
      title: 'Newer Duplicate',
      createdAt: oldBookmark.createdAt + 10_000,
      updatedAt: oldBookmark.updatedAt + 10_000,
      lastVisited: oldBookmark.createdAt + 20_000,
    });

    expect(recentBookmark).toBeNull();

    const groups = await bookmarkService.findDuplicates();

    expect(groups).toHaveLength(1);
    expect(groups[0].url).toBe('example.com/repeat');
    expect(groups[0].keep).toBe('duplicate-newer');
    expect(groups[0].duplicates.map((bookmark) => bookmark.id)).toEqual([
      oldBookmark.id,
      'duplicate-older',
    ]);
    expect(groups[0].reason).toContain('最近访问于');
  });

  it('imports browser bookmarks with folder hierarchy preserved', async () => {
    vi.mocked(chrome.bookmarks.getTree).mockResolvedValue([
      {
        id: '0',
        title: '',
        children: [
          {
            id: '1',
            title: 'Bookmarks Bar',
            children: [
              {
                id: '100',
                title: 'Development',
                children: [
                  {
                    id: '101',
                    title: 'Docs',
                    children: [
                      {
                        id: '102',
                        title: 'TypeScript Docs',
                        url: 'https://www.typescriptlang.org/docs/',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      } as chrome.bookmarks.BookmarkTreeNode,
    ]);

    const result = await bookmarkService.importFromBrowser();

    expect(result.success).toBe(true);
    expect(result.imported).toBe(1);

    const folders = await db.folders.toArray();
    const devFolder = folders.find((folder) => folder.name === 'Development');
    const docsFolder = folders.find((folder) => folder.name === 'Docs');
    const importedBookmark = await db.bookmarks.toArray();

    expect(devFolder).toBeDefined();
    expect(docsFolder?.parentId).toBe(devFolder?.id);
    expect(importedBookmark[0].folderId).toBe(docsFolder?.id);
    expect(importedBookmark[0].url).toBe('https://www.typescriptlang.org/docs');
  });
});
