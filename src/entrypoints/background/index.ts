// Background Service Worker - WXT 格式

import { initDatabase } from '@/lib/database';
import { onMessage, getCurrentPageInfo } from '@/lib/messaging';
import { bookmarkService, folderService, tagService, searchService, organizerService, browserSyncService } from '@/services';
import type { Message, MessageResponse, CreateBookmarkDTO, UpdateBookmarkDTO } from '@/types';

export default defineBackground(() => {
  console.log('[Background] Service Worker started');

  // 初始化
  async function initialize() {
    console.log('[Background] Initializing...');
    try {
      await initDatabase();
      console.log('[Background] Database initialized');
      setupContextMenu();
      setupAlarms();
      setupCommands();
      console.log('[Background] Ready');
    } catch (error) {
      console.error('[Background] Initialization failed:', error);
    }
  }

  // 设置右键菜单
  function setupContextMenu() {
    browser.contextMenus.removeAll().then(() => {
      browser.contextMenus.create({
        id: 'add-bookmark',
        title: '添加到智能书签',
        contexts: ['page', 'link'],
      });

      browser.contextMenus.create({
        id: 'add-bookmark-with-tags',
        title: '添加书签并设置标签...',
        contexts: ['page', 'link'],
      });
    });
  }

  // 设置定时任务
  function setupAlarms() {
    // 链接健康检查 - 每 24 小时
    browser.alarms.create('link-health-check', {
      periodInMinutes: 60 * 24,
    });

    // 清理未使用标签 - 每周
    browser.alarms.create('cleanup-tags', {
      periodInMinutes: 60 * 24 * 7,
    });

    // 自动整理书签 - 每天凌晨 2 点执行
    browser.alarms.create('auto-organize', {
      periodInMinutes: 60 * 24,
    });
  }

  // 设置快捷键命令
  function setupCommands() {
    browser.commands.onCommand.addListener(async (command) => {
      console.log('[Background] Command received:', command);

      switch (command) {
        case 'open-sidepanel':
          if (browser.sidePanel) {
            const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
            if (tab[0]?.id) {
              await browser.sidePanel.open({ windowId: tab[0].windowId });
            }
          }
          break;

        case 'quick-add':
          try {
            const pageInfo = await getCurrentPageInfo();
            if (pageInfo) {
              await bookmarkService.create({
                url: pageInfo.url,
                title: pageInfo.title,
                favicon: pageInfo.favicon,
              });
              console.log('[Background] Quick add:', pageInfo.url);
            }
          } catch (error) {
            console.error('[Background] Quick add failed:', error);
          }
          break;

        case 'toggle-favorite':
          try {
            const pageInfo = await getCurrentPageInfo();
            if (!pageInfo?.url) return;

            // 查找现有书签
            const bookmarks = await bookmarkService.getAll({ limit: 1000 });
            const existing = bookmarks.find((b) => b.url === pageInfo.url);

            if (existing) {
              await bookmarkService.toggleFavorite(existing.id);
              console.log('[Background] Toggled favorite for:', existing.id);
            }
          } catch (error) {
            console.error('[Background] Toggle favorite failed:', error);
          }
          break;

        case 'search-bookmarks':
          // 打开 sidepanel 并聚焦搜索框
          if (browser.sidePanel) {
            const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
            if (tab[0]?.id) {
              await browser.sidePanel.open({ windowId: tab[0].windowId });
              // TODO: 发送消息到 sidepanel 聚焦搜索框
            }
          }
          break;
      }
    });
  }

  // 处理右键菜单点击
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab?.url) return;

    const url = info.linkUrl || info.pageUrl || tab.url;
    const title = tab.title || url;

    try {
      if (info.menuItemId === 'add-bookmark') {
        await bookmarkService.create({
          url,
          title,
          favicon: tab.favIconUrl,
        });
        console.log('[Background] Bookmark added:', url);
      } else if (info.menuItemId === 'add-bookmark-with-tags') {
        await bookmarkService.create({
          url,
          title,
          favicon: tab.favIconUrl,
        });
      }
    } catch (error) {
      console.error('[Background] Failed to add bookmark:', error);
    }
  });

  // 处理定时任务
  browser.alarms.onAlarm.addListener(async (alarm) => {
    console.log('[Background] Alarm triggered:', alarm.name);

    switch (alarm.name) {
      case 'link-health-check':
        console.log('[Background] Running link health check...');
        break;

      case 'cleanup-tags':
        try {
          const count = await tagService.cleanupUnused();
          console.log('[Background] Cleaned up', count, 'unused tags');
        } catch (error) {
          console.error('[Background] Failed to cleanup tags:', error);
        }
        break;

      case 'auto-organize':
        console.log('[Background] Running auto-organize...');
        try {
          // 检查是否启用了自动整理
          const config = await chrome.storage.local.get('autoOrganizeConfig');
          if (config.autoOrganizeConfig?.enabled) {
            const result = await organizerService.organizeAll({
              strategy: config.autoOrganizeConfig.strategy || 'auto',
              createNewFolders: true,
              applyTags: true,
              moveBookmarks: false, // 自动整理不移动书签，只分类
              removeDuplicates: false,
              minConfidence: config.autoOrganizeConfig.minConfidence || 0.7,
              archiveUncategorized: false,
              handleBroken: 'ignore',
            });

            console.log('[Background] Auto-organize completed:', result);

            // 同步到浏览器书签栏
            try {
              const syncResult = await browserSyncService.syncToBrowser({
                moveBookmarks: false, // 自动整理不移动
                applyTags: true, // 应用标签
              });
              console.log('[Background] Browser sync completed:', syncResult);
            } catch (syncError) {
              console.error('[Background] Browser sync failed:', syncError);
            }
          } else {
            console.log('[Background] Auto-organize is disabled');
          }
        } catch (error) {
          console.error('[Background] Auto-organize failed:', error);
        }
        break;
    }
  });

  // 处理消息
  onMessage(async (message: Message, _sender): Promise<MessageResponse> => {
    console.log('[Background] Received message:', message.type);

    try {
      switch (message.type) {
        // 书签操作
        case 'BOOKMARK_CREATE': {
          const bookmark = await bookmarkService.create(message.payload as CreateBookmarkDTO);
          searchService.invalidateCache();
          return { success: true, data: bookmark, requestId: message.requestId };
        }

        case 'BOOKMARK_UPDATE': {
          const { id, ...dto } = message.payload as { id: string } & UpdateBookmarkDTO;
          const bookmark = await bookmarkService.update(id, dto);
          searchService.invalidateCache();
          return { success: true, data: bookmark, requestId: message.requestId };
        }

        case 'BOOKMARK_DELETE': {
          await bookmarkService.delete(message.payload as string);
          searchService.invalidateCache();
          return { success: true, requestId: message.requestId };
        }

        case 'BOOKMARK_BATCH_DELETE': {
          await bookmarkService.deleteMany(message.payload as string[]);
          searchService.invalidateCache();
          return { success: true, requestId: message.requestId };
        }

        case 'BOOKMARK_GET_ALL': {
          const bookmarks = await bookmarkService.getAll(message.payload);
          return { success: true, data: bookmarks, requestId: message.requestId };
        }

        case 'BOOKMARK_SEARCH': {
          const result = await searchService.search(message.payload as string);
          return { success: true, data: result, requestId: message.requestId };
        }

        case 'BOOKMARK_IMPORT': {
          const result = await bookmarkService.importFromBrowser();
          searchService.invalidateCache();
          return { success: true, data: result, requestId: message.requestId };
        }

        // 文件夹操作
        case 'FOLDER_CREATE': {
          const folder = await folderService.create(message.payload);
          return { success: true, data: folder, requestId: message.requestId };
        }

        case 'FOLDER_UPDATE': {
          const { id, ...dto } = message.payload as { id: string };
          const folder = await folderService.update(id, dto);
          return { success: true, data: folder, requestId: message.requestId };
        }

        case 'FOLDER_DELETE': {
          const { id, moveBookmarksTo } = message.payload as { id: string; moveBookmarksTo?: string };
          await folderService.delete(id, moveBookmarksTo);
          return { success: true, requestId: message.requestId };
        }

        case 'FOLDER_GET_ALL': {
          const tree = await folderService.getTree();
          return { success: true, data: tree, requestId: message.requestId };
        }

        // 标签操作
        case 'TAG_GET_ALL': {
          const tags = await tagService.getAll();
          return { success: true, data: tags, requestId: message.requestId };
        }

        case 'TAG_CREATE': {
          const tag = await tagService.create(message.payload);
          return { success: true, data: tag, requestId: message.requestId };
        }

        case 'TAG_DELETE': {
          await tagService.delete(message.payload as string);
          return { success: true, requestId: message.requestId };
        }

        // 当前标签页
        case 'GET_CURRENT_TAB': {
          const pageInfo = await getCurrentPageInfo();
          return { success: true, data: pageInfo, requestId: message.requestId };
        }

        // 浏览器书签栏清理 - 扫描空文件夹
        case 'SCAN_BROWSER_BOOKMARKS': {
          const startTime = Date.now();
          const tree = await chrome.bookmarks.getTree();
          const emptyFolders: any[] = [];

          // 优化：使用字符串拼接而非数组操作，减少内存分配
          const scan = (node: any, pathStr: string = '') => {
            // 早期跳过书签节点
            if (node.url) return;

            // 只处理文件夹
            if (node.title) {
              const newPath = pathStr ? `${pathStr} > ${node.title}` : node.title;

              // 检查是否为空文件夹（有子节点但无书签）
              const hasBookmarks = node.children?.some((child: any) => child.url);

              if (!hasBookmarks) {
                emptyFolders.push({
                  id: node.id,
                  title: node.title,
                  path: newPath,
                  parentId: node.parentId,
                  index: node.index,
                  dateAdded: node.dateAdded,
                });
              }

              // 递归检查子文件夹
              if (node.children?.length) {
                for (let i = 0; i < node.children.length; i++) {
                  scan(node.children[i], newPath);
                }
              }
            }
          };

          // 从根节点开始扫描
          for (let i = 0; i < tree.length; i++) {
            scan(tree[i]);
          }

          console.log(`[Background] Scan completed in ${Date.now() - startTime}ms, found ${emptyFolders.length} empty folders`);

          return {
            success: true,
            folders: emptyFolders,
            requestId: message.requestId,
          };
        }

        // 浏览器书签栏清理 - 删除空文件夹
        case 'CLEANUP_BROWSER_BOOKMARKS': {
          const { folderIds } = message.payload as { folderIds: string[] };
          const startTime = Date.now();
          let deleted = 0;
          const errors: string[] = [];

          for (const folderId of folderIds) {
            try {
              await chrome.bookmarks.remove(folderId);
              deleted++;
            } catch (error) {
              const errorMsg = `删除失败 ID "${folderId}": ${(error as Error).message}`;
              errors.push(errorMsg);
            }
          }

          const result = {
            deleted,
            errors,
            duration: Date.now() - startTime,
          };

          return {
            success: true,
            result,
            requestId: message.requestId,
          };
        }

        default:
          return {
            success: false,
            error: `Unknown message type: ${message.type}`,
            requestId: message.requestId,
          };
      }
    } catch (error) {
      console.error('[Background] Error handling message:', error);
      return {
        success: false,
        error: (error as Error).message,
        requestId: message.requestId,
      };
    }
  });

  // 监听浏览器书签变化
  browser.bookmarks.onCreated.addListener((id, bookmark) => {
    console.log('[Background] Browser bookmark created:', bookmark.url);
  });

  browser.bookmarks.onRemoved.addListener((id, _removeInfo) => {
    console.log('[Background] Browser bookmark removed:', id);
  });

  // 启动初始化
  initialize();
});
