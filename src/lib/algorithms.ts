// 算法库 - 相似度计算、聚类、模式挖掘

import type { Bookmark, SimilarityResult, BookmarkGroup, PatternDiscovery } from '@/types';

/**
 * 计算两个书签的相似度
 */
export function calculateSimilarity(
  bookmark1: Bookmark,
  bookmark2: Bookmark
): SimilarityResult {
  const urlSimilarity = calculateURLSimilarity(bookmark1.url, bookmark2.url);
  const titleSimilarity = calculateTextSimilarity(bookmark1.title, bookmark2.title);
  const tagSimilarity = calculateTagSimilarity(bookmark1.tags, bookmark2.tags);
  const domainSimilarity = sameDomain(bookmark1.url, bookmark2.url) ? 1 : 0;

  // 加权计算总体相似度
  const weights = { url: 0.3, title: 0.4, tags: 0.2, domain: 0.1 };
  const overallSimilarity =
    urlSimilarity * weights.url +
    titleSimilarity * weights.title +
    tagSimilarity * weights.tags +
    domainSimilarity * weights.domain;

  // 生成理由
  const reasons: string[] = [];
  if (titleSimilarity > 0.6) reasons.push('标题相似');
  if (tagSimilarity > 0.5) reasons.push('标签重叠');
  if (domainSimilarity > 0) reasons.push('同一域名');
  if (urlSimilarity > 0.5) reasons.push('URL 结构相似');

  return {
    bookmark1Id: bookmark1.id,
    bookmark2Id: bookmark2.id,
    similarity: overallSimilarity,
    factors: {
      url: urlSimilarity,
      title: titleSimilarity,
      tags: tagSimilarity,
      domain: domainSimilarity,
    },
    reason: reasons.join(', ') || '无明显相似性',
  };
}

/**
 * 计算 URL 相似度
 */
function calculateURLSimilarity(url1: string, url2: string): number {
  try {
    const u1 = new URL(url1);
    const u2 = new URL(url2);

    // 域名相同
    if (u1.hostname !== u2.hostname) return 0;

    // 比较路径
    const path1 = u1.pathname.split('/').filter(Boolean);
    const path2 = u2.pathname.split('/').filter(Boolean);

    if (path1.length === 0 && path2.length === 0) return 1;

    // 计算公共路径部分
    const common = path1.filter((p, i) => i < path2.length && p === path2[i]);
    const maxLength = Math.max(path1.length, path2.length);

    return maxLength > 0 ? common.length / maxLength : 0;
  } catch {
    return 0;
  }
}

/**
 * 计算文本相似度（简单的 Jaccard 相似度）
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = tokenize(text1);
  const words2 = tokenize(text2);

  if (words1.length === 0 && words2.length === 0) return 1;
  if (words1.length === 0 || words2.length === 0) return 0;

  const intersection = words1.filter((w) => words2.includes(w));
  const union = [...new Set([...words1, ...words2])];

  return union.length > 0 ? intersection.length / union.length : 0;
}

/**
 * 计算标签相似度
 */
function calculateTagSimilarity(tags1: string[], tags2: string[]): number {
  if (tags1.length === 0 && tags2.length === 0) return 1;
  if (tags1.length === 0 || tags2.length === 0) return 0;

  const intersection = tags1.filter((t) => tags2.includes(t));
  const union = [...new Set([...tags1, ...tags2])];

  return union.length > 0 ? intersection.length / union.length : 0;
}

/**
 * 检查是否同一域名
 */
function sameDomain(url1: string, url2: string): boolean {
  try {
    const u1 = new URL(url1);
    const u2 = new URL(url2);
    return u1.hostname === u2.hostname;
  } catch {
    return false;
  }
}

/**
 * 文本分词
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ') // 保留中文
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

/**
 * K-Means 聚类算法
 */
