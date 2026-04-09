# Background Modules

- `index.ts`: background 启动入口，只负责初始化和装配依赖。
- `setup/`: 浏览器事件注册层。
- `setup/commands.ts` 与 `messages/commandHandlers.ts`: 命令监听注册与命令行为处理。
- `handlers.ts`: 对外门面，复用现有导入路径。
- `messages/messageHandlers.ts`: 消息分发组合层。
- `messages/`: 按消息域拆分的具体处理实现与共享类型。
