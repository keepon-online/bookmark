// AI 分类服务

import { urlAnalyzer } from '@/lib/urlAnalyzer';
import { extractKeywords } from '@/lib/utils';
import type {
  Bookmark,
  ClassificationResult,
  ClassificationRule,
  ContentType,
} from '@/types';

// 默认分类规则
const DEFAULT_RULES: ClassificationRule[] = [
  {
    id: 'github',
    name: 'GitHub Repos',
    description: 'GitHub 仓库和项目',
    priority: 100,
    enabled: true,
    conditions: [
      { type: 'domain', operator: 'exact', value: 'github.com' },
      { type: 'domain', operator: 'endsWith', value: '.github.io' },
    ],
    actions: {
      tags: ['开发', '代码', 'GitHub'],
      folder: '开发/代码库',
      contentType: 'repository',
    },
  },
  {
    id: 'stackoverflow',
    name: 'Stack Overflow',
    description: 'Stack Overflow 问答',
    priority: 100,
    enabled: true,
    conditions: [
      { type: 'domain', operator: 'exact', value: 'stackoverflow.com' },
    ],
    actions: {
      tags: ['开发', '问答', '技术'],
      folder: '开发/问答',
      contentType: 'forum',
    },
  },
  {
    id: 'youtube',
    name: 'YouTube',
    description: 'YouTube 视频',
    priority: 90,
    enabled: true,
    conditions: [
      { type: 'domain', operator: 'exact', value: 'youtube.com' },
      { type: 'domain', operator: 'exact', value: 'youtu.be' },
    ],
    actions: {
      tags: ['视频'],
      folder: '娱乐/视频',
      contentType: 'video',
    },
  },
  {
    id: 'bilibili',
    name: 'Bilibili',
    description: 'Bilibili 视频',
    priority: 90,
    enabled: true,
    conditions: [
      { type: 'domain', operator: 'exact', value: 'bilibili.com' },
    ],
    actions: {
      tags: ['视频', 'B站'],
      folder: '娱乐/视频',
      contentType: 'video',
    },
  },
  {
    id: 'docs',
    name: 'Documentation',
    description: '技术文档',
    priority: 80,
    enabled: true,
    conditions: [
      { type: 'path', operator: 'contains', value: '/docs/' },
      { type: 'path', operator: 'contains', value: '/doc/' },
      { type: 'path', operator: 'contains', value: '/documentation/' },
      { type: 'path', operator: 'contains', value: '/api/' },
      { type: 'path', operator: 'contains', value: '/reference/' },
    ],
    actions: {
      tags: ['文档'],
      contentType: 'documentation',
    },
  },
  {
    id: 'blog',
    name: 'Blog Posts',
    description: '博客文章',
    priority: 70,
    enabled: true,
    conditions: [
      { type: 'path', operator: 'contains', value: '/blog/' },
      { type: 'path', operator: 'contains', value: '/post/' },
      { type: 'path', operator: 'contains', value: '/posts/' },
      { type: 'path', operator: 'contains', value: '/article/' },
    ],
    actions: {
      tags: ['博客'],
      contentType: 'blog',
    },
  },
  {
    id: 'shopping',
    name: 'Shopping',
    description: '购物网站',
    priority: 75,
    enabled: true,
    conditions: [
      { type: 'domain', operator: 'endsWith', value: 'amazon.com' },
      { type: 'domain', operator: 'endsWith', value: 'amazon.cn' },
      { type: 'domain', operator: 'endsWith', value: 'taobao.com' },
      { type: 'domain', operator: 'endsWith', value: 'tmall.com' },
      { type: 'domain', operator: 'endsWith', value: 'jd.com' },
    ],
    actions: {
      tags: ['购物'],
      folder: '购物',
      contentType: 'shopping',
    },
  },
  {
    id: 'social',
    name: 'Social Media',
    description: '社交媒体',
    priority: 70,
    enabled: true,
    conditions: [
      { type: 'domain', operator: 'exact', value: 'twitter.com' },
      { type: 'domain', operator: 'exact', value: 'x.com' },
      { type: 'domain', operator: 'exact', value: 'facebook.com' },
      { type: 'domain', operator: 'exact', value: 'instagram.com' },
      { type: 'domain', operator: 'exact', value: 'linkedin.com' },
      { type: 'domain', operator: 'exact', value: 'reddit.com' },
    ],
    actions: {
      tags: ['社交'],
      folder: '社交',
      contentType: 'social',
    },
  },
  {
    id: 'mdn',
    name: 'MDN Web Docs',
    description: 'MDN Web 技术权威文档',
    priority: 95,
    enabled: true,
    conditions: [
      { type: 'domain', operator: 'exact', value: 'developer.mozilla.org' },
    ],
    actions: {
      tags: ['开发', '文档', 'MDN', 'Web'],
      folder: '开发/文档',
      contentType: 'documentation',
    },
  },
  {
    id: 'frontend-frameworks',
    name: 'Frontend Frameworks',
    description: '主流前端框架官方文档',
    priority: 85,
    enabled: true,
    conditions: [
      { type: 'domain', operator: 'exact', value: 'react.dev' },
      { type: 'domain', operator: 'exact', value: 'vuejs.org' },
      { type: 'domain', operator: 'endsWith', value: '.vuejs.org' },
      { type: 'domain', operator: 'exact', value: 'angular.io' },
      { type: 'domain', operator: 'exact', value: 'angular.dev' },
      { type: 'domain', operator: 'exact', value: 'svelte.dev' },
      { type: 'domain', operator: 'exact', value: 'nextjs.org' },
      { type: 'domain', operator: 'exact', value: 'nuxt.com' },
    ],
    actions: {
      tags: ['开发', '前端', '框架'],
      folder: '开发/前端',
      contentType: 'documentation',
    },
  },
  {
    id: 'css-ui',
    name: 'CSS & UI Libraries',
    description: '前端 UI 库与样式体系',
    priority: 80,
    enabled: true,
    conditions: [
      { type: 'domain', operator: 'exact', value: 'tailwindcss.com' },
      { type: 'domain', operator: 'exact', value: 'getbootstrap.com' },
      { type: 'domain', operator: 'exact', value: 'ant.design' },
      { type: 'domain', operator: 'exact', value: 'mui.com' },
    ],
    actions: {
      tags: ['开发', 'UI', '前端'],
      folder: '开发/前端',
      contentType: 'documentation',
    },
  },
  {
    id: 'dev-runtimes',
    name: 'Runtimes & Tooling',
    description: 'JavaScript/TypeScript 与构建工具',
    priority: 85,
    enabled: true,
    conditions: [
      { type: 'domain', operator: 'exact', value: 'typescriptlang.org' },
      { type: 'domain', operator: 'exact', value: 'nodejs.org' },
      { type: 'domain', operator: 'exact', value: 'bun.sh' },
      { type: 'domain', operator: 'exact', value: 'deno.land' },
      { type: 'domain', operator: 'exact', value: 'vitejs.dev' },
      { type: 'domain', operator: 'exact', value: 'webpack.js.org' },
    ],
    actions: {
      tags: ['开发', '工具链', 'JavaScript'],
      folder: '开发/前端与工具链',
      contentType: 'documentation',
    },
  },
  {
    id: 'programming-languages',
    name: 'Programming Languages',
    description: '常用编程语言官方站点',
    priority: 85,
    enabled: true,
    conditions: [
      { type: 'domain', operator: 'exact', value: 'go.dev' },
      { type: 'domain', operator: 'exact', value: 'golang.org' },
      { type: 'domain', operator: 'exact', value: 'rust-lang.org' },
      { type: 'domain', operator: 'exact', value: 'python.org' },
    ],
    actions: {
      tags: ['开发', '编程语言'],
      folder: '开发/编程语言',
      contentType: 'documentation',
    },
  },
  {
    id: 'tech-communities',
    name: 'Tech Communities',
    description: '中文技术社区与问答',
    priority: 80,
    enabled: true,
    conditions: [
      { type: 'domain', operator: 'endsWith', value: 'juejin.cn' },
      { type: 'domain', operator: 'endsWith', value: 'csdn.net' },
      { type: 'domain', operator: 'exact', value: 'v2ex.com' },
      { type: 'domain', operator: 'endsWith', value: 'segmentfault.com' },
      { type: 'domain', operator: 'endsWith', value: 'cnblogs.com' },
    ],
    actions: {
      tags: ['技术', '博客', '社区'],
      folder: '学习/技术社区',
      contentType: 'blog',
    },
  },
  {
    id: 'productivity-notes',
    name: 'Productivity & Notes',
    description: '笔记与协同知识库',
    priority: 80,
    enabled: true,
    conditions: [
      { type: 'domain', operator: 'exact', value: 'notion.so' },
      { type: 'domain', operator: 'endsWith', value: 'yuque.com' },
      { type: 'domain', operator: 'endsWith', value: 'wolai.com' },
      { type: 'domain', operator: 'endsWith', value: 'feishu.cn' },
    ],
    actions: {
      tags: ['办公', '知识库', '协作'],
      folder: '办公/知识库',
      contentType: 'tool',
    },
  },
  {
    id: 'design-tools',
    name: 'Design & Creative',
    description: '设计与创意工具',
    priority: 80,
    enabled: true,
    conditions: [
      { type: 'domain', operator: 'exact', value: 'figma.com' },
      { type: 'domain', operator: 'exact', value: 'canva.com' },
      { type: 'domain', operator: 'exact', value: 'dribbble.com' },
      { type: 'domain', operator: 'exact', value: 'behance.net' },
    ],
    actions: {
      tags: ['设计', '工具', '素材'],
      folder: '设计/灵感与工具',
      contentType: 'tool',
    },
  },
  {
    id: 'ai-tools',
    name: 'AI & LLM Services',
    description: 'AI 与大模型工具',
    priority: 85,
    enabled: true,
    conditions: [
      { type: 'domain', operator: 'exact', value: 'chatgpt.com' },
      { type: 'domain', operator: 'exact', value: 'openai.com' },
      { type: 'domain', operator: 'exact', value: 'claude.ai' },
      { type: 'domain', operator: 'exact', value: 'deepseek.com' },
      { type: 'domain', operator: 'exact', value: 'huggingface.co' },
    ],
    actions: {
      tags: ['AI', '大模型', '工具'],
      folder: 'AI/工具与模型',
      contentType: 'tool',
    },
  },
  {
    id: 'knowledge-wiki',
    name: 'Knowledge & Wiki',
    description: '百科与知识平台',
    priority: 75,
    enabled: true,
    conditions: [
      { type: 'domain', operator: 'endsWith', value: 'wikipedia.org' },
      { type: 'domain', operator: 'endsWith', value: 'baike.baidu.com' },
      { type: 'domain', operator: 'endsWith', value: 'zhihu.com' },
    ],
    actions: {
      tags: ['学习', '百科', '问答'],
      folder: '学习/知识库',
      contentType: 'article',
    },
  },
];

