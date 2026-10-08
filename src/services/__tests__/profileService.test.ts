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

  it('组织度评分与「分类整理率」同口径：散落在书签栏的书签不计入入夹率', () => {
    // 两个书签都直接躺在书签栏（path 为 '书签栏'），既没进子文件夹也没打标签
    const loose = [
      node('1', 'https://a.example.com', 'A', 1000, '书签栏'),
      node('2', 'https://b.example.com', 'B', 2000, '书签栏'),
    ];
    const barProfile = profileService.getProfile({ bookmarks: loose, folders: [], meta: {} });
    expect(barProfile.folderedRate).toBe(0);
    // 入夹率 0 + 打标率 0 → 评分必须为 0，不能因为"有 parentId 有 path"就白拿 50 分
    expect(barProfile.organizationScore).toBe(0);

    // 放进子文件夹后才计入入夹率：占评分 50% 权重 → 50 分
    const folderedProfile = profileService.getProfile({
      bookmarks: [node('3', 'https://c.example.com', 'C', 3000, '书签栏/开发')],
      folders: [node('f1', '', '开发', 500, '书签栏')],
      meta: {},
    });
    expect(folderedProfile.folderedRate).toBe(100);
    expect(folderedProfile.organizationScore).toBe(50);
  });

  it('空数据不崩溃', () => {
    const profile = profileService.getProfile({ bookmarks: [], folders: [], meta: {} });
    expect(profile.totalBookmarks).toBe(0);
    expect(profile.httpsRatio).toBe(0);
    expect(profile.primaryCategory).toBe('other');
  });
});
