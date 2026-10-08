import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import 'fake-indexeddb/auto';
import { auxDb } from '@/lib/auxDatabase';
import { organizerService } from '@/services/organizerService';
import { deepSeekAIService } from '@/services/deepseekAIService';
import type { BrowserBookmarkNode } from '@/types';

function node(id: string, url: string, title: string, parentId = '1'): BrowserBookmarkNode {
  return {
    id,
    parentId,
    title,
    url,
    index: 0,
    dateAdded: 100,
    path: '书签栏',
  };
}

describe('organizerService v2', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await auxDb.delete();
    await auxDb.open();
    // 强制走本地规则引擎
    (chrome.storage.local.get as Mock).mockResolvedValue({});
  });

  it('suggest 基于规则引擎生成建议并过滤已有标签', async () => {
    const suggestions = await organizerService.suggest(
      [node('1', 'https://github.com/user/repo', 'user/repo'), node('2', 'https://news.example.com/x', 'News')],
      {}
    );

    // github 规则命中（开发/代码库），普通新闻站无规则只有低置信度关键词 → 被阈值过滤
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].node.id).toBe('1');
    expect(suggestions[0].suggestedFolderPath).toBe('开发/代码库');
    expect(suggestions[0].engine).toBe('rule');

    // 已有标签会被排除
    const tagged = await organizerService.suggest(
      [node('1', 'https://github.com/user/repo2', 'user/repo2')],
      {
        '1': {
          bookmarkId: '1',
          tags: suggestions[0].suggestedTags,
          isFavorite: false,
          visitCount: 0,
        },
      }
    );
    expect(tagged[0].suggestedTags).toHaveLength(0);
  });

  it('apply 移动书签到建议文件夹并写入标签', async () => {
    // ensureFolderPath: getChildren 返回空 → create
    (chrome.bookmarks.getChildren as Mock).mockResolvedValue([]);
    (chrome.bookmarks.create as Mock).mockImplementation(async (arg: chrome.bookmarks.BookmarkCreateArg) => ({
      id: `folder-${arg.title}`,
      parentId: arg.parentId ?? '1',
      title: arg.title ?? '',
      index: 0,
    } as chrome.bookmarks.BookmarkTreeNode));
    (chrome.bookmarks.move as Mock).mockResolvedValue({});

    const suggestions = await organizerService.suggest(
      [node('9', 'https://github.com/foo/bar', 'foo/bar')],
      {}
    );
    const result = await organizerService.apply(suggestions);

    expect(result.applied).toBe(1);
    expect(result.moved).toBe(1);
    expect(result.tagged).toBe(1);

    // 移动链路：确保 "开发/代码库" 两级文件夹后 move
    expect(chrome.bookmarks.create).toHaveBeenCalledWith({ parentId: '1', title: '开发' });
    expect(chrome.bookmarks.create).toHaveBeenCalledWith({ parentId: 'folder-开发', title: '代码库' });
    expect(chrome.bookmarks.move).toHaveBeenCalledWith('9', { parentId: 'folder-代码库' });

    // 标签写 aux
    const meta = await auxDb.bookmarkMeta.get('9');
    expect(meta?.aiGenerated).toBe(true);
    expect(meta?.tags.length).toBeGreaterThan(0);

    const history = await organizerService.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].changes).toHaveLength(1);
    expect(history[0].changes[0].bookmarkId).toBe('9');
    expect(history[0].changes[0].from).toBe('1');
    expect(history[0].changes[0].to).toBe('folder-代码库');
  });

  it('rollback 能够将已移动的书签还原原文件夹，并剥离本次添加的标签', async () => {
    (chrome.bookmarks.getChildren as Mock).mockResolvedValue([]);
    (chrome.bookmarks.create as Mock).mockImplementation(async (arg: chrome.bookmarks.BookmarkCreateArg) => ({
      id: `folder-${arg.title}`,
      parentId: arg.parentId ?? '1',
      title: arg.title ?? '',
      index: 0,
    } as chrome.bookmarks.BookmarkTreeNode));
    (chrome.bookmarks.move as Mock).mockResolvedValue({});

    const suggestions = await organizerService.suggest(
      [node('10', 'https://github.com/test/repo', 'test/repo', 'folder-custom')],
      {}
    );
    await organizerService.apply(suggestions);

    const historyBefore = await organizerService.getHistory();
    expect(historyBefore).toHaveLength(1);
    const historyId = historyBefore[0].id;

    // 清理 mock 记录准备验证 rollback
    vi.clearAllMocks();

    const rollbackRes = await organizerService.rollback(historyId);
    expect(rollbackRes.restored).toBe(1);
    expect(rollbackRes.errors).toHaveLength(0);

    // 验证 moveBookmark 将其还原回 'folder-custom'
    expect(chrome.bookmarks.move).toHaveBeenCalledWith('10', { parentId: 'folder-custom' });

    // 验证 tags 被还原（移除添加的标签）
    const metaAfter = await auxDb.bookmarkMeta.get('10');
    expect(metaAfter?.tags).toHaveLength(0);

    // 验证记录标记为已撤销
    const historyAfter = await organizerService.getHistory();
    expect(historyAfter[0].rolledBack).toBe(true);

    // 再次回滚应该抛出错误阻止重复回滚
    await expect(organizerService.rollback(historyId)).rejects.toThrow('该记录已撤销');
  });

  it('deleteHistory 与 clearHistory 能够删除指定或全部历史记录', async () => {
    (chrome.bookmarks.getChildren as Mock).mockResolvedValue([]);
    (chrome.bookmarks.create as Mock).mockResolvedValue({ id: 'f', parentId: '1', title: 't', index: 0 } as any);
    (chrome.bookmarks.move as Mock).mockResolvedValue({});

    const suggestions = await organizerService.suggest([node('11', 'https://github.com/a/b', 'a/b')], {});
    await organizerService.apply(suggestions);

    let history = await organizerService.getHistory();
    expect(history).toHaveLength(1);

    await organizerService.deleteHistory(history[0].id);
    history = await organizerService.getHistory();
    expect(history).toHaveLength(0);
  });

  it('suggest 当书签已在目标文件夹中时，抑制多余的移动建议', async () => {
    const inTargetFolder: BrowserBookmarkNode = {
      ...node('1', 'https://github.com/user/repo', 'user/repo'),
      path: '书签栏/开发/代码库',
    };
    const suggestions = await organizerService.suggest([inTargetFolder], {});
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].suggestedFolderPath).toBeUndefined();
    expect(suggestions[0].suggestedTags.length).toBeGreaterThan(0);
  });

  it('规则先行：命中项不送 AI，仅长尾交给 DeepSeek 并透传用户目录树', async () => {
    const batchSpy = vi
      .spyOn(deepSeekAIService, 'batchClassify')
      .mockResolvedValue([
        {
          suggestedTags: ['技术', '文章'],
          suggestedFolder: '学习/博客',
          contentType: 'blog',
          confidence: 0.9,
          method: 'llm' as const,
          reasoning: '技术博客文章',
        },
      ] as never);

    (chrome.storage.local.get as Mock).mockImplementation(async (key: string) =>
      key === 'deepseekConfig'
        ? { deepseekConfig: { enabled: true, apiKey: 'test-key', model: 'deepseek-chat' } }
        : {}
    );

    const suggestions = await organizerService.suggest(
      [
        node('20', 'https://github.com/user/repo', 'repo'),
        node('21', 'https://someblog.example.com/deep-dive', '深度文章'),
      ],
      {},
      { folderPaths: ['开发', '开发/前端', '学习/博客'] }
    );

    // 只有规则未命中的长尾被送去 AI
    expect(batchSpy).toHaveBeenCalledTimes(1);
    const call = batchSpy.mock.calls[0];
    const aiInputs = call?.[0] ?? [];
    const aiOptions = call?.[1] ?? {};
    expect(aiInputs).toHaveLength(1);
    expect(aiInputs[0].url).toBe('https://someblog.example.com/deep-dive');
    expect(aiOptions.folderTree).toEqual(['开发', '开发/前端', '学习/博客']);

    // 规则命中走 rule，长尾走 deepseek
    const byId = new Map(suggestions.map((s) => [s.node.id, s]));
    expect(byId.get('20')?.engine).toBe('rule');
    expect(byId.get('20')?.suggestedFolderPath).toBe('开发/代码库');
    expect(byId.get('21')?.engine).toBe('deepseek');
    expect(byId.get('21')?.suggestedFolderPath).toBe('学习/博客');

    batchSpy.mockRestore();
  });

  it('未配置 DeepSeek 时不发起任何 AI 调用', async () => {
    const batchSpy = vi
      .spyOn(deepSeekAIService, 'batchClassify')
      .mockResolvedValue([] as never);
    // beforeEach 已将 storage.get 置为 {} → 未启用

    await organizerService.suggest([node('22', 'https://anything.example.com/x', 'x')], {});

    expect(batchSpy).not.toHaveBeenCalled();
    batchSpy.mockRestore();
  });

  it('AI 高置信度建议应用后固化为域名规则，后续同域名直接走规则', async () => {
    // 简易存储后端：让 get/set 围绕同一份数据工作
    const backing: Record<string, unknown> = {
      deepseekConfig: { enabled: true, apiKey: 'test-key', model: 'deepseek-chat' },
    };
    (chrome.storage.local.get as Mock).mockImplementation(async (key: string) =>
      key in backing ? { [key]: backing[key] } : {}
    );
    (chrome.storage.local.set as Mock).mockImplementation(async (items: Record<string, unknown>) => {
      Object.assign(backing, items);
    });

    const batchSpy = vi
      .spyOn(deepSeekAIService, 'batchClassify')
      .mockResolvedValue([
        {
          suggestedTags: ['AI'],
          suggestedFolder: '技术/AI',
          contentType: 'article',
          confidence: 0.92,
          method: 'llm' as const,
          reasoning: 'AI 资讯文章',
        },
      ] as never);

    // 第一轮：长尾走 AI
    const first = await organizerService.suggest(
      [node('30', 'https://ai-news.example.com/llm-post', 'LLM 动态')],
      {}
    );
    expect(first).toHaveLength(1);
    expect(first[0].engine).toBe('deepseek');

    // 应用（bookmarks mock 供 ensureFolderPath/move）
    (chrome.bookmarks.getChildren as Mock).mockResolvedValue([]);
    (chrome.bookmarks.create as Mock).mockImplementation(
      async (arg: chrome.bookmarks.BookmarkCreateArg) =>
        ({
          id: `folder-${arg.title}`,
          parentId: arg.parentId ?? '1',
          title: arg.title ?? '',
          index: 0,
        }) as chrome.bookmarks.BookmarkTreeNode
    );
    (chrome.bookmarks.move as Mock).mockResolvedValue({});
    await organizerService.apply(first);

    // 固化为域名规则
    const learned = backing.learnedDomainRules as Record<string, { folder: string }>;
    expect(learned['ai-news.example.com'].folder).toBe('技术/AI');

    // 第二轮：同域名直接走学习规则，不再调用 AI
    batchSpy.mockClear();
    const second = await organizerService.suggest(
      [node('31', 'https://ai-news.example.com/another-post', '另一篇')],
      {}
    );
    expect(batchSpy).not.toHaveBeenCalled();
    expect(second).toHaveLength(1);
    expect(second[0].engine).toBe('rule');
    expect(second[0].suggestedFolderPath).toBe('技术/AI');

    batchSpy.mockRestore();
  });

  it('应用失败的建议不回流为学习规则，只有成功应用的才固化', async () => {
    const backing: Record<string, unknown> = {
      deepseekConfig: { enabled: true, apiKey: 'test-key', model: 'deepseek-chat' },
    };
    (chrome.storage.local.get as Mock).mockImplementation(async (key: string) =>
      key in backing ? { [key]: backing[key] } : {}
    );
    (chrome.storage.local.set as Mock).mockImplementation(async (items: Record<string, unknown>) => {
      Object.assign(backing, items);
    });

    const batchSpy = vi
      .spyOn(deepSeekAIService, 'batchClassify')
      .mockResolvedValue([
        {
          suggestedTags: ['AI'],
          suggestedFolder: '技术/AI',
          contentType: 'article',
          confidence: 0.95,
          method: 'llm' as const,
          reasoning: 'AI 资讯文章',
        },
      ] as never);

    const suggestions = await organizerService.suggest(
      [node('40', 'https://failing.example.com/post', '会失败的书签')],
      {}
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].engine).toBe('deepseek');

    // 目录可确保创建，但移动本身失败
    (chrome.bookmarks.getChildren as Mock).mockResolvedValue([]);
    (chrome.bookmarks.create as Mock).mockImplementation(
      async (arg: chrome.bookmarks.BookmarkCreateArg) =>
        ({
          id: `folder-${arg.title}`,
          parentId: arg.parentId ?? '1',
          title: arg.title ?? '',
          index: 0,
        }) as chrome.bookmarks.BookmarkTreeNode
    );
    (chrome.bookmarks.move as Mock).mockRejectedValue(new Error('move failed'));

    const result = await organizerService.apply(suggestions);

    expect(result.applied).toBe(0);
    expect(result.errors).toHaveLength(1);
    // 失败的建议不能沉淀成域名规则，否则下次同域名的正确分类会被错误规则抢先
    expect(backing.learnedDomainRules).toBeUndefined();

    batchSpy.mockRestore();
  });
});
