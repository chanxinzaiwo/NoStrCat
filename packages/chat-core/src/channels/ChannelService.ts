/**
 * 公开频道服务 (NIP-28)
 * https://github.com/nostr-protocol/nips/blob/master/28.md
 *
 * 频道消息不加密，任何人都可以读取
 */

import { NostrEvent } from '../crypto/nip59'
import { secp256k1 } from '@noble/curves/secp256k1'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex, hexToBytes } from '../crypto/nip44'

// NIP-28 事件类型
export const CHANNEL_KIND = {
  CHANNEL_CREATE: 40,         // 创建频道
  CHANNEL_METADATA: 41,       // 频道元数据
  CHANNEL_MESSAGE: 42,        // 频道消息
  CHANNEL_HIDE_MESSAGE: 43,   // 隐藏消息 (管理员)
  CHANNEL_MUTE_USER: 44,      // 禁言用户 (管理员)
}

// 频道
export interface Channel {
  id: string                  // 创建事件 ID
  name: string
  about?: string
  picture?: string
  creator: string
  relays: string[]            // 推荐的中继
  createdAt: number
}

// 频道消息
export interface ChannelMessage {
  id: string
  channelId: string
  content: string
  sender: string
  createdAt: number
  replyTo?: string            // 回复的消息 ID
  mentions?: string[]         // @提及的用户
}

// 中继连接接口
export interface RelayConnection {
  url: string
  publish(event: NostrEvent): Promise<boolean>
  subscribe(
    filters: object[],
    onEvent: (event: NostrEvent) => void,
    onEose?: () => void
  ): () => void
}

// 服务配置
export interface ChannelServiceConfig {
  privateKey: string
  relays: RelayConnection[]
  onChannelMessage?: (channelId: string, message: ChannelMessage) => void
}

/**
 * 计算事件哈希 (ID)
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
 * 公开频道服务
 */
export class ChannelService {
  private privateKey: Uint8Array
  private publicKey: string
  private relays: RelayConnection[]
  private channels: Map<string, Channel> = new Map()
  private messageCallbacks: Set<(channelId: string, message: ChannelMessage) => void> = new Set()

  constructor(config: ChannelServiceConfig) {
    this.privateKey = hexToBytes(config.privateKey)
    this.publicKey = bytesToHex(
      secp256k1.getPublicKey(this.privateKey, true).slice(1)
    )
    this.relays = config.relays

    if (config.onChannelMessage) {
      this.messageCallbacks.add(config.onChannelMessage)
    }
  }

  /**
   * 创建频道 (kind: 40)
   */
  async createChannel(params: {
    name: string
    about?: string
    picture?: string
  }): Promise<Channel> {
    const now = Math.floor(Date.now() / 1000)

    const metadata = {
      name: params.name,
      about: params.about,
      picture: params.picture
    }

    const event: NostrEvent = {
      kind: CHANNEL_KIND.CHANNEL_CREATE,
      pubkey: this.publicKey,
      created_at: now,
      tags: [],
      content: JSON.stringify(metadata)
    }

    const signedEvent = signEvent(event, this.privateKey)

    // 发布到所有中继
    await Promise.all(this.relays.map(r => r.publish(signedEvent)))

    const channel: Channel = {
      id: signedEvent.id!,
      name: params.name,
      about: params.about,
      picture: params.picture,
      creator: this.publicKey,
      relays: this.relays.map(r => r.url),
      createdAt: now
    }

    this.channels.set(channel.id, channel)
    return channel
  }

  /**
   * 更新频道元数据 (kind: 41)
   */
  async updateChannel(
    channelId: string,
    metadata: {
      name?: string
      about?: string
      picture?: string
    }
  ): Promise<void> {
    const channel = this.channels.get(channelId)
    if (!channel) {
      throw new Error(`Channel not found: ${channelId}`)
    }

    // 只有创建者可以更新
    if (channel.creator !== this.publicKey) {
      throw new Error('Only channel creator can update metadata')
    }

    const event: NostrEvent = {
      kind: CHANNEL_KIND.CHANNEL_METADATA,
      pubkey: this.publicKey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['e', channelId, this.relays[0]?.url || '']
      ],
      content: JSON.stringify(metadata)
    }

