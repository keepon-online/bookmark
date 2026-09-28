// 高级设置页面：外观（主题）等

import * as React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useUIStore } from '@/stores';

const THEME_OPTIONS: Array<{
  value: 'light' | 'dark' | 'system';
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    value: 'light',
    label: '浅色',
    description: '始终使用浅色主题',
    icon: <Sun className="h-5 w-5" />,
  },
  {
    value: 'dark',
    label: '深色',
    description: '始终使用深色主题',
    icon: <Moon className="h-5 w-5" />,
  },
  {
    value: 'system',
    label: '跟随系统',
    description: '随操作系统外观自动切换',
    icon: <Monitor className="h-5 w-5" />,
  },
];

export function AdvancedSettings() {
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">高级设置</h2>

      <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-semibold mb-1 dark:text-gray-100">外观</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          主题应用于侧边栏、弹窗和设置页，选择后立即生效并自动记忆
        </p>
        <div className="grid grid-cols-3 gap-3">
          {THEME_OPTIONS.map((option) => {
            const active = theme === option.value;
            return (
              <button
                key={option.value}
                onClick={() => setTheme(option.value)}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors ${
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-input hover:bg-muted text-gray-700 dark:text-gray-300'
                }`}
              >
                {option.icon}
                <span className="text-sm font-medium">{option.label}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-semibold mb-1 dark:text-gray-100">数据说明</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          书签本体保存在浏览器中并由 Chrome 账号跨设备同步；标签、收藏、备注、
          死链状态等增强数据仅存于本机，可在
          <span className="mx-1 font-medium text-gray-700 dark:text-gray-300">书签管理</span>
          页导出 JSON 备份。卸载扩展不会影响浏览器书签。
        </p>
      </div>
    </div>
  );
}
