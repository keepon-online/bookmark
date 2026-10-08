import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Bookmark, CostStats, DeepSeekConfig } from '@/types';

// 用假客户端替掉真实 HTTP 客户端；vi.hoisted 保证工厂执行时它已就绪
const { chatCompletions } = vi.hoisted(() => ({ chatCompletions: vi.fn() }));

vi.mock('@/lib/deepseekClient', () => ({
  createDeepSeekClient: () => ({
    chatCompletions,
    testConnection: vi.fn().mockResolvedValue(true),
  }),
  DeepSeekAPIError: class DeepSeekAPIError extends Error {},
}));

import { deepSeekAIService } from '@/services/deepseekAIService';

function config(overrides: Partial<DeepSeekConfig> = {}): DeepSeekConfig {
  return {
    apiKey: 'sk-test',
    model: 'deepseek-chat',
    enabled: true,
    temperature: 0.3,
    maxTokens: 500,
    ...overrides,
  };
}

function bookmark(id: string, url: string, title = `书签 ${id}`): Bookmark {
  return {
    id,
    url,
    urlKey: url,
    title,
    tags: [],
    createdAt: 0,
    updatedAt: 0,
    visitCount: 0,
    isFavorite: false,
    isArchived: false,
    status: 'active',
    aiGenerated: false,
  };
}

function llmResponse(content: string, totalTokens = 100, model = 'deepseek-chat') {
  return {
    id: 'resp-1',
    object: 'chat.completion',
    created: 0,
    model,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: totalTokens - 10, total_tokens: totalTokens },
  };
}

const SINGLE_JSON = JSON.stringify({
  suggestedTags: ['前端', '文档'],
  suggestedFolder: '开发/前端',
  contentType: 'documentation',
  confidence: 0.9,
  reasoning: '官方文档',
});