export class AIService {
  private rules: ClassificationRule[] = DEFAULT_RULES;

  /**
   * 分类单个书签
   */
  async classifyBookmark(bookmark: Bookmark): Promise<ClassificationResult> {
    const urlInfo = urlAnalyzer.analyze(bookmark.url);
    const contentType = urlAnalyzer.inferContentType(bookmark.url, bookmark.title);

    // 尝试匹配规则
    const matchedRule = this.findMatchingRule(bookmark, urlInfo);

    if (matchedRule) {
      return {
        suggestedFolder: matchedRule.actions.folder,
        suggestedTags: matchedRule.actions.tags,
        contentType: matchedRule.actions.contentType,
        confidence: 0.85, // 规则匹配的置信度较高
        method: 'rule',
        matchedRuleId: matchedRule.id,
      };
    }

    // 如果没有匹配规则，使用基于关键词的推荐
    const keywords = this.extractKeywordsFromBookmark(bookmark);
    const suggestedTags = this.generateTagsFromKeywords(keywords, contentType);

    // 根据内容类型生成建议文件夹
    const suggestedFolder = this.generateFolderFromContentType(contentType, suggestedTags);

    // 对于明确推断出的特定内容类型（文档、博客、视频、购物、社交、工具等），启发式置信度设为 0.75
    // 对于通用的 article 兜底类型，若无明显特征保持低置信度（0.5），避免对任意普通网页产生误建议
    const confidence =
      contentType !== 'other' && contentType !== 'article'
        ? 0.75
        : suggestedTags.length >= 2
        ? 0.55
        : 0.5;

    return {
      suggestedFolder,
      suggestedTags,
      contentType,
      confidence,
      method: 'rule',
    };
  }

