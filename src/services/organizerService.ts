// 智能整理服务 v2：预览-确认模式
// 输入浏览器书签节点，先只读地生成建议（suggest），
// 用户确认后按所选建议执行（apply）：移动走 chrome.bookmarks，
// 标签写 aux，全程记录整理历史。

import { browserBookmarks } from './browserBookmarksService';
import { auxDb, defaultMeta } from '@/lib/auxDatabase';
import {
  loadLearnedRules,
  saveLearnedRules,
  matchLearnedRule,
  trimLearnedRules,
} from '@/lib/learnedRules';
import { aiService } from './aiService';
import { deepSeekAIService } from './deepseekAIService';
import { generateId, getDomain, getUrlKey, now } from '@/lib/utils';
import { createLogger } from '@/lib/logger';
import type { AuxBookmarkMeta, BrowserBookmarkNode } from '@/types';
import type { Bookmark, ClassificationResult } from '@/types';
import type { OrganizeChange, OrganizeHistory } from '@/types/organizer';

const logger = createLogger('Organizer');

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
  // auto：配置并启用 DeepSeek 时，规则未覆盖的长尾交给 LLM；rule：仅规则引擎
  engine?: 'auto' | 'rule';
  // 建议是否包含移动（默认 true）
  moveBookmarks?: boolean;
  // 建议是否包含标签（默认 true）
  applyTags?: boolean;
  // 用户现有文件夹完整路径（如 "开发/前端"），作为 AI 分类的目标结构
  folderPaths?: string[];
}

