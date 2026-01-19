import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  manifest: {
    name: '智能书签',
    description: 'AI 驱动的智能书签管理插件 - 自动分类、标签推荐、跨设备同步',
    version: '0.1.0',
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
    icons: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png'
    }
  },
});
