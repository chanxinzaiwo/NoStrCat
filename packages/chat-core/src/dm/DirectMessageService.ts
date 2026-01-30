/**
 * 私聊服务 (NIP-17)
 * 基于 NIP-44 加密 + NIP-59 Gift Wrap
 */

import {
  NostrEvent,
  EVENT_KIND,
  wrapDirectMessage,
  unwrapDirectMessage,
  verifyEvent
} from '../crypto/nip59'
import { getConversationKey } from '../crypto/nip44'
import { secp256k1 } from '@noble/curves/secp256k1'
import { bytesToHex, hexToBytes } from '../crypto/nip44'

// 消息状态
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed'

// 私聊消息
export interface DirectMessage {
  id: string
  conversationId: string      // 会话ID (双方公钥排序后哈希)
  content: string
  sender: string              // 发送者公钥
  recipient: string           // 接收者公钥
  createdAt: number
  status: MessageStatus
  replyTo?: string            // 回复的消息ID
  // 链上存证
  opcatTxid?: string
  opcatBlock?: number
}

// 会话
export interface Conversation {
  id: string
  type: 'dm'
  peerPubkey: string          // 对方公钥
  peerName?: string           // 对方昵称
  peerPicture?: string        // 对方头像
  lastMessage?: DirectMessage
  unreadCount: number
  updatedAt: number
}

// 中继连接接口
export interface RelayConnection {
  publish(event: NostrEvent): Promise<boolean>
  subscribe(
    filters: object[],
    onEvent: (event: NostrEvent) => void,
    onEose?: () => void
  ): () => void
}

// 服务配置
export interface DirectMessageServiceConfig {
  privateKey: string          // 用户私钥 (hex)
  relays: RelayConnection[]   // 中继连接
  onMessage?: (message: DirectMessage) => void
  onStatusChange?: (messageId: string, status: MessageStatus) => void
}

/**
 * 私聊服务类
 */
export class DirectMessageService {
  private privateKey: Uint8Array
  private publicKey: string
  private relays: RelayConnection[]
  private subscriptions: Map<string, () => void> = new Map()
  private messageCallbacks: Set<(message: DirectMessage) => void> = new Set()
  private statusCallbacks: Set<(messageId: string, status: MessageStatus) => void> = new Set()

  constructor(config: DirectMessageServiceConfig) {
    this.privateKey = hexToBytes(config.privateKey)
    this.publicKey = bytesToHex(
      secp256k1.getPublicKey(this.privateKey, true).slice(1)
    )
    this.relays = config.relays

    if (config.onMessage) {
      this.messageCallbacks.add(config.onMessage)
    }
    if (config.onStatusChange) {
      this.statusCallbacks.add(config.onStatusChange)
    }
  }

  /**
   * 获取用户公钥
   */
  getPublicKey(): string {
    return this.publicKey
  }

  /**
   * 计算会话ID
   */
  getConversationId(peerPubkey: string): string {
    const sorted = [this.publicKey, peerPubkey].sort()
    const combined = sorted.join(':')
    // 简单哈希
    let hash = 0
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return `dm:${Math.abs(hash).toString(16)}`
  }

  /**
   * 发送私聊消息
   */
  async sendMessage(
    recipientPublicKey: string,
    content: string,
    options?: {
      replyTo?: string
      storeOnChain?: boolean
    }
  ): Promise<DirectMessage> {
    const now = Math.floor(Date.now() / 1000)
    const conversationId = this.getConversationId(recipientPublicKey)

    // 创建 DM 事件 (kind: 14)
    const dmEvent: NostrEvent = {
      kind: EVENT_KIND.PRIVATE_DM,
      pubkey: this.publicKey,
      created_at: now,
      tags: [
        ['p', recipientPublicKey],
        ...(options?.replyTo ? [['e', options.replyTo, '', 'reply']] : [])
      ],
      content: content
    }

    // Gift Wrap 封装
    const giftWrap = wrapDirectMessage(
      dmEvent,
      this.privateKey,
      recipientPublicKey
    )

    // 构建消息对象
    const message: DirectMessage = {
      id: giftWrap.id!,
      conversationId,
      content,
      sender: this.publicKey,
      recipient: recipientPublicKey,
      createdAt: now,
      status: 'sending',
      replyTo: options?.replyTo
    }

    // 发送到所有中继
    try {
      const results = await Promise.all(
        this.relays.map(relay => relay.publish(giftWrap))
      )

      const anySuccess = results.some(r => r)
      message.status = anySuccess ? 'sent' : 'failed'

      this.notifyStatusChange(message.id, message.status)
    } catch (error) {
      message.status = 'failed'
      this.notifyStatusChange(message.id, 'failed')
      throw error
    }

    return message
  }