    const signedEvent = signEvent(event, this.privateKey)
    await Promise.all(this.relays.map(r => r.publish(signedEvent)))

    // 更新本地缓存
    if (metadata.name) channel.name = metadata.name
    if (metadata.about) channel.about = metadata.about
    if (metadata.picture) channel.picture = metadata.picture
  }

  /**
   * 发送频道消息 (kind: 42)
   */
  async sendMessage(
    channelId: string,
    content: string,
    options?: {
      replyTo?: string
      mentions?: string[]
    }
  ): Promise<ChannelMessage> {
    const now = Math.floor(Date.now() / 1000)
    const relayHint = this.relays[0]?.url || ''

    // 构建 tags
    const tags: string[][] = [
      ['e', channelId, relayHint, 'root'] // 频道根事件
    ]

    // 回复
    if (options?.replyTo) {
      tags.push(['e', options.replyTo, relayHint, 'reply'])
    }

    // 提及
    if (options?.mentions) {
      options.mentions.forEach(pubkey => {
        tags.push(['p', pubkey])
      })
    }

    const event: NostrEvent = {
      kind: CHANNEL_KIND.CHANNEL_MESSAGE,
      pubkey: this.publicKey,
      created_at: now,
      tags,
      content
    }

    const signedEvent = signEvent(event, this.privateKey)
    await Promise.all(this.relays.map(r => r.publish(signedEvent)))

    return {
      id: signedEvent.id!,
      channelId,
      content,
      sender: this.publicKey,
      createdAt: now,
      replyTo: options?.replyTo,
      mentions: options?.mentions
    }
  }

  /**
   * 隐藏消息 (kind: 43) - 管理员功能
   */
  async hideMessage(channelId: string, messageId: string, reason?: string): Promise<void> {
    const channel = this.channels.get(channelId)
    if (!channel || channel.creator !== this.publicKey) {
      throw new Error('Only channel creator can hide messages')
    }

    const event: NostrEvent = {
      kind: CHANNEL_KIND.CHANNEL_HIDE_MESSAGE,
      pubkey: this.publicKey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['e', messageId]
      ],
      content: JSON.stringify({ reason: reason || 'spam' })
    }

    const signedEvent = signEvent(event, this.privateKey)
    await Promise.all(this.relays.map(r => r.publish(signedEvent)))
  }

  /**
   * 禁言用户 (kind: 44) - 管理员功能
   */
  async muteUser(channelId: string, userPubkey: string, reason?: string): Promise<void> {
    const channel = this.channels.get(channelId)
    if (!channel || channel.creator !== this.publicKey) {
      throw new Error('Only channel creator can mute users')
    }

    const event: NostrEvent = {
      kind: CHANNEL_KIND.CHANNEL_MUTE_USER,
      pubkey: this.publicKey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['p', userPubkey]
      ],
      content: JSON.stringify({ reason: reason || 'spam' })
    }

    const signedEvent = signEvent(event, this.privateKey)
    await Promise.all(this.relays.map(r => r.publish(signedEvent)))
  }

  /**
   * 搜索频道
   */
  async searchChannels(query: string): Promise<Channel[]> {
    return new Promise((resolve) => {
      const channels: Channel[] = []
      const unsubs: (() => void)[] = []

      const filter = {
        kinds: [CHANNEL_KIND.CHANNEL_CREATE],
        limit: 100
      }

      for (const relay of this.relays) {
        const unsub = relay.subscribe(
          [filter],
          (event) => {
            try {
              const metadata = JSON.parse(event.content)

              // 简单的搜索匹配
              const name = metadata.name?.toLowerCase() || ''
              const about = metadata.about?.toLowerCase() || ''
              const q = query.toLowerCase()

              if (name.includes(q) || about.includes(q)) {
                const channel: Channel = {
                  id: event.id!,
                  name: metadata.name,
                  about: metadata.about,
                  picture: metadata.picture,
                  creator: event.pubkey,
                  relays: [relay.url],
                  createdAt: event.created_at
                }

                // 去重
                if (!channels.find(c => c.id === channel.id)) {
                  channels.push(channel)
                }
              }
            } catch (e) {
              // 忽略解析错误
            }
          },
          () => {
            // EOSE
          }
        )
        unsubs.push(unsub)
      }

      // 超时返回结果
      setTimeout(() => {
        unsubs.forEach(u => u())
        resolve(channels)
      }, 5000)
    })
  }

  /**
   * 订阅频道消息
   */
  subscribeChannel(channelId: string, since?: number): () => void {
    const unsubs: (() => void)[] = []

    const filter = {
      kinds: [CHANNEL_KIND.CHANNEL_MESSAGE],
      '#e': [channelId],
      since: since || Math.floor(Date.now() / 1000) - 24 * 60 * 60 // 默认1天
    }

    for (const relay of this.relays) {
      const unsub = relay.subscribe(
        [filter],
        (event) => this.handleChannelMessage(channelId, event)
      )
      unsubs.push(unsub)
    }

    return () => unsubs.forEach(u => u())
  }

  /**
   * 处理频道消息
   */
  private handleChannelMessage(channelId: string, event: NostrEvent): void {
    // 验证是频道消息
    if (event.kind !== CHANNEL_KIND.CHANNEL_MESSAGE) return

    // 检查是否属于该频道
    const rootTag = event.tags.find(t => t[0] === 'e' && t[3] === 'root')
    if (!rootTag || rootTag[1] !== channelId) return

    const message: ChannelMessage = {
      id: event.id!,
      channelId,
      content: event.content,
      sender: event.pubkey,
      createdAt: event.created_at,
      replyTo: event.tags.find(t => t[0] === 'e' && t[3] === 'reply')?.[1],
      mentions: event.tags.filter(t => t[0] === 'p').map(t => t[1])
    }

    this.notifyMessage(channelId, message)
  }

  /**
   * 获取频道历史消息
   */
  async getChannelHistory(
    channelId: string,
    options?: {
      limit?: number
      until?: number
    }
  ): Promise<ChannelMessage[]> {
    return new Promise((resolve) => {
      const messages: ChannelMessage[] = []
      const unsubs: (() => void)[] = []

      const filter = {
        kinds: [CHANNEL_KIND.CHANNEL_MESSAGE],
        '#e': [channelId],
        limit: options?.limit || 50,
        until: options?.until
      }

      for (const relay of this.relays) {
        const unsub = relay.subscribe(
          [filter],
          (event) => {
            const rootTag = event.tags.find(t => t[0] === 'e' && t[3] === 'root')
            if (!rootTag || rootTag[1] !== channelId) return

            const message: ChannelMessage = {
              id: event.id!,
              channelId,
              content: event.content,
              sender: event.pubkey,
              createdAt: event.created_at,
              replyTo: event.tags.find(t => t[0] === 'e' && t[3] === 'reply')?.[1],
              mentions: event.tags.filter(t => t[0] === 'p').map(t => t[1])
            }

            // 去重
            if (!messages.find(m => m.id === message.id)) {
              messages.push(message)
            }
          },
          () => {
            unsubs.forEach(u => u())
            messages.sort((a, b) => a.createdAt - b.createdAt)
            resolve(messages)
          }
        )
        unsubs.push(unsub)
      }

      // 超时
      setTimeout(() => {
        unsubs.forEach(u => u())
        messages.sort((a, b) => a.createdAt - b.createdAt)
        resolve(messages)
      }, 10000)
    })
  }

  /**
   * 加入频道 (保存到本地)
   */
  joinChannel(channel: Channel): void {
    this.channels.set(channel.id, channel)
  }

  /**
   * 离开频道
   */
  leaveChannel(channelId: string): void {
    this.channels.delete(channelId)
  }

  /**
   * 获取已加入的频道
   */
  getJoinedChannels(): Channel[] {
    return Array.from(this.channels.values())
  }

  /**
   * 添加消息回调
   */
  onMessage(callback: (channelId: string, message: ChannelMessage) => void): () => void {
    this.messageCallbacks.add(callback)
    return () => this.messageCallbacks.delete(callback)
  }

  private notifyMessage(channelId: string, message: ChannelMessage): void {
    this.messageCallbacks.forEach(cb => {
      try {
        cb(channelId, message)
      } catch (e) {
        console.error('Channel message callback error:', e)
      }
    })
  }
}

export default ChannelService
