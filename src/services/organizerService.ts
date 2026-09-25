// 智能整理服务 v2：预览-确认模式
// 输入浏览器书签节点，先只读地生成建议（suggest），
// 用户确认后按所选建议执行（apply）：移动走 chrome.bookmarks，
// 标签写 aux，全程记录整理历史。

import { browserBookmarks } from './browserBookmarksService';
import { auxDb, defaultMeta } from '@/lib/auxDatabase';
import { aiService } from './aiService';
import { deepSeekAIService } from './deepseekAIService';
import { generateId, getUrlKey, now } from '@/lib/utils';
import type { AuxBookmarkMeta, BrowserBookmarkNode } from '@/types';
import type { Bookmark, ClassificationResult } from '@/types';
import type { OrganizeHistory } from '@/types/organizer';

// 单条整理建议
export interface OrganizeSuggestion {
  node: BrowserBookmarkNode;
  // 建议文件夹路径（相对书签栏，如 "开发/文档"）
  suggestedFolderPath?: string;
  // 建议新增的标签（已排除现有标签）
  suggestedTags: string[];
  confidence: number;
  reason: string;
  engine: 'rule' | 'deepseek';
}

export interface SuggestOptions {
  // 最低置信度（默认 0.6）
  minConfidence?: number;
  // auto：配置并启用 DeepSeek 时优先用 LLM，失败回退规则引擎
  engine?: 'auto' | 'rule';
  // 建议是否包含移动（默认 true）
  moveBookmarks?: boolean;
  // 建议是否包含标签（默认 true）
  applyTags?: boolean;
}

export interface ApplyResult {
  applied: number;
  moved: number;
  tagged: number;
  errors: string[];
}

// 分类器输入适配：浏览器节点 + meta → 旧 Bookmark 形状（分类器只读 url/title/tags）
function toClassifierInput(node: BrowserBookmarkNode, meta?: AuxBookmarkMeta): Bookmark {
  return {
    id: node.id,
    url: node.url ?? '',
    urlKey: node.url ? getUrlKey(node.url) : '',
    title: node.title,
    tags: meta?.tags ?? [],
    createdAt: node.dateAdded ?? 0,
    updatedAt: node.dateAdded ?? 0,
    visitCount: meta?.visitCount ?? 0,
    isFavorite: meta?.isFavorite ?? false,
    isArchived: false,
    status: 'active',
    aiGenerated: false,
  };
}

// DeepSeek 是否已启用（chrome.storage.local.deepseekConfig）
export async function isDeepSeekEnabled(): Promise<boolean> {
  try {
    const stored = await chrome.storage.local.get('deepseekConfig');
    const config = stored?.deepseekConfig;
    return Boolean(config?.enabled && config?.apiKey);
  } catch {
    return false;
  }
}

export class OrganizerService {
  // 生成整理建议（纯只读，不写任何数据）
  async suggest(
    nodes: BrowserBookmarkNode[],
    meta: Record<string, AuxBookmarkMeta>,
    options: SuggestOptions = {}
  ): Promise<OrganizeSuggestion[]> {
    const {
      minConfidence = 0.6,
      engine = 'auto',
      moveBookmarks = true,
      applyTags = true,
    } = options;

    const targets = nodes.filter((node) => node.url);
    const inputs = targets.map((node) => toClassifierInput(node, meta[node.id]));

    let results: ClassificationResult[];
    let usedEngine: 'rule' | 'deepseek' = 'rule';

    if (engine === 'auto' && (await isDeepSeekEnabled())) {
      try {
        const stored = await chrome.storage.local.get('deepseekConfig');
        deepSeekAIService.initialize(stored.deepseekConfig);
        results = await deepSeekAIService.batchClassify(inputs, { batchSize: 20 });
        usedEngine = 'deepseek';
      } catch {
        results = await aiService.batchClassify(inputs);
      }
    } else {
      results = await aiService.batchClassify(inputs);
    }

    const suggestions: OrganizeSuggestion[] = [];
    targets.forEach((node, index) => {
      const result = results[index];
      if (!result || result.confidence < minConfidence) {
        return;
      }

      const folder = moveBookmarks ? result.suggestedFolder : undefined;
      const tags = applyTags
        ? result.suggestedTags.filter((tag) => !(meta[node.id]?.tags ?? []).includes(tag))
        : [];

      if (!folder && tags.length === 0) {
        return;
      }

      suggestions.push({
        node,
        suggestedFolderPath: folder,
        suggestedTags: tags,
        confidence: result.confidence,
        reason: usedEngine === 'deepseek' ? 'DeepSeek 分类' : '规则引擎匹配',
        engine: usedEngine,
      });
    });

    return suggestions;
  }

  // 应用所选建议：移动直写 chrome.bookmarks，标签写 aux，记录历史
  async apply(suggestions: OrganizeSuggestion[]): Promise<ApplyResult> {
    const result: ApplyResult = { applied: 0, moved: 0, tagged: 0, errors: [] };

    for (const suggestion of suggestions) {
      try {
        if (suggestion.suggestedFolderPath) {
          const folderId = await browserBookmarks.ensureFolderPath(
            suggestion.suggestedFolderPath.split('/')
          );
          if (folderId !== suggestion.node.parentId) {
            await browserBookmarks.moveBookmark(suggestion.node.id, folderId);
            result.moved++;
          }
        }

        if (suggestion.suggestedTags.length > 0) {
          const base =
            (await auxDb.bookmarkMeta.get(suggestion.node.id)) ?? defaultMeta(suggestion.node.id);
          await auxDb.bookmarkMeta.put({
            ...base,
            tags: [...new Set([...base.tags, ...suggestion.suggestedTags])],
            aiGenerated: true,
          });
          result.tagged++;
        }

        result.applied++;
      } catch (error) {
        result.errors.push(`${suggestion.node.title || suggestion.node.url}: ${(error as Error).message}`);
      }
    }

    if (result.applied > 0) {
      await auxDb.organizeHistory.add({
        id: generateId(),
        timestamp: now(),
        // 旧 OrganizeOptions 字段在新流程中的等价记录
        options: {
          strategy: 'auto',
          createNewFolders: true,
          applyTags: true,
          moveBookmarks: true,
          removeDuplicates: false,
          minConfidence: 0,
          archiveUncategorized: false,
          handleBroken: 'ignore',
        },
        result: {
          success: result.errors.length === 0,
          processed: result.applied,
          classified: result.applied,
          moved: result.moved,
          tagged: result.tagged,
          duplicatesRemoved: 0,
          archived: 0,
          foldersCreated: [],
          errors: result.errors,
          duration: 0,
          timestamp: now(),
        },
        changes: [],
      });
    }

    return result;
  }

  // 整理历史（新记录在前）
  async getHistory(limit = 20): Promise<OrganizeHistory[]> {
    const records = await auxDb.organizeHistory.toArray();
    return records.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }
}

// 单例导出
export const organizerService = new OrganizerService();