  /**
   * 根据内容类型生成建议文件夹
   */
  private generateFolderFromContentType(contentType: ContentType, _tags: string[]): string | undefined {
    const folderMap: Record<ContentType, string | undefined> = {
      article: '学习/文章',
      video: '娱乐/视频',
      documentation: '开发/文档',
      tool: '工具',
      social: '社交',
      shopping: '购物',
      repository: '开发/代码库',
      blog: '学习/博客',
      forum: '开发/问答',
      other: undefined,
    };

    return folderMap[contentType];
  }

  /**
   * 从书签中提取关键词（优化版 - 减少标签数量）
   */
  private extractKeywordsFromBookmark(bookmark: Bookmark): string[] {
    const keywords: string[] = [];

    // 只从标题提取（最有价值）
    const titleKeywords = extractKeywords(bookmark.title);
    keywords.push(...titleKeywords);

    // 仅当标题关键词不足时才从 URL 提取
    if (keywords.length < 3) {
      const urlKeywords = urlAnalyzer.extractKeywords(bookmark.url);
      // 只保留域名和路径中的关键部分，不过度拆分
      keywords.push(...urlKeywords.slice(0, 3));
    }

    // 不再从描述提取（避免标签过多）

    // 去重并返回，限制总数量
    return [...new Set(keywords)].slice(0, 8);
  }