export function kMeansClustering(
  bookmarks: Bookmark[],
  k: number,
  maxIterations = 100
): BookmarkGroup[] {
  if (bookmarks.length < k) {
    k = bookmarks.length;
  }

  // 初始化聚类中心（随机选择）
  const centroids = bookmarks.slice(0, k);
  const clusters: Map<number, Bookmark[]> = new Map();

  for (let iter = 0; iter < maxIterations; iter++) {
    // 清空聚类
    clusters.clear();
    for (let i = 0; i < k; i++) {
      clusters.set(i, []);
    }

    // 分配每个书签到最近的聚类中心
    let converged = true;
    for (const bookmark of bookmarks) {
      let minDist = Infinity;
      let clusterIndex = 0;

      for (let i = 0; i < k; i++) {
        const dist = distance(bookmark, centroids[i]);
        if (dist < minDist) {
          minDist = dist;
          clusterIndex = i;
        }
      }

      clusters.get(clusterIndex)!.push(bookmark);
    }

    // 更新聚类中心
    for (let i = 0; i < k; i++) {
      const cluster = clusters.get(i)!;
      if (cluster.length === 0) continue;

      const newCentroid = findCentroid(cluster);
      if (newCentroid.id !== centroids[i].id) {
        centroids[i] = newCentroid;
        converged = false;
      }
    }

    if (converged) break;
  }

  // 转换为 BookmarkGroup
  return Array.from(clusters.entries())
    .filter(([_, bookmarks]) => bookmarks.length > 0)
    .map(([index, bookmarks], i) => ({
      id: `cluster-${i}`,
      name: generateClusterName(bookmarks),
      bookmarks,
      similarity: calculateClusterCohesion(bookmarks),
      commonTags: findCommonTags(bookmarks),
      commonDomain: findCommonDomain(bookmarks),
    }));
}

/**
 * 计算两个书签的距离
 */
function distance(b1: Bookmark, b2: Bookmark): number {
  const sim = calculateSimilarity(b1, b2);
  return 1 - sim.similarity; // 距离 = 1 - 相似度
}

/**
 * 找到聚类中心（与所有其他点平均距离最小的点）
 */
function findCentroid(bookmarks: Bookmark[]): Bookmark {
  if (bookmarks.length === 1) return bookmarks[0];

  let minAvgDist = Infinity;
  let centroid = bookmarks[0];

  for (const candidate of bookmarks) {
    let totalDist = 0;
    for (const other of bookmarks) {
      if (candidate.id !== other.id) {
        totalDist += distance(candidate, other);
      }
    }
    const avgDist = totalDist / (bookmarks.length - 1);

    if (avgDist < minAvgDist) {
      minAvgDist = avgDist;
      centroid = candidate;
    }
  }

  return centroid;
}

/**
 * 生成聚类名称
 */
function generateClusterName(bookmarks: Bookmark[]): string {
  if (bookmarks.length === 0) return '空组';
  if (bookmarks.length === 1) return bookmarks[0].title;

  // 使用常见标签或域名生成名称
  const commonTags = findCommonTags(bookmarks);
  if (commonTags.length > 0) {
    return commonTags.slice(0, 2).join(' + ');
  }

  const commonDomain = findCommonDomain(bookmarks);
  if (commonDomain) {
    return commonDomain;
  }

  // 使用标题中的公共词
  const commonWords = findCommonWords(bookmarks.map((b) => b.title));
  if (commonWords.length > 0) {
    return commonWords.slice(0, 3).join(' ');
  }

  return `未命名组 (${bookmarks.length})`;
}

/**
 * 计算聚类内聚度
 */
function calculateClusterCohesion(bookmarks: Bookmark[]): number {
  if (bookmarks.length <= 1) return 1;

  let totalSimilarity = 0;
  let count = 0;

  for (let i = 0; i < bookmarks.length; i++) {
    for (let j = i + 1; j < bookmarks.length; j++) {
      const sim = calculateSimilarity(bookmarks[i], bookmarks[j]);
      totalSimilarity += sim.similarity;
      count++;
    }
  }

  return count > 0 ? totalSimilarity / count : 0;
}

/**
 * 找到公共标签
 */
