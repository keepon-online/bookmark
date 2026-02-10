// 文件夹浏览器同步设置组件

import { useState, useEffect } from 'react';
import { FolderSync as FolderSyncIcon, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { folderSyncService } from '@/services/folderSyncService';
import type { FolderSyncSettings, BatchFolderSyncResult, FolderSyncConflict } from '@/types/sync';
import { DEFAULT_FOLDER_SYNC_SETTINGS } from '@/types/sync';

interface FolderSyncSettingsProps {
  className?: string;
}

export function FolderSyncSettingsPanel({ className = '' }: FolderSyncSettingsProps) {
  const [settings, setSettings] = useState<FolderSyncSettings>(DEFAULT_FOLDER_SYNC_SETTINGS);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<BatchFolderSyncResult | null>(null);
  const [conflicts, setConflicts] = useState<FolderSyncConflict[]>([]);
  const [isWatching, setIsWatching] = useState(false);

  useEffect(() => {
    loadSettings();
    loadConflicts();
    setIsWatching(folderSyncService.isWatchingBrowser());
  }, []);

  const loadSettings = async () => {
    try {
      const stored = await chrome.storage.local.get('settings');
      if (stored.settings?.folderSync) {
        setSettings(stored.settings.folderSync);
      }
    } catch (error) {
      console.error('Failed to load folder sync settings:', error);
    }
  };

  const loadConflicts = async () => {
    try {
      const conflictList = await folderSyncService.getConflicts();
      setConflicts(conflictList);
    } catch (error) {
      console.error('Failed to load conflicts:', error);
    }
  };

  const saveSettings = async (newSettings: FolderSyncSettings) => {
    try {
      const stored = await chrome.storage.local.get('settings');
      const allSettings = stored.settings || {};
      allSettings.folderSync = newSettings;
      await chrome.storage.local.set({ settings: allSettings });
      setSettings(newSettings);

      // 根据设置启动/停止监听
      if (newSettings.watchBrowserChanges && !isWatching) {
        folderSyncService.startWatching();
        setIsWatching(true);
      } else if (!newSettings.watchBrowserChanges && isWatching) {
        folderSyncService.stopWatching();
        setIsWatching(false);
      }
    } catch (error) {
      console.error('Failed to save folder sync settings:', error);
    }
  };

// PLACEHOLDER_CONTINUE

  const handleSyncToBrowser = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const result = await folderSyncService.syncAllToBrowser();
      setSyncResult(result);
    } catch (error) {
      setSyncResult({
        success: false,
        total: 0,
        synced: 0,
        skipped: 0,
        errors: [{ folderId: '', folderName: '', error: (error as Error).message, timestamp: Date.now() }],
        conflicts: [],
        duration: 0,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncFromBrowser = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const result = await folderSyncService.syncAllFromBrowser();
      setSyncResult(result);
    } catch (error) {
      setSyncResult({
        success: false,
        total: 0,
        synced: 0,
        skipped: 0,
        errors: [{ folderId: '', folderName: '', error: (error as Error).message, timestamp: Date.now() }],
        conflicts: [],
        duration: 0,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleResolveConflict = async (conflictId: string, action: 'use_db' | 'use_browser' | 'skip') => {
    try {
      await folderSyncService.resolveConflict(conflictId, { action });
      await loadConflicts();
    } catch (error) {
      console.error('Failed to resolve conflict:', error);
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm p-6 ${className}`}>
      {/* 头部 */}
      <div className="flex items-start gap-3 mb-6">
        <FolderSyncIcon className="w-5 h-5 text-blue-600 mt-0.5" />
        <div>
          <h3 className="text-lg font-semibold text-gray-900">文件夹同步</h3>
          <p className="text-sm text-gray-500 mt-1">
            将数据库文件夹与浏览器书签栏文件夹保持同步
          </p>
        </div>
      </div>

      {/* 设置选项 */}
      <div className="space-y-4 mb-6">
        {/* 自动同步到浏览器 */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-gray-700">自动同步到浏览器</label>
            <p className="text-xs text-gray-500">创建/修改文件夹时自动同步到浏览器书签栏</p>
          </div>
          <button
            onClick={() => saveSettings({ ...settings, autoSyncToBrowser: !settings.autoSyncToBrowser })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.autoSyncToBrowser ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings.autoSyncToBrowser ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* 监听浏览器变化 */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-gray-700">监听浏览器变化</label>
            <p className="text-xs text-gray-500">浏览器书签栏文件夹变化时自动同步到数据库</p>
          </div>
          <button
            onClick={() => saveSettings({ ...settings, watchBrowserChanges: !settings.watchBrowserChanges })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.watchBrowserChanges ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings.watchBrowserChanges ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* 冲突策略 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">冲突解决策略</label>
          <select
            value={settings.conflictStrategy}
            onChange={(e) => saveSettings({ ...settings, conflictStrategy: e.target.value as any })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          >
            <option value="ask">每次询问</option>
            <option value="prefer_db">优先使用数据库</option>
            <option value="prefer_browser">优先使用浏览器</option>
            <option value="keep_both">保留两者</option>
          </select>
        </div>
      </div>

      {/* 同步结果 */}
      {syncResult && (
        <div className={`p-4 rounded-lg mb-4 ${syncResult.success ? 'bg-green-50' : 'bg-red-50'}`}>
          <div className="flex items-center gap-2 mb-2">
            {syncResult.success ? (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600" />
            )}
            <span className={`font-medium ${syncResult.success ? 'text-green-900' : 'text-red-900'}`}>
              {syncResult.success ? '同步完成' : '同步失败'}
            </span>
          </div>
          {syncResult.success && (
            <div className="text-sm text-gray-700 space-y-1">
              <div>已同步: {syncResult.synced} / {syncResult.total} 个文件夹</div>
              <div className="text-xs text-gray-500">耗时: {(syncResult.duration / 1000).toFixed(2)} 秒</div>
            </div>
          )}
          {syncResult.errors.length > 0 && (
            <div className="mt-2 text-sm text-red-700">
              {syncResult.errors.map((e, i) => (
                <div key={i}>{e.folderName}: {e.error}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 冲突列表 */}
      {conflicts.length > 0 && (
        <div className="mb-4 p-4 bg-orange-50 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-5 h-5 text-orange-600" />
            <span className="font-medium text-orange-900">待解决冲突 ({conflicts.length})</span>
          </div>
          <div className="space-y-2">
            {conflicts.slice(0, 5).map((conflict) => (
              <div key={conflict.id} className="flex items-center justify-between bg-white p-2 rounded">
                <span className="text-sm text-gray-700">
                  {conflict.dbFolderName || conflict.browserFolderName || '未知文件夹'}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleResolveConflict(conflict.id, 'use_db')}
                    className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  >
                    用数据库
                  </button>
                  <button
                    onClick={() => handleResolveConflict(conflict.id, 'use_browser')}
                    className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                  >
                    用浏览器
                  </button>
                  <button
                    onClick={() => handleResolveConflict(conflict.id, 'skip')}
                    className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                  >
                    跳过
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 手动同步按钮 */}
      <div className="flex gap-2">
        <button
          onClick={handleSyncToBrowser}
          disabled={isSyncing}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium text-sm"
        >
          {isSyncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
          同步到浏览器
        </button>
        <button
          onClick={handleSyncFromBrowser}
          disabled={isSyncing}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium text-sm"
        >
          {isSyncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
          从浏览器导入
        </button>
      </div>

      {/* 监听状态 */}
      <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
        <div className={`w-2 h-2 rounded-full ${isWatching ? 'bg-green-500' : 'bg-gray-300'}`} />
        {isWatching ? '正在监听浏览器变化' : '未监听浏览器变化'}
      </div>
    </div>
  );
}
