import type { CreateFolderDTO, Message, MessageResponse, UpdateFolderDTO } from '@/types';
import type { BackgroundHandlerDeps } from './messageHandlerTypes';
import { success } from './messageHandlerTypes';

export async function handleFolderMessage(
  message: Message,
  deps: Pick<BackgroundHandlerDeps, 'folderService'>
): Promise<MessageResponse | undefined> {
  const { folderService } = deps;

  switch (message.type) {
    case 'FOLDER_CREATE': {
      const folder = await folderService.create?.(message.payload as CreateFolderDTO);
      return success(folder, message.requestId);
    }

    case 'FOLDER_UPDATE': {
      const { id, ...dto } = message.payload as { id: string } & UpdateFolderDTO;
      const folder = await folderService.update?.(id, dto);
      return success(folder, message.requestId);
    }

    case 'FOLDER_DELETE': {
      const { id, moveBookmarksTo } = message.payload as { id: string; moveBookmarksTo?: string };
      await folderService.delete?.(id, moveBookmarksTo);
      return success(undefined, message.requestId);
    }

    case 'FOLDER_GET_ALL': {
      const tree = await folderService.getTree?.();
      return success(tree, message.requestId);
    }

    default:
      return undefined;
  }
}
