import { createDefaultCommandHandler } from '../handlers';

type CommandsApi = {
  onCommand: {
    addListener: (callback: (command: string) => void | Promise<void>) => void;
  };
};

type LoggerLike = Pick<Console, 'log'>;

type CreateCommandHandler = typeof createDefaultCommandHandler;

interface CommandSetupDeps {
  commands?: CommandsApi;
  createCommandHandler?: CreateCommandHandler;
  commandDeps: Parameters<CreateCommandHandler>[0];
  logger?: LoggerLike;
}

export function setupCommands({
  commands,
  createCommandHandler = createDefaultCommandHandler,
  commandDeps,
  logger = console,
}: CommandSetupDeps): void {
  if (!commands) {
    return;
  }

  const handleCommand = createCommandHandler(commandDeps);

  commands.onCommand.addListener(async (command) => {
    logger.log('[Background] Command received:', command);
    await handleCommand(command);
  });
}
