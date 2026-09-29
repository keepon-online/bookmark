// 浏览器书签领域模型（chrome.bookmarks 规范化后的形状）
// v0.6 起 chrome.bookmarks 是唯一数据源，扩展不再自建书签库

// 规范化后的书签/文件夹节点
export interface BrowserBookmarkNode {
  id: string;
  parentId: string;
  title: string;
  url?: string; // 有 url 为书签节点，无 url 为文件夹
  index: number;
  dateAdded?: number;
  // 所在文件夹路径（从书签栏根开始，不含自身），如 "书签栏/开发"
  path: string;
}

// 带子节点的树形结构（用于渲染）
export interface BrowserTreeNode extends BrowserBookmarkNode {
  children: BrowserTreeNode[];
}

// 整树快照
export interface BrowserTreeSnapshot {
  tree: BrowserTreeNode[]; // 顶层根节点（书签栏、其他书签）
  bookmarks: BrowserBookmarkNode[]; // 所有书签平铺
  folders: BrowserBookmarkNode[]; // 所有文件夹平铺（不含虚拟根 '0'）
}

// 扩展自有元数据：浏览器书签没有、按书签节点 id 关联的字段
export interface AuxBookmarkMeta {
  bookmarkId: string;
  tags: string[];
  notes?: string;
  isFavorite: boolean;
  visitCount: number;
  lastVisited?: number;
  // active 可达；broken 失效（连续确认）；unreachable 连续多轮无法建立连接；
  // pending/未设置 待检查
  linkStatus?: 'active' | 'broken' | 'pending' | 'unreachable';
  linkCheckedAt?: number;
  // 最近一次检查的 HTTP 状态码（0 = 网络层失败）
  lastStatusCode?: number;
  // 最近一次检查的失败原因（软 404/超时等，展示用）
  lastErrorMessage?: string;
  // 人工标记为正常：自动扫描不再改判（强制重查除外）
  linkStatusManual?: boolean;
  aiGenerated?: boolean;
}

// 重复书签保留策略
export type DuplicateRetentionStrategy = 'smart' | 'newest' | 'oldest';

// 重复书签分组（轻量版，基于浏览器节点）
export interface BrowserDuplicateGroup {
  urlKey: string;
  url: string; // 组内原始 URL
  bookmarks: BrowserBookmarkNode[]; // 按 dateAdded 降序或优先级降序
  keepId: string; // 建议保留
}

// 侧边栏/弹出层快速过滤
export type BrowserBookmarkFilter = 'all' | 'favorites' | 'recent' | 'broken' | 'tag';
