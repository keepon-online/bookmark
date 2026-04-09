import type { Message, MessageResponse } from '@/types';
import type { BackgroundHandlerDeps, BookmarkQueryOptions } from './messageHandlerTypes';
import { success } from './messageHandlerTypes';

export async function handleBookmarkReadMessage(
  message: Message,
  deps: Pick<BackgroundHandlerDeps, 'bookmarkService' | 'searchService'>
): Promise<MessageResponse | undefined> {
  const { bookmarkService, searchService } = deps;

  switch (message.type) {
    case 'BOOKMARK_GET_ALL': {
      const bookmarks = await bookmarkService.getAll?.(message.payload as BookmarkQueryOptions | undefined);
      return success(bookmarks, message.requestId);
    }

    case 'BOOKMARK_SEARCH': {
      const result = await searchService.search?.(message.payload as string);
      return success(result, message.requestId);
    }

    default:
      return undefined;
  }
}
