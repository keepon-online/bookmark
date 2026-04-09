// 文件夹同步服务测试

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '@/lib/database';
import { FolderSyncService } from '@/services/folderSyncService';
import type { Folder } from '@/types';

// 创建独立的服务实例用于测试
let syncService: FolderSyncService;

// 辅助函数：创建测试文件夹
function createTestFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '测试文件夹',
    icon: '📁',
    parentId: undefined,
    order: 0,
    isSmartFolder: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

beforeEach(async () => {
  // 重置数据库
  await db.delete();
  await db.open();

  // 重置 Chrome API mocks
  vi.mocked(chrome.bookmarks.create).mockReset();
  vi.mocked(chrome.bookmarks.update).mockReset();
  vi.mocked(chrome.bookmarks.remove).mockReset();
  vi.mocked(chrome.bookmarks.removeTree).mockReset();
  vi.mocked(chrome.bookmarks.get).mockReset();
  vi.mocked(chrome.bookmarks.getTree).mockReset();
  vi.mocked(chrome.bookmarks.onCreated.addListener).mockReset();
  vi.mocked(chrome.bookmarks.onRemoved.addListener).mockReset();
  vi.mocked(chrome.bookmarks.onMoved.addListener).mockReset();
  vi.mocked(chrome.bookmarks.onChanged.addListener).mockReset();
  vi.mocked(chrome.bookmarks.onCreated.removeListener).mockReset();
  vi.mocked(chrome.bookmarks.onRemoved.removeListener).mockReset();
  vi.mocked(chrome.bookmarks.onMoved.removeListener).mockReset();
  vi.mocked(chrome.bookmarks.onChanged.removeListener).mockReset();

  // 创建新的服务实例
  syncService = new FolderSyncService();
});

afterEach(async () => {
  syncService.stopWatching();
  await db.delete();
});

// ========== 同步到浏览器 ==========

describe('syncFolderToBrowser', () => {
  it('应该将数据库文件夹同步到浏览器', async () => {
    // 准备测试数据
    const folder = createTestFolder({ name: '前端开发' });
    await db.folders.add(folder);

    // Mock chrome.bookmarks.create 返回浏览器文件夹
    vi.mocked(chrome.bookmarks.create).mockResolvedValue({
      id: 'browser-folder-1',
      title: '前端开发',
      parentId: '1',
    } as never);

    // 执行同步
    const result = await syncService.syncFolderToBrowser(folder.id);

    // 验证结果
    expect(result.success).toBe(true);
    expect(result.action).toBe('created');
    expect(result.browserFolderId).toBe('browser-folder-1');

    // 验证调用了 chrome.bookmarks.create
    expect(chrome.bookmarks.create).toHaveBeenCalledWith({
      parentId: '1',
      title: '前端开发',
    });

    // 验证数据库中的映射已更新
    const updatedFolder = await db.folders.get(folder.id);
    expect(updatedFolder?.browserFolderId).toBe('browser-folder-1');
    expect(updatedFolder?.syncStatus).toBe('synced');

    // 验证映射表中有记录
    const mappings = await db.folderMappings.toArray();
    expect(mappings.length).toBe(1);
    expect(mappings[0].dbFolderId).toBe(folder.id);
    expect(mappings[0].browserFolderId).toBe('browser-folder-1');
  });

  it('文件夹不存在时应返回失败', async () => {
    const result = await syncService.syncFolderToBrowser('non-existent-id');
    expect(result.success).toBe(false);
    expect(result.action).toBe('skipped');
    expect(result.error).toBe('Folder not found');
  });

  it('智能文件夹不应同步到浏览器', async () => {
    const folder = createTestFolder({ isSmartFolder: true, name: '智能文件夹' });
    await db.folders.add(folder);

    const result = await syncService.syncFolderToBrowser(folder.id);
    expect(result.success).toBe(false);
    expect(result.action).toBe('skipped');
    expect(result.error).toBe('Smart folders cannot be synced');
  });

  it('已有映射时应更新而非创建', async () => {
    const folder = createTestFolder({ name: '后端开发', browserFolderId: 'browser-2' });
    await db.folders.add(folder);

    // 添加映射记录
    await db.folderMappings.add({
      id: 'mapping-1',
      dbFolderId: folder.id,
      browserFolderId: 'browser-2',
      browserParentId: '1',
      lastSyncedAt: Date.now(),
      syncDirection: 'bidirectional',
      syncStatus: 'synced',
      version: 1,
    });

    // Mock get 返回浏览器文件夹
    vi.mocked(chrome.bookmarks.get).mockResolvedValue([{
      id: 'browser-2',
      title: '后端开发',
      parentId: '1',
    }] as chrome.bookmarks.BookmarkTreeNode[]);

    const result = await syncService.syncFolderToBrowser(folder.id);
    expect(result.success).toBe(true);
    expect(result.action).toBe('updated');

    // 不应调用 create
    expect(chrome.bookmarks.create).not.toHaveBeenCalled();
  });
});

