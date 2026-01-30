/**
 * 私聊模块
 *
 * 实现 NIP-17 端到端加密私信
 * 提供发送、接收、解密私信功能
 */

import { NostrEvent, EventKind, createEvent, getEventHash } from '../../events/types'
import { encryptDM, decryptDM, encryptNip17, decryptNip17 } from '../../crypto/encryption'
import { signEvent, KeyPair } from '../../crypto/keys'
import { NostrConnection } from '../../client/NostrConnection'

/**
 * 私信消息
 */
export interface DirectMessage {
  id: string
  senderId: string
  recipientId: string
  content: string
  createdAt: number
  isRead: boolean
  isDecrypted: boolean
  rawEvent?: NostrEvent
}

/**
 * 会话
 */
export interface Conversation {
  id: string
  participantId: string
  participantName?: string
  participantPicture?: string
  lastMessage?: DirectMessage
  unreadCount: number
  updatedAt: number
}

/**
 * 私聊管理类
 */
export class PrivateChat {
  private connection: NostrConnection
  private keyPair: KeyPair
  private conversations: Map<string, Conversation> = new Map()
  private messages: Map<string, DirectMessage[]> = new Map()
  private subscriptionId: string | null = null
  private onMessageCallback?: (message: DirectMessage) => void

  constructor(connection: NostrConnection, keyPair: KeyPair) {
    this.connection = connection
    this.keyPair = keyPair
  }

  /**
   * 发送私信 (NIP-04)
   * @param recipientPubkey 接收者公钥
   * @param content 消息内容
   * @returns 发送的事件
   */
  async sendMessage(recipientPubkey: string, content: string): Promise<NostrEvent> {
    // 加密消息
    const encryptedContent = await encryptDM(
      content,
      this.keyPair.privateKey,
      recipientPubkey
    )

    // 创建事件
    const unsignedEvent = {
      ...createEvent(EventKind.EncryptedDM, encryptedContent, [
        ['p', recipientPubkey],
      ]),
      pubkey: this.keyPair.publicKey,
    }

    // 计算哈希并签名
    const id = getEventHash(unsignedEvent)
    const sig = await signEvent(id, this.keyPair.privateKey)

    const event: NostrEvent = {
      ...unsignedEvent,
      id,
      sig,
    }

    // 发布到中继
    await this.connection.publish(event)

    // 保存到本地
    const message: DirectMessage = {
      id: event.id,
      senderId: this.keyPair.publicKey,
      recipientId: recipientPubkey,
      content,
      createdAt: event.created_at,
      isRead: true,
      isDecrypted: true,
      rawEvent: event,
    }

    this.addMessageToConversation(recipientPubkey, message)

    return event
  }

  /**
   * 发送 NIP-17 私信（更安全）
   * @param recipientPubkey 接收者公钥
   * @param content 消息内容
   */
  async sendSecureMessage(recipientPubkey: string, content: string): Promise<string> {
    const wrappedEvent = await encryptNip17(
      content,
      this.keyPair.privateKey,
      recipientPubkey
    )

    // 解析并发布
    const event = JSON.parse(wrappedEvent)

    // 签名礼物包装事件
    const unsignedEvent = {
      ...event,
      pubkey: this.keyPair.publicKey,
    }
    const id = getEventHash(unsignedEvent)
    const sig = await signEvent(id, this.keyPair.privateKey)

    const signedEvent: NostrEvent = {
      ...unsignedEvent,
      id,
      sig,
    }

    await this.connection.publish(signedEvent)

    return signedEvent.id
  }

  /**
   * 订阅私信
   * @param onMessage 收到新消息的回调
   */
  subscribe(onMessage: (message: DirectMessage) => void): void {
    this.onMessageCallback = onMessage

    // 订阅发给我的消息
    this.subscriptionId = this.connection.subscribe(
      {
        kinds: [EventKind.EncryptedDM, EventKind.GiftWrap],
        '#p': [this.keyPair.publicKey],
      },
      async (event) => {
        await this.handleIncomingMessage(event)
      }
    )

    // 同时订阅我发送的消息（用于多设备同步）
    this.connection.subscribe(
      {
        kinds: [EventKind.EncryptedDM],
        authors: [this.keyPair.publicKey],
      },
      async (event) => {
        await this.handleOutgoingMessage(event)
      }
    )
  }

