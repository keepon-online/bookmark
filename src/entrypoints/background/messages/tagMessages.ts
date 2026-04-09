import type { CreateTagDTO, Message, MessageResponse, UpdateTagDTO } from '@/types';
import type { BackgroundHandlerDeps } from './messageHandlerTypes';
import { success } from './messageHandlerTypes';

export async function handleTagMessage(
  message: Message,
  deps: Pick<BackgroundHandlerDeps, 'tagService'>
): Promise<MessageResponse | undefined> {
  const { tagService } = deps;

  switch (message.type) {
    case 'TAG_GET_ALL': {
      const tags = await tagService.getAll?.();
      return success(tags, message.requestId);
    }

    case 'TAG_CREATE': {
      const tag = await tagService.create?.(message.payload as CreateTagDTO);
      return success(tag, message.requestId);
    }

    case 'TAG_UPDATE': {
      const { id, ...dto } = message.payload as { id: string } & UpdateTagDTO;
      const tag = await tagService.update?.(id, dto);
      return success(tag, message.requestId);
    }

    case 'TAG_DELETE': {
      await tagService.delete?.(message.payload as string);
      return success(undefined, message.requestId);
    }

    default:
      return undefined;
  }
}
