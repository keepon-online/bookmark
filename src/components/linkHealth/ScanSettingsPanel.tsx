// 扫描设置面板组件
// 设置的类型、默认值与读写都在 @/lib/scanSettings（后台定时自动扫描也要用）

import * as React from 'react';
import { Settings, Info } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { ScanSettings } from '@/lib/scanSettings';
import {
  AUTO_SCAN_BATCH_SIZE,
  AUTO_SCAN_PROGRESS_KEY,
  type AutoScanProgress,
} from '@/services/linkHealthAutoScan';

interface ScanSettingsPanelProps {
  settings: ScanSettings;
  onChange: (settings: ScanSettings) => void;
  disabled?: boolean;
  className?: string;
}

export function ScanSettingsPanel({
  settings,
  onChange,
  disabled = false,
  className,
}: ScanSettingsPanelProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [whitelistText, setWhitelistText] = React.useState(settings.whitelist.join('\n'));
  const [autoScanProgress, setAutoScanProgress] = React.useState<AutoScanProgress | undefined>(
    undefined
  );

  // 保证异步加载设置后白名单文本框能正确同步
  React.useEffect(() => {
    setWhitelistText(settings.whitelist.join('\n'));
  }, [settings.whitelist]);

  // 读一次自动扫描的进度，展示"进行中 / 上次完成"
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await chrome.storage.local.get(AUTO_SCAN_PROGRESS_KEY);
        if (!cancelled) {
          setAutoScanProgress(stored?.[AUTO_SCAN_PROGRESS_KEY] as AutoScanProgress | undefined);
        }
      } catch {
        // 读不到进度不影响设置面板
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const autoScanStatusText = React.useMemo(() => {
    if (!autoScanProgress) {
      return '尚未运行过';
    }
    if (autoScanProgress.runningSince) {
      return `正在检查… 本轮已完成 ${autoScanProgress.checked} 条`;
    }
    if (autoScanProgress.lastFinishedAt) {
      return `上次完成：${formatRelativeTime(autoScanProgress.lastFinishedAt)}（本轮 ${autoScanProgress.checked} 条）`;
    }
    return `本轮已完成 ${autoScanProgress.checked} 条`;
  }, [autoScanProgress]);

  const handleTimeoutChange = (value: number) => {
    onChange({ ...settings, timeout: value });
  };

  const handleConcurrencyChange = (value: number) => {
    onChange({ ...settings, concurrency: value });
  };

  const handleRetriesChange = (value: number) => {
    onChange({ ...settings, retries: value });
  };

  const handleSkipRecentChange = (value: number) => {
    onChange({ ...settings, skipRecentHours: value });
  };

  const handleWhitelistChange = (text: string) => {
    setWhitelistText(text);
    const domains = text
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    onChange({ ...settings, whitelist: domains });
  };

  return React.createElement('div', { className: cn('border-t pt-4 mt-4', className) },
    // 折叠按钮
    React.createElement(Button, {
      variant: 'ghost',
      size: 'sm',
      onClick: () => setIsExpanded(!isExpanded),
      className: 'w-full justify-between text-muted-foreground hover:text-foreground',
      disabled,
    },
      React.createElement('span', { className: 'flex items-center gap-2' },
        React.createElement(Settings, { size: 16 }),
        '扫描设置'
      ),
      React.createElement('span', { className: cn('transition-transform', isExpanded && 'rotate-180') }, '▼')
    ),

    // 设置面板
    isExpanded && React.createElement('div', {
      className: 'mt-4 space-y-4 p-4 bg-muted/30 rounded-lg',
    },
      // 超时时间
      React.createElement('div', { className: 'space-y-2' },
        React.createElement('div', { className: 'flex items-center justify-between' },
          React.createElement('label', { className: 'text-sm font-medium' }, '超时时间'),
          React.createElement('span', { className: 'text-sm text-muted-foreground tabular-nums' },
            `${settings.timeout} 秒`
          )
        ),
        React.createElement('input', {
          type: 'range',
          min: 3,
          max: 30,
          value: settings.timeout,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => handleTimeoutChange(Number(e.target.value)),
          disabled,
          className: 'w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary',
        }),
        React.createElement('div', { className: 'flex justify-between text-xs text-muted-foreground' },
          React.createElement('span', null, '3秒'),
          React.createElement('span', null, '30秒')
        )
      ),

      // 并发数
      React.createElement('div', { className: 'space-y-2' },
        React.createElement('div', { className: 'flex items-center justify-between' },
          React.createElement('label', { className: 'text-sm font-medium' }, '并发数'),
          React.createElement('span', { className: 'text-sm text-muted-foreground tabular-nums' },
            `${settings.concurrency} 个`
          )
        ),
        React.createElement('input', {
          type: 'range',
          min: 1,
          max: 20,
          value: settings.concurrency,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => handleConcurrencyChange(Number(e.target.value)),
          disabled,
          className: 'w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary',
        }),
        React.createElement('div', { className: 'flex justify-between text-xs text-muted-foreground' },
          React.createElement('span', null, '1'),
          React.createElement('span', null, '20')
        )
      ),

      // 重试次数
      React.createElement('div', { className: 'space-y-2' },
        React.createElement('div', { className: 'flex items-center justify-between' },
          React.createElement('label', { className: 'text-sm font-medium' }, '重试次数'),
          React.createElement('span', { className: 'text-sm text-muted-foreground tabular-nums' },
            `${settings.retries} 次`
          )
        ),
        React.createElement('div', { className: 'flex gap-2' },
          ...[0, 1, 2, 3].map(n =>
            React.createElement('button', {
              key: n,
              onClick: () => handleRetriesChange(n),
              disabled,
              className: cn(
                'flex-1 py-1.5 text-sm rounded-md border transition-colors',
                settings.retries === n
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-muted border-input'
              ),
            }, n)
          )
        )
      ),

      // 跳过最近检查
      React.createElement('div', { className: 'space-y-2' },
        React.createElement('div', { className: 'flex items-center justify-between' },
          React.createElement('label', { className: 'text-sm font-medium' }, '跳过最近检查'),
          React.createElement('span', { className: 'text-sm text-muted-foreground tabular-nums' },
            settings.skipRecentHours === 0 ? '不跳过' : `${settings.skipRecentHours} 小时内`
          )
        ),
        React.createElement('div', { className: 'flex gap-2' },
          ...[0, 6, 12, 24, 48].map(n =>
            React.createElement('button', {
              key: n,
              onClick: () => handleSkipRecentChange(n),
              disabled,
              className: cn(
                'flex-1 py-1.5 text-xs rounded-md border transition-colors',
                settings.skipRecentHours === n
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-muted border-input'
              ),
            }, n === 0 ? '不跳过' : `${n}h`)
          )
        )
      ),

      // 白名单
      React.createElement('div', { className: 'space-y-2' },
        React.createElement('div', { className: 'flex items-center gap-2' },
          React.createElement('label', { className: 'text-sm font-medium' }, '白名单域名'),
          React.createElement('span', {
            className: 'text-xs text-muted-foreground',
            title: '这些域名将被跳过检查',
          },
            React.createElement(Info, { size: 14 })
          )
        ),
        React.createElement('textarea', {
          value: whitelistText,
          onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => handleWhitelistChange(e.target.value),
          disabled,
          placeholder: '每行一个域名，例如:\nlocalhost\n127.0.0.1\nexample.com',
          className: cn(
            'w-full h-20 px-3 py-2 text-sm rounded-md border border-input bg-background',
            'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring',
            'resize-none'
          ),
        }),
        settings.whitelist.length > 0 && React.createElement('div', {
          className: 'text-xs text-muted-foreground',
        }, `已添加 ${settings.whitelist.length} 个域名`)
      ),

      // 定时自动检查
      React.createElement('div', { className: 'space-y-2 border-t pt-4' },
        React.createElement('div', { className: 'flex items-center justify-between' },
          React.createElement('label', { className: 'text-sm font-medium' }, '定时自动检查'),
          React.createElement('label', { className: 'flex items-center gap-2 text-sm cursor-pointer select-none' },
            React.createElement('input', {
              type: 'checkbox',
              checked: settings.autoScanEnabled,
              disabled,
              onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                onChange({ ...settings, autoScanEnabled: e.target.checked }),
              className: 'h-4 w-4',
            }),
            settings.autoScanEnabled ? '已开启' : '已关闭'
          )
        ),
        settings.autoScanEnabled && React.createElement('div', { className: 'space-y-2' },
          React.createElement('div', { className: 'flex items-center justify-between' },
            React.createElement('label', { className: 'text-sm font-medium' }, '检查间隔'),
            React.createElement('span', { className: 'text-sm text-muted-foreground tabular-nums' },
              `${settings.autoScanIntervalHours} 小时`
            )
          ),
          React.createElement('div', { className: 'flex gap-2' },
            ...[6, 12, 24, 72].map(n =>
              React.createElement('button', {
                key: n,
                onClick: () => onChange({ ...settings, autoScanIntervalHours: n }),
                disabled,
                className: cn(
                  'flex-1 py-1.5 text-xs rounded-md border transition-colors',
                  settings.autoScanIntervalHours === n
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-muted border-input'
                ),
              }, `${n}h`)
            )
          ),
          React.createElement('p', { className: 'text-xs text-muted-foreground' }, autoScanStatusText)
        ),
        React.createElement('p', { className: 'text-xs text-muted-foreground' },
          `后台分批检查（每批最多 ${AUTO_SCAN_BATCH_SIZE} 条，可跨多次闹钟续跑）。需要网站访问权限，未授权时结果会记为「无法连接」而不是失效。`
        )
      ),

      // 提示信息
      React.createElement('div', {
        className: 'flex items-start gap-2 p-3 bg-blue-50 text-blue-700 rounded-md text-xs',
      },
        React.createElement(Info, { size: 14, className: 'mt-0.5 flex-shrink-0' }),
        React.createElement('div', null,
          React.createElement('p', null, '提示：较高的并发数可以加快检查速度，但可能触发网站的速率限制。'),
          React.createElement('p', { className: 'mt-1' }, '建议保持默认设置，除非遇到特殊情况。')
        )
      )
    )
  );
}
