/**
 * NoStrCat Chat Core
 *
 * 基于 Nostr 协议的聊天核心库
 * 支持 NIP-17 私聊、NIP-28 公开频道、私有群聊
 */

// 加密模块
export {
  getConversationKey,
  encrypt,
  decrypt,
  hexToBytes,
  bytesToHex
} from './crypto/nip44'

export {
  NostrEvent,
  EVENT_KIND,
  createSeal,
  unwrapSeal,
  createGiftWrap,
  unwrapGiftWrap,
  wrapDirectMessage,
  unwrapDirectMessage,
  verifyEvent
} from './crypto/nip59'

// 私聊模块
export {
  DirectMessageService,
  type DirectMessage,
  type Conversation,
  type MessageStatus,
  type DirectMessageServiceConfig,
  type RelayConnection
} from './dm/DirectMessageService'

// 私有群聊模块
export {
  PrivateGroupService,
  type PrivateGroup,
  type GroupMessage,
  GROUP_EVENT_KIND,
  type PrivateGroupServiceConfig
} from './groups/PrivateGroupService'

// 公开频道模块
export {
  ChannelService,
  type Channel,
  type ChannelMessage,
  CHANNEL_KIND,
  type ChannelServiceConfig
} from './channels/ChannelService'

// 版本信息
export const VERSION = '0.1.0'
