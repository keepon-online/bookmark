// 书签整理服务

import { db } from '@/lib/database';
import { bookmarkService, folderService, tagService, aiService, deepSeekAIService } from '@/services';
import { linkHealthService } from '@/services/linkHealthService';
import { calculateSimilarity, kMeansClustering, discoverPatterns } from '@/lib/algorithms';
import type {
  Bookmark,
  OrganizeOptions,
  OrganizeProgress,
  OrganizeResult,
  OrganizePreview,
  OrganizeChange,
  OrganizeHistory,
  BookmarkGroup,
  DuplicateGroup,
  CleanupOptions,
  CleanupResult,
  SimilarityResult,
  SmartSuggestion,
} from '@/types';

const DEFAULT_ORGANIZE_OPTIONS: OrganizeOptions = {
  strategy: 'auto',
  createNewFolders: true,
  applyTags: true,
  moveBookmarks: true,
  removeDuplicates: false,
  minConfidence: 0.6,
  archiveUncategorized: false,
  handleBroken: 'ignore',
};

export class OrganizerService {
  private isOrganizing = false;
  private currentProgress: OrganizeProgress | null = null;

  /**
   * 一键整理所有书签
   */
  async organizeAll(
    options: Partial<OrganizeOptions> = {},
    onProgress?: (progress: OrganizeProgress) => void
  ): Promise<OrganizeResult> {
    if (this.isOrganizing) {
      throw new Error('整理任务正在进行中');
    }

    this.isOrganizing = true;
    const opts = { ...DEFAULT_ORGANIZE_OPTIONS, ...options };
    const startTime = Date.now();

    try {
      onProgress?.({
        stage: 'analyzing',
        current: 0,
        total: 0,
        message: '分析书签数据...',
      });

      // 获取所有书签
      const bookmarks = await bookmarkService.getAll({ limit: 10000 });
      const total = bookmarks.length;

      const result: OrganizeResult = {
        success: false,
        processed: 0,
        classified: 0,
        moved: 0,
        tagged: 0,
        duplicatesRemoved: 0,
        archived: 0,
        foldersCreated: [],
        errors: [],
        duration: 0,
        timestamp: Date.now(),
      };

      const changes: OrganizeChange[] = [];

      // 阶段1: 分类
      onProgress?.({
        stage: 'classifying',
        current: 0,
        total,
        message: '智能分类中...',
      });

      // 批量分类提高性能
      const BATCH_SIZE = 10;
      let classifications: any[] = [];

      try {
        // 优先使用 DeepSeek 批量分类
        classifications = await deepSeekAIService.batchClassify(bookmarks, {
          batchSize: BATCH_SIZE,
          fallbackToLocal: true,
          onProgress: (current, batchTotal) => {
            onProgress?.({
              stage: 'classifying',
              current,
              total: batchTotal,
              message: `AI分类中 ${current}/${batchTotal}...`,
            });
          },
        });
      } catch {
        // DeepSeek 未初始化，使用本地批量分类
        classifications = await aiService.batchClassify(bookmarks);
      }

      // 应用分类结果
      for (let i = 0; i < bookmarks.length; i++) {
        const bookmark = bookmarks[i];
        const classification = classifications[i];

        try {
          if (classification && classification.confidence >= opts.minConfidence) {
            result.classified++;

            // 应用标签
            if (opts.applyTags && classification.suggestedTags.length > 0) {
              const newTags = [...new Set([...bookmark.tags, ...classification.suggestedTags])];
              if (newTags.length > bookmark.tags.length) {
                await bookmarkService.update(bookmark.id, {
                  tags: newTags,
                  aiGenerated: true  // 标记为 AI 生成
                });
                result.tagged++;

                changes.push({
                  bookmarkId: bookmark.id,
                  bookmarkTitle: bookmark.title,
                  type: 'tag',
                  tags: {
                    added: classification.suggestedTags,
                    removed: [],
                  },
                  confidence: classification.confidence,
                  reason: `AI 推荐标签: ${classification.suggestedTags.join(', ')}`,
                });
              }
            }

            // 移动到文件夹
            if (opts.moveBookmarks && classification.suggestedFolder) {
              // 查找或创建文件夹
              const folderId = await this.getOrCreateFolder(
                classification.suggestedFolder,
                opts.createNewFolders
              );

              if (folderId && folderId !== bookmark.folderId) {
                await bookmarkService.update(bookmark.id, {
                  folderId: folderId,
                  aiGenerated: true  // 标记为 AI 生成
                });
                result.moved++;

                changes.push({
                  bookmarkId: bookmark.id,
                  bookmarkTitle: bookmark.title,
                  type: 'move',
                  from: bookmark.folderId,
                  to: folderId,
                  confidence: classification.confidence,
                  reason: `AI 推荐文件夹: ${classification.suggestedFolder}`,
                });
              }
            }
          }

          result.processed++;

          // 更新进度（每10个更新一次避免频繁刷新）
          if (i % 10 === 0 || i === bookmarks.length - 1) {
            onProgress?.({
              stage: 'classifying',
              current: i + 1,
              total,
              message: `应用分类 ${i + 1}/${total}...`,
            });
          }
        } catch (error) {
          result.errors.push(
            `书签 "${bookmark.title}" 处理失败: ${(error as Error).message}`
          );
        }
      }

      // 阶段2: 清理
      onProgress?.({
        stage: 'cleanup',
        current: 0,
        total: 0,
        message: '清理重复和失效链接...',
      });

      // 检测和删除重复
      if (opts.removeDuplicates) {
        const duplicates = await this.detectDuplicates();
        for (const group of duplicates) {
          for (const dup of group.duplicates) {
            if (dup.id !== group.keep) {
              await bookmarkService.delete(dup.id);
              result.duplicatesRemoved++;
            }
          }
        }
      }

      // 处理失效链接
      if (opts.handleBroken !== 'ignore') {
        const brokenBookmarks = await this.findBrokenBookmarks();
        for (const bookmark of brokenBookmarks) {
          if (opts.handleBroken === 'delete') {
            await bookmarkService.delete(bookmark.id);
          } else if (opts.handleBroken === 'archive') {
            await bookmarkService.update(bookmark.id, { isArchived: true });
            result.archived++;
          }
        }
      }

      // 保存历史记录
      await this.saveHistory({
        id: `history-${Date.now()}`,
        timestamp: Date.now(),
        options: opts,
        result,
        changes,
      });

      result.success = true;
      result.duration = Date.now() - startTime;

      onProgress?.({
        stage: 'complete',
        current: total,
        total,
        message: '整理完成！',
      });

      return result;
    } finally {
      this.isOrganizing = false;
      this.currentProgress = null;
    }
  }

