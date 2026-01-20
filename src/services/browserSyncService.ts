// 浏览器书签同步服务

import { db } from '@/lib/database';
import { bookmarkService } from './bookmarkService';
import { folderService } from './folderService';
import type { Bookmark } from '@/types';

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
      const organizedBookmarks = await db.bookmarks
        .where('aiGenerated')
        .equals(true)
        .toArray();

      console.log(`[BrowserSync] Found ${organizedBookmarks.length} organized bookmarks to sync`);

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
   * 同步单个书签到浏览器
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
      console.log(`[BrowserSync] Creating new browser bookmark for: ${bookmark.url}`);

      // 获取或创建目标文件夹
      const targetFolderId = await this.getOrCreateBrowserFolder(bookmark);
      const parentId = targetFolderId || '1'; // 默认添加到书签栏

      // 创建新书签
      const titleWithTags = options.applyTags && bookmark.tags.length > 0
        ? `${bookmark.tags.map((t) => `[${t}]`).join(' ')} ${bookmark.title}`
        : bookmark.title;

      const newBookmark = await chrome.bookmarks.create({
        parentId,
        title: titleWithTags,
        url: bookmark.url,
      });

      browserBookmark = newBookmark;
      result.moved++;
      console.log(`[BrowserSync] Created new bookmark: ${titleWithTags}`);
    } else {
      // 2. 应用标签（通过修改标题添加标签前缀）
      if (options.applyTags && bookmark.tags.length > 0) {
        await this.applyTagsToBrowserBookmark(browserBookmark, bookmark.tags);
        result.tagged++;
      }

      // 3. 移动到目标文件夹
      if (options.moveBookmarks) {
        const targetFolderId = await this.getOrCreateBrowserFolder(bookmark);
        if (targetFolderId && targetFolderId !== browserBookmark.parentId) {
          await chrome.bookmarks.move(browserBookmark.id, {
            parentId: targetFolderId,
          });
          result.moved++;
          console.log(`[BrowserSync] Moved "${bookmark.title}" to folder ${targetFolderId}`);
        }
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
   * 应用标签到浏览器书签（通过修改标题）
   */
  private async applyTagsToBrowserBookmark(
    browserBookmark: chrome.bookmarks.BookmarkTreeNode,
    tags: string[]
  ): Promise<void> {
    // 检查标题是否已包含标签
    const currentTitle = browserBookmark.title;
    const tagPrefix = tags.map((t) => `[${t}]`).join(' ');

    // 如果标题开头没有标签，添加标签
    if (!currentTitle.startsWith('[')) {
      const newTitle = `${tagPrefix} ${currentTitle}`;
      await chrome.bookmarks.update(browserBookmark.id, {
        title: newTitle,
      });
      console.log(`[BrowserSync] Applied tags to "${currentTitle}": ${tagPrefix}`);
    }
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
    console.log('[BrowserSync] Import completed:', importResult);

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
