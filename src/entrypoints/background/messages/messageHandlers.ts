import type { Message, MessageResponse } from '@/types';
import { handleBookmarkMessage } from './bookmarkMessages';
import { handleFolderMessage } from './folderMessages';
import type { BackgroundHandlerDeps } from './messageHandlerTypes';
import { failure } from './messageHandlerTypes';
import { handleMiscMessage } from './miscMessages';
import { handleTagMessage } from './tagMessages';

export function createBackgroundMessageHandler({
  bookmarkService,
  folderService,
  tagService,
  searchService,
  getCurrentPageInfo: resolveCurrentPageInfo,
}: BackgroundHandlerDeps) {
  return async (
    message: Message,
    _sender: chrome.runtime.MessageSender
  ): Promise<MessageResponse> => {
    try {
      return (
        (await handleBookmarkMessage(message, { bookmarkService, searchService })) ??
        (await handleFolderMessage(message, { folderService })) ??
        (await handleTagMessage(message, { tagService })) ??
        (await handleMiscMessage(message, { getCurrentPageInfo: resolveCurrentPageInfo })) ??
        failure(`Unknown message type: ${message.type}`, message.requestId)
      );
    } catch (error) {
      return failure((error as Error).message, message.requestId);
    }
  };
}

export type { BackgroundHandlerDeps };