  /**
   * 预览整理效果（不实际执行）
   */
  async previewOrganize(
    options: Partial<OrganizeOptions> = {}
  ): Promise<OrganizePreview> {
    const opts = { ...DEFAULT_ORGANIZE_OPTIONS, ...options };
    const bookmarks = await bookmarkService.getAll({ limit: 1000 });
    const changes: OrganizeChange[] = [];
    const newFolders = new Set<string>();
    const warnings: string[] = [];

    // 预览分类
    for (const bookmark of bookmarks) {
      const classification = await aiService.classifyBookmark(bookmark);

      if (classification.confidence >= opts.minConfidence) {
        // 预览标签变更
        if (opts.applyTags && classification.suggestedTags.length > 0) {
          const newTags = [...new Set([...bookmark.tags, ...classification.suggestedTags])];
          if (newTags.length > bookmark.tags.length) {
            changes.push({
              bookmarkId: bookmark.id,
              bookmarkTitle: bookmark.title,
              type: 'tag',
              tags: {
                added: classification.suggestedTags,
                removed: [],
              },
              confidence: classification.confidence,
            });
          }
        }

        // 预览移动
        if (opts.moveBookmarks && classification.suggestedFolder) {
          newFolders.add(classification.suggestedFolder);

          changes.push({
            bookmarkId: bookmark.id,
            bookmarkTitle: bookmark.title,
            type: 'move',
            from: bookmark.folderId,
            to: classification.suggestedFolder, // 预览时使用名称
            confidence: classification.confidence,
          });
        }
      }
    }

    // 预览重复检测
    if (opts.removeDuplicates) {
      const duplicates = await this.detectDuplicates();
      warnings.push(`发现 ${duplicates.length} 组重复书签`);
    }

    return {
      changes,
      summary: {
        totalChanges: changes.length,
        newFolders: Array.from(newFolders),
        affectedBookmarks: changes.length,
        estimatedTime: Math.ceil(changes.length / 10), // 估算时间（秒）
      },
      warnings,
    };
  }

