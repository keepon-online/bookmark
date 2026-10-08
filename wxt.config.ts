import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  dev: {
    server: {
      // Windows + Node 17+ 下 localhost 可能只解析到 IPv6 ::1，导致
      // dev server 只监听 [::1]:3000，而 Chrome 走 IPv4 连接被拒。
      // 显式绑定 IPv4 并让扩展页面直连 127.0.0.1。
      host: '127.0.0.1',
      origin: 'http://127.0.0.1:3000',
    },
  },
  manifest: {
    name: '智能书签',
    description: '浏览器书签增强插件 - 秒级搜索、智能整理、死链检查、书签档案',
    version: '0.7.0',
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
