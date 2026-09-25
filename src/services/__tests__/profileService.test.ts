import { describe, expect, it } from 'vitest';
import { profileService } from '@/services/profileService';
import type { AuxBookmarkMeta, BrowserBookmarkNode } from '@/types';

function node(id: string, url: string, title: string, dateAdded: number, path = ''): BrowserBookmarkNode {
  return { id, parentId: '1', title, url, index: 0, dateAdded, path };
}

describe('profileService v2', () => {
  it('从树快照 + 元数据计算完整档案', () => {
    const bookmarks = [
      node('1', 'https://github.com/a/b', 'repo', 1000),
      node('2', 'http://github.com/a/b', 'repo2', 2000),
      node('3', 'https://www.youtube.com/watch?v=x', 'Video', 3000),
    ];
    const folders = [node('f1', '', '开发', 500, '')];
    const meta: Record<string, AuxBookmarkMeta> = {
      '1': { bookmarkId: '1', tags: ['开发'], isFavorite: true, visitCount: 3 },
      '3': { bookmarkId: '3', tags: [], isFavorite: false, visitCount: 0, linkStatus: 'broken' },
    };

    const profile = profileService.getProfile({ bookmarks, folders, meta });

    expect(profile.totalBookmarks).toBe(3);
    expect(profile.totalFolders).toBe(1);
    expect(profile.totalTags).toBe(1);
    expect(profile.uniqueDomains).toBe(2); // github.com + youtube.com
    // 2/3 https
    expect(profile.httpsRatio).toBeCloseTo(2 / 3);
    expect(profile.favoriteCount).toBe(1);
    expect(profile.brokenCount).toBe(1);
    // github 重复（协议差异）
    expect(profile.duplicateCount).toBe(1);
    expect(profile.primaryCategory).toBe('tech');
    expect(profile.yearlyTrend).toHaveLength(1);
    expect(profile.organizationScore).toBeGreaterThanOrEqual(0);
    expect(profile.organizationScore).toBeLessThanOrEqual(100);
    expect(profile.collectorLevel).toBeGreaterThanOrEqual(1);
    expect(profile.collectorTitle).toBeTruthy();
  });

  it('空数据不崩溃', () => {
    const profile = profileService.getProfile({ bookmarks: [], folders: [], meta: {} });
    expect(profile.totalBookmarks).toBe(0);
    expect(profile.httpsRatio).toBe(0);
    expect(profile.primaryCategory).toBe('other');
  });
});