  /**
   * 取消订阅
   */
  unsubscribe(): void {
    if (this.subscriptionId) {
      this.connection.unsubscribe(this.subscriptionId)
      this.subscriptionId = null
    }
  }

  /**
   * 处理收到的消息
   */
  private async handleIncomingMessage(event: NostrEvent): Promise<void> {
    try {
      let content: string
      let senderId: string

      if (event.kind === EventKind.GiftWrap) {
        // NIP-17 消息
        content = await decryptNip17(
          JSON.stringify(event),
          this.keyPair.privateKey
        )
        senderId = event.pubkey
      } else {
        // NIP-04 消息
        content = await decryptDM(
          event.content,
          this.keyPair.privateKey,
          event.pubkey
        )
        senderId = event.pubkey
      }

      const message: DirectMessage = {
        id: event.id,
        senderId,
        recipientId: this.keyPair.publicKey,
        content,
        createdAt: event.created_at,
        isRead: false,
        isDecrypted: true,
        rawEvent: event,
      }

      this.addMessageToConversation(senderId, message)

      if (this.onMessageCallback) {
        this.onMessageCallback(message)
      }
    } catch (error) {
      console.error('Failed to decrypt message:', error)
    }
  }

  /**
   * 处理发出的消息（多设备同步）
   */
  private async handleOutgoingMessage(event: NostrEvent): Promise<void> {
    // 获取接收者
    const recipientTag = event.tags.find(t => t[0] === 'p')
    if (!recipientTag) return

    const recipientPubkey = recipientTag[1]

    try {
      const content = await decryptDM(
        event.content,
        this.keyPair.privateKey,
        recipientPubkey
      )

      const message: DirectMessage = {
        id: event.id,
        senderId: this.keyPair.publicKey,
        recipientId: recipientPubkey,
        content,
        createdAt: event.created_at,
        isRead: true,
        isDecrypted: true,
        rawEvent: event,
      }

      this.addMessageToConversation(recipientPubkey, message)
    } catch (error) {
      console.error('Failed to decrypt outgoing message:', error)
    }
  }

  /**
   * 添加消息到会话
   */
  private addMessageToConversation(participantId: string, message: DirectMessage): void {
    // 更新会话
    let conversation = this.conversations.get(participantId)
    if (!conversation) {
      conversation = {
        id: participantId,
        participantId,
        unreadCount: 0,
        updatedAt: message.createdAt,
      }
      this.conversations.set(participantId, conversation)
    }

    conversation.lastMessage = message
    conversation.updatedAt = message.createdAt
    if (!message.isRead && message.senderId !== this.keyPair.publicKey) {
      conversation.unreadCount++
    }

    // 保存消息
    let conversationMessages = this.messages.get(participantId)
    if (!conversationMessages) {
      conversationMessages = []
      this.messages.set(participantId, conversationMessages)
    }

    // 避免重复
    if (!conversationMessages.find(m => m.id === message.id)) {
      conversationMessages.push(message)
      conversationMessages.sort((a, b) => a.createdAt - b.createdAt)
    }
  }

  /**
   * 获取所有会话
   */
  getConversations(): Conversation[] {
    return Array.from(this.conversations.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /**
   * 获取会话消息
   */
  getMessages(participantId: string): DirectMessage[] {
    return this.messages.get(participantId) || []
  }

  /**
   * 标记会话已读
   */
  markAsRead(participantId: string): void {
    const conversation = this.conversations.get(participantId)
    if (conversation) {
      conversation.unreadCount = 0
    }

    const messages = this.messages.get(participantId)
    if (messages) {
      messages.forEach(m => {
        m.isRead = true
      })
    }
  }

  /**
   * 获取历史消息
   */
  async fetchHistory(participantId: string, limit = 50): Promise<DirectMessage[]> {
    const events = await this.connection.fetch({
      kinds: [EventKind.EncryptedDM],
      authors: [this.keyPair.publicKey, participantId],
      '#p': [this.keyPair.publicKey, participantId],
      limit,
    })

    for (const event of events) {
      if (event.pubkey === this.keyPair.publicKey) {
        await this.handleOutgoingMessage(event)
      } else {
        await this.handleIncomingMessage(event)
      }
    }

    return this.getMessages(participantId)
  }

  /**
   * 获取未读消息总数
   */
  getUnreadCount(): number {
    return Array.from(this.conversations.values())
      .reduce((sum, conv) => sum + conv.unreadCount, 0)
  }
}