function findCommonTags(bookmarks: Bookmark[]): string[] {
  if (bookmarks.length === 0) return [];

  const tagCounts = new Map<string, number>();
  const threshold = Math.ceil(bookmarks.length / 2);

  for (const bookmark of bookmarks) {
    for (const tag of bookmark.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  return Array.from(tagCounts.entries())
    .filter(([_, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, _]) => tag);
}

/**
 * 找到公共域名
 */
function findCommonDomain(bookmarks: Bookmark[]): string | null {
  if (bookmarks.length === 0) return null;

  const domains = new Map<string, number>();
  const threshold = Math.ceil(bookmarks.length / 2);

  for (const bookmark of bookmarks) {
    try {
      const domain = new URL(bookmark.url).hostname;
      domains.set(domain, (domains.get(domain) || 0) + 1);
    } catch {
      // 忽略无效 URL
    }
  }

  for (const [domain, count] of domains) {
    if (count >= threshold) {
      return domain;
    }
  }

  return null;
}

/**
 * 找到公共词
 */
function findCommonWords(texts: string[]): string[] {
  if (texts.length === 0) return [];

  const wordCounts = new Map<string, number>();
  const threshold = Math.ceil(texts.length / 2);

  for (const text of texts) {
    const words = tokenize(text);
    const uniqueWords = [...new Set(words)];
    for (const word of uniqueWords) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
  }

  return Array.from(wordCounts.entries())
    .filter(([_, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([word, _]) => word);
}

/**
 * 发现 URL 模式
 */
export function discoverPatterns(bookmarks: Bookmark[]): PatternDiscovery[] {
  const patterns: PatternDiscovery[] = [];

  // 按域名分组
  const domainGroups = groupByDomain(bookmarks);

  // 分析每个域名组
  for (const [domain, domainBookmarks] of domainGroups) {
    if (domainBookmarks.length < 3) continue; // 至少3个样本

    // 提取路径模式
    const pathPatterns = extractPathPatterns(domainBookmarks);

    for (const pattern of pathPatterns) {
      if (pattern.frequency >= 3) {
        // 根据模式推断标签和文件夹
        const suggestedTag = inferTagFromPattern(domain, pattern.pattern);
        const suggestedFolder = inferFolderFromPattern(domain, pattern.pattern);

        patterns.push({
          pattern: `${domain}${pattern.pattern}`,
          frequency: pattern.frequency,
          suggestedTag,
          suggestedFolder,
          confidence: Math.min(pattern.frequency / domainBookmarks.length, 1),
          samples: pattern.samples.slice(0, 3),
        });
      }
    }
  }

  // 按置信度排序
  return patterns.sort((a, b) => b.confidence - a.confidence);
}

/**
 * 按域名分组
 */
function groupByDomain(bookmarks: Bookmark[]): Map<string, Bookmark[]> {
  const groups = new Map<string, Bookmark[]>();

  for (const bookmark of bookmarks) {
    try {
      const domain = new URL(bookmark.url).hostname;
      if (!groups.has(domain)) {
        groups.set(domain, []);
      }
      groups.get(domain)!.push(bookmark);
    } catch {
      // 忽略无效 URL
    }
  }

  return groups;
}

/**
 * 提取路径模式
 */
function extractPathPatterns(bookmarks: Bookmark[]): Array<{
  pattern: string;
  frequency: number;
  samples: string[];
}> {
  const patterns = new Map<string, { count: number; samples: string[] }>();

  for (const bookmark of bookmarks) {
    try {
      const url = new URL(bookmark.url);
      // 将路径标准化为模式（替换数字、ID等为占位符）
      const pattern = normalizePath(url.pathname);

      if (!patterns.has(pattern)) {
        patterns.set(pattern, { count: 0, samples: [] });
      }

      const p = patterns.get(pattern)!;
      p.count++;
      if (p.samples.length < 5) {
        p.samples.push(bookmark.url);
      }
    } catch {
      // 忽略无效 URL
    }
  }

  return Array.from(patterns.entries()).map(([pattern, data]) => ({
    pattern,
    frequency: data.count,
    samples: data.samples,
  }));
}

/**
 * 标准化路径为模式
 */
function normalizePath(path: string): string {
  return path
    .split('/')
    .map((segment) => {
      // 数字或 ID 替换为占位符
      if (/^\d+$/.test(segment)) return '{id}';
      if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(segment)) {
        return '{uuid}';
      }
      if (segment.length > 20) return '{long}';
      return segment;
    })
    .join('/');
}

/**
 * 从模式推断标签
 */
function inferTagFromPattern(domain: string, pattern: string): string {
  if (pattern.includes('/docs/')) return '文档';
  if (pattern.includes('/blog/')) return '博客';
  if (pattern.includes('/api/')) return 'API';
  if (pattern.includes('/repo/')) return '仓库';
  if (pattern.includes('/user/')) return '用户';
  if (pattern.includes('/video/')) return '视频';

  // 基于域名
  if (domain.includes('github')) return 'GitHub';
  if (domain.includes('stackoverflow')) return '问答';
  if (domain.includes('youtube')) return '视频';

  return '其他';
}

/**
 * 从模式推断文件夹
 */
function inferFolderFromPattern(domain: string, pattern: string): string {
  if (pattern.includes('/docs/')) return '开发/文档';
  if (pattern.includes('/blog/')) return '阅读/博客';
  if (pattern.includes('/api/')) return '开发/API';
  if (pattern.includes('/repo/')) return '开发/代码库';

  return '未分类';
}
