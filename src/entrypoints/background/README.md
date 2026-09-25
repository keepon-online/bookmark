# Background Modules

- `index.ts`: background 启动入口，只负责初始化和装配依赖（右键菜单、
  定时任务、快捷键、书签事件监听、GET_CURRENT_TAB 消息）。
- `setup/`: 浏览器事件注册层（DI 风格，便于测试注入）。
- `setup/commands.ts` 与 `messages/commandHandlers.ts`: 命令监听注册与
  命令行为处理（quick-add 直写 chrome.bookmarks，toggle-favorite 写 aux）。

v0.6 起 UI 直连数据层，消息通道仅保留 `GET_CURRENT_TAB`，
原消息分发层已移除。
