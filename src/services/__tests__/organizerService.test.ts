import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import 'fake-indexeddb/auto';
import { auxDb } from '@/lib/auxDatabase';
import { organizerService } from '@/services/organizerService';
import type { BrowserBookmarkNode } from '@/types';

function node(id: string, url: string, title: string, parentId = '1'): BrowserBookmarkNode {
  return {
    id,
    parentId,
    title,
    url,
    index: 0,
    dateAdded: 100,
    path: '书签栏',
  };
}

describe('organizerService v2', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await auxDb.delete();
    await auxDb.open();
    // 强制走本地规则引擎
    (chrome.storage.local.get as Mock).mockResolvedValue({});
  });

  it('suggest 基于规则引擎生成建议并过滤已有标签', async () => {
    const suggestions = await organizerService.suggest(
      [node('1', 'https://github.com/user/repo', 'user/repo'), node('2', 'https://news.example.com/x', 'News')],
      {}
    );

    // github 规则命中（开发/代码库），普通新闻站无规则只有低置信度关键词 → 被阈值过滤
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].node.id).toBe('1');
    expect(suggestions[0].suggestedFolderPath).toBe('开发/代码库');
    expect(suggestions[0].engine).toBe('rule');

    // 已有标签会被排除
    const tagged = await organizerService.suggest(
      [node('1', 'https://github.com/user/repo2', 'user/repo2')],
      {
        '1': {
          bookmarkId: '1',
          tags: suggestions[0].suggestedTags,
          isFavorite: false,
          visitCount: 0,
        },
      }
    );
    expect(tagged[0].suggestedTags).toHaveLength(0);
  });

  it('apply 移动书签到建议文件夹并写入标签', async () => {
    // ensureFolderPath: getChildren 返回空 → create
    (chrome.bookmarks.getChildren as Mock).mockResolvedValue([]);
    (chrome.bookmarks.create as Mock).mockImplementation(async (arg: chrome.bookmarks.BookmarkCreateArg) => ({
      id: `folder-${arg.title}`,
      parentId: arg.parentId ?? '1',
      title: arg.title ?? '',
      index: 0,
    } as chrome.bookmarks.BookmarkTreeNode));
    (chrome.bookmarks.move as Mock).mockResolvedValue({});

    const suggestions = await organizerService.suggest(
      [node('9', 'https://github.com/foo/bar', 'foo/bar')],
      {}
    );
    const result = await organizerService.apply(suggestions);

    expect(result.applied).toBe(1);
    expect(result.moved).toBe(1);
    expect(result.tagged).toBe(1);

    // 移动链路：确保 "开发/代码库" 两级文件夹后 move
    expect(chrome.bookmarks.create).toHaveBeenCalledWith({ parentId: '1', title: '开发' });
    expect(chrome.bookmarks.create).toHaveBeenCalledWith({ parentId: 'folder-开发', title: '代码库' });
    expect(chrome.bookmarks.move).toHaveBeenCalledWith('9', { parentId: 'folder-代码库' });

    // 标签写 aux
    const meta = await auxDb.bookmarkMeta.get('9');
    expect(meta?.aiGenerated).toBe(true);
    expect(meta?.tags.length).toBeGreaterThan(0);

    // 整理历史已记录
    const history = await organizerService.getHistory();
    expect(history).toHaveLength(1);
  });

  it('suggest 当书签已在目标文件夹中时，抑制多余的移动建议', async () => {
    const inTargetFolder: BrowserBookmarkNode = {
      ...node('1', 'https://github.com/user/repo', 'user/repo'),
      path: '书签栏/开发/代码库',
    };
    const suggestions = await organizerService.suggest([inTargetFolder], {});
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].suggestedFolderPath).toBeUndefined();
    expect(suggestions[0].suggestedTags.length).toBeGreaterThan(0);
  });
});
