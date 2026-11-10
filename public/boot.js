// 首帧前同步注入暗色类（外置文件：MV3 扩展页 CSP 禁止内联脚本）。
// deferred 的应用脚本晚于首帧绘制，深色用户会先看到一帧白底（FOUC）。
// 主题持久化在 zustand persist 的 smart-bookmark-ui 键里
try {
  var ui = JSON.parse(localStorage.getItem('smart-bookmark-ui') || '{}').state || {};
  var theme = ui.theme || 'system';
  if (
    theme === 'dark' ||
    (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  ) {
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