// 学习回流门槛：AI 建议 + 该置信度以上 + 用户成功应用，才值得固化。
// 规则的存取、匹配与容量控制见 @/lib/learnedRules
const LEARN_MIN_CONFIDENCE = 0.8;

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
      folderPaths = [],
    } = options;

    const targets = nodes.filter((node) => node.url);
    const inputs = targets.map((node) => toClassifierInput(node, meta[node.id]));

    // 规则先行（免费、确定、含用户确认过的学习规则）；
    // AI 只处理规则未覆盖的长尾，规则命中的部分质量更稳且零成本
    const learnedRules = await loadLearnedRules();
    const results: ClassificationResult[] = await Promise.all(
      inputs.map(async (input) => {
        const learned = matchLearnedRule(learnedRules, input.url);
        return learned ?? aiService.classifyBookmark(input);
      })
    );

    // 哪些位置最终由 AI 复核（用于逐条标注 engine 与学习回流）
    const aiHandled = new Set<number>();

    if (engine === 'auto' && (await isDeepSeekEnabled())) {
      const longTail = inputs
        .map((_, index) => index)
        .filter((index) => !results[index].matchedRuleId);
      if (longTail.length > 0) {
        try {
          const stored = await chrome.storage.local.get('deepseekConfig');
          // await：initialize 内部要加载持久化缓存（loadCache），
          // 不等它就把 batchClassify 的缓存前缀跑完 → 每个上下文首查全量 miss
          await deepSeekAIService.initialize(stored.deepseekConfig);
          const aiResults = await deepSeekAIService.batchClassify(
            longTail.map((index) => inputs[index]),
            { batchSize: 20, folderTree: folderPaths }
          );
          longTail.forEach((index, j) => {
            const aiResult = aiResults[j];
            if (aiResult) {
              results[index] = aiResult;
              aiHandled.add(index);
            }
          });
        } catch {
          // AI 不可用：保持规则结果
        }
      }
    }

    const suggestions: OrganizeSuggestion[] = [];
    targets.forEach((node, index) => {
      const result = results[index];
      if (!result || result.confidence < minConfidence) {
        return;
      }

      let folder = moveBookmarks ? result.suggestedFolder : undefined;

      // 如果目标文件夹与书签当前所在目录一致，则无需重复建议移动
      if (folder) {
        const normalize = (p: string) =>
          p
            .replace(/^书签栏\/?/, '')
            .replace(/^其他书签\/?/, '')
            .replace(/\/$/, '')
            .trim();
        if (normalize(node.path) === normalize(folder)) {
          folder = undefined;
        }
      }

      const tags = applyTags
        ? result.suggestedTags.filter((tag) => !(meta[node.id]?.tags ?? []).includes(tag))
        : [];

      if (!folder && tags.length === 0) {
        return;
      }

      const engineUsed: 'rule' | 'deepseek' = aiHandled.has(index) ? 'deepseek' : 'rule';
      suggestions.push({
        node,
        suggestedFolderPath: folder,
        suggestedTags: tags,
        confidence: result.confidence,
        reason: engineUsed === 'deepseek' ? 'DeepSeek 分类' : '规则引擎匹配',
        engine: engineUsed,
      });
    });

    return suggestions;
  }

  // 应用所选建议：移动直写 chrome.bookmarks，标签写 aux，记录历史
  async apply(suggestions: OrganizeSuggestion[]): Promise<ApplyResult> {
    const startedAt = now();
    const result: ApplyResult = { applied: 0, moved: 0, tagged: 0, errors: [] };
    const changes: OrganizeChange[] = [];
    // 应用成功的建议：学习回流只认这些，抛错的不能沉淀成规则
    const appliedSuggestions: OrganizeSuggestion[] = [];

    for (const suggestion of suggestions) {
      try {
        let moved = false;
        let originalParentId: string | undefined = undefined;
        let targetFolderId: string | undefined = undefined;

        if (suggestion.suggestedFolderPath) {
          const folderId = await browserBookmarks.ensureFolderPath(
            suggestion.suggestedFolderPath.split('/')
          );
          if (folderId !== suggestion.node.parentId) {
            originalParentId = suggestion.node.parentId;
            targetFolderId = folderId;
            await browserBookmarks.moveBookmark(suggestion.node.id, folderId);
            result.moved++;
            moved = true;
          }
        }

        // 移动成功立即写入变更记录：若后续标签事务失败，这条 catch
        // 跳过时移动也不能从历史里消失——否则书签已被移走、一键撤销
        // 却对它永久失效
        let change: OrganizeChange | undefined;
        if (moved) {
          change = {
            bookmarkId: suggestion.node.id,
            bookmarkTitle: suggestion.node.title || suggestion.node.url || '',
            type: 'move',
            from: originalParentId,
            to: targetFolderId,
            tags: { added: [], removed: [] },
            confidence: suggestion.confidence,
            reason: suggestion.reason,
          };
          changes.push(change);
        }

        let appliedTags: string[] = [];
        if (suggestion.suggestedTags.length > 0) {
          // 事务内合并标签（并发写安全），并只记录**实际新增**的子集：
          // rollback 按值剥离，若记录全部建议标签，用户在生成建议后
          // 手动加的同名标签会被误删
          appliedTags = await auxDb.transaction('rw', auxDb.bookmarkMeta, async () => {
            const base =
              (await auxDb.bookmarkMeta.get(suggestion.node.id)) ??
              defaultMeta(suggestion.node.id);
            const added = suggestion.suggestedTags.filter((tag) => !base.tags.includes(tag));
            await auxDb.bookmarkMeta.put({
              ...base,
              tags: [...new Set([...base.tags, ...suggestion.suggestedTags])],
              aiGenerated: true,
            });
            return added;
          });
          result.tagged++;
        }

        if (appliedTags.length > 0) {
          if (change) {
            // 移动 + 标签：补充到同一条变更（rollback 一次还原两者）
            change.tags = { added: appliedTags, removed: [] };
          } else {
            changes.push({
              bookmarkId: suggestion.node.id,
              bookmarkTitle: suggestion.node.title || suggestion.node.url || '',
              type: 'tag',
              from: undefined,
              to: undefined,
              tags: { added: appliedTags, removed: [] },
              confidence: suggestion.confidence,
              reason: suggestion.reason,
            });
          }
        }

        result.applied++;
        appliedSuggestions.push(suggestion);
      } catch (error) {
        result.errors.push(`${suggestion.node.title || suggestion.node.url}: ${(error as Error).message}`);
      }
    }

    // 学习回流：高置信度 AI 建议被用户确认并成功应用 → 固化为域名级规则，
    // 后续同域名书签直接走规则，AI 用量随使用递减。
    // 只认应用成功的建议：移动或写标签抛错的那些不能沉淀为规则
    const learnable = appliedSuggestions.filter(
      (suggestion) =>
        suggestion.engine === 'deepseek' &&
        suggestion.confidence >= LEARN_MIN_CONFIDENCE &&
        !!suggestion.suggestedFolderPath
    );
    if (learnable.length > 0) {
      const learned = await loadLearnedRules();
      for (const suggestion of learnable) {
        const domain = getDomain(suggestion.node.url ?? '').toLowerCase();
        if (!domain) continue;
        learned[domain] = {
          folder: suggestion.suggestedFolderPath!,
          tags: suggestion.suggestedTags,
          learnedAt: now(),
        };
      }
      await saveLearnedRules(trimLearnedRules(learned));
    }

    if (result.applied > 0) {
      const finishedAt = now();
      // 新流程是"用户在预览里逐条勾选"，没有策略/阈值这类输入，因此这里记录的是
      // 从本次实际执行推导出来的等价信息（不是用户输入，也不含未实现的能力）
      await auxDb.organizeHistory.add({
        id: generateId(),
        timestamp: finishedAt,
        options: {
          // 组织策略：新流程没有策略选项，固定记为 auto
          strategy: 'auto',
          // 缺失的目标文件夹会自动创建，故恒为 true
          createNewFolders: true,
          applyTags: suggestions.some((suggestion) => suggestion.suggestedTags.length > 0),
          moveBookmarks: suggestions.some((suggestion) => !!suggestion.suggestedFolderPath),
          removeDuplicates: false,
          // 筛选发生在 suggest 阶段，这里记录本次实际应用的最低置信度
          minConfidence: suggestions.length > 0
            ? Math.min(...suggestions.map((suggestion) => suggestion.confidence))
            : 0,
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
          // 未跟踪：ensureFolderPath 只回报目标 id，不回报是否新建
          foldersCreated: [],
          errors: result.errors,
          duration: finishedAt - startedAt,
          timestamp: finishedAt,
        },
        changes,
      });
    }

    return result;
  }

  // 撤销/回滚指定整理记录
  async rollback(historyId: string): Promise<{ restored: number; errors: string[] }> {
    const history = await auxDb.organizeHistory.get(historyId);
    if (!history) {
      throw new Error(`未找到整理记录: ${historyId}`);
    }
    if (history.rolledBack) {
      throw new Error('该记录已撤销，无法重复撤销');
    }

    const res = { restored: 0, errors: [] as string[] };

    for (const change of history.changes) {
      try {
        let hasAction = false;
        // 1. 如果移动过，移回原文件夹
        if (change.from && change.to && change.from !== change.to) {
          try {
            await browserBookmarks.moveBookmark(change.bookmarkId, change.from);
            hasAction = true;
          } catch (e) {
            res.errors.push(`还原文件夹失败 (${change.bookmarkTitle}): ${(e as Error).message}`);
          }
        }

        // 2. 如果添加过标签，从 auxDb 移除本次添加的标签
        if (change.tags?.added && change.tags.added.length > 0) {
          try {
            const meta = await auxDb.bookmarkMeta.get(change.bookmarkId);
            if (meta) {
              const addedSet = new Set(change.tags.added);
              const remainingTags = meta.tags.filter((t) => !addedSet.has(t));
              await auxDb.bookmarkMeta.put({
                ...meta,
                tags: remainingTags,
              });
              hasAction = true;
            }
          } catch (e) {
            res.errors.push(`还原标签失败 (${change.bookmarkTitle}): ${(e as Error).message}`);
          }
        }

        if (hasAction) {
          res.restored++;
        }
      } catch (err) {
        res.errors.push(`回滚变更失败 (${change.bookmarkTitle}): ${(err as Error).message}`);
      }
    }

    // 全部成功才标记已撤销：部分失败（如原文件夹已被删除）时保持可重试，
    // 否则失败项永远无法再次回滚，卡在半回滚状态
    if (res.errors.length === 0) {
      await auxDb.organizeHistory.update(historyId, {
        rolledBack: true,
        rolledBackAt: now(),
      });

      // 回收本次涉及域名的学习规则：用户明确撤销的分类不能以 0.9
      // 置信度持续复现，且学习规则会抢先 AI，不删就永远没机会重学
      try {
        const snapshot = await browserBookmarks.loadTree();
        const byId = new Map(snapshot.bookmarks.map((node) => [node.id, node]));
        const domains = new Set<string>();
        for (const change of history.changes) {
          const url = byId.get(change.bookmarkId)?.url;
          const domain = url ? getDomain(url).toLowerCase() : '';
          if (domain) {
            domains.add(domain);
          }
        }
        if (domains.size > 0) {
          const learned = await loadLearnedRules();
          let touched = false;
          for (const domain of domains) {
            if (learned[domain]) {
              delete learned[domain];
              touched = true;
            }
          }
          if (touched) {
            await saveLearnedRules(learned);
          }
        }
      } catch (error) {
        // 规则回收失败不影响撤销本身
        logger.warn('Rollback: 清理学习规则失败', error);
      }
    }

    return res;
  }

  // 整理历史（新记录在前）
  async getHistory(limit = 20): Promise<OrganizeHistory[]> {
    const records = await auxDb.organizeHistory.toArray();
    return records.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }

  // 删除某条历史记录
  async deleteHistory(historyId: string): Promise<void> {
    await auxDb.organizeHistory.delete(historyId);
  }

  // 清空历史记录
  async clearHistory(): Promise<void> {
    await auxDb.organizeHistory.clear();
  }
}

// 单例导出
export const organizerService = new OrganizerService();
