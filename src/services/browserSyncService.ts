// 浏览器书签同步服务

import { db } from '@/lib/database';
import { bookmarkService } from './bookmarkService';
import { folderService } from './folderService';
import { createLogger } from '@/lib/logger';
import type { Bookmark } from '@/types';

const logger = createLogger('BrowserSync');

/**
 * 浏览器书签节点映射
 */
interface BrowserBookmarkMap {
  [id: string]: chrome.bookmarks.BookmarkTreeNode;
}

/**
 * 同步结果
 */
export interface SyncResult {
  success: boolean;
  moved: number;
  tagged: number;
  errors: string[];
}

/**
 * 浏览器书签同步服务
 */
export class BrowserSyncService {
  private browserBookmarkMap: BrowserBookmarkMap = {};

  /**
   * 将整理后的书签同步回浏览器书签栏
   */
  async syncToBrowser(options: {
    moveBookmarks?: boolean; // 是否移动书签到文件夹
    applyTags?: boolean; // 是否应用标签（通过修改标题）
    folderId?: string; // 目标文件夹 ID（可选）
  } = {}): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      moved: 0,
      tagged: 0,
      errors: [],
    };

    try {
      // 1. 获取浏览器书签树
      await this.loadBrowserBookmarks();

      // 2. 获取所有已整理的书签（有 AI 生成的标签或文件夹的）
      // 使用 filter 代替 where 避免 aiGenerated 为 undefined 时的 IDBKeyRange 错误
      const allBookmarks = await db.bookmarks.toArray();
      const organizedBookmarks = allBookmarks.filter(
        (b) => b.aiGenerated === true && (b.tags.length > 0 || b.folderId)
      );

      logger.debug(`Found ${organizedBookmarks.length} organized bookmarks to sync`);

      // 3. 对每个书签进行同步
      for (const bookmark of organizedBookmarks) {
        try {
          await this.syncBookmark(bookmark, options, result);
        } catch (error) {
          const errorMsg = `Failed to sync ${bookmark.url}: ${(error as Error).message}`;
          result.errors.push(errorMsg);
          console.error('[BrowserSync]', errorMsg);
        }
      }

      console.log(`[BrowserSync] Sync completed: moved=${result.moved}, tagged=${result.tagged}`);
    } catch (error) {
      result.success = false;
      result.errors.push((error as Error).message);
    }

    return result;
  }

  /**
   * 同步单个书签到浏览器（优化版 - 不修改标题）
   */
  private async syncBookmark(
    bookmark: Bookmark,
    options: { moveBookmarks?: boolean; applyTags?: boolean; folderId?: string },
    result: SyncResult
  ): Promise<void> {
    // 1. 在浏览器中找到对应的书签
    let browserBookmark = this.findBrowserBookmark(bookmark.url);

    // 如果浏览器中没有这个书签，创建它
    if (!browserBookmark) {
      logger.debug(`Creating new browser bookmark for: ${bookmark.url}`);

      // 获取或创建目标文件夹
      const targetFolderId = await this.getOrCreateBrowserFolder(bookmark);
      const parentId = targetFolderId || '1'; // 默认添加到书签栏

      // 创建新书签（使用原始标题，不添加标签）
      const newBookmark = await chrome.bookmarks.create({
        parentId,
        title: bookmark.title,
        url: bookmark.url,
      });

      browserBookmark = newBookmark;
      result.moved++;
      logger.debug(`Created new bookmark: ${bookmark.title}`);
    } else {
      // 2. 清理旧格式：如果标题包含 [标签]，移除它们
      await this.cleanupTagPrefix(browserBookmark);

      // 3. 移动到目标文件夹
      if (options.moveBookmarks) {
        const targetFolderId = await this.getOrCreateBrowserFolder(bookmark);
        if (targetFolderId && targetFolderId !== browserBookmark.parentId) {
          await chrome.bookmarks.move(browserBookmark.id, {
            parentId: targetFolderId,
          });
          result.moved++;
          logger.debug(`Moved "${bookmark.title}" to folder ${targetFolderId}`);
        }
      }
    }
  }

  /**
   * 清理浏览器书签标题中的标签前缀
   * 移除 [标签] 格式的前缀，保持标题简洁
   */
  private async cleanupTagPrefix(
    browserBookmark: chrome.bookmarks.BookmarkTreeNode
  ): Promise<void> {
    const currentTitle = browserBookmark.title;

    // 检查是否包含标签前缀
    // 匹配模式：开头的 [xxx] [yyy] 格式
    const tagPrefixRegex = /^\[([^\]]+)\](\s*\[([^\]]+)\])*\s*/;
    const match = currentTitle.match(tagPrefixRegex);

    if (match) {
      // 移除标签前缀，保留原标题
      const cleanTitle = currentTitle.replace(tagPrefixRegex, '');
      if (cleanTitle !== currentTitle && cleanTitle.trim()) {
        await chrome.bookmarks.update(browserBookmark.id, {
          title: cleanTitle.trim(),
        });
        logger.debug(`Cleaned tag prefix: "${currentTitle}" → "${cleanTitle.trim()}"`);
      }
    }
  }

  /**
   * 在浏览器书签中查找指定 URL 的书签
   */
  private findBrowserBookmark(url: string): chrome.bookmarks.BookmarkTreeNode | undefined {
    // 遍历所有浏览器书签，查找匹配的 URL
    for (const [id, node] of Object.entries(this.browserBookmarkMap)) {
      if (node.url && this.normalizeUrl(node.url) === this.normalizeUrl(url)) {
        return node;
      }
    }
    return undefined;
  }

  /**
   * 标准化 URL（用于比较）
   */
  private normalizeUrl(url: string): string {
    return url
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
      .replace(/^www\./, '');
  }

  /**
   * 应用标签到浏览器书签（已禁用 - 不修改标题）
   * 标签存储在数据库中，不需要添加到浏览器标题
   */
  private async applyTagsToBrowserBookmark(
    browserBookmark: chrome.bookmarks.BookmarkTreeNode,
    tags: string[]
  ): Promise<void> {
    // 不再修改浏览器书签标题
    // 标签已经存储在数据库的 bookmarks.tags 字段中
    // 浏览器标题保持原样，更加简洁
    logger.debug('Skip applying tags to browser title (tags stored in DB only)');
  }

  /**
   * 获取或创建浏览器文件夹
   */
  private async getOrCreateBrowserFolder(bookmark: Bookmark): Promise<string | undefined> {
    if (!bookmark.folderId) return undefined;

    // 从数据库获取文件夹信息
    const folder = await db.folders.get(bookmark.folderId);
    if (!folder) return undefined;

    // 构建文件夹路径
    const folderPath = await this.buildFolderPath(folder);
    if (!folderPath) return undefined;

    // 在浏览器中创建或获取文件夹
    return await this.findOrCreateBrowserFolder(folderPath);
  }

  /**
   * 构建文件夹完整路径
   */
  private async buildFolderPath(folder: any): Promise<string[]> {
    const path: string[] = [];
    let currentFolder = folder;

    while (currentFolder) {
      path.unshift(currentFolder.name);
      if (currentFolder.parentId) {
        currentFolder = await db.folders.get(currentFolder.parentId);
      } else {
        break;
      }
    }

    return path;
  }

  /**
   * 在浏览器中查找或创建文件夹
   */
  private async findOrCreateBrowserFolder(path: string[]): Promise<string | undefined> {
    if (path.length === 0) return undefined;

    // 获取浏览器书签栏的根节点
    const tree = await chrome.bookmarks.getTree();
    const bookmarkBar = tree[0].children?.find((node) => node.id === '1'); // "1" 是书签栏的 ID
    if (!bookmarkBar) return undefined;

    // 逐级查找或创建文件夹
    let currentNode = bookmarkBar;
    let currentPath = '';

    for (const folderName of path) {
      currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;

      // 查找子文件夹
      const existingFolder = currentNode.children?.find(
        (node) => !node.url && node.title === folderName
      );

      if (existingFolder) {
        currentNode = existingFolder;
      } else {
        // 创建新文件夹
        const newFolder = await chrome.bookmarks.create({
          parentId: currentNode.id,
          title: folderName,
          index: undefined, // 添加到末尾
        });
        currentNode = newFolder;
        console.log(`[BrowserSync] Created folder: ${currentPath}`);
      }
    }

    return currentNode.id;
  }

  /**
   * 加载浏览器书签到内存
   */
  private async loadBrowserBookmarks(): Promise<void> {
    const tree = await chrome.bookmarks.getTree();
    this.browserBookmarkMap = {};

    const traverse = (node: chrome.bookmarks.BookmarkTreeNode) => {
      this.browserBookmarkMap[node.id] = node;
      if (node.children) {
        node.children.forEach(traverse);
      }
    };

    tree.forEach(traverse);
    console.log(`[BrowserSync] Loaded ${Object.keys(this.browserBookmarkMap).length} browser bookmarks`);
  }

  /**
   * 导入后自动整理并同步
   */
  async importAndOrganize(): Promise<{ importResult: any; syncResult: SyncResult }> {
    // 1. 导入浏览器书签
    const importResult = await bookmarkService.importFromBrowser();
    logger.debug(' Import completed:', importResult);

    // 2. 等待一下，让 AI 分类完成
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 3. 同步回浏览器
    const syncResult = await this.syncToBrowser({
      moveBookmarks: true,
      applyTags: true,
    });

    return { importResult, syncResult };
  }
}

// 单例导出
export const browserSyncService = new BrowserSyncService();
