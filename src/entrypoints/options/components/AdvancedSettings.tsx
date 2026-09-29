// 高级设置页面：外观（主题模式、主题色）等

import * as React from 'react';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { useUIStore, PRIMARY_COLOR_OPTIONS, type PrimaryColor } from '@/stores';

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
  const primaryColor = useUIStore((state) => state.primaryColor ?? 'blue');
  const setPrimaryColor = useUIStore((state) => state.setPrimaryColor);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">高级设置</h2>

      <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-zinc-800 space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-1 text-gray-900 dark:text-gray-100">外观模式</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            设置浅色或深色主题，选择后侧边栏、弹窗和设置页立即生效并跨页面自动同步
          </p>
          <div className="grid grid-cols-3 gap-3">
            {THEME_OPTIONS.map((option) => {
              const active = theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
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

        <div className="pt-4 border-t border-gray-200 dark:border-zinc-800">
          <h3 className="text-lg font-semibold mb-1 text-gray-900 dark:text-gray-100">主题色</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            选择应用的主色调，将作用于按钮、高亮边框、选中状态和图标强调色
          </p>
          <div className="grid grid-cols-5 gap-3">
            {PRIMARY_COLOR_OPTIONS.map((color) => {
              const active = primaryColor === color.id;
              return (
                <button
                  key={color.id}
                  type="button"
                  onClick={() => setPrimaryColor(color.id as PrimaryColor)}
                  className={`flex flex-col items-center gap-2.5 p-3 rounded-lg border transition-all ${
                    active
                      ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
                      : 'border-input hover:bg-muted/50'
                  }`}
                >
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center shadow-sm"
                    style={{ backgroundColor: color.hex }}
                  >
                    {active && <Check className="w-4 h-4 text-white" />}
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      active ? 'text-primary font-semibold' : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {color.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-zinc-800">
        <h3 className="text-lg font-semibold mb-1 text-gray-900 dark:text-gray-100">数据说明</h3>
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
