// 书签整理工具组件

import { useState, useEffect } from 'react';
import {
  Wand2,
  Eye,
  Play,
  Settings,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { organizerService, browserSyncService } from '@/services';
import type {
  OrganizeOptions,
  OrganizeProgress,
  OrganizePreview,
  OrganizeResult,
} from '@/types';

interface AutoOrganizeConfig {
  enabled: boolean;
  strategy: 'auto' | 'conservative' | 'aggressive';
  minConfidence: number;
  schedule: 'daily' | 'weekly';
}

interface BookmarksOrganizerProps {
  className?: string;
  onComplete?: (result: OrganizeResult) => void;
}

export function BookmarksOrganizer({
  className = '',
  onComplete,
}: BookmarksOrganizerProps) {
  const [options, setOptions] = useState<OrganizeOptions>({
    strategy: 'auto',
    createNewFolders: true,
    applyTags: true,
    moveBookmarks: true,
    removeDuplicates: false,
    minConfidence: 0.6,
    archiveUncategorized: false,
    handleBroken: 'ignore',
  });

  const [autoOrganizeConfig, setAutoOrganizeConfig] = useState<AutoOrganizeConfig>({
    enabled: false,
    strategy: 'auto',
    minConfidence: 0.7,
    schedule: 'daily',
  });

  const [progress, setProgress] = useState<OrganizeProgress | null>(null);
  const [preview, setPreview] = useState<OrganizePreview | null>(null);
  const [result, setResult] = useState<OrganizeResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [lastAutoOrganize, setLastAutoOrganize] = useState<string | null>(null);
  const [syncToBrowser, setSyncToBrowser] = useState(true); // 默认同步到浏览器
  const [syncResult, setSyncResult] = useState<{ moved: number; tagged: number } | null>(null);
  const [lastOrganizeTime, setLastOrganizeTime] = useState<string | null>(null);

  // 加载自动整理配置和上次的整理结果
  useEffect(() => {
    loadAutoOrganizeConfig();
    loadLastOrganizeResult();
  }, []);

  const loadAutoOrganizeConfig = async () => {
    const stored = await chrome.storage.local.get('autoOrganizeConfig');
    if (stored.autoOrganizeConfig) {
      setAutoOrganizeConfig(stored.autoOrganizeConfig);
    }

    const lastRun = await chrome.storage.local.get('lastAutoOrganize');
    if (lastRun.lastAutoOrganize) {
      setLastAutoOrganize(new Date(lastRun.lastAutoOrganize).toLocaleString());
    }
  };

  const loadLastOrganizeResult = async () => {
    const stored = await chrome.storage.local.get(['lastOrganizeResult', 'lastSyncResult', 'lastOrganizeTime']);
    if (stored.lastOrganizeResult) {
      setResult(stored.lastOrganizeResult);
    }
    if (stored.lastSyncResult) {
      setSyncResult(stored.lastSyncResult);
    }
    if (stored.lastOrganizeTime) {
      setLastOrganizeTime(new Date(stored.lastOrganizeTime).toLocaleString());
    }
  };

  const saveAutoOrganizeConfig = async (config: AutoOrganizeConfig) => {
    setAutoOrganizeConfig(config);
    await chrome.storage.local.set({ autoOrganizeConfig: config });
  };

  // 生成预览
  const handlePreview = async () => {
    setIsRunning(true);
    setPreview(null);
    setResult(null);

    try {
      const previewData = await organizerService.previewOrganize(options);
      setPreview(previewData);
      setShowPreview(true);
    } catch (error) {
      console.error('预览失败:', error);
    } finally {
      setIsRunning(false);
    }
  };

  // 执行整理
  const handleOrganize = async () => {
    setIsRunning(true);
    setProgress(null);
    setResult(null);
    setShowPreview(false);
    setSyncResult(null);

    try {
      // 1. 在扩展中整理书签
      const resultData = await organizerService.organizeAll(options, (prog) => {
        setProgress(prog);
      });

      setResult(resultData);
      onComplete?.(resultData);

      // 更新时间
      setLastOrganizeTime(new Date().toLocaleString());

      // 保存整理结果到存储
      await chrome.storage.local.set({
        lastOrganizeResult: resultData,
        lastOrganizeTime: Date.now(),
      });

      // 2. 如果启用同步，将整理结果同步到浏览器书签栏
      if (syncToBrowser && resultData.success) {
        setProgress({ current: 0, total: 100, message: '正在同步到浏览器书签栏...' });

        const syncData = await browserSyncService.syncToBrowser({
          moveBookmarks: options.moveBookmarks,
          applyTags: options.applyTags,
        });

        const syncResultData = { moved: syncData.moved, tagged: syncData.tagged };

        if (syncData.success) {
          setSyncResult(syncResultData);
          // 保存同步结果到存储
          await chrome.storage.local.set({
            lastSyncResult: syncResultData,
          });
          console.log('[Organizer] Browser sync completed:', syncData);
        } else {
          console.error('[Organizer] Browser sync failed:', syncData.errors);
        }
      }
    } catch (error) {
      console.error('整理失败:', error);
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm p-6 ${className}`}>
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Wand2 className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">智能整理</h3>
            <p className="text-sm text-gray-500">AI 驱动的书签自动整理</p>
          </div>
        </div>

        <button
          onClick={() => setShowOptions(!showOptions)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <Settings className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* 选项面板 */}
      {showOptions && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg space-y-4">
          <h4 className="font-medium text-gray-900">整理选项</h4>

          {/* 策略选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              整理策略
            </label>
            <select
              value={options.strategy}
              onChange={(e) =>
                setOptions({ ...options, strategy: e.target.value as any })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            >
              <option value="auto">自动（推荐）</option>
              <option value="conservative">保守（仅高置信度）</option>
              <option value="aggressive">激进（包含低置信度）</option>
            </select>
          </div>

          {/* 置信度阈值 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              最低置信度: {Math.round(options.minConfidence * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={options.minConfidence}
              onChange={(e) =>
                setOptions({
                  ...options,
                  minConfidence: parseFloat(e.target.value),
                })
              }
              className="w-full"
            />
            <p className="text-xs text-gray-500 mt-1">
              只处理置信度高于此阈值的建议
            </p>
          </div>

          {/* 复选框选项 */}
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={options.createNewFolders}
                onChange={(e) =>
                  setOptions({ ...options, createNewFolders: e.target.checked })
                }
                className="rounded border-gray-300 text-purple-600"
              />
              <span className="text-sm text-gray-700">自动创建新文件夹</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={options.applyTags}
                onChange={(e) =>
                  setOptions({ ...options, applyTags: e.target.checked })
                }
                className="rounded border-gray-300 text-purple-600"
              />
              <span className="text-sm text-gray-700">应用推荐标签</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={options.moveBookmarks}
                onChange={(e) =>
                  setOptions({ ...options, moveBookmarks: e.target.checked })
                }
                className="rounded border-gray-300 text-purple-600"
              />
              <span className="text-sm text-gray-700">移动书签到推荐文件夹</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={options.removeDuplicates}
                onChange={(e) =>
                  setOptions({ ...options, removeDuplicates: e.target.checked })
                }
                className="rounded border-gray-300 text-purple-600"
              />
              <span className="text-sm text-gray-700">删除重复书签</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={options.archiveUncategorized}
                onChange={(e) =>
                  setOptions({ ...options, archiveUncategorized: e.target.checked })
                }
                className="rounded border-gray-300 text-purple-600"
              />
              <span className="text-sm text-gray-700">归档无法分类的书签</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={syncToBrowser}
                onChange={(e) => setSyncToBrowser(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600"
              />
              <span className="text-sm text-gray-700 flex items-center gap-1">
                <RefreshCw className="w-3 h-3" />
                同步到浏览器书签栏
              </span>
            </label>
          </div>

          {/* 失效链接处理 */}
          {options.removeDuplicates && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                失效链接处理
              </label>
              <select
                value={options.handleBroken}
                onChange={(e) =>
                  setOptions({
                    ...options,
                    handleBroken: e.target.value as any,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              >
                <option value="ignore">忽略</option>
                <option value="archive">归档</option>
                <option value="delete">删除</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* 自动整理配置 */}
      <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-purple-600" />
            <h4 className="font-medium text-gray-900">自动整理</h4>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={autoOrganizeConfig.enabled}
              onChange={(e) =>
                saveAutoOrganizeConfig({
                  ...autoOrganizeConfig,
                  enabled: e.target.checked,
                })
              }
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
          </label>
        </div>

        {autoOrganizeConfig.enabled && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              自动为新添加的书签进行分类和打标签，无需手动操作
            </p>

            {/* 整理策略 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                整理策略
              </label>
              <select
                value={autoOrganizeConfig.strategy}
                onChange={(e) =>
                  saveAutoOrganizeConfig({
                    ...autoOrganizeConfig,
                    strategy: e.target.value as any,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              >
                <option value="auto">自动（推荐）</option>
                <option value="conservative">保守（仅高置信度）</option>
                <option value="aggressive">激进（包含低置信度）</option>
              </select>
            </div>

            {/* 置信度阈值 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                最低置信度: {Math.round(autoOrganizeConfig.minConfidence * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={autoOrganizeConfig.minConfidence}
                onChange={(e) =>
                  saveAutoOrganizeConfig({
                    ...autoOrganizeConfig,
                    minConfidence: parseFloat(e.target.value),
                  })
                }
                className="w-full"
              />
            </div>

            {/* 整理频率 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                整理频率
              </label>
              <select
                value={autoOrganizeConfig.schedule}
                onChange={(e) =>
                  saveAutoOrganizeConfig({
                    ...autoOrganizeConfig,
                    schedule: e.target.value as any,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              >
                <option value="daily">每天</option>
                <option value="weekly">每周</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {autoOrganizeConfig.schedule === 'daily'
                  ? '每天凌晨 2 点自动整理所有书签'
                  : '每周日凌晨 2 点自动整理所有书签'}
              </p>
            </div>

            {/* 上次整理时间 */}
            {lastAutoOrganize && (
              <div className="text-xs text-gray-500">
                上次自动整理: {lastAutoOrganize}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 进度显示 */}
      {progress && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
            <span className="font-medium text-blue-900">{progress.message}</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2 mb-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{
                width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="text-sm text-blue-700">
            {progress.current} / {progress.total}
          </div>
        </div>
      )}

      {/* 预览结果 */}
      {showPreview && preview && (
        <div className="mb-6 p-4 bg-yellow-50 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="w-5 h-5 text-yellow-600" />
            <span className="font-medium text-yellow-900">整理预览</span>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-3">
            <div className="text-center p-3 bg-white rounded-lg">
              <div className="text-2xl font-semibold text-yellow-700">
                {preview.summary.totalChanges}
              </div>
              <div className="text-xs text-gray-500">预计变更</div>
            </div>
            <div className="text-center p-3 bg-white rounded-lg">
              <div className="text-2xl font-semibold text-yellow-700">
                {preview.summary.affectedBookmarks}
              </div>
              <div className="text-xs text-gray-500">受影响书签</div>
            </div>
          </div>

          {preview.summary.newFolders.length > 0 && (
            <div className="mb-3">
              <div className="text-sm font-medium text-gray-700 mb-1">将创建文件夹：</div>
              <div className="flex flex-wrap gap-1">
                {preview.summary.newFolders.map((folder, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 bg-white rounded text-xs text-gray-600"
                  >
                    {folder}
                  </span>
                ))}
              </div>
            </div>
          )}

          {preview.warnings.length > 0 && (
            <div className="space-y-1">
              {preview.warnings.map((warning, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-yellow-700">
                  <AlertTriangle className="w-4 h-4" />
                  {warning}
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 text-sm text-gray-600">
            预计耗时: {preview.summary.estimatedTime} 秒
          </div>
        </div>
      )}

      {/* 整理结果 */}
      {result && (
        <div
          className={`mb-6 p-4 rounded-lg ${
            result.success ? 'bg-green-50' : 'bg-red-50'
          }`}
        >
          <div className="flex items-center gap-2 mb-3">
            {result.success ? (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            ) : (
              <XCircle className="w-5 h-5 text-red-600" />
            )}
            <span className={`font-medium ${result.success ? 'text-green-900' : 'text-red-900'}`}>
              {result.success ? '整理完成' : '整理失败'}
            </span>
          </div>

          {result.success && (
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center p-2 bg-white rounded">
                <div className="text-lg font-semibold text-gray-900">
                  {result.processed}
                </div>
                <div className="text-xs text-gray-500">已处理</div>
              </div>
              <div className="text-center p-2 bg-white rounded">
                <div className="text-lg font-semibold text-purple-600">
                  {result.classified}
                </div>
                <div className="text-xs text-gray-500">已分类</div>
              </div>
              <div className="text-center p-2 bg-white rounded">
                <div className="text-lg font-semibold text-blue-600">
                  {result.tagged}
                </div>
                <div className="text-xs text-gray-500">已加标签</div>
              </div>
              <div className="text-center p-2 bg-white rounded">
                <div className="text-lg font-semibold text-green-600">
                  {result.moved}
                </div>
                <div className="text-xs text-gray-500">已移动</div>
              </div>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="mt-3 text-sm text-red-700">
              <div className="font-medium mb-1">错误：</div>
              {result.errors.slice(0, 3).map((error, i) => (
                <div key={i}>• {error}</div>
              ))}
              {result.errors.length > 3 && (
                <div>• 还有 {result.errors.length - 3} 个错误...</div>
              )}
            </div>
          )}

          {result.success && (
            <div className="mt-3 space-y-1 text-sm text-gray-600">
              <div>耗时: {(result.duration / 1000).toFixed(2)} 秒</div>
              {lastOrganizeTime && (
                <div>整理时间: {lastOrganizeTime}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 同步结果 */}
      {syncResult && (
        <div className="mb-6 p-4 bg-indigo-50 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <RefreshCw className="w-5 h-5 text-indigo-600" />
            <span className="font-medium text-indigo-900">浏览器同步完成</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-2 bg-white rounded">
              <div className="text-lg font-semibold text-indigo-600">
                {syncResult.moved}
              </div>
              <div className="text-xs text-gray-500">已移动到文件夹</div>
            </div>
            <div className="text-center p-2 bg-white rounded">
              <div className="text-lg font-semibold text-indigo-600">
                {syncResult.tagged}
              </div>
              <div className="text-xs text-gray-500">已添加标签</div>
            </div>
          </div>

          <div className="mt-3 text-sm text-indigo-700">
            ✨ 书签已在浏览器书签栏中更新，打开书签管理器查看效果
          </div>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <button
          onClick={handlePreview}
          disabled={isRunning}
          className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
        >
          <Eye className="w-4 h-4" />
          预览效果
        </button>

        <button
          onClick={handleOrganize}
          disabled={isRunning}
          className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
        >
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              整理中...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              开始整理
            </>
          )}
        </button>
      </div>
    </div>
  );
}