  /**
   * 检测重复书签
   */
  async detectDuplicates(): Promise<DuplicateGroup[]> {
    const bookmarks = await bookmarkService.getAll({ limit: 10000 });
    const urlMap = new Map<string, Bookmark[]>();

    // 按 URL 分组
    for (const bookmark of bookmarks) {
      if (!urlMap.has(bookmark.url)) {
        urlMap.set(bookmark.url, []);
      }
      urlMap.get(bookmark.url)!.push(bookmark);
    }

    // 找出重复的
    const duplicates: DuplicateGroup[] = [];

    for (const [url, group] of urlMap) {
      if (group.length > 1) {
        // 选择保留哪一个：优先保留最近访问的
        const sorted = [...group].sort((a, b) => {
          const aTime = a.lastVisited || a.createdAt;
          const bTime = b.lastVisited || b.createdAt;
          return bTime - aTime;
        });

        const keep = sorted[0];
        const reason = `最近访问于 ${keep.lastVisited
          ? new Date(keep.lastVisited).toLocaleDateString()
          : '创建时'
          }`;

        duplicates.push({
          id: `dup-${Date.now()}-${duplicates.length}`,
          url,
          bookmarks: group,
          keep: keep.id,
          reason,
          duplicates: sorted.slice(1).map((b) => ({
            id: b.id,
            title: b.title,
            createdAt: b.createdAt,
            lastVisited: b.lastVisited,
          })),
        });
      }
    }

    return duplicates;
  }

  /**
   * 智能分组相似书签
   */
  async groupSimilarBookmarks(
    bookmarkIds?: string[],
    k = 5
  ): Promise<BookmarkGroup[]> {
    let bookmarks: Bookmark[];

    if (bookmarkIds && bookmarkIds.length > 0) {
      // 获取指定书签
      bookmarks = await Promise.all(
        bookmarkIds.map((id) => db.bookmarks.get(id))
      ).then((books) => books.filter((b): b is Bookmark => !!b));
    } else {
      // 获取所有未分类书签
      bookmarks = await bookmarkService.getAll({ limit: 1000 });
    }

    if (bookmarks.length === 0) return [];

    // 使用 K-Means 聚类
    const clusters = kMeansClustering(bookmarks, k);

    // 为每个组生成建议
    return clusters.map((group) => ({
      ...group,
      suggestedFolder: this.suggestFolderName(group),
      suggestedTags: group.commonTags,
    }));
  }

  /**
   * 计算两个书签的相似度
   */
  async getSimilarity(bookmark1Id: string, bookmark2Id: string): Promise<SimilarityResult> {
    const [b1, b2] = await Promise.all([
      db.bookmarks.get(bookmark1Id),
      db.bookmarks.get(bookmark2Id),
    ]);

    if (!b1 || !b2) {
      throw new Error('书签不存在');
    }

    return calculateSimilarity(b1, b2);
  }

