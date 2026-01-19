// 云端同步设置组件

import { useState, useEffect } from 'react';
import { Cloud, CloudOff, RefreshCw, AlertCircle, CheckCircle2, LogOut, Settings } from 'lucide-react';
import { syncService } from '@/services/syncService';
import type { SyncConfig, UserSession, SyncResult } from '@/types';

interface SyncSettingsProps {
  className?: string;
}

export function SyncSettings({ className = '' }: SyncSettingsProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [session, setSession] = useState<UserSession | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{
    lastSyncTime: number;
    pendingCount: number;
    conflictCount: number;
  } | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);

  // 登录表单状态
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // 配置状态
  const [config, setConfig] = useState<SyncConfig>({
    provider: 'supabase',
    enabled: false,
    syncInterval: 30,
    autoSync: true,
    conflictResolution: 'latest',
    encryptData: false,
    supabase: {
      url: '',
      anonKey: '',
    },
  });

  useEffect(() => {
    loadConfig();
    checkAuth();
    loadSyncStatus();
  }, []);

  const loadConfig = async () => {
    const stored = await chrome.storage.local.get('syncConfig');
    if (stored.syncConfig) {
      setConfig(stored.syncConfig);
      if (stored.syncConfig.enabled) {
        await syncService.initialize(stored.syncConfig);
      }
    }
  };

  const checkAuth = () => {
    const session = syncService.getSession();
    setSession(session);
    setIsAuthenticated(syncService.isAuthenticated());
  };

  const loadSyncStatus = async () => {
    const status = await syncService.getSyncStatus();
    setSyncStatus(status);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');

    try {
      if (isRegister) {
        await syncService.register(email, password);
      } else {
        await syncService.login(email, password);
      }
      checkAuth();
      setShowLogin(false);
      setEmail('');
      setPassword('');
    } catch (error) {
      setAuthError((error as Error).message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await syncService.logout();
    await syncService.clearSyncData();
    checkAuth();
    setLastSyncResult(null);
  };

  const handleSync = async (direction: 'upload' | 'download' | 'bidirectional' = 'bidirectional') => {
    if (!isAuthenticated) return;

    setIsSyncing(true);
    setLastSyncResult(null);

    try {
      const result = await syncService.sync(direction, (progress) => {
        console.log('[Sync]', progress.message);
      });
      setLastSyncResult(result);
      await loadSyncStatus();
    } catch (error) {
      setLastSyncResult({
        success: false,
        uploaded: 0,
        downloaded: 0,
        conflicts: 0,
        errors: [(error as Error).message],
        duration: 0,
        timestamp: Date.now(),
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleConfigChange = async (updates: Partial<SyncConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    await chrome.storage.local.set({ syncConfig: newConfig });

    if (newConfig.enabled) {
      await syncService.initialize(newConfig);
    }
  };

  const formatTime = (timestamp: number) => {
    if (!timestamp) return '从未同步';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    return date.toLocaleDateString();
  };

  if (!config.enabled) {
    return (
      <div className={`bg-white rounded-lg shadow-sm p-6 ${className}`}>
        <div className="flex items-start gap-3 mb-4">
          <CloudOff className="w-5 h-5 text-gray-400 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">云端同步</h3>
            <p className="text-sm text-gray-500 mt-1">
              启用跨设备同步，在多个设备间保持书签一致
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              同步服务提供商
            </label>
            <select
              value={config.provider}
              onChange={(e) => handleConfigChange({ provider: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="supabase">Supabase</option>
              <option value="custom" disabled>自定义服务器（即将推出）</option>
              <option value="webdav" disabled>WebDAV（即将推出）</option>
            </select>
          </div>

          {config.provider === 'supabase' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Supabase URL
                </label>
                <input
                  type="text"
                  placeholder="https://xxx.supabase.co"
                  value={config.supabase?.url || ''}
                  onChange={(e) => handleConfigChange({
                    supabase: { ...config.supabase!, url: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Supabase Anon Key
                </label>
                <input
                  type="password"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={config.supabase?.anonKey || ''}
                  onChange={(e) => handleConfigChange({
                    supabase: { ...config.supabase!, anonKey: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          )}

          <button
            onClick={() => handleConfigChange({ enabled: true })}
            disabled={!config.supabase?.url || !config.supabase?.anonKey}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
          >
            启用云端同步
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm p-6 ${className}`}>
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-start gap-3">
          <Cloud className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">云端同步</h3>
            <p className="text-sm text-gray-500 mt-1">
              {isAuthenticated
                ? `已登录为 ${session?.userEmail}`
                : '请登录以启用云端同步'
              }
            </p>
          </div>
        </div>

        {isAuthenticated && (
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            登出
          </button>
        )}
      </div>

      {/* 未登录状态 */}
      {!isAuthenticated && (
        <div className="space-y-4">
          {!showLogin ? (
            <button
              onClick={() => setShowLogin(true)}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              登录账户
            </button>
          ) : (
            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  邮箱地址
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  密码
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              {authError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-2 rounded-lg">
                  <AlertCircle className="w-4 h-4" />
                  {authError}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={authLoading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 font-medium"
                >
                  {authLoading ? '处理中...' : isRegister ? '注册' : '登录'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowLogin(false);
                    setAuthError('');
                  }}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium"
                >
                  取消
                </button>
              </div>
              <button
                type="button"
                onClick={() => setIsRegister(!isRegister)}
                className="w-full text-sm text-blue-600 hover:underline"
              >
                {isRegister ? '已有账户？去登录' : '没有账户？去注册'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* 已登录状态 */}
      {isAuthenticated && (
        <div className="space-y-6">
          {/* 同步状态 */}
          {syncStatus && (
            <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
              <div className="text-center">
                <div className="text-2xl font-semibold text-gray-900">
                  {formatTime(syncStatus.lastSyncTime)}
                </div>
                <div className="text-xs text-gray-500 mt-1">上次同步</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-semibold text-blue-600">
                  {syncStatus.pendingCount}
                </div>
                <div className="text-xs text-gray-500 mt-1">待同步</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-semibold text-orange-600">
                  {syncStatus.conflictCount}
                </div>
                <div className="text-xs text-gray-500 mt-1">冲突</div>
              </div>
            </div>
          )}

          {/* 同步结果 */}
          {lastSyncResult && (
            <div className={`p-4 rounded-lg ${
              lastSyncResult.success ? 'bg-green-50' : 'bg-red-50'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {lastSyncResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600" />
                )}
                <span className={`font-medium ${
                  lastSyncResult.success ? 'text-green-900' : 'text-red-900'
                }`}>
                  {lastSyncResult.success ? '同步完成' : '同步失败'}
                </span>
              </div>
              {lastSyncResult.success && (
                <div className="text-sm text-gray-700 space-y-1">
                  <div>上传: {lastSyncResult.uploaded} 条</div>
                  <div>下载: {lastSyncResult.downloaded} 条</div>
                  {lastSyncResult.conflicts > 0 && (
                    <div className="text-orange-700">冲突: {lastSyncResult.conflicts} 条</div>
                  )}
                  <div className="text-xs text-gray-500">
                    耗时: {(lastSyncResult.duration / 1000).toFixed(2)} 秒
                  </div>
                </div>
              )}
              {lastSyncResult.errors.length > 0 && (
                <div className="mt-2 text-sm text-red-700">
                  {lastSyncResult.errors.join(', ')}
                </div>
              )}
            </div>
          )}

          {/* 同步按钮 */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleSync('upload')}
              disabled={isSyncing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium text-sm"
            >
              {isSyncing ? '同步中...' : '上传'}
            </button>
            <button
              onClick={() => handleSync('download')}
              disabled={isSyncing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium text-sm"
            >
              {isSyncing ? '同步中...' : '下载'}
            </button>
            <button
              onClick={() => handleSync('bidirectional')}
              disabled={isSyncing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium text-sm"
            >
              {isSyncing ? (
                <span className="flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  同步中
                </span>
              ) : (
                '双向同步'
              )}
            </button>
          </div>

          {/* 高级设置 */}
          <div className="border-t pt-4">
            <button
              onClick={() => {}}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
            >
              <Settings className="w-4 h-4" />
              高级设置
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
