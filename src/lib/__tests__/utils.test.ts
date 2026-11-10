import { describe, expect, it } from 'vitest';
import { formatRelativeTime, getUrlKey, isHttpUrl } from '@/lib/utils';

describe('getUrlKey', () => {
  it('协议、www、尾斜杠与 hash 归一，大小写按 host 折叠', () => {
    const a = getUrlKey('https://www.Example.com/Page/?a=1#sec');
    const b = getUrlKey('http://example.com/Page?a=1');
    expect(a).toBe(b);
    expect(a).toBe('example.com/Page?a=1');
  });

  it('路径与查询参数大小写敏感：不同视频/文件不判重', () => {
    // YouTube 视频 ID 大小写敏感——整体 toLowerCase 会把两个视频
    // 判成同页，查重面板会预选删除"伪重复"
    expect(getUrlKey('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).not.toBe(
      getUrlKey('https://www.youtube.com/watch?v=dqw4w9wgxcq')
    );
    expect(getUrlKey('https://s3.example.com/README.md')).not.toBe(
      getUrlKey('https://s3.example.com/readme.md')
    );
  });

  it('非默认端口保留，默认端口归一', () => {
    expect(getUrlKey('https://example.com:8080/x')).toBe('example.com:8080/x');
    expect(getUrlKey('https://example.com:443/x')).toBe(getUrlKey('https://example.com/x'));
  });

  it('非网页协议原样透传，不产生跨协议碰撞', () => {
    // chrome:// 等 origin 为 'null' 的协议：旧实现会全部撞成
    // 'null/...' 同一个 key
    expect(getUrlKey('chrome://settings')).toBe('chrome://settings');
    expect(getUrlKey('javascript:void(0)')).toBe('javascript:void(0)');
    expect(getUrlKey('chrome://settings')).not.toBe(getUrlKey('javascript:void(0)'));
  });

  it('无法解析的输入原样返回', () => {
    expect(getUrlKey('not a url')).toBe('not a url');
  });
});

describe('isHttpUrl', () => {
  it('只放行 http(s)，容忍前导空白', () => {
    expect(isHttpUrl('https://a.com')).toBe(true);
    expect(isHttpUrl('HTTP://a.com')).toBe(true);
    expect(isHttpUrl('  https://a.com')).toBe(true);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('')).toBe(false);
    expect(isHttpUrl(undefined)).toBe(false);
  });
});

describe('formatRelativeTime', () => {
  it('未来时间戳钳位为"刚刚"，不输出"N秒后"', () => {
    // 时钟回拨/导入自超前设备的备份
    expect(formatRelativeTime(Date.now() + 3600_000)).toBe('刚刚');
    expect(formatRelativeTime(Date.now() + 5)).toBe('刚刚');
  });

  it('正常过去时间仍分级', () => {
    expect(formatRelativeTime(Date.now() - 30_000)).toContain('秒');
    expect(formatRelativeTime(Date.now() - 5 * 60_000)).toContain('分钟');
    expect(formatRelativeTime(Date.now() - 3 * 3600_000)).toContain('小时');
  });
});
