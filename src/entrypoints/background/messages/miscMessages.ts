import type { Message, MessageResponse } from '@/types';
import type { BackgroundHandlerDeps } from './messageHandlerTypes';
import { success } from './messageHandlerTypes';

export async function handleMiscMessage(
  message: Message,
  deps: Pick<BackgroundHandlerDeps, 'getCurrentPageInfo'>
): Promise<MessageResponse | undefined> {
  switch (message.type) {
    case 'GET_CURRENT_TAB': {
      const pageInfo = await deps.getCurrentPageInfo();
      return success(pageInfo, message.requestId);
    }

    default:
      return undefined;
  }
}
