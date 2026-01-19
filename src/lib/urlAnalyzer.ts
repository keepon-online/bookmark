// URL 分析器

import type { UrlInfo, ContentType } from '@/types';

export class UrlAnalyzer {
  /**
   * 分析 URL 并提取特征信息
   */
  analyze(url: string): UrlInfo {
    try {
      const parsed = new URL(url);
      const domain = parsed.hostname.toLowerCase();
      const path = parsed.pathname.toLowerCase();
      const query = parsed.search;

      return {
        url,
        domain,
        path,
        query,
        isGitHub: this.isGitHub(domain, path),
        isStackOverflow: this.isStackOverflow(domain),
        isYouTube: this.isYouTube(domain),
        isDocumentation: this.isDocumentation(domain, path),
        isBlog: this.isBlog(domain, path),
      };
    } catch {
      return {
        url,
        domain: '',
        path: '',
        query: '',
        isGitHub: false,
        isStackOverflow: false,
        isYouTube: false,
        isDocumentation: false,
        isBlog: false,
      };
    }
  }

  /**
   * 推断内容类型
   */
  inferContentType(url: string, title: string = ''): ContentType {
    const info = this.analyze(url);

    if (info.isYouTube) return 'video';
    if (info.isGitHub && info.path.includes('/')) return 'repository';
    if (info.isStackOverflow) return 'forum';
    if (info.isDocumentation) return 'documentation';
    if (info.isBlog) return 'blog';

    // 基于域名推断
    const domain = info.domain;
    if (this.isShoppingDomain(domain)) return 'shopping';
    if (this.isSocialDomain(domain)) return 'social';
    if (this.isToolDomain(domain)) return 'tool';

    // 基于标题推断
    const titleLower = title.toLowerCase();
    if (titleLower.includes('tutorial') || titleLower.includes('教程')) {
      return 'documentation';
    }
    if (titleLower.includes('blog') || titleLower.includes('博客')) {
      return 'blog';
    }
    if (titleLower.includes('video') || titleLower.includes('视频')) {
      return 'video';
    }

    return 'article';
  }

  /**
   * 提取域名
   */
  extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  /**
   * 提取主要域名 (移除 www. 和子域名)
   */
  extractRootDomain(url: string): string {
    const domain = this.extractDomain(url);
    const parts = domain.split('.');

    // 对于类似 co.uk 的情况
    if (parts.length >= 2) {
      return parts.slice(-2).join('.');
    }
    return domain;
  }

  /**
   * 检查是否是 GitHub
   */
  private isGitHub(domain: string, path: string): boolean {
    return (
      domain === 'github.com' ||
      domain === 'gist.github.com' ||
      domain.endsWith('.github.io')
    );
  }

  /**
   * 检查是否是 Stack Overflow
   */
  private isStackOverflow(domain: string): boolean {
    return domain === 'stackoverflow.com' || domain.endsWith('.stackoverflow.com');
  }

  /**
   * 检查是否是 YouTube
   */
  private isYouTube(domain: string): boolean {
    return domain === 'youtube.com' || domain === 'youtu.be';
  }

  /**
   * 检查是否是文档页面
   */
  private isDocumentation(domain: string, path: string): boolean {
    const docIndicators = [
      '/docs/',
      '/doc/',
      '/documentation/',
      '/reference/',
      '/api/',
      '/guide/',
      '/tutorial/',
      '/tutorials/',
    ];

    return docIndicators.some((indicator) => path.includes(indicator));
  }

  /**
   * 检查是否是博客
   */
  private isBlog(domain: string, path: string): boolean {
    const blogIndicators = [
      '/blog/',
      '/post/',
      '/posts/',
      '/article/',
      '/articles/',
      '/news/',
      '/journal/',
    ];

    return blogIndicators.some((indicator) => path.includes(indicator));
  }

  /**
   * 检查是否是购物网站
   */
  private isShoppingDomain(domain: string): boolean {
    const shoppingDomains = [
      'amazon.com',
      'amazon.',
      'ebay.com',
      'ebay.',
      'taobao.com',
      'tmall.com',
      'jd.com',
      'shopify.com',
    ];

    return shoppingDomains.some((d) => domain === d || domain.endsWith(`.${d}`));
  }

  /**
   * 检查是否是社交媒体
   */
  private isSocialDomain(domain: string): boolean {
    const socialDomains = [
      'twitter.com',
      'x.com',
      'facebook.com',
      'instagram.com',
      'linkedin.com',
      'reddit.com',
      'tiktok.com',
    ];

    return socialDomains.some((d) => domain === d || domain.endsWith(`.${d}`));
  }

  /**
   * 检查是否是工具网站
   */
  private isToolDomain(domain: string): boolean {
    const toolDomains = [
      'figma.com',
      'canva.com',
      'notion.so',
      'trello.com',
      'github.com',
      'gitlab.com',
      'bitbucket.org',
    ];

    return toolDomains.some((d) => domain === d || domain.endsWith(`.${d}`));
  }

  /**
   * 从 URL 提取关键词
   */
  extractKeywords(url: string): string[] {
    const info = this.analyze(url);
    const keywords: string[] = [];

    // 从域名提取
    const domainParts = info.domain.split('.');
    domainParts.forEach((part) => {
      if (part.length > 3 && !part.startsWith('www')) {
        keywords.push(part);
      }
    });

    // 从路径提取
    const pathParts = info.path.split('/').filter(Boolean);
    pathParts.forEach((part) => {
      // 移除文件扩展名
      const cleanPart = part.replace(/\.(html|htm|php|aspx?)$/, '');
      if (cleanPart.length > 2 && !cleanPart.match(/^\d+$/)) {
        keywords.push(cleanPart);
      }
    });

    // 去重并返回
    return [...new Set(keywords)];
  }

  /**
   * 规范化 URL
   */
  normalize(url: string): string {
    try {
      const parsed = new URL(url);
      // 移除尾部斜杠
      let normalized = parsed.origin + parsed.pathname.replace(/\/$/, '');
      // 保留查询参数
      if (parsed.search) {
        normalized += parsed.search;
      }
      return normalized;
    } catch {
      return url;
    }
  }

  /**
   * 检查两个 URL 是否指向同一资源
   */
  isSameUrl(url1: string, url2: string): boolean {
    return this.normalize(url1) === this.normalize(url2);
  }
}

// 单例导出
export const urlAnalyzer = new UrlAnalyzer();
