/**
 * NIP-59: Gift Wrap
 * https://github.com/nostr-protocol/nips/blob/master/59.md
 *
 * Gift Wrap 提供额外的隐私层：
 * 1. 隐藏真实发送者 (使用随机密钥签名)
 * 2. 隐藏真实时间戳 (随机化)
 * 3. 加密内容对中继不可见
 */

import { getConversationKey, encrypt, decrypt } from './nip44'
import { bytesToHex, hexToBytes } from './nip44'
import { secp256k1 } from '@noble/curves/secp256k1'
import { sha256 } from '@noble/hashes/sha256'
import { randomBytes } from '@noble/hashes/utils'

// Nostr 事件类型
export interface NostrEvent {
  id?: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig?: string
}

// 事件类型常量
export const EVENT_KIND = {
  SEAL: 13,           // 密封事件
  GIFT_WRAP: 1059,    // 礼物包装
  PRIVATE_DM: 14,     // NIP-17 私聊
}

/**
 * 计算事件 ID
 */
function getEventHash(event: NostrEvent): string {
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content
  ])
  const hash = sha256(new TextEncoder().encode(serialized))
  return bytesToHex(hash)
}

/**
 * 签名事件
 */
function signEvent(event: NostrEvent, privateKey: Uint8Array): NostrEvent {
  const id = getEventHash(event)
  const sig = secp256k1.sign(hexToBytes(id), privateKey)

  return {
    ...event,
    id,
    sig: bytesToHex(sig.toCompactRawBytes())
  }
}

/**
 * 验证事件签名
 */
export function verifyEvent(event: NostrEvent): boolean {
  if (!event.id || !event.sig) return false

  const expectedId = getEventHash(event)
  if (event.id !== expectedId) return false

  try {
    return secp256k1.verify(
      hexToBytes(event.sig),
      hexToBytes(event.id),
      hexToBytes(event.pubkey)
    )
  } catch {
    return false
  }
}

/**
 * 生成随机密钥对
 */
function generateRandomKeys(): { privateKey: Uint8Array; publicKey: string } {
  const privateKey = randomBytes(32)
  const publicKey = secp256k1.getPublicKey(privateKey, true)
  return {
    privateKey,
    publicKey: bytesToHex(publicKey.slice(1)) // 去掉前缀
  }
}

/**
 * 随机化时间戳
 * 在 ±2天范围内随机偏移，增加隐私性
 */
function randomizeTimestamp(baseTime?: number): number {
  const now = baseTime || Math.floor(Date.now() / 1000)
  const twoDays = 2 * 24 * 60 * 60
  const randomOffset = Math.floor(Math.random() * twoDays * 2) - twoDays
  return now + randomOffset
}

/**
 * 创建 Seal (密封事件)
 * kind: 13
 */
export function createSeal(
  rumor: NostrEvent,
  senderPrivateKey: Uint8Array,
  recipientPublicKey: string
): NostrEvent {
  const senderPublicKey = bytesToHex(
    secp256k1.getPublicKey(senderPrivateKey, true).slice(1)
  )

  // 计算会话密钥
  const conversationKey = getConversationKey(senderPrivateKey, recipientPublicKey)

  // 加密 rumor (不含 id 和 sig 的事件)
  const rumorJson = JSON.stringify(rumor)
  const encryptedContent = encrypt(rumorJson, conversationKey)

  // 创建 seal 事件
  const seal: NostrEvent = {
    kind: EVENT_KIND.SEAL,
    pubkey: senderPublicKey,
    created_at: randomizeTimestamp(),
    tags: [],
    content: encryptedContent
  }

  return signEvent(seal, senderPrivateKey)
}

/**
 * 解开 Seal
 */
