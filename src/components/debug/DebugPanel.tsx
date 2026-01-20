// 调试面板 - 显示系统状态

import { useState, useEffect } from 'react';
import { Bug, RefreshCw, Database, Bookmark, Tag, Folder, Play, AlertCircle, FolderTree } from 'lucide-react';
import { db } from '@/lib/database';
import { bookmarkService, organizerService, browserSyncService, folderService, aiService } from '@/services';

export function DebugPanel() {
  const [dbStats, setDbStats] = useState({
    bookmarks: 0,
    aiGenerated: 0,
    withTags: 0,
    withFolder: 0,
  });
  const [browserBookmarks, setBrowserBookmarks] = useState(0);
  const [lastOrganize, setLastOrganize] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOrganizingBrowser, setIsOrganizingBrowser] = useState(false);
  const [organizeError, setOrganizeError] = useState<string | null>(null);
  const [organizeProgress, setOrganizeProgress] = useState<string>('');
  const [syncLog, setSyncLog] = useState<string[]>([]);
  const [folderList, setFolderList] = useState<any[]>([]);
  const [showFolders, setShowFolders] = useState(false);

  useEffect(() => {
    loadDebugInfo();
  }, []);

  const loadDebugInfo = async () => {
    setIsLoading(true);
    try {
      // 数据库统计
      const bookmarks = await db.bookmarks.toArray();
      const aiGenerated = bookmarks.filter((b) => b.aiGenerated).length;
      const withTags = bookmarks.filter((b) => b.tags.length > 0).length;
      const withFolder = bookmarks.filter((b) => b.folderId).length;

      setDbStats({
        bookmarks: bookmarks.length,
        aiGenerated,
        withTags,
        withFolder,
      });

      // 浏览器书签统计
      const browserTree = await chrome.bookmarks.getTree();
      let browserCount = 0;
      const countBookmarks = (node: any) => {
        if (node.url) browserCount++;
        if (node.children) node.children.forEach(countBookmarks);
      };
      browserTree.forEach(countBookmarks);
      setBrowserBookmarks(browserCount);

      // 最后整理结果
      const stored = await chrome.storage.local.get([
        'lastOrganizeResult',
        'lastOrganizeTime',
        'lastSyncResult',
      ]);
      setLastOrganize(stored);

      // 加载文件夹列表
      const folders = await db.folders.toArray();
      setFolderList(folders);
    } catch (error) {
      console.error('Failed to load debug info:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 快速整理
  const handleQuickOrganize = async () => {
    setIsOrganizing(true);
    setOrganizeError(null);
    setOrganizeProgress('准备整理...');

    try {
      console.log('[Debug] 开始快速整理...');

      const result = await organizerService.organizeAll(
        {
          strategy: 'auto',
          createNewFolders: true,
          applyTags: true,
          moveBookmarks: true,
          removeDuplicates: false,
          minConfidence: 0.3, // 降低置信度阈值
          archiveUncategorized: false,
          handleBroken: 'ignore',
        },
        (progress) => {
          console.log('[Debug] 整理进度:', progress);
          setOrganizeProgress(progress.message || `${progress.current}/${progress.total}`);
        }
      );

      console.log('[Debug] 整理完成:', result);

      // 保存结果
      await chrome.storage.local.set({
        lastOrganizeResult: result,
        lastOrganizeTime: Date.now(),
      });

      // 同步到浏览器
      if (result.success) {
        setOrganizeProgress('同步到浏览器...');

        // 统计要同步的书签
        const allBookmarks = await db.bookmarks.toArray();
        const withTags = allBookmarks.filter(b => b.tags && b.tags.length > 0).length;
        const withFolder = allBookmarks.filter(b => b.folderId).length;
        syncLog.push(`准备同步: ${withTags} 个有标签, ${withFolder} 个有文件夹`);
        setSyncLog([...syncLog]);

        const syncResult = await browserSyncService.syncToBrowser({
          moveBookmarks: true,
          applyTags: true,
        });

        console.log('[Debug] 同步完成:', syncResult);
        syncLog.push(`同步完成: 移动 ${syncResult.moved} 个, 标签 ${syncResult.tagged} 个`);
        if (syncResult.errors.length > 0) {
          syncLog.push(`错误: ${syncResult.errors.slice(0, 3).join('; ')}`);
        }
        setSyncLog([...syncLog]);

        await chrome.storage.local.set({
          lastSyncResult: { moved: syncResult.moved, tagged: syncResult.tagged },
        });
      }

      // 刷新显示
      await loadDebugInfo();
      setOrganizeProgress('完成！');
    } catch (error) {
      console.error('[Debug] 整理失败:', error);
      setOrganizeError((error as Error).message);
    } finally {
      setIsOrganizing(false);
    }
  };

  // 仅同步到浏览器（包含AI分类）
  const handleSyncToBrowser = async () => {
    setIsSyncing(true);
    setSyncLog([]);
    setOrganizeError(null);

    try {
      console.log('[Debug] 开始同步到浏览器...');

      // 第一步：对没有标签的书签进行AI分类
      const allBookmarks = await db.bookmarks.toArray();
      const untaggedBookmarks = allBookmarks.filter((b) => b.tags.length === 0);

      if (untaggedBookmarks.length > 0) {
        syncLog.push(`发现 ${untaggedBookmarks.length} 个无标签书签，正在进行AI分类...`);
        setSyncLog([...syncLog]);

        let classified = 0;
        for (const bookmark of untaggedBookmarks) {
          try {
            const result = await aiService.classifyBookmark(bookmark);
            if (result.suggestedTags.length > 0) {
              await db.bookmarks.update(bookmark.id, {
                tags: result.suggestedTags,
                aiGenerated: true,
              });
              classified++;
            }
          } catch (err) {
            console.warn(`[Debug] AI分类失败: ${bookmark.title}`, err);
          }
        }
        syncLog.push(`✓ AI分类完成: ${classified} 个书签已添加标签`);
      }

      // 第二步：获取所有有标签的书签（包括刚分类的）
      const bookmarks = await db.bookmarks
        .filter((b) => b.tags.length > 0)
        .toArray();

      syncLog.push(`找到 ${bookmarks.length} 个有标签的书签`);
      console.log(`[Debug] Found ${bookmarks.length} bookmarks with tags`);

      // 获取浏览器书签树
      const browserTree = await chrome.bookmarks.getTree();
      let browserCount = 0;
      const countBookmarks = (node: any) => {
        if (node.url) browserCount++;
        if (node.children) node.children.forEach(countBookmarks);
      };
      browserTree.forEach(countBookmarks);
      syncLog.push(`浏览器中有 ${browserCount} 个书签`);

      let moved = 0;
      let tagged = 0;
      let notFound = 0;
      let alreadyTagged = 0;

      // 创建 URL 到书签节点的映射
      const urlToNodeMap = new Map<string, any>();
      const traverseTree = (node: any) => {
        if (node.url) {
          urlToNodeMap.set(node.url, node);
        }
        if (node.children) {
          node.children.forEach(traverseTree);
        }
      };
      browserTree.forEach(traverseTree);

      syncLog.push(`构建了 ${urlToNodeMap.size} 个浏览器书签的映射`);

      for (const bookmark of bookmarks) {
        // 处理所有有标签的书签
        try {
          const browserNode = urlToNodeMap.get(bookmark.url);

          if (browserNode) {
            // 找到了！应用标签
            if (bookmark.tags.length > 0) {
              // 检查是否已经有标签前缀
              const currentTitle = browserNode.title;

              // 移除旧的标签前缀（如果有的话）
              const baseTitle = currentTitle.replace(/^(\[[^\]]+\]\s*)+/, '');

              // 添加新的标签前缀
              const tagPrefix = bookmark.tags.slice(0, 3).map((t) => `[${t}]`).join(' '); // 最多显示3个标签
              const newTitle = `${tagPrefix} ${baseTitle}`;

              // 只有当标题真的改变时才更新
              if (newTitle !== currentTitle) {
                await chrome.bookmarks.update(browserNode.id, { title: newTitle });
                tagged++;
                syncLog.push(`✓ 更新: "${newTitle}"`);
                console.log(`[Debug] Updated: "${currentTitle}" -> "${newTitle}"`);
              } else {
                alreadyTagged++;
                syncLog.push(`- 已有标签: "${currentTitle}"`);
              }
            }
          } else {
            notFound++;
            syncLog.push(`✗ 未找到: "${bookmark.title}"`);
            console.log(`[Debug] Not found in browser: ${bookmark.url}`);
          }
        } catch (error) {
          syncLog.push(`✗ 错误: "${bookmark.title}" - ${(error as Error).message}`);
          console.error(`[Debug] Error processing ${bookmark.title}:`, error);
        }
      }

      syncLog.push(`\n同步完成:`);
      syncLog.push(`- 新标记: ${tagged} 个`);
      syncLog.push(`- 已有标签: ${alreadyTagged} 个`);
      syncLog.push(`- 未找到: ${notFound} 个`);
      syncLog.push(`\n提示: 打开 chrome://bookmarks/ 查看效果`);
      syncLog.push(`标签格式: [标签1] [标签2] 原标题`);

      // 保存结果
      await chrome.storage.local.set({
        lastSyncResult: { moved, tagged },
      });

      // 刷新显示
      await loadDebugInfo();

      // 提示用户刷新浏览器书签页
      if (tagged > 0) {
        setTimeout(() => {
          if (confirm(`已成功标记 ${tagged} 个书签！\n\n是否要打开浏览器书签管理器查看效果？`)) {
            chrome.tabs.create({ url: 'chrome://bookmarks/' });
          }
        }, 500);
      }
    } catch (error) {
      console.error('[Debug] 同步失败:', error);
      setOrganizeError((error as Error).message);
    } finally {
      setIsSyncing(false);
    }
  };

  // 整理浏览器书签 - 创建文件夹并移动
  const handleOrganizeBrowserBookmarks = async () => {
    setIsOrganizingBrowser(true);
    setSyncLog([]);
    setOrganizeError(null);

    try {
      console.log('[Debug] 开始整理浏览器书签...');

      // 获取所有有文件夹信息的书签
      const bookmarks = await db.bookmarks
        .filter((b) => !!b.folderId)
        .toArray();

      syncLog.push(`找到 ${bookmarks.length} 个有文件夹的书签`);

      // 获取文件夹信息
      const folderMap = new Map<string, any>();
      for (const bookmark of bookmarks) {
        if (bookmark.folderId && !folderMap.has(bookmark.folderId)) {
          const folder = await db.folders.get(bookmark.folderId);
          if (folder) {
            folderMap.set(bookmark.folderId, folder);
          }
        }
      }

      syncLog.push(`找到 ${folderMap.size} 个文件夹`);

      // 获取浏览器书签树
      const browserTree = await chrome.bookmarks.getTree();
      const bookmarkBar = browserTree[0].children?.find((node: any) => node.id === '1'); // 书签栏

      if (!bookmarkBar) {
        throw new Error('找不到浏览器书签栏');
      }

      syncLog.push('准备创建文件夹结构...');

      // 统计每个文件夹的书签数量
      const folderBookmarks = new Map<string, any[]>();
      for (const bookmark of bookmarks) {
        if (!bookmark.folderId) continue;

        if (!folderBookmarks.has(bookmark.folderId)) {
          folderBookmarks.set(bookmark.folderId, []);
        }
        folderBookmarks.get(bookmark.folderId)!.push(bookmark);
      }

      // 为每个文件夹创建浏览器文件夹
      let createdFolders = 0;
      let movedBookmarks = 0;

      for (const [folderId, folder] of folderMap) {
        try {
          // 构建文件夹路径
          const path = await buildFolderPath(folder);
          const pathStr = path.join('/');

          // 在浏览器中创建文件夹
          const browserFolderId = await createBrowserFolder(bookmarkBar, path);
          createdFolders++;

          syncLog.push(`✓ 创建文件夹: ${pathStr}`);

          // 获取这个文件夹的书签
          const items = folderBookmarks.get(folderId) || [];

          // 在浏览器中查找并移动书签
          for (const bookmark of items) {
            // 处理所有书签
            const browserNode = await findBrowserBookmarkNode(browserTree, bookmark.url);

            if (browserNode && browserNode.parentId !== browserFolderId) {
              await chrome.bookmarks.move(browserNode.id, {
                parentId: browserFolderId,
              });
              movedBookmarks++;
              syncLog.push(`  └─ 移动: "${browserNode.title}"`);
            }
          }
        } catch (error) {
          syncLog.push(`✗ 文件夹错误: ${folder.name} - ${(error as Error).message}`);
        }
      }

      syncLog.push(`\n整理完成:`);
      syncLog.push(`- 创建文件夹: ${createdFolders} 个`);
      syncLog.push(`- 移动书签: ${movedBookmarks} 个`);
      syncLog.push(`\n提示: 打开 chrome://bookmarks/ 查看效果`);

      // 保存结果
      await chrome.storage.local.set({
        lastSyncResult: { moved: movedBookmarks, tagged: 0 },
      });

      // 提示用户
      if (createdFolders > 0 || movedBookmarks > 0) {
        setTimeout(() => {
          if (confirm(`浏览器书签整理完成！\n\n创建 ${createdFolders} 个文件夹\n移动 ${movedBookmarks} 个书签\n\n是否要打开浏览器书签管理器查看效果？`)) {
            chrome.tabs.create({ url: 'chrome://bookmarks/' });
          }
        }, 500);
      }

      await loadDebugInfo();
    } catch (error) {
      console.error('[Debug] 整理失败:', error);
      setOrganizeError((error as Error).message);
    } finally {
      setIsOrganizingBrowser(false);
    }
  };

  // 辅助函数：构建文件夹路径
  const buildFolderPath = async (folder: any): Promise<string[]> => {
    const path: string[] = [];
    let current = folder;

    while (current) {
      path.unshift(current.name);
      if (current.parentId) {
        current = await db.folders.get(current.parentId);
      } else {
        break;
      }
    }

    return path;
  };

  // 辅助函数：在浏览器中创建文件夹
  const createBrowserFolder = async (parentNode: any, path: string[]): Promise<string> => {
    let currentNode = parentNode;

    for (const folderName of path) {
      // 查找是否已存在
      const existing = currentNode.children?.find(
        (node: any) => !node.url && node.title === folderName
      );

      if (existing) {
        currentNode = existing;
      } else {
        // 创建新文件夹
        const newFolder = await chrome.bookmarks.create({
          parentId: currentNode.id,
          title: folderName,
        });
        currentNode = newFolder;
      }
    }

    return currentNode.id;
  };

  // 辅助函数：在浏览器中查找书签
  const findBrowserBookmarkNode = async (tree: any[], url: string): Promise<any> => {
    for (const node of tree) {
      if (node.url === url) {
        return node;
      }
      if (node.children) {
        const found = await findBrowserBookmarkNode(node.children, url);
        if (found) return found;
      }
    }
    return null;
  };

  // 显示前5个书签示例
  const [sampleBookmarks, setSampleBookmarks] = useState<any[]>([]);

  useEffect(() => {
    const loadSamples = async () => {
      const samples = await db.bookmarks.limit(5).toArray();
      setSampleBookmarks(samples);
    };
    loadSamples();
  }, []);

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bug className="w-5 h-5 text-gray-600" />
          <h3 className="font-semibold text-gray-900">调试面板</h3>
        </div>
        <div className="flex items-center gap-2">
          {/* 快速整理按钮 */}
          {dbStats.bookmarks > 0 && dbStats.aiGenerated === 0 && (
            <button
              onClick={handleQuickOrganize}
              disabled={isOrganizing || isSyncing}
              className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {isOrganizing ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  整理中...
                </>
              ) : (
                <>
                  <Play className="w-3 h-3" />
                  快速整理
                </>
              )}
            </button>
          )}

          {/* 同步到浏览器按钮 */}
          {dbStats.withTags > 0 && (
            <button
              onClick={handleSyncToBrowser}
              disabled={isSyncing || isOrganizing || isOrganizingBrowser}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  同步中...
                </>
              ) : (
                <>
                  <RefreshCw className="w-3 h-3" />
                  同步标签
                </>
              )}
            </button>
          )}

          {/* 整理浏览器书签按钮 */}
          {dbStats.withFolder > 0 && (
            <button
              onClick={handleOrganizeBrowserBookmarks}
              disabled={isOrganizingBrowser || isOrganizing || isSyncing}
              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {isOrganizingBrowser ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  整理中...
                </>
              ) : (
                <>
                  <FolderTree className="w-3 h-3" />
                  整理文件夹
                </>
              )}
            </button>
          )}

          <button
            onClick={loadDebugInfo}
            disabled={isLoading || isSyncing || isOrganizing || isOrganizingBrowser}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            title="刷新"
          >
            <RefreshCw className={`w-4 h-4 text-gray-600 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 整理进度 */}
      {organizeProgress && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="text-sm text-blue-900">{organizeProgress}</div>
        </div>
      )}

      {/* 整理错误 */}
      {organizeError && (
        <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
          <div className="flex items-start gap-2 text-sm text-red-900">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">整理失败</div>
              <div className="text-xs mt-1">{organizeError}</div>
            </div>
          </div>
        </div>
      )}

      {/* 同步日志 */}
      {syncLog.length > 0 && (
        <div className="mb-4 p-3 bg-gray-900 rounded-lg text-xs">
          <div className="text-green-400 font-medium mb-2">同步日志:</div>
          <div className="space-y-1">
            {syncLog.map((log, i) => (
              <div key={i} className="text-gray-300 font-mono">
                {log}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* 数据库统计 */}
        <div className="bg-white p-3 rounded-lg border">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium">数据库</span>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-600">总书签:</span>
              <span className="font-medium">{dbStats.bookmarks}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">AI 分类:</span>
              <span className="font-medium text-green-600">{dbStats.aiGenerated}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">有标签:</span>
              <span className="font-medium">{dbStats.withTags}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">有文件夹:</span>
              <span className="font-medium">{dbStats.withFolder}</span>
            </div>
          </div>
        </div>

        {/* 浏览器统计 */}
        <div className="bg-white p-3 rounded-lg border">
          <div className="flex items-center gap-2 mb-2">
            <Bookmark className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-medium">浏览器书签</span>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-600">总数:</span>
              <span className="font-medium">{browserBookmarks}</span>
            </div>
            {dbStats.bookmarks > 0 && (
              <div className="text-gray-500 text-xs mt-2">
                数据库中有 {dbStats.bookmarks} 个书签
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 最后整理结果 */}
      {lastOrganize?.lastOrganizeResult && (
        <div className="bg-green-50 p-3 rounded-lg border border-green-200 mb-4">
          <div className="text-sm font-medium text-green-900 mb-2">
            上次整理结果
          </div>
          <div className="grid grid-cols-4 gap-2 text-xs">
            <div>
              <div className="font-medium text-green-700">
                {lastOrganize.lastOrganizeResult.processed}
              </div>
              <div className="text-gray-600">已处理</div>
            </div>
            <div>
              <div className="font-medium text-green-700">
                {lastOrganize.lastOrganizeResult.classified}
              </div>
              <div className="text-gray-600">已分类</div>
            </div>
            <div>
              <div className="font-medium text-green-700">
                {lastOrganize.lastOrganizeResult.tagged}
              </div>
              <div className="text-gray-600">已加标签</div>
            </div>
            <div>
              <div className="font-medium text-green-700">
                {lastOrganize.lastOrganizeResult.moved}
              </div>
              <div className="text-gray-600">已移动</div>
            </div>
          </div>
          {lastOrganize.lastSyncResult && (
            <div className="mt-2 pt-2 border-t border-green-300">
              <div className="text-xs text-green-700">
                浏览器同步: 移动 {lastOrganize.lastSyncResult.moved} 个,
                标签 {lastOrganize.lastSyncResult.tagged} 个
              </div>
            </div>
          )}
          {lastOrganize.lastOrganizeTime && (
            <div className="text-xs text-green-600 mt-1">
              时间: {new Date(lastOrganize.lastOrganizeTime).toLocaleString()}
            </div>
          )}
        </div>
      )}

      {/* 文件夹列表 */}
      {folderList.length > 0 && (
        <div className="bg-purple-50 p-3 rounded-lg border border-purple-200 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-purple-900">
              数据库文件夹 ({folderList.length} 个)
            </div>
            <button
              onClick={() => setShowFolders(!showFolders)}
              className="text-xs text-purple-700 hover:text-purple-900 underline"
            >
              {showFolders ? '隐藏' : '显示'}
            </button>
          </div>
          {showFolders && (
            <div className="space-y-1 text-xs">
              {folderList.map((folder) => (
                <div key={folder.id} className="flex items-center gap-2 text-purple-800">
                  <Folder className="w-3 h-3" />
                  <span className="font-medium">{folder.name}</span>
                  <span className="text-purple-600">ID: {folder.id}</span>
                  {folder.parentId && <span className="text-purple-500">父级: {folder.parentId}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 示例书签 */}
      {sampleBookmarks.length > 0 && (
        <div className="bg-white p-3 rounded-lg border">
          <div className="text-sm font-medium mb-2">示例书签 (前5个)</div>
          <div className="space-y-2">
            {sampleBookmarks.map((bookmark) => (
              <div key={bookmark.id} className="text-xs p-2 bg-gray-50 rounded">
                <div className="font-medium truncate">{bookmark.title}</div>
                <div className="text-gray-500 truncate">{bookmark.url}</div>
                <div className="flex gap-2 mt-1">
                  {bookmark.tags.length > 0 && (
                    <div className="flex items-center gap-1 text-blue-600">
                      <Tag className="w-3 h-3" />
                      {bookmark.tags.join(', ')}
                    </div>
                  )}
                  {bookmark.folderId && (
                    <div className="flex items-center gap-1 text-purple-600">
                      <Folder className="w-3 h-3" />
                      {bookmark.folderId}
                    </div>
                  )}
                  {bookmark.aiGenerated && (
                    <div className="text-green-600">✨ AI</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 提示信息 */}
      {dbStats.bookmarks === 0 && (
        <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200 text-sm text-yellow-800">
          <p className="font-medium mb-1">⚠️ 数据库中没有书签</p>
          <p className="text-xs">
            请先点击"从浏览器导入"按钮导入书签，然后再点击"开始整理"
          </p>
        </div>
      )}

      {dbStats.bookmarks > 0 && dbStats.aiGenerated === 0 && (
        <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 text-sm text-blue-800">
          <p className="font-medium mb-1">📝 书签已导入，但还未整理</p>
          <p className="text-xs">
            请在"智能整理"组件中点击"开始整理"按钮进行分类
          </p>
        </div>
      )}
    </div>
  );
}