  /**
   * 订阅私聊消息
   */
  subscribeMessages(since?: number): () => void {
    const filter = {
      kinds: [EVENT_KIND.GIFT_WRAP],
      '#p': [this.publicKey],
      since: since || Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60 // 默认7天
    }

    const unsubscribers: (() => void)[] = []

    for (const relay of this.relays) {
      const unsub = relay.subscribe(
        [filter],
        (event) => this.handleIncomingEvent(event)
      )
      unsubscribers.push(unsub)
    }

    // 返回取消订阅函数
    return () => {
      unsubscribers.forEach(unsub => unsub())
    }
  }

  /**
   * 处理收到的事件
   */
  private handleIncomingEvent(event: NostrEvent): void {
    try {
      // 验证事件
      if (event.kind !== EVENT_KIND.GIFT_WRAP) return
      if (!verifyEvent(event)) return

      // 检查是否是发给自己的
      const pTag = event.tags.find(t => t[0] === 'p')
      if (!pTag || pTag[1] !== this.publicKey) return

      // 解包 Gift Wrap
      const { dm, sender } = unwrapDirectMessage(event, this.privateKey)

      // 验证 DM 类型
      if (dm.kind !== EVENT_KIND.PRIVATE_DM) return

      // 构建消息对象
      const message: DirectMessage = {
        id: event.id!,
        conversationId: this.getConversationId(sender),
        content: dm.content,
        sender: sender,
        recipient: this.publicKey,
        createdAt: dm.created_at,
        status: 'delivered',
        replyTo: dm.tags.find(t => t[0] === 'e' && t[3] === 'reply')?.[1]
      }

      // 通知回调
      this.notifyMessage(message)
    } catch (error) {
      console.error('Failed to process incoming message:', error)
    }
  }

  /**
   * 添加消息回调
   */
  onMessage(callback: (message: DirectMessage) => void): () => void {
    this.messageCallbacks.add(callback)
    return () => this.messageCallbacks.delete(callback)
  }

  /**
   * 添加状态变化回调
   */
  onStatusChange(callback: (messageId: string, status: MessageStatus) => void): () => void {
    this.statusCallbacks.add(callback)
    return () => this.statusCallbacks.delete(callback)
  }

  /**
   * 通知消息回调
   */
  private notifyMessage(message: DirectMessage): void {
    this.messageCallbacks.forEach(cb => {
      try {
        cb(message)
      } catch (e) {
        console.error('Message callback error:', e)
      }
    })
  }

  /**
   * 通知状态变化
   */
  private notifyStatusChange(messageId: string, status: MessageStatus): void {
    this.statusCallbacks.forEach(cb => {
      try {
        cb(messageId, status)
      } catch (e) {
        console.error('Status callback error:', e)
      }
    })
  }

  /**
   * 获取与某用户的历史消息
   */
  async getMessageHistory(
    peerPubkey: string,
    options?: {
      limit?: number
      until?: number
    }
  ): Promise<DirectMessage[]> {
    const messages: DirectMessage[] = []

    // 订阅历史消息
    const filter = {
      kinds: [EVENT_KIND.GIFT_WRAP],
      '#p': [this.publicKey],
      limit: options?.limit || 50,
      until: options?.until
    }

    return new Promise((resolve) => {
      const unsubs: (() => void)[] = []

      for (const relay of this.relays) {
        const unsub = relay.subscribe(
          [filter],
          (event) => {
            try {
              const { dm, sender } = unwrapDirectMessage(event, this.privateKey)

              // 只处理与目标用户的消息
              if (sender !== peerPubkey && dm.pubkey !== peerPubkey) return

              const message: DirectMessage = {
                id: event.id!,
                conversationId: this.getConversationId(peerPubkey),
                content: dm.content,
                sender: sender,
                recipient: this.publicKey,
                createdAt: dm.created_at,
                status: 'delivered'
              }

              messages.push(message)
            } catch (e) {
              // 忽略解密失败的消息
            }
          },
          () => {
            // EOSE - 历史消息加载完成
            unsubs.forEach(u => u())
            // 按时间排序
            messages.sort((a, b) => a.createdAt - b.createdAt)
            resolve(messages)
          }
        )
        unsubs.push(unsub)
      }

      // 超时处理
      setTimeout(() => {
        unsubs.forEach(u => u())
        messages.sort((a, b) => a.createdAt - b.createdAt)
        resolve(messages)
      }, 10000)
    })
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    this.subscriptions.forEach(unsub => unsub())
    this.subscriptions.clear()
    this.messageCallbacks.clear()
    this.statusCallbacks.clear()
  }
}

export default DirectMessageService
