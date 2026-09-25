// 消息类型定义
// v0.6 起 UI 直连数据层，消息通道只保留后台专属能力（读取当前页面信息）

export type MessageType = 'GET_CURRENT_TAB';

export interface MessagePayloadMap {
  GET_CURRENT_TAB: undefined;
}

export type MessagePayload<TType extends MessageType> =
  TType extends keyof MessagePayloadMap ? MessagePayloadMap[TType] : unknown;

export interface Message<TType extends MessageType = MessageType> {
  type: TType;
  payload?: MessagePayload<TType>;
  requestId?: string;
}

export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  requestId?: string;
}
