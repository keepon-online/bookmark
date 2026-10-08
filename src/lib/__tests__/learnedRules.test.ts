import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import 'fake-indexeddb/auto';
import {
  LEARNED_RULES_KEY,
  LEARNED_RULES_MAX,
  LEARNED_RULE_CONFIDENCE,
  clearLearnedRules,
  loadLearnedRules,
  lookupLearnedRule,
  matchLearnedRule,
  saveLearnedRules,
  trimLearnedRules,
  type LearnedDomainRules,
} from '@/lib/learnedRules';
import { auxDb, exportAuxData, importAuxData } from '@/lib/auxDatabase';

// 让 get / set / remove 围绕同一份数据工作，模拟真实 storage 往返
function useBackingStore(): Record<string, unknown> {
  const backing: Record<string, unknown> = {};
  (chrome.storage.local.get as Mock).mockImplementation(async (key: string) =>
    key in backing ? { [key]: backing[key] } : {}
  );
  (chrome.storage.local.set as Mock).mockImplementation(async (items: Record<string, unknown>) => {
    Object.assign(backing, items);
  });
  (chrome.storage.local.remove as Mock).mockImplementation(async (key: string) => {
    delete backing[key];
  });
  return backing;
}

function rule(folder: string, learnedAt: number): { folder: string; tags: string[]; learnedAt: number } {
  return { folder, tags: [`${folder}-tag`], learnedAt };
}

describe('learnedRules', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await auxDb.delete();
    await auxDb.open();
  });

  it('save / load / clear 围绕 chrome.storage.local 往返', async () => {
    const backing = useBackingStore();

    await saveLearnedRules({ 'example.com': rule('开发', 1) });
    expect(backing[LEARNED_RULES_KEY]).toBeTruthy();
    await expect(loadLearnedRules()).resolves.toMatchObject({ 'example.com': { folder: '开发' } });

    await clearLearnedRules();
    await expect(loadLearnedRules()).resolves.toEqual({});
    expect(backing[LEARNED_RULES_KEY]).toBeUndefined();
  });

  it('storage 失败时降级为空规则，不抛出', async () => {
    (chrome.storage.local.get as Mock).mockRejectedValue(new Error('storage unavailable'));
    await expect(loadLearnedRules()).resolves.toEqual({});
  });

  it('命中学习规则返回规则结果，未命中返回 null', () => {
    const rules: LearnedDomainRules = { 'example.com': rule('开发/前端', 1) };

    const hit = matchLearnedRule(rules, 'https://Example.com/article');
    expect(hit).toMatchObject({
      suggestedFolder: '开发/前端',
      suggestedTags: ['开发/前端-tag'],
      confidence: LEARNED_RULE_CONFIDENCE,
      method: 'rule',
    });
    expect(hit?.matchedRuleId).toBe('learned:example.com');

    expect(matchLearnedRule(rules, 'https://other.com/a')).toBeNull();
    expect(lookupLearnedRule(rules, 'not a url')).toBeUndefined();
  });

  it('trimLearnedRules 只保留最新的 LEARNED_RULES_MAX 条，未超限原样返回', () => {
    const small: LearnedDomainRules = { 'a.com': rule('A', 1) };
    expect(trimLearnedRules(small)).toBe(small);

    const many: LearnedDomainRules = {};
    for (let i = 0; i < LEARNED_RULES_MAX + 5; i++) {
      many[`d${i}.com`] = rule(`F${i}`, i);
    }
    const trimmed = trimLearnedRules(many);
    expect(Object.keys(trimmed)).toHaveLength(LEARNED_RULES_MAX);
    // 最新的保留、最旧的淘汰
    expect(trimmed[`d${LEARNED_RULES_MAX + 4}.com`]).toBeDefined();
    expect(trimmed['d0.com']).toBeUndefined();
  });

  it('元数据导出包含学习规则，导入按 key 合并且导入方优先', async () => {
    useBackingStore();
    await saveLearnedRules({ 'a.com': rule('A', 1) });

    const exported = await exportAuxData();
    expect(exported.learnedDomainRules).toMatchObject({ 'a.com': { folder: 'A' } });

    // 本地已被改成 B，导入旧备份时应由备份里的 A 覆盖，同时并入备份独有的 b.com
    await saveLearnedRules({ 'a.com': rule('B', 2) });
    await importAuxData({
      ...exported,
      learnedDomainRules: { 'a.com': rule('A', 1), 'b.com': rule('B', 3) },
    });

    const merged = await loadLearnedRules();
    expect(merged['a.com'].folder).toBe('A');
    expect(merged['b.com'].folder).toBe('B');
  });
});
