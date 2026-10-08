// AI 整理的学习规则
//
// 用户在整理预览里确认并**成功应用**的高置信度 AI 建议，会按域名固化成规则；
// 下次同域名的书签直接命中规则、不再消耗 AI 调用（见 organizerService）。
//
// 已知取舍：粒度是**整个域名**。同一域名的多用途书签会共用一条规则、互相覆盖
// （例如 medium.com 上的技术文与生活文），学错一次也会在下一次学习覆盖它之前
// 一直抢先于 LLM。因此设置页提供了查看与清空入口，备份导出也包含这份数据——
// 让误学可发现、可撤销，而不是不可恢复。
//
// 之所以不做"域名 + 内容类型"的更细粒度：本地 inferContentType 主要看 URL 与
// 域名，同一域名通常只映射到同一个类型，细化收益很小却会明显降低命中率。

import type { ClassificationResult } from '@/types';
import { getDomain } from './utils';

export interface LearnedDomainRule {
  folder: string;
  tags: string[];
  learnedAt: number;
}

export type LearnedDomainRules = Record<string, LearnedDomainRule>;

export const LEARNED_RULES_KEY = 'learnedDomainRules';

// 容量上限：超限按 learnedAt 淘汰最旧的，避免无限增长
export const LEARNED_RULES_MAX = 200;

// 命中学习规则时的置信度：高于规则引擎的常规值，因为这条是用户亲自确认过的
export const LEARNED_RULE_CONFIDENCE = 0.9;

export async function loadLearnedRules(): Promise<LearnedDomainRules> {
  try {
    const stored = await chrome.storage.local.get(LEARNED_RULES_KEY);
    return (stored?.[LEARNED_RULES_KEY] as LearnedDomainRules) ?? {};
  } catch {
    return {};
  }
}

export async function saveLearnedRules(rules: LearnedDomainRules): Promise<void> {
  try {
    await chrome.storage.local.set({ [LEARNED_RULES_KEY]: rules });
  } catch {
    // 存储失败不影响整理主流程
  }
}

export async function clearLearnedRules(): Promise<void> {
  try {
    await chrome.storage.local.remove(LEARNED_RULES_KEY);
  } catch {
    // 清理失败无可补救，静默忽略
  }
}

// 容量控制：超限时按学习时间淘汰最旧的
export function trimLearnedRules(rules: LearnedDomainRules): LearnedDomainRules {
  const entries = Object.entries(rules);
  if (entries.length <= LEARNED_RULES_MAX) {
    return rules;
  }
  return Object.fromEntries(
    entries.sort((a, b) => b[1].learnedAt - a[1].learnedAt).slice(0, LEARNED_RULES_MAX)
  );
}

// 按域名查规则
export function lookupLearnedRule(
  rules: LearnedDomainRules,
  url: string
): LearnedDomainRule | undefined {
  const domain = getDomain(url).toLowerCase();
  return domain ? rules[domain] : undefined;
}

// 命中学习规则 → 规则结果（带 matchedRuleId，使其不再送 AI）
export function matchLearnedRule(
  rules: LearnedDomainRules,
  url: string
): ClassificationResult | null {
  const hit = lookupLearnedRule(rules, url);
  if (!hit) {
    return null;
  }
  return {
    suggestedFolder: hit.folder,
    suggestedTags: hit.tags,
    contentType: 'other',
    confidence: LEARNED_RULE_CONFIDENCE,
    method: 'rule',
    matchedRuleId: `learned:${getDomain(url).toLowerCase()}`,
  };
}
