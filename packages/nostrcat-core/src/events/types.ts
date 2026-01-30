/**
 * Nostr 事件类型定义
 *
 * 遵循 Nostr 协议规范（NIP-01 等）
 */

import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '../utils/encoding'

/**
 * 事件类型枚举
 * 参考：https://github.com/nostr-protocol/nips
 */
export enum EventKind {
  // 基础事件
  Metadata = 0,           // 用户元数据（NIP-01）
  TextNote = 1,           // 文本帖子（NIP-01）
  RecommendRelay = 2,     // 推荐中继（已弃用）
  Contacts = 3,           // 联系人列表（NIP-02）
  EncryptedDM = 4,        // 加密私信（NIP-04，已弃用）
  EventDeletion = 5,      // 删除事件（NIP-09）
  Repost = 6,             // 转发（NIP-18）
  Reaction = 7,           // 反应/点赞（NIP-25）

  // 徽章系统
  BadgeAward = 8,         // 徽章授予
  Badge = 30009,          // 徽章定义

  // 长文章
  LongFormContent = 30023, // 长文章（NIP-23）

  // 加密消息
  Seal = 13,              // 密封事件（NIP-59）
  GiftWrap = 1059,        // 礼物包装（NIP-59）
  PrivateDM = 14,         // 私信（NIP-17）

  // Zaps
  ZapRequest = 9734,      // Zap 请求（NIP-57）
  ZapReceipt = 9735,      // Zap 收据（NIP-57）

  // NoStrCat 扩展
  OPCATReference = 30078, // OP_CAT 链上引用
  ContentAnchor = 30079,  // 内容锚点
  OPCATZapReceipt = 30080,// OP_CAT Zap 收据
  IdentityVerification = 30081, // 身份验证
  GroupRegistration = 30082,    // 群组注册
}

/**
 * 未签名事件（用于构建）
 */
export interface UnsignedEvent {
  kind: number
  content: string
  tags: string[][]
  created_at: number
  pubkey?: string
}

/**
 * 签名后的完整事件
 */
export interface NostrEvent extends UnsignedEvent {
  id: string      // 事件哈希
  pubkey: string  // 发布者公钥
  sig: string     // 签名
}

/**
 * 事件过滤器（用于订阅）
 */
export interface EventFilter {
  ids?: string[]
  authors?: string[]
  kinds?: number[]
  since?: number
  until?: number
  limit?: number
  '#e'?: string[]  // 引用的事件
  '#p'?: string[]  // 提到的公钥
  '#t'?: string[]  // 标签
  [key: string]: string[] | number[] | number | undefined
}

/**
 * 创建未签名事件
 */
export function createEvent(
  kind: EventKind | number,
  content: string,
  tags: string[][] = []
): UnsignedEvent {
  return {
    kind,
    content,
    tags,
    created_at: Math.floor(Date.now() / 1000),
  }
}

/**
 * 序列化事件（用于计算哈希）
 * 按照 NIP-01 规范：[0, pubkey, created_at, kind, tags, content]
 */
export function serializeEvent(event: UnsignedEvent & { pubkey: string }): string {
  return JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ])
}

/**
 * 计算事件哈希
 */
export function getEventHash(event: UnsignedEvent & { pubkey: string }): string {
  const serialized = serializeEvent(event)
  const hashBytes = sha256(new TextEncoder().encode(serialized))
  return bytesToHex(hashBytes)
}

/**
 * 验证事件格式
 */
export function validateEvent(event: NostrEvent): boolean {
  // 检查必需字段
  if (!event.id || !event.pubkey || !event.sig) {
    return false
  }

  // 检查 ID 格式（64 位十六进制）
  if (!/^[0-9a-f]{64}$/i.test(event.id)) {
    return false
  }

  // 检查公钥格式
  if (!/^[0-9a-f]{64}$/i.test(event.pubkey)) {
    return false
  }

  // 检查签名格式（128 位十六进制）
  if (!/^[0-9a-f]{128}$/i.test(event.sig)) {
    return false
  }

  // 验证哈希
  const expectedHash = getEventHash(event)
  if (event.id !== expectedHash) {
    return false
  }

  // 验证时间戳（不能是未来太远或过去太久）
  const now = Math.floor(Date.now() / 1000)
  const oneYearAgo = now - 365 * 24 * 60 * 60
  const oneHourFromNow = now + 60 * 60

  if (event.created_at < oneYearAgo || event.created_at > oneHourFromNow) {
    return false
  }

  return true
}

/**
 * 从 JSON 解析事件
 */
export function parseEvent(json: string): NostrEvent | null {
  try {
    const event = JSON.parse(json) as NostrEvent
    if (validateEvent(event)) {
      return event
    }
    return null
  } catch {
    return null
  }
}

/**
 * 事件标签辅助函数
 */
export const EventTags = {
  // 获取所有指定类型的标签
  getAll(event: NostrEvent, tagName: string): string[][] {
    return event.tags.filter(tag => tag[0] === tagName)
  },

  // 获取第一个指定类型的标签值
  getFirst(event: NostrEvent, tagName: string): string | undefined {
    const tag = event.tags.find(t => t[0] === tagName)
    return tag ? tag[1] : undefined
  },

  // 获取所有提到的公钥
  getMentionedPubkeys(event: NostrEvent): string[] {
    return this.getAll(event, 'p').map(tag => tag[1])
  },

  // 获取所有引用的事件
  getReferencedEvents(event: NostrEvent): string[] {
    return this.getAll(event, 'e').map(tag => tag[1])
  },

  // 获取所有标签
  getHashtags(event: NostrEvent): string[] {
    return this.getAll(event, 't').map(tag => tag[1])
  },
}