describe('deepSeekAIService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (chrome.storage.local.get as Mock).mockResolvedValue({});
    (chrome.storage.local.set as Mock).mockResolvedValue(undefined);
    (chrome.storage.local.remove as Mock).mockResolvedValue(undefined);
    chatCompletions.mockReset();
    // 单例的内部缓存会跨用例残留，先清干净再初始化
    await deepSeekAIService.clearCache();
    await deepSeekAIService.initialize(config());
  });

  it('未启用或未初始化时直接抛错', async () => {
    await deepSeekAIService.initialize(config({ enabled: false }));
    await expect(
      deepSeekAIService.classifyBookmark(bookmark('1', 'https://a.com/'))
    ).rejects.toThrow(/not initialized or disabled/);
  });

  it('classifyBookmark 解析 LLM 返回的 JSON（含 markdown 围栏与前后缀文本）', async () => {
    chatCompletions.mockResolvedValue(
      llmResponse(`好的，这是结果：\n\`\`\`json\n${SINGLE_JSON}\n\`\`\`\n希望有帮助`)
    );

    const result = await deepSeekAIService.classifyBookmark(bookmark('1', 'https://vuejs.org/guide'));

    expect(result).toMatchObject({
      suggestedTags: ['前端', '文档'],
      suggestedFolder: '开发/前端',
      contentType: 'documentation',
      confidence: 0.9,
      reasoning: '官方文档',
      method: 'llm',
      modelUsed: 'deepseek-chat',
      tokensUsed: 100,
    });

    // 请求参数：system + user 两条消息，温度取配置值
    const params = chatCompletions.mock.calls[0][0];
    expect(params.messages).toHaveLength(2);
    expect(params.messages[0].role).toBe('system');
    expect(params.messages[1].content).toContain('https://vuejs.org/guide');
    expect(params.temperature).toBe(0.3);

    // 结果写入缓存与成本统计
    const cacheWrite = (chrome.storage.local.set as Mock).mock.calls.find(
      (call) => 'deepseekClassificationCache' in (call[0] as object)
    );
    expect(cacheWrite).toBeTruthy();
    expect(deepSeekAIService.getCostStats().classifyCount).toBeGreaterThan(0);
  });

  it('缓存命中时不再请求 LLM', async () => {
    chatCompletions.mockResolvedValue(llmResponse(SINGLE_JSON));
    const target = bookmark('2', 'https://react.dev/learn');

    const first = await deepSeekAIService.classifyBookmark(target);
    const second = await deepSeekAIService.classifyBookmark(target);

    expect(chatCompletions).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('LLM 返回无法解析的内容时给出默认结果（confidence 0、reasoning 解析失败）', async () => {
    chatCompletions.mockResolvedValue(llmResponse('抱歉，我无法完成这个请求。'));

    const result = await deepSeekAIService.classifyBookmark(bookmark('3', 'https://x.com/a'));

    expect(result).toMatchObject({ suggestedTags: [], confidence: 0, reasoning: '解析失败' });
  });

  it('LLM 调用抛错时回退本地规则分类', async () => {
    chatCompletions.mockRejectedValue(new Error('network down'));

    const result = await deepSeekAIService.classifyBookmark(
      bookmark('4', 'https://github.com/user/repo', 'user/repo')
    );

    expect(result.method).toBe('rule');
    expect(result.reasoning).toBe('LLM 调用失败，使用本地规则分类');
  });

  it('batchClassify 把 batchSize 收敛到 [10, 50]（用 max_tokens 观察）', async () => {
    chatCompletions.mockResolvedValue(llmResponse(`[${SINGLE_JSON}]`, 60));

    // 传 5 → 收敛为 10 → max_tokens = min(10*300, 4000)
    await deepSeekAIService.batchClassify([bookmark('5', 'https://a.com/1')], { batchSize: 5 });
    expect(chatCompletions.mock.calls[0][0].max_tokens).toBe(3000);

    chatCompletions.mockClear();
    // 传 100 → 收敛为 50 → 触到 4000 上限
    await deepSeekAIService.batchClassify([bookmark('6', 'https://a.com/2')], { batchSize: 100 });
    expect(chatCompletions.mock.calls[0][0].max_tokens).toBe(4000);
  });

  it('batchClassify 把 folderTree 注入 system prompt，并原样回填结果索引', async () => {
    chatCompletions.mockResolvedValue(
      llmResponse(
        JSON.stringify([
          { suggestedTags: ['A'], suggestedFolder: '开发', confidence: 0.8 },
          { suggestedTags: ['B'], suggestedFolder: '学习', confidence: 0.7 },
        ])
      )
    );

    const results = await deepSeekAIService.batchClassify(
      [bookmark('7', 'https://a.com/1'), bookmark('8', 'https://a.com/2')],
      { batchSize: 10, folderTree: ['开发', '学习/博客'] }
    );

    const systemPrompt = chatCompletions.mock.calls[0][0].messages[0].content as string;
    expect(systemPrompt).toContain('开发');
    expect(systemPrompt).toContain('学习/博客');
    expect(systemPrompt).toContain('优先使用用户现有文件夹');

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ suggestedTags: ['A'], suggestedFolder: '开发', method: 'llm' });
    expect(results[1]).toMatchObject({ suggestedTags: ['B'], suggestedFolder: '学习' });
    // 整批 token 按条均摊
    expect(results[0].tokensUsed).toBe(50);
    expect(results[1].tokensUsed).toBe(50);
  });

  it('batchClassify 分批调用，并保证结果顺序与入参一致', async () => {
    vi.useFakeTimers();
    try {
      // 25 条、每批 20 → 两次请求（第二批 5 条）
      chatCompletions
        .mockResolvedValueOnce(
          llmResponse(
            JSON.stringify(
              Array.from({ length: 20 }, (_, i) => ({
                suggestedTags: [`t${i}`],
                suggestedFolder: `F${i}`,
                confidence: 0.5,
              }))
            )
          )
        )
        .mockResolvedValueOnce(
          llmResponse(
            JSON.stringify(
              Array.from({ length: 5 }, (_, i) => ({
                suggestedTags: [`u${i}`],
                suggestedFolder: `G${i}`,
                confidence: 0.5,
              }))
            )
          )
        );

      const bookmarks = Array.from({ length: 25 }, (_, i) => bookmark(`b${i}`, `https://s${i}.com/`));
      const onProgress = vi.fn();

      const promise = deepSeekAIService.batchClassify(bookmarks, {
        batchSize: 20,
        onProgress,
      });
      // 批间有 500ms 防限流延迟
      await vi.advanceTimersByTimeAsync(1000);
      const results = await promise;

      expect(chatCompletions).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(25);
      // 第 1 批的结果落在 0..19，第 2 批落在 20..24
      expect(results[0].suggestedFolder).toBe('F0');
      expect(results[19].suggestedFolder).toBe('F19');
      expect(results[20].suggestedFolder).toBe('G0');
      expect(results[24].suggestedFolder).toBe('G4');
      // 进度回调反映已完成条数
      expect(onProgress).toHaveBeenLastCalledWith(25, 25);
    } finally {
      vi.useRealTimers();
    }
  });

  it('batchClassify 全部命中缓存时不再请求 LLM', async () => {
    chatCompletions.mockResolvedValue(llmResponse(`[${SINGLE_JSON}]`, 60));
    const bookmarks = [bookmark('c1', 'https://cache.com/1'), bookmark('c2', 'https://cache.com/2')];

    await deepSeekAIService.batchClassify(bookmarks, { batchSize: 10 });
    expect(chatCompletions).toHaveBeenCalledTimes(1);

    await deepSeekAIService.batchClassify(bookmarks, { batchSize: 10 });
    expect(chatCompletions).toHaveBeenCalledTimes(1);
  });

  it('批量失败时按 fallbackToLocal 决定回退还是留空', async () => {
    chatCompletions.mockRejectedValue(new Error('boom'));
    const bookmarks = [bookmark('f1', 'https://github.com/a/b'), bookmark('f2', 'https://github.com/c/d')];

    const fallback = await deepSeekAIService.batchClassify(bookmarks, { batchSize: 10 });
    expect(fallback).toHaveLength(2);
    expect(fallback.every((r) => r.method === 'rule')).toBe(true);
    expect(fallback[0].reasoning).toBe('LLM批量调用失败，使用本地分类');

    const noFallback = await deepSeekAIService.batchClassify(
      [bookmark('f3', 'https://other.com/x')],
      { batchSize: 10, fallbackToLocal: false }
    );
    // 不回退时那一批不写入结果：实现只按位赋值，因此数组可能**短于入参**
    // （中间批成功、首尾批失败时还会出现空洞）——调用方必须按位判空
    expect(noFallback).toHaveLength(0);
    expect(noFallback[0]).toBeUndefined();
  });

  it('成本统计按天累加，并只保留最近 30 天', async () => {
    const seeded: CostStats = {
      totalTokens: 5,
      totalCost: 0.5,
      classifyCount: 2,
      avgCostPerClassify: 0.25,
      dailyStats: Array.from({ length: 35 }, (_, i) => ({
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
        tokens: 1,
        cost: 0,
        count: 1,
      })),
    };
    (chrome.storage.local.get as Mock).mockImplementation(async (key: string) =>
      key === 'deepseekCostStats' ? { deepseekCostStats: seeded } : {}
    );
    await deepSeekAIService.clearCache();
    await deepSeekAIService.initialize(config());

    chatCompletions.mockResolvedValue(llmResponse(SINGLE_JSON, 200));
    await deepSeekAIService.classifyBookmark(bookmark('9', 'https://costs.com/a'));

    const stats = deepSeekAIService.getCostStats();
    expect(stats.totalTokens).toBe(205);
    expect(stats.classifyCount).toBe(3);
    expect(stats.dailyStats).toHaveLength(30);
    // 保留的是最近 30 天（最早的 6 条被裁掉）
    expect(stats.dailyStats[0].date).toBe('2026-01-07');
  });
});
