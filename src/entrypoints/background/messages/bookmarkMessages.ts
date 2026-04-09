import type { Message, MessageResponse } from '@/types';
import { handleBookmarkReadMessage } from './bookmarkReadMessages';
import type { BackgroundHandlerDeps } from './messageHandlerTypes';
import { handleBookmarkWriteMessage } from './bookmarkWriteMessages';

export async function handleBookmarkMessage(
  message: Message,
  deps: Pick<BackgroundHandlerDeps, 'bookmarkService' | 'searchService'>
): Promise<MessageResponse | undefined> {
  return (await handleBookmarkWriteMessage(message, deps)) ?? handleBookmarkReadMessage(message, deps);
}