export function unwrapSeal(
  seal: NostrEvent,
  recipientPrivateKey: Uint8Array
): NostrEvent {
  if (seal.kind !== EVENT_KIND.SEAL) {
    throw new Error(`Invalid seal kind: ${seal.kind}`)
  }

  // 验证签名
  if (!verifyEvent(seal)) {
    throw new Error('Invalid seal signature')
  }

  // 计算会话密钥
  const conversationKey = getConversationKey(recipientPrivateKey, seal.pubkey)

  // 解密内容
  const rumorJson = decrypt(seal.content, conversationKey)
  return JSON.parse(rumorJson)
}

/**
 * 创建 Gift Wrap
 * kind: 1059
 */
export function createGiftWrap(
  seal: NostrEvent,
  recipientPublicKey: string
): NostrEvent {
  // 生成随机密钥对 (隐藏真实发送者)
  const { privateKey: randomPrivateKey, publicKey: randomPublicKey } = generateRandomKeys()

  // 计算会话密钥 (随机密钥 -> 接收者)
  const conversationKey = getConversationKey(randomPrivateKey, recipientPublicKey)

  // 加密 seal
  const encryptedContent = encrypt(JSON.stringify(seal), conversationKey)

  // 创建 gift wrap 事件
  const giftWrap: NostrEvent = {
    kind: EVENT_KIND.GIFT_WRAP,
    pubkey: randomPublicKey,
    created_at: randomizeTimestamp(),
    tags: [['p', recipientPublicKey]], // 接收者标签
    content: encryptedContent
  }

  return signEvent(giftWrap, randomPrivateKey)
}

/**
 * 解开 Gift Wrap
 */
export function unwrapGiftWrap(
  giftWrap: NostrEvent,
  recipientPrivateKey: Uint8Array
): NostrEvent {
  if (giftWrap.kind !== EVENT_KIND.GIFT_WRAP) {
    throw new Error(`Invalid gift wrap kind: ${giftWrap.kind}`)
  }

  // 注意: Gift Wrap 的签名使用随机密钥，所以可以验证但无法识别发送者
  if (!verifyEvent(giftWrap)) {
    throw new Error('Invalid gift wrap signature')
  }

  // 计算会话密钥
  const conversationKey = getConversationKey(recipientPrivateKey, giftWrap.pubkey)

  // 解密得到 seal
  const sealJson = decrypt(giftWrap.content, conversationKey)
  const seal = JSON.parse(sealJson) as NostrEvent

  // 解开 seal 得到原始消息
  return unwrapSeal(seal, recipientPrivateKey)
}

/**
 * 完整的 Gift Wrap 封装流程
 * DM Event -> Seal -> Gift Wrap
 */
export function wrapDirectMessage(
  dmEvent: NostrEvent,
  senderPrivateKey: Uint8Array,
  recipientPublicKey: string
): NostrEvent {
  // 1. 创建 Seal (用发送者私钥加密)
  const seal = createSeal(dmEvent, senderPrivateKey, recipientPublicKey)

  // 2. 创建 Gift Wrap (用随机密钥签名)
  const giftWrap = createGiftWrap(seal, recipientPublicKey)

  return giftWrap
}

/**
 * 完整的 Gift Wrap 解包流程
 * Gift Wrap -> Seal -> DM Event
 */
export function unwrapDirectMessage(
  giftWrap: NostrEvent,
  recipientPrivateKey: Uint8Array
): { dm: NostrEvent; sender: string } {
  // 1. 解开 Gift Wrap 得到 Seal
  const conversationKey = getConversationKey(recipientPrivateKey, giftWrap.pubkey)
  const sealJson = decrypt(giftWrap.content, conversationKey)
  const seal = JSON.parse(sealJson) as NostrEvent

  // 2. 验证 Seal 签名
  if (!verifyEvent(seal)) {
    throw new Error('Invalid seal signature')
  }

  // 3. 解开 Seal 得到 DM
  const dm = unwrapSeal(seal, recipientPrivateKey)

  return {
    dm,
    sender: seal.pubkey // 真实发送者
  }
}

export { getConversationKey, encrypt, decrypt }
