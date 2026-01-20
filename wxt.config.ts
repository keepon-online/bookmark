import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  manifest: {
    name: '智能书签',
    description: 'AI 驱动的智能书签管理插件 - 自动分类、标签推荐、跨设备同步、语义搜索、智能整理',
    version: '0.5.6',
    permissions: [
      'bookmarks',
      'storage',
      'tabs',
      'activeTab',
      'alarms',
      'contextMenus'
    ],
    optional_host_permissions: [
      'https://*/*',
      'http://*/*'
    ],
    options_ui: {
      page: 'options.html',
      open_in_tab: true
    },
    icons: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png'
    },
    commands: {
      'open-sidepanel': {
        suggested_key: {
          default: 'Alt+Shift+S',
          windows: 'Alt+Shift+S',
          mac: 'Alt+Shift+S',
        },
        description: '打开侧边栏',
      },
      'quick-add': {
        suggested_key: {
          default: 'Alt+Shift+A',
          windows: 'Alt+Shift+A',
          mac: 'Alt+Shift+A',
        },
        description: '快速添加当前页面',
      },
      'toggle-favorite': {
        suggested_key: {
          default: 'Alt+Shift+F',
          windows: 'Alt+Shift+F',
          mac: 'Alt+Shift+F',
        },
        description: '切换收藏状态',
      },
      'search-bookmarks': {
        suggested_key: {
          default: 'Alt+Shift+K',
          windows: 'Alt+Shift+K',
          mac: 'Alt+Shift+K',
        },
        description: '搜索书签',
      },
    },
  },
  hooks: {
    'build:manifestGenerated': (wxt, manifest) => {
      // 确保 options_ui 包含 open_in_tab
      if (manifest.options_ui) {
        (manifest.options_ui as any).open_in_tab = true;
      }
    },
  },
});
