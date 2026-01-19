// DeepSeek AI 配置组件

import { useState, useEffect } from 'react';
import {
  Settings,
  Sparkles,
  Key,
  TestTube,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  DollarSign,
  Zap,
  Database,
  AlertTriangle,
} from 'lucide-react';
import { deepSeekAIService } from '@/services';
import type { DeepSeekConfig, CostStats } from '@/types';

interface DeepSeekConfigProps {
  className?: string;
  onConfigChange?: (config: DeepSeekConfig) => void;
}

export function DeepSeekConfig({ className = '', onConfigChange }: DeepSeekConfigProps) {
  const [config, setConfig] = useState<DeepSeekConfig>({
    apiKey: '',
    model: 'deepseek-chat',
    enabled: false,
    temperature: 0.3,
    maxTokens: 500,
  });

  const [showApiKey, setShowApiKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [costStats, setCostStats] = useState<CostStats | null>(null);
  const [cacheSize, setCacheSize] = useState(0);

  // 加载配置
  useEffect(() => {
    loadConfig();
    loadStats();
  }, []);

  const loadConfig = async () => {
    try {
      const stored = await chrome.storage.local.get('deepseekConfig');
      if (stored.deepseekConfig) {
        setConfig(stored.deepseekConfig);
        // 初始化服务
        if (stored.deepseekConfig.enabled) {
          await deepSeekAIService.initialize(stored.deepseekConfig);
        }
      }
    } catch (error) {
      console.error('Failed to load DeepSeek config:', error);
    }
  };

  const loadStats = async () => {
    try {
      const stats = deepSeekAIService.getCostStats();
      setCostStats(stats);

      const cached = await chrome.storage.local.get('deepseekClassificationCache');
      const cacheObj = cached.deepseekClassificationCache || {};
      setCacheSize(Object.keys(cacheObj).length);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const saveConfig = async (newConfig: DeepSeekConfig) => {
    setConfig(newConfig);
    await chrome.storage.local.set({ deepseekConfig: newConfig });

    // 重新初始化服务
    if (newConfig.enabled && newConfig.apiKey) {
      await deepSeekAIService.initialize(newConfig);
    }

    onConfigChange?.(newConfig);
  };

  const testConnection = async () => {
    if (!config.apiKey) {
      setTestResult({ success: false, message: '请先输入 API Key' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      // 临时初始化进行测试
      await deepSeekAIService.initialize(config);
      const success = await deepSeekAIService.testConnection();

      if (success) {
        setTestResult({ success: true, message: '连接成功！DeepSeek API 可用' });
      } else {
        setTestResult({ success: false, message: '连接失败，请检查 API Key' });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: `测试失败: ${(error as Error).message}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const clearCache = async () => {
    if (!confirm('确定要清空分类缓存吗？这将导致后续分类需要重新调用 API。')) {
      return;
    }

    try {
      await deepSeekAIService.clearCache();
      setCacheSize(0);
      alert('缓存已清空');
    } catch (error) {
      console.error('Failed to clear cache:', error);
      alert('清空缓存失败');
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm p-6 ${className}`}>
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <Sparkles className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">DeepSeek AI</h3>
            <p className="text-sm text-gray-500">大语言模型驱动的智能分类</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) =>
                saveConfig({
                  ...config,
                  enabled: e.target.checked,
                })
              }
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
          <span className="text-sm text-gray-600">
            {config.enabled ? '已启用' : '已禁用'}
          </span>
        </div>
      </div>

      {/* 配置选项 */}
      {config.enabled && (
        <div className="space-y-4">
          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4" />
                API Key
              </div>
            </label>
            <div className="flex gap-2">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={config.apiKey}
                onChange={(e) =>
                  saveConfig({
                    ...config,
                    apiKey: e.target.value,
                  })
                }
                placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {showApiKey ? '隐藏' : '显示'}
              </button>
              <button
                onClick={testConnection}
                disabled={isTesting || !config.apiKey}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    测试中...
                  </>
                ) : (
                  <>
                    <TestTube className="w-4 h-4" />
                    测试连接
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              获取 API Key:{' '}
              <a
                href="https://platform.deepseek.com/api_keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline"
              >
                platform.deepseek.com
              </a>
            </p>
          </div>

          {/* 测试结果 */}
          {testResult && (
            <div
              className={`p-3 rounded-lg flex items-center gap-2 ${
                testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <XCircle className="w-5 h-5" />
              )}
              <span className="text-sm">{testResult.message}</span>
            </div>
          )}

          {/* 模型选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              模型
            </label>
            <select
              value={config.model}
              onChange={(e) =>
                saveConfig({
                  ...config,
                  model: e.target.value as 'deepseek-chat' | 'deepseek-coder',
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="deepseek-chat">DeepSeek Chat（通用）</option>
              <option value="deepseek-coder">DeepSeek Coder（代码）</option>
            </select>
          </div>

          {/* Temperature */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Temperature: {config.temperature}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={config.temperature}
              onChange={(e) =>
                saveConfig({
                  ...config,
                  temperature: parseFloat(e.target.value),
                })
              }
              className="w-full"
            />
            <p className="text-xs text-gray-500 mt-1">
              较低的值使输出更确定，较高的值更随机
            </p>
          </div>

          {/* Max Tokens */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              最大 Tokens: {config.maxTokens}
            </label>
            <input
              type="range"
              min="100"
              max="2000"
              step="100"
              value={config.maxTokens}
              onChange={(e) =>
                saveConfig({
                  ...config,
                  maxTokens: parseInt(e.target.value),
                })
              }
              className="w-full"
            />
            <p className="text-xs text-gray-500 mt-1">
              控制响应的最大长度
            </p>
          </div>

          {/* 成本统计 */}
          {costStats && costStats.classifyCount > 0 && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="w-5 h-5 text-green-600" />
                <h4 className="font-medium text-gray-900">成本统计</h4>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-2xl font-semibold text-green-700">
                    {costStats.totalTokens.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-600">总 Tokens</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold text-green-700">
                    ¥{costStats.totalCost.toFixed(4)}
                  </div>
                  <div className="text-xs text-gray-600">总成本</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold text-green-700">
                    {costStats.classifyCount}
                  </div>
                  <div className="text-xs text-gray-600">分类次数</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold text-green-700">
                    ¥{costStats.avgCostPerClassify.toFixed(6)}
                  </div>
                  <div className="text-xs text-gray-600">平均成本</div>
                </div>
              </div>

              {/* 今日统计 */}
              {costStats.dailyStats.length > 0 && (
                <div className="mt-3 pt-3 border-t border-green-300">
                  <div className="text-sm text-gray-700">
                    今日:{' '}
                    <span className="font-medium">
                      {costStats.dailyStats[costStats.dailyStats.length - 1].tokens} tokens,
                      ¥{costStats.dailyStats[costStats.dailyStats.length - 1].cost.toFixed(4)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 缓存管理 */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-600" />
                <div>
                  <div className="font-medium text-gray-900">分类缓存</div>
                  <div className="text-xs text-gray-600">
                    {cacheSize} 个缓存条目
                  </div>
                </div>
              </div>
              <button
                onClick={clearCache}
                className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                清空
              </button>
            </div>
          </div>

          {/* 提示信息 */}
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium mb-1">使用须知</p>
              <ul className="space-y-1 text-xs">
                <li>• DeepSeek 定价: ¥1/百万 tokens</li>
                <li>• 平均每个书签分类成本: ¥0.0005</li>
                <li>• 建议先测试连接，确认 API Key 有效</li>
                <li>• 分类结果会被缓存 24 小时</li>
                <li>• 失败时会自动回退到本地规则分类</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 未启用提示 */}
      {!config.enabled && (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center">
          <Zap className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">
            启用 DeepSeek AI 获得更智能的书签分类效果
          </p>
        </div>
      )}
    </div>
  );
}