  /**
   * 从关键词生成标签（优化版 - 质量优先）
   */
  private generateTagsFromKeywords(keywords: string[], contentType: ContentType): string[] {
    const tags: string[] = [];
    const keywordSet = new Set(keywords);

    // 基于内容类型添加标签（精简版）
    const typeTags: Record<ContentType, string[]> = {
      article: ['文章'],           // 只保留一个内容类型标签
      video: ['视频'],
      documentation: ['文档'],
      tool: ['工具'],
      social: ['社交'],
      shopping: ['购物'],
      repository: ['仓库'],
      blog: ['博客'],
      forum: ['论坛'],
      other: [],
    };

    tags.push(...(typeTags[contentType] || []));

    // 从关键词中选择最有价值的标签
    const meaningfulKeywords = [...keywordSet].filter(
      (kw) =>
        kw.length >= 2 &&           // 长度至少 2
        kw.length <= 15 &&          // 避免过长的词
        !this.isCommonWord(kw) &&   // 不是常见词
        !kw.includes('.') &&        // 不是文件扩展名
        !kw.includes('-') &&        // 不是复合词
        !/^\d+$/.test(kw) &&        // 不是纯数字
        !/^[a-z]\d+$/.test(kw)      // 不是 "a1" 这种模式
    );

    // 按长度和重要性排序，取前 3 个
    const sortedKeywords = meaningfulKeywords
      .sort((a, b) => b.length - a.length)
      .slice(0, 3);

    tags.push(...sortedKeywords);

    // 最终限制标签总数（内容类型 + 3个关键词 = 最多 4 个）
    return [...new Set(tags)].slice(0, 4);
  }

  /**
   * 检查是否是常见词（扩展版 - 包含更多过滤词）
   */
  private isCommonWord(word: string): boolean {
    const commonWords = [
      // 英文常见词
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
      'her', 'was', 'one', 'our', 'out', 'has', 'www', 'com', 'http', 'https',
      'html', 'php', 'index', 'home', 'page', 'site', 'the',
      // 技术词汇
      'git', 'api', 'sdk', 'app', 'web', 'dev', 'src', 'lib', 'bin', 'etc',
      'var', 'let', 'const', 'new', 'this', 'that', 'with', 'from', 'import',
      // URL 组件
      'raw', 'master', 'main', 'readme', 'license', 'contributing',
      // 中文常见词
      '的', '了', '是', '在', '有', '和', '与', '或', '及', '等',
      // 域名组件
      'githubusercontent', 'kimentanm', 'aptv', 'm3u', 'iptv',
    ];

    return commonWords.includes(word.toLowerCase());
  }