  /**
   * 清理书签
   */
  async cleanup(options: CleanupOptions): Promise<CleanupResult> {
    const startTime = Date.now();
    const result: CleanupResult = {
      removed: 0,
      archived: 0,
      kept: 0,
      invalid: 0,
      emptyFoldersRemoved: 0,
      unusedTagsRemoved: 0,
      errors: [],
      duration: 0,
    };

    try {
      // 删除重复
      if (options.removeDuplicates) {
        const duplicates = await this.detectDuplicates();
        for (const group of duplicates) {
          for (const dup of group.duplicates) {
            if (dup.id !== group.keep) {
              await bookmarkService.delete(dup.id);
              result.removed++;
            }
          }
        }
      }

      // 处理失效链接
      const brokenBookmarks = await this.findBrokenBookmarks();
      result.invalid = brokenBookmarks.length;

      for (const bookmark of brokenBookmarks) {
        try {
          if (options.handleBroken === 'delete') {
            await bookmarkService.delete(bookmark.id);
            result.removed++;
          } else if (options.handleBroken === 'archive') {
            await bookmarkService.update(bookmark.id, { isArchived: true });
            result.archived++;
          } else {
            result.kept++;
          }
        } catch (error) {
          result.errors.push(
            `处理失效链接失败 "${bookmark.title}": ${(error as Error).message}`
          );
        }
      }

      // 归档长期未访问的书签
      if (options.archiveUnused) {
        const cutoffDate = Date.now() - options.unusedDays * 24 * 60 * 60 * 1000;
        const allBookmarks = await db.bookmarks.toArray();
        const unused = allBookmarks.filter(b => b.lastVisited && b.lastVisited < cutoffDate);

        for (const bookmark of unused) {
          if (!bookmark.isArchived) {
            await bookmarkService.update(bookmark.id, { isArchived: true });
            result.archived++;
          }
        }
      }

      // 清理空文件夹（实现）
      if (options.removeEmptyFolders) {
        const emptyFolders = await this.findEmptyFolders();
        for (const folder of emptyFolders) {
          try {
            await folderService.delete(folder.id);
            result.emptyFoldersRemoved++;
          } catch (error) {
            result.errors.push(
              `删除空文件夹失败 "${folder.name}": ${(error as Error).message}`
            );
          }
        }
      }

      // 清理未使用的标签
      if (options.cleanupUnusedTags) {
        const count = await tagService.cleanupUnused();
        result.unusedTagsRemoved = count;
      }

      result.duration = Date.now() - startTime;
      return result;
    } catch (error) {
      result.errors.push((error as Error).message);
      result.duration = Date.now() - startTime;
      return result;
    }
  }

