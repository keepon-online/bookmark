import type { CreateBookmarkDTO, Message, MessageResponse, UpdateBookmarkDTO } from '@/types';
import type { BackgroundHandlerDeps } from './messageHandlerTypes';
import { success } from './messageHandlerTypes';

export async function handleBookmarkWriteMessage(
  message: Message,
  deps: Pick<BackgroundHandlerDeps, 'bookmarkService' | 'searchService'>
): Promise<MessageResponse | undefined> {
  const { bookmarkService, searchService } = deps;

  switch (message.type) {
    case 'BOOKMARK_CREATE': {
      const bookmark = await bookmarkService.create?.(message.payload as CreateBookmarkDTO);
      searchService.invalidateCache?.();
      return success(bookmark, message.requestId);
    }

    case 'BOOKMARK_UPDATE': {
      const { id, ...dto } = message.payload as { id: string } & UpdateBookmarkDTO;
      const bookmark = await bookmarkService.update?.(id, dto);
      searchService.invalidateCache?.();
      return success(bookmark, message.requestId);
    }

    case 'BOOKMARK_DELETE': {
      await bookmarkService.delete?.(message.payload as string);
      searchService.invalidateCache?.();
      return success(undefined, message.requestId);
    }

    case 'BOOKMARK_BATCH_DELETE': {
      await bookmarkService.deleteMany?.(message.payload as string[]);
      searchService.invalidateCache?.();
      return success(undefined, message.requestId);
    }

    case 'BOOKMARK_IMPORT': {
      const result = await bookmarkService.importFromBrowser?.();
      searchService.invalidateCache?.();
      return success(result, message.requestId);
    }

    default:
      return undefined;
  }
}
