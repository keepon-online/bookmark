// 语义搜索设置组件

import { useState, useEffect } from 'react';
import { Search, Database, Zap, Settings } from 'lucide-react';
import { semanticSearchService } from '@/services/semanticSearchService';
import type { SemanticSearchConfig } from '@/types';
import { bookmarkService } from '@/services';

interface SemanticSearchSettingsProps {
  className?: string;
}

export function SemanticSearchSettings({ className = '' }: SemanticSearchSettingsProps) {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState({ current: 0, total: 0 });
  const [indexStatus, setIndexStatus] = useState<{
    indexed: number;
    total: number;
    model: string;
  } | null>(null);

  const [config, setConfig] = useState<SemanticSearchConfig>({
    enabled: false,
    model: 'local',
    provider: 'local',
    threshold: 0.6,
    topK: 10,
  });

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [customModel, setCustomModel] = useState('');

  useEffect(() => {
    loadConfig();
    loadIndexStatus();
  }, []);

  const loadConfig = async () => {
    const stored = await chrome.storage.local.get('semanticSearchConfig');
    if (stored.semanticSearchConfig) {
      const loadedConfig = stored.semanticSearchConfig as SemanticSearchConfig;
      setConfig(loadedConfig);
      setIsEnabled(loadedConfig.enabled);
      if (loadedConfig.enabled) {
        await semanticSearchService.initialize(loadedConfig);
      }
    }
  };

  const loadIndexStatus = async () => {
    const status = await semanticSearchService.getIndexStatus();
    setIndexStatus(status);
  };

  const handleConfigChange = async (updates: Partial<SemanticSearchConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    await chrome.storage.local.set({ semanticSearchConfig: newConfig });

    if (newConfig.enabled) {
      await semanticSearchService.initialize(newConfig);
    }
  };

  const handleEnable = async () => {
    if (config.provider !== 'local' && !apiKey) {
      alert(`请输入 ${config.provider.toUpperCase()} API Key`);
      return;
    }

    const newConfig = {
      ...config,
      enabled: true,
      apiKey: config.provider !== 'local' ? apiKey : undefined,
    };

    await handleConfigChange(newConfig);
    setIsEnabled(true);
    await semanticSearchService.initialize(newConfig);
  };

  const handleDisable = async () => {
    await handleConfigChange({ enabled: false });
    setIsEnabled(false);
  };

  const handleBuildIndex = async () => {
    if (!isEnabled) {
      alert('请先启用语义搜索');
      return;
    }

    setIsIndexing(true);
    setIndexProgress({ current: 0, total: 0 });

    try {
      const bookmarks = await bookmarkService.getAll({ limit: 10000 });
      setIndexProgress({ current: 0, total: bookmarks.length });

      await semanticSearchService.indexBookmarks(bookmarks, (current, total) => {
        setIndexProgress({ current, total });
      });

      await loadIndexStatus();
    } catch (error) {
      console.error('[Semantic Search] Index build failed:', error);
      alert(`索引构建失败: ${(error as Error).message}`);
    } finally {
      setIsIndexing(false);
    }
  };

  const handleClearIndex = async () => {
    if (confirm('确定要清空所有搜索索引吗？')) {
      await semanticSearchService.clearIndex();
      await loadIndexStatus();
    }
  };

  const handleRebuildIndex = async () => {
    if (!isEnabled) {
      alert('请先启用语义搜索');
      return;
    }

    if (isIndexing) return;

    setIsIndexing(true);
    setIndexProgress({ current: 0, total: 0 });

    try {
      await semanticSearchService.rebuildIndex((current, total) => {
        setIndexProgress({ current, total });
      });

      await loadIndexStatus();
    } catch (error) {
      console.error('[Semantic Search] Index rebuild failed:', error);
      alert(`索引重建失败: ${(error as Error).message}`);
    } finally {
      setIsIndexing(false);
    }
  };

  const getProviderName = (provider: string) => {
    switch (provider) {
      case 'openai': return 'OpenAI';
      case 'cohere': return 'Cohere';
      case 'local': return '本地模型';
      default: return provider;
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm p-6 ${className}`}>
      {/* 头部 */}
      <div className="flex items-start gap-3 mb-6">
        <Search className="w-5 h-5 text-purple-600 mt-0.5" />
        <div>
          <h3 className="text-lg font-semibold text-gray-900">语义搜索</h3>
          <p className="text-sm text-gray-500 mt-1">
            基于内容的智能搜索，理解查询意图而非仅匹配关键词
          </p>
        </div>
      </div>

      {!isEnabled ? (
        <div className="space-y-4">
          {/* 选择提供商 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              嵌入向量提供商
            </label>
            <select
              value={config.provider}
              onChange={(e) => setConfig({ ...config, provider: e.target.value as any, model: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="local">本地模型（免费，无需 API Key）</option>
              <option value="openai">OpenAI（需要 API Key）</option>
              <option value="cohere">Cohere（需要 API Key）</option>
            </select>
          </div>

          {/* API Key 输入 */}
          {config.provider !== 'local' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {config.provider.toUpperCase()} API Key
              </label>
              <input
                type="password"
                placeholder={`输入 ${config.provider.toUpperCase()} API Key`}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                您的 API Key 仅在本地使用，不会上传到我们的服务器
              </p>
            </div>
          )}

          {/* 模型选择 */}
          {config.provider !== 'local' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                模型
              </label>
              <select
                value={customModel || config.model}
                onChange={(e) => {
                  setCustomModel(e.target.value);
                  setConfig({ ...config, model: e.target.value as any });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              >
                {config.provider === 'openai' && (
                  <>
                    <option value="text-embedding-3-small">text-embedding-3-small</option>
                    <option value="text-embedding-3-large">text-embedding-3-large</option>
                    <option value="text-embedding-ada-002">text-embedding-ada-002</option>
                  </>
                )}
                {config.provider === 'cohere' && (
                  <>
                    <option value="embed-english-v3.0">embed-english-v3.0</option>
                    <option value="embed-multilingual-v3.0">embed-multilingual-v3.0</option>
                    <option value="embed-english-v2.0">embed-english-v2.0</option>
                  </>
                )}
              </select>
            </div>
          )}

          {/* 说明信息 */}
          <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-900">
            <div className="font-medium mb-1">提供商说明：</div>
            {config.provider === 'local' && (
              <ul className="space-y-1 text-xs text-blue-800">
                <li>• 完全免费，无需 API Key</li>
                <li>• 使用本地 TF-IDF 算法</li>
                <li>• 准确率相对较低，但速度快</li>
                <li>• 适合少量书签和个人使用</li>
              </ul>
            )}
            {config.provider === 'openai' && (
              <ul className="space-y-1 text-xs text-blue-800">
                <li>• 需要有效的 OpenAI API Key</li>
                <li>• 使用最新的 text-embedding 模型</li>
                <li>• 准确率高，支持多语言</li>
                <li>• 按使用量付费</li>
              </ul>
            )}
            {config.provider === 'cohere' && (
              <ul className="space-y-1 text-xs text-blue-800">
                <li>• 需要有效的 Cohere API Key</li>
                <li>• 优秀的多语言支持</li>
                <li>• 有免费额度可用</li>
                <li>• 性价比高</li>
              </ul>
            )}
          </div>

          <button
            onClick={handleEnable}
            disabled={config.provider !== 'local' && !apiKey}
            className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
          >
            启用语义搜索
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 索引状态 */}
          {indexStatus && (
            <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
              <div className="text-center">
                <div className="text-2xl font-semibold text-gray-900">
                  {indexStatus.indexed}
                </div>
                <div className="text-xs text-gray-500 mt-1">已索引</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-semibold text-purple-600">
                  {indexStatus.total}
                </div>
                <div className="text-xs text-gray-500 mt-1">总书签数</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-semibold text-blue-600">
                  {getProviderName(config.provider)}
                </div>
                <div className="text-xs text-gray-500 mt-1">提供商</div>
              </div>
            </div>
          )}

          {/* 索引进度 */}
          {isIndexing && (
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-5 h-5 text-blue-600 animate-pulse" />
                <span className="font-medium text-blue-900">正在构建索引...</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2 mb-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{
                    width: `${indexProgress.total > 0 ? (indexProgress.current / indexProgress.total) * 100 : 0}%`
                  }}
                />
              </div>
              <div className="text-sm text-blue-700">
                {indexProgress.current} / {indexProgress.total}
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="space-y-2">
            <button
              onClick={handleBuildIndex}
              disabled={isIndexing}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
            >
              <Database className="w-4 h-4" />
              {isIndexing ? '索引中...' : '构建索引'}
            </button>

            <button
              onClick={handleRebuildIndex}
              disabled={isIndexing}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
            >
              重建索引
            </button>

            <button
              onClick={handleClearIndex}
              disabled={isIndexing}
              className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
            >
              清空索引
            </button>

            <button
              onClick={handleDisable}
              disabled={isIndexing}
              className="w-full px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium"
            >
              禁用语义搜索
            </button>
          </div>

          {/* 高级设置 */}
          <div className="border-t pt-4">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
            >
              <Settings className="w-4 h-4" />
              {showAdvanced ? '隐藏' : '显示'}高级设置
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    相似度阈值: {(config.threshold * 100).toFixed(0)}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={config.threshold}
                    onChange={(e) => handleConfigChange({ threshold: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    越高越严格，只会返回最相关的结果
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    返回结果数: {config.topK}
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="50"
                    step="5"
                    value={config.topK}
                    onChange={(e) => handleConfigChange({ topK: parseInt(e.target.value) })}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    每次搜索返回的最大结果数量
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