// ========== 从浏览器同步 ==========

describe('syncFolderFromBrowser', () => {
  it('应该将浏览器文件夹同步到数据库', async () => {
    // Mock chrome.bookmarks.get
    vi.mocked(chrome.bookmarks.get).mockResolvedValue([{
      id: 'browser-folder-new',
      title: '设计资源',
      parentId: '1',
      dateAdded: Date.now(),
    }] as chrome.bookmarks.BookmarkTreeNode[]);

    const result = await syncService.syncFolderFromBrowser('browser-folder-new');

    expect(result.success).toBe(true);
    expect(result.action).toBe('created');
    expect(result.browserFolderId).toBe('browser-folder-new');

    // 验证数据库中创建了文件夹
    const folders = await db.folders.toArray();
    const newFolder = folders.find(f => f.name === '设计资源');
    expect(newFolder).toBeDefined();
    expect(newFolder?.browserFolderId).toBe('browser-folder-new');
    expect(newFolder?.syncStatus).toBe('synced');
  });

  it('书签（非文件夹）不应同步', async () => {
    vi.mocked(chrome.bookmarks.get).mockResolvedValue([{
      id: 'bookmark-1',
      title: 'Google',
      url: 'https://google.com',
      parentId: '1',
    }] as chrome.bookmarks.BookmarkTreeNode[]);

    const result = await syncService.syncFolderFromBrowser('bookmark-1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Not a folder');
  });

  it('浏览器文件夹不存在时应返回失败', async () => {
    vi.mocked(chrome.bookmarks.get).mockResolvedValue([]);

    const result = await syncService.syncFolderFromBrowser('non-existent');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Browser folder not found');
  });

  it('已存在同名文件夹时应创建映射而非重复创建', async () => {
    // 数据库中已有同名文件夹
    const existingFolder = createTestFolder({ name: '工具收藏' });
    await db.folders.add(existingFolder);

    vi.mocked(chrome.bookmarks.get).mockResolvedValue([{
      id: 'browser-tools',
      title: '工具收藏',
      parentId: '1',
    }] as chrome.bookmarks.BookmarkTreeNode[]);

    const result = await syncService.syncFolderFromBrowser('browser-tools');
    expect(result.success).toBe(true);
    expect(result.action).toBe('updated');
    expect(result.dbFolderId).toBe(existingFolder.id);

    // 验证没有创建重复文件夹
    const folders = await db.folders.where('name').equals('工具收藏').toArray();
    expect(folders.length).toBe(1);
  });
});

// ========== 映射管理 ==========

describe('映射管理', () => {
  it('createMapping 应该创建映射记录', async () => {
    const mapping = await syncService.createMapping('db-1', 'browser-1', '1');

    expect(mapping.dbFolderId).toBe('db-1');
    expect(mapping.browserFolderId).toBe('browser-1');
    expect(mapping.syncStatus).toBe('synced');

    const stored = await db.folderMappings.toArray();
    expect(stored.length).toBe(1);
  });

  it('getBrowserFolderId 应该返回对应的浏览器 ID', async () => {
    await syncService.createMapping('db-1', 'browser-1', '1');

    const browserId = await syncService.getBrowserFolderId('db-1');
    expect(browserId).toBe('browser-1');
  });

  it('getDbFolderId 应该返回对应的数据库 ID', async () => {
    await syncService.createMapping('db-1', 'browser-1', '1');

    const dbId = await syncService.getDbFolderId('browser-1');
    expect(dbId).toBe('db-1');
  });

  it('removeMappingByDbId 应该按数据库 ID 删除映射', async () => {
    await syncService.createMapping('db-1', 'browser-1', '1');
    await syncService.createMapping('db-2', 'browser-2', '1');

    await syncService.removeMappingByDbId('db-1');

    const mappings = await db.folderMappings.toArray();
    expect(mappings.length).toBe(1);
    expect(mappings[0].dbFolderId).toBe('db-2');
  });
});

