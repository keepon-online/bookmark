import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { auxDb } from '@/lib/auxDatabase';
import { httpChecker } from '@/lib/httpChecker';
import { linkHealthService } from '@/services/linkHealthService';

describe('regressions', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    await auxDb.delete();
    await auxDb.open();
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