  /**
   * 查找匹配的规则
   */
  private findMatchingRule(bookmark: Bookmark, urlInfo: ReturnType<typeof urlAnalyzer.analyze>): ClassificationRule | null {
    // 按优先级排序规则
    const sortedRules = [...this.rules].sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      if (!rule.enabled) continue;

      if (this.matchesRule(bookmark, urlInfo, rule)) {
        return rule;
      }
    }

    return null;
  }

  /**
   * 检查书签是否匹配规则
   * 同类型条件之间为 OR（如多个域名模式），不同类型之间为 AND
   */
  private matchesRule(
    bookmark: Bookmark,
    urlInfo: ReturnType<typeof urlAnalyzer.analyze>,
    rule: ClassificationRule
  ): boolean {
    const conditionsByType = new Map<string, ClassificationRule['conditions']>();
    for (const condition of rule.conditions) {
      const list = conditionsByType.get(condition.type) ?? [];
      list.push(condition);
      conditionsByType.set(condition.type, list);
    }

    for (const conditions of conditionsByType.values()) {
      const matched = conditions.some((condition) =>
        this.matchesCondition(bookmark, urlInfo, condition)
      );
      if (!matched) {
        return false;
      }
    }
    return true;
  }

  /**
   * 检查是否匹配单个条件
   */
  private matchesCondition(
    bookmark: Bookmark,
    urlInfo: ReturnType<typeof urlAnalyzer.analyze>,
    condition: ClassificationRule['conditions'][0]
  ): boolean {
    const { type, operator, value, caseSensitive = false } = condition;

    let target = '';
    switch (type) {
      case 'url':
        target = bookmark.url;
        break;
      case 'title':
        target = bookmark.title;
        break;
      case 'domain':
        target = urlInfo.domain;
        break;
      case 'path':
        target = urlInfo.path;
        break;
      case 'query':
        target = urlInfo.query;
        break;
    }

    if (!caseSensitive) {
      target = target.toLowerCase();
      const conditionValue = value.toLowerCase();
      return this.evaluateOperator(target, conditionValue, operator);
    }

    return this.evaluateOperator(target, value, operator);
  }

  /**
   * 评估操作符
   */
  private evaluateOperator(target: string, value: string, operator: ClassificationRule['conditions'][0]['operator']): boolean {
    switch (operator) {
      case 'contains':
        return target.includes(value);
      case 'startsWith':
        return target.startsWith(value);
      case 'endsWith':
        return target.endsWith(value);
      case 'exact':
        return target === value;
      case 'regex':
        try {
          const regex = new RegExp(value, 'i');
          return regex.test(target);
        } catch {
          return false;
        }
      default:
        return false;
    }
  }

  /**
   * 获取自定义规则
   */
  getRules(): ClassificationRule[] {
    return [...this.rules];
  }

  /**
   * 添加规则
   */
  addRule(rule: ClassificationRule): void {
    this.rules.push(rule);
  }

  /**
   * 更新规则
   */
  updateRule(ruleId: string, updates: Partial<ClassificationRule>): boolean {
    const index = this.rules.findIndex((r) => r.id === ruleId);
    if (index === -1) return false;

    this.rules[index] = { ...this.rules[index], ...updates };
    return true;
  }

  /**
   * 删除规则
   */
  removeRule(ruleId: string): boolean {
    const index = this.rules.findIndex((r) => r.id === ruleId);
    if (index === -1) return false;

    this.rules.splice(index, 1);
    return true;
  }

  /**
   * 检测内容类型
   */
  detectContentType(url: string, title: string): ContentType {
    return urlAnalyzer.inferContentType(url, title);
  }
}

// 单例导出
export const aiService = new AIService();