// ========== 事件监听 ==========

describe('事件监听', () => {
  it('startWatching 应该注册所有事件监听器', () => {
    syncService.startWatching();

    expect(chrome.bookmarks.onCreated.addListener).toHaveBeenCalledTimes(1);
    expect(chrome.bookmarks.onRemoved.addListener).toHaveBeenCalledTimes(1);
    expect(chrome.bookmarks.onMoved.addListener).toHaveBeenCalledTimes(1);
    expect(chrome.bookmarks.onChanged.addListener).toHaveBeenCalledTimes(1);
    expect(syncService.isWatchingBrowser()).toBe(true);
  });

  it('stopWatching 应该移除所有事件监听器', () => {
    syncService.startWatching();
    syncService.stopWatching();

    expect(chrome.bookmarks.onCreated.removeListener).toHaveBeenCalledTimes(1);
    expect(chrome.bookmarks.onRemoved.removeListener).toHaveBeenCalledTimes(1);
    expect(chrome.bookmarks.onMoved.removeListener).toHaveBeenCalledTimes(1);
    expect(chrome.bookmarks.onChanged.removeListener).toHaveBeenCalledTimes(1);
    expect(syncService.isWatchingBrowser()).toBe(false);
  });

  it('重复调用 startWatching 不应重复注册', () => {
    syncService.startWatching();
    syncService.startWatching();

    expect(chrome.bookmarks.onCreated.addListener).toHaveBeenCalledTimes(1);
  });

  it('未启动时调用 stopWatching 不应报错', () => {
    expect(() => syncService.stopWatching()).not.toThrow();
    expect(chrome.bookmarks.onCreated.removeListener).not.toHaveBeenCalled();
  });
});

// ========== 全量同步 ==========

describe('syncAllToBrowser', () => {
  it('应该同步所有非智能文件夹', async () => {
    const folder1 = createTestFolder({ name: '技术', order: 0 });
    const folder2 = createTestFolder({ name: '生活', order: 1 });
    const smartFolder = createTestFolder({ name: '收藏', isSmartFolder: true, order: 2 });

    await db.folders.bulkAdd([folder1, folder2, smartFolder]);

    let callCount = 0;
    vi.mocked(chrome.bookmarks.create).mockImplementation(async (details) => {
      callCount++;
      return {
        id: `browser-${callCount}`,
        title: details?.title || '',
        parentId: details?.parentId || '1',
      } as chrome.bookmarks.BookmarkTreeNode;
    });

    const result = await syncService.syncAllToBrowser();

    expect(result.success).toBe(true);
    expect(result.total).toBe(3);
    expect(result.synced).toBe(2); // 2 个普通文件夹
    expect(result.skipped).toBe(1); // 1 个智能文件夹
  });

  it('空数据库应返回成功且计数为 0', async () => {
    const result = await syncService.syncAllToBrowser();

    expect(result.success).toBe(true);
    expect(result.total).toBe(0);
    expect(result.synced).toBe(0);
  });
});

// ========== 冲突管理 ==========

describe('冲突管理', () => {
  it('getConflicts 初始应返回空数组', async () => {
    const conflicts = await syncService.getConflicts();
    expect(conflicts).toEqual([]);
  });

  it('resolveConflict 使用 skip 应标记冲突为已解决', async () => {
    // 手动插入一个冲突
    await db.folderSyncConflicts.add({
      id: 'conflict-1',
      type: 'deleted_on_one_side',
      dbFolderId: 'db-1',
      browserFolderId: 'browser-1',
      detectedAt: Date.now(),
      resolved: false,
    });

    await syncService.resolveConflict('conflict-1', { action: 'skip' });

    const conflict = await db.folderSyncConflicts.get('conflict-1');
    expect(conflict?.resolved).toBe(true);
  });
});
