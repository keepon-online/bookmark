import { describe, expect, it } from 'vitest';
import { urlAnalyzer } from '@/lib/urlAnalyzer';

describe('urlAnalyzer.inferContentType（www./子域回归）', () => {
  it('YouTube 规范形式（www./m./music.）判 video，不再落 article', () => {
    expect(urlAnalyzer.inferContentType('https://www.youtube.com/watch?v=x')).toBe('video');
    expect(urlAnalyzer.inferContentType('https://m.youtube.com/watch?v=x')).toBe('video');
    expect(urlAnalyzer.inferContentType('https://music.youtube.com/playlist')).toBe('video');
    expect(urlAnalyzer.inferContentType('https://youtu.be/abc123')).toBe('video');
  });

  it('GitHub：仓库页判 repository；*.github.io 是 Pages 站点不再判 repository', () => {
    expect(urlAnalyzer.inferContentType('https://github.com/user/repo')).toBe('repository');
    expect(urlAnalyzer.inferContentType('https://gist.github.com/user/gist')).toBe('repository');
    // 个人博客/文档站：落到 blog（路径含 /blog/）而不是代码库
    expect(urlAnalyzer.inferContentType('https://user.github.io/blog/post-1')).toBe('blog');
  });

  it('Google Workspace 文档判 documentation', () => {
    expect(urlAnalyzer.inferContentType('https://docs.google.com/document/d/abc/edit')).toBe(
      'documentation'
    );
    expect(urlAnalyzer.inferContentType('https://docs.google.com/spreadsheets/d/abc')).toBe(
      'documentation'
    );
  });

  it('国际购物站判 shopping（旧 "amazon." 后缀条目永假）', () => {
    expect(urlAnalyzer.inferContentType('https://www.amazon.co.jp/dp/B00X')).toBe('shopping');
    expect(urlAnalyzer.inferContentType('https://www.amazon.de/gp/product/X')).toBe('shopping');
    expect(urlAnalyzer.inferContentType('https://smile.amazon.com/dp/X')).toBe('shopping');
    expect(urlAnalyzer.inferContentType('https://www.ebay.de/itm/123')).toBe('shopping');
  });
});
