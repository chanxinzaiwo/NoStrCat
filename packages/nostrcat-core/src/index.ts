/**
 * NoStrCat Core Library
 *
 * 统一的核心库，支持 Web 和移动端应用
 * 集成 Nostr 协议和 OP_CAT Layer 区块链
 */

// 客户端
export { NostrCatClient } from './client/NostrCatClient'
export type { NostrCatClientConfig, UserProfile } from './client/NostrCatClient'
export { NostrConnection } from './client/NostrConnection'
export type { RelayConfig } from './client/NostrConnection'
export { OPCATConnection } from './client/OPCATConnection'
export type { OPCATConfig } from './client/OPCATConnection'

// 加密
export {
  generateKeyPair,
  derivePublicKey,
  signEvent,
  verifySignature,
} from './crypto/keys'
export type { KeyPair } from './crypto/keys'
export {
  encryptDM,
  decryptDM,
  encryptNip17,
  decryptNip17,
} from './crypto/encryption'

// 事件
export {
  EventKind,
  createEvent,
  validateEvent,
  serializeEvent,
  getEventHash,
} from './events/types'
export type { NostrEvent, UnsignedEvent } from './events/types'
export { EventBuilder } from './events/builder'

// 钱包
export { Wallet } from './wallet/Wallet'
export type { WalletConfig, Balance, Transaction } from './wallet/Wallet'
export { TransactionBuilder } from './wallet/TransactionBuilder'

// 存储
export { LocalStorage } from './storage/LocalStorage'
export { SyncEngine } from './storage/SyncEngine'

// 聊天模块
export { PrivateChat } from './modules/chat/PrivateChat'
export type { DirectMessage, Conversation } from './modules/chat/PrivateChat'
export { GroupChat } from './modules/chat/GroupChat'
export type { GroupMessage, Group, GroupMember } from './modules/chat/GroupChat'

// 时间线模块
export { Timeline } from './modules/feed/Timeline'
export type { Post, TimelineConfig, TimelineType } from './modules/feed/Timeline'

// 支付模块
export { ZapManager } from './modules/payments/ZapManager'
export type { ZapReceipt, ZapStats } from './modules/payments/ZapManager'

// 工具
export {
  bytesToHex,
  hexToBytes,
  encodeNpub,
  decodeNpub,
  encodeNsec,
  decodeNsec,
} from './utils/encoding'

// 常量
export {
  DEFAULT_RELAYS,
  NOSTR_EVENT_KINDS,
  OPCAT_NETWORK,
} from './utils/constants'
