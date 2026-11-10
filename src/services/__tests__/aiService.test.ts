import { describe, expect, it } from 'vitest';
import { aiService } from '@/services/aiService';
import type { Bookmark } from '@/types';

function bookmark(url: string, title = ''): Bookmark {
  return {
    id: 'b1',
    url,
    urlKey: url,
    title,
    tags: [],
    createdAt: 0,
    updatedAt: 0,
    visitCount: 0,
    isFavorite: false,
    isArchived: false,
    status: 'active',
    aiGenerated: false,
  };
}

describe('aiService 规则匹配（域名含子域）', () => {
  it('www. 规范形式命中规则：视频站不再判 article', async () => {
    const yt = await aiService.classifyBookmark(bookmark('https://www.youtube.com/watch?v=x'));
    expect(yt.matchedRuleId).toBe('youtube');
    expect(yt.suggestedFolder).toBe('娱乐/视频');
    expect(yt.confidence).toBe(0.85);

    const bili = await aiService.classifyBookmark(bookmark('https://www.bilibili.com/video/BV1'));
    expect(bili.matchedRuleId).toBe('bilibili');
    expect(bili.suggestedFolder).toBe('娱乐/视频');
  });

  it('*.github.io 不再按代码库规则命中（Pages 是博客/文档站）', async () => {
    const page = await aiService.classifyBookmark(bookmark('https://user.github.io/blog/post'));
    expect(page.matchedRuleId).not.toBe('github');
    expect(page.suggestedFolder).not.toBe('开发/代码库');

    // github.com 本体仍命中
    const repo = await aiService.classifyBookmark(bookmark('https://github.com/user/repo'));
    expect(repo.matchedRuleId).toBe('github');
  });

  it('点边界仍生效：myamazon.com 不命中 amazon 规则', async () => {
    const r = await aiService.classifyBookmark(bookmark('https://myamazon.com/product/1'));
    expect(r.matchedRuleId).not.toBe('shopping');
  });
});
