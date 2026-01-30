/**
 * 常量定义
 */

/**
 * 默认 Nostr 中继列表
 */
export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.snort.social',
  'wss://nostr.wine',
  'wss://relay.nostr.info',
  'wss://nostr-pub.wellorder.net',
  'wss://relay.current.fyi',
]

/**
 * Nostr 事件类型
 */
export const NOSTR_EVENT_KINDS = {
  // 基础事件
  METADATA: 0,
  TEXT_NOTE: 1,
  RECOMMEND_RELAY: 2,
  CONTACTS: 3,
  ENCRYPTED_DM: 4,
  EVENT_DELETION: 5,
  REPOST: 6,
  REACTION: 7,

  // 群聊相关
  CHANNEL_CREATION: 40,
  CHANNEL_METADATA: 41,
  CHANNEL_MESSAGE: 42,
  CHANNEL_HIDE_MESSAGE: 43,
  CHANNEL_MUTE_USER: 44,

  // NIP-17 私信
  SEAL: 13,
  PRIVATE_DM: 14,
  GIFT_WRAP: 1059,

  // Zaps
  ZAP_REQUEST: 9734,
  ZAP_RECEIPT: 9735,

  // 长内容
  LONG_FORM_CONTENT: 30023,

  // NoStrCat 扩展
  OPCAT_REFERENCE: 30078,
  CONTENT_ANCHOR: 30079,
  OPCAT_ZAP_RECEIPT: 30080,
  IDENTITY_VERIFICATION: 30081,
  GROUP_REGISTRATION: 30082,
} as const

/**
 * OP_CAT 网络配置
 */
export const OPCAT_NETWORK = {
  // 主网
  MAINNET: {
    name: 'mainnet',
    rpcUrl: 'https://opcat.network/rpc',
    explorerUrl: 'https://explorer.opcat.network',
    electrsUrl: 'https://electrs.opcat.network',
  },
  // 测试网
  TESTNET: {
    name: 'testnet',
    rpcUrl: 'https://testnet.opcat.network/rpc',
    explorerUrl: 'https://testnet-explorer.opcat.network',
    electrsUrl: 'https://testnet-electrs.opcat.network',
  },
  // 本地开发
  LOCAL: {
    name: 'local',
    rpcUrl: 'http://localhost:8332',
    explorerUrl: 'http://localhost:8080',
    electrsUrl: 'http://localhost:3000',
  },
} as const

/**
 * 密钥派生路径
 */
export const KEY_DERIVATION_PATHS = {
  // Nostr 身份密钥（NIP-06）
  NOSTR_IDENTITY: "m/44'/1237'/0'/0/0",
  NOSTR_RECOVERY: "m/44'/1237'/0'/1/0",

  // OP_CAT 钱包密钥
  OPCAT_HOT: "m/44'/0'/0'/0/0",
  OPCAT_COLD: "m/44'/0'/0'/1/0",
} as const

/**
 * 消息类型
 */
export const MESSAGE_TYPES = {
  EVENT: 'EVENT',
  REQ: 'REQ',
  CLOSE: 'CLOSE',
  NOTICE: 'NOTICE',
  EOSE: 'EOSE',
  OK: 'OK',
  AUTH: 'AUTH',
  COUNT: 'COUNT',
} as const

/**
 * 订阅配置
 */
export const SUBSCRIPTION_CONFIG = {
  // 默认每次请求的事件数量
  DEFAULT_LIMIT: 100,
  // 最大每次请求的事件数量
  MAX_LIMIT: 5000,
  // 订阅超时（毫秒）
  TIMEOUT: 10000,
  // 重连延迟（毫秒）
  RECONNECT_DELAY: 3000,
  // 最大重连次数
  MAX_RECONNECT_ATTEMPTS: 5,
} as const

/**
 * 缓存配置
 */
export const CACHE_CONFIG = {
  // 事件缓存最大数量
  MAX_EVENTS: 10000,
  // 事件缓存过期时间（毫秒）
  EVENT_TTL: 7 * 24 * 60 * 60 * 1000, // 7 天
  // 用户资料缓存过期时间
  PROFILE_TTL: 24 * 60 * 60 * 1000, // 24 小时
  // 消息永不过期
  MESSAGE_TTL: Infinity,
} as const

/**
 * 支付配置
 */
export const PAYMENT_CONFIG = {
  // 最小 Zap 金额（satoshis）
  MIN_ZAP_AMOUNT: 21,
  // 默认 Zap 金额
  DEFAULT_ZAP_AMOUNTS: [21, 100, 500, 1000, 5000, 10000],
  // 交易费率（sats/vbyte）
  DEFAULT_FEE_RATE: 1,
  // 粉尘限制
  DUST_LIMIT: 546,
} as const

/**
 * 加密配置
 */
export const CRYPTO_CONFIG = {
  // 密钥长度（字节）
  KEY_LENGTH: 32,
  // IV 长度（字节）
  IV_LENGTH: 16,
  // 盐长度（字节）
  SALT_LENGTH: 16,
  // PBKDF2 迭代次数
  PBKDF2_ITERATIONS: 100000,
} as const

/**
 * 验证配置
 */
export const VALIDATION_CONFIG = {
  // 公钥长度
  PUBKEY_LENGTH: 64,
  // 私钥长度
  PRIVKEY_LENGTH: 64,
  // 事件 ID 长度
  EVENT_ID_LENGTH: 64,
  // 签名长度
  SIGNATURE_LENGTH: 128,
  // 最大内容长度
  MAX_CONTENT_LENGTH: 65535,
  // 最大标签数量
  MAX_TAGS: 2000,
} as const