  /**
   * 生成智能建议
   */
  async generateSmartSuggestions(): Promise<SmartSuggestion[]> {
    const suggestions: SmartSuggestion[] = [];
    const bookmarks = await bookmarkService.getAll({ limit: 1000 });

    // 检测重复
    const duplicates = await this.detectDuplicates();
    if (duplicates.length > 0) {
      suggestions.push({
        type: 'cleanup',
        priority: 'high',
        title: `发现 ${duplicates.length} 组重复书签`,
        description: '删除重复书签可以节省空间并提高管理效率',
        action: async () => {
          await this.cleanup({
            removeDuplicates: true,
            handleBroken: 'ignore',
            archiveUnused: false,
            removeEmptyFolders: false,
            cleanupUnusedTags: false,
          });
        },
        estimatedImpact: {
          bookmarksAffected: duplicates.reduce(
            (sum, g) => sum + g.duplicates.length,
            0
          ),
          timeSaved: duplicates.length * 2, // 分钟
        },
      });
    }

    // 检测未分类书签
    const uncategorized = bookmarks.filter((b) => !b.folderId);
    if (uncategorized.length > 10) {
      suggestions.push({
        type: 'folder',
        priority: 'medium',
        title: `${uncategorized.length} 个书签未分类`,
        description: '使用 AI 自动分类可以将书签整理到合适的文件夹',
        action: async () => {
          await this.organizeAll({
            moveBookmarks: true,
            applyTags: true,
          });
        },
        estimatedImpact: {
          bookmarksAffected: uncategorized.length,
          timeSaved: uncategorized.length * 0.5,
        },
      });
    }

    // 检测失效链接
    const broken = await this.findBrokenBookmarks();
    if (broken.length > 5) {
      suggestions.push({
        type: 'cleanup',
        priority: 'high',
        title: `发现 ${broken.length} 个失效链接`,
        description: '清理失效链接可以保持书签库的健康',
        action: async () => {
          await this.cleanup({
            removeDuplicates: false,
            handleBroken: 'archive',
            archiveUnused: false,
            removeEmptyFolders: false,
            cleanupUnusedTags: false,
          });
        },
        estimatedImpact: {
          bookmarksAffected: broken.length,
          timeSaved: 0,
        },
      });
    }

    // 检测空文件夹
    const emptyFolders = await folderService.findEmptyFolders({
      recursive: true,
      excludeRoot: true,
      minAge: 24 * 60 * 60 * 1000, // 1天
    });

    if (emptyFolders.length > 0) {
      suggestions.push({
        type: 'cleanup',
        priority: emptyFolders.length > 10 ? 'high' : 'medium',
        title: `发现 ${emptyFolders.length} 个空文件夹`,
        description: '清理空文件夹可以让书签结构更清晰',
        action: async () => {
          await folderService.deleteEmptyFolders({
            recursive: true,
            excludeRoot: true,
            minAge: 24 * 60 * 60 * 1000,
          });
        },
        estimatedImpact: {
          foldersAffected: emptyFolders.length,
          timeSaved: emptyFolders.length * 0.1, // 分钟
        },
      });
    }

    // 发现模式
    const patterns = discoverPatterns(bookmarks);
    for (const pattern of patterns.slice(0, 3)) {
      suggestions.push({
        type: 'merge',
        priority: 'low',
        title: `发现常见模式: ${pattern.pattern}`,
        description: `可以创建标签 "${pattern.suggestedTag}" 来统一管理这类书签`,
        action: async () => {
          // TODO: 实现批量添加标签
        },
        estimatedImpact: {
          bookmarksAffected: pattern.frequency,
          timeSaved: pattern.frequency * 0.2,
        },
      });
    }

    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * 获取整理历史
   */
  async getHistory(): Promise<OrganizeHistory[]> {
    return (await db.organizeHistory.toArray()).sort(
      (a, b) => b.timestamp - a.timestamp
    );
  }

  /**
   * 辅助方法：获取或创建文件夹
   */
  private async getOrCreateFolder(
    path: string,
    create: boolean
  ): Promise<string | undefined> {
    if (!path) return undefined;

    // 尝试查找现有文件夹
    const folders = await folderService.getTree();
    // TODO: 实现路径查找逻辑

    if (!create) return undefined;

    // 创建新文件夹
    const parts = path.split('/');
    let parentId: string | undefined;

    for (const part of parts) {
      if (!part) continue;

      // 查找或创建文件夹
      const allFolders = await db.folders.toArray();
      const existing = allFolders.find(f => f.name === part && f.parentId === parentId);

      if (existing) {
        parentId = existing.id;
      } else if (create) {
        const newFolder = await folderService.create({
          name: part,
          parentId,
          order: 0,
          isSmartFolder: false,
        });
        parentId = newFolder.id;
      }
    }

    return parentId;
  }

  /**
   * 辅助方法：建议文件夹名称
   */
  private suggestFolderName(group: BookmarkGroup): string {
    if (group.commonDomain) {
      return group.commonDomain;
    }
    if (group.commonTags.length > 0) {
      return group.commonTags[0];
    }
    return group.name;
  }

  /**
   * 辅助方法：查找失效书签
   */
  private async findBrokenBookmarks(): Promise<Bookmark[]> {
    return db.bookmarks.where('status').equals('broken').toArray();
  }

  /**
   * 辅助方法：查找空文件夹
   */
  private async findEmptyFolders(): Promise<Folder[]> {
    const folders = await folderService.getAll();
    const bookmarks = await db.bookmarks.toArray();

    // 统计每个文件夹的书签数
    const folderCounts = new Map<string, number>();
    for (const bookmark of bookmarks) {
      if (bookmark.folderId) {
        folderCounts.set(bookmark.folderId, (folderCounts.get(bookmark.folderId) || 0) + 1);
      }
    }

    // 找出空文件夹
    const emptyFolders = folders.filter(folder => {
      const count = folderCounts.get(folder.id) || 0;
      return count === 0;
    });

    return emptyFolders;
  }

  /**
   * 辅助方法：保存历史记录
   */
  private async saveHistory(history: OrganizeHistory): Promise<void> {
    await db.organizeHistory.put(history);
  }
}

// 单例导出
export const organizerService = new OrganizerService();
