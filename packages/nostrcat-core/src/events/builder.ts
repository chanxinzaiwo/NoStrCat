/**
 * 事件构建器
 *
 * 提供链式 API 构建 Nostr 事件
 */

import { NostrEvent, EventKind, createEvent, getEventHash } from './types'
import { signEvent, KeyPair } from '../crypto/keys'

/**
 * 事件构建器类
 */
export class EventBuilder {
  private kind: EventKind | number = EventKind.TextNote
  private content = ''
  private tags: string[][] = []
  private keyPair: KeyPair | null = null
  private createdAt?: number

  /**
   * 设置事件类型
   */
  setKind(kind: EventKind | number): this {
    this.kind = kind
    return this
  }

  /**
   * 设置事件内容
   */
  setContent(content: string): this {
    this.content = content
    return this
  }

  /**
   * 添加标签
   */
  addTag(tag: string[]): this {
    this.tags.push(tag)
    return this
  }

  /**
   * 添加多个标签
   */
  addTags(tags: string[][]): this {
    this.tags.push(...tags)
    return this
  }

  /**
   * 添加 'p' 标签（引用公钥）
   */
  addPubkeyTag(pubkey: string, relayUrl?: string, petname?: string): this {
    const tag = ['p', pubkey]
    if (relayUrl) tag.push(relayUrl)
    if (petname) tag.push(petname)
    this.tags.push(tag)
    return this
  }

  /**
   * 添加 'e' 标签（引用事件）
   */
  addEventTag(eventId: string, relayUrl?: string, marker?: 'reply' | 'root' | 'mention'): this {
    const tag = ['e', eventId]
    if (relayUrl) tag.push(relayUrl)
    else tag.push('')
    if (marker) tag.push(marker)
    this.tags.push(tag)
    return this
  }

  /**
   * 添加话题标签
   */
  addHashtag(hashtag: string): this {
    this.tags.push(['t', hashtag.toLowerCase().replace(/^#/, '')])
    return this
  }

  /**
   * 添加 'd' 标签（可替换事件标识符）
   */
  addIdentifier(identifier: string): this {
    this.tags.push(['d', identifier])
    return this
  }

  /**
   * 添加链上引用
   */
  addOPCATReference(txid: string, type?: string): this {
    const tag = ['opcat', txid]
    if (type) {
      this.tags.push(['opcat-type', type])
    }
    this.tags.push(tag)
    return this
  }

  /**
   * 设置密钥对
   */
  setKeyPair(keyPair: KeyPair): this {
    this.keyPair = keyPair
    return this
  }

  /**
   * 设置创建时间
   */
  setCreatedAt(timestamp: number): this {
    this.createdAt = timestamp
    return this
  }

  /**
   * 构建文本帖子
   */
  textNote(content: string): this {
    return this.setKind(EventKind.TextNote).setContent(content)
  }

  /**
   * 构建回复
   */
  reply(content: string, replyToId: string, replyToPubkey: string): this {
    return this
      .textNote(content)
      .addEventTag(replyToId, '', 'reply')
      .addPubkeyTag(replyToPubkey)
  }

  /**
   * 构建转发
   */
  repost(originalEvent: NostrEvent): this {
    return this
      .setKind(EventKind.Repost)
      .setContent(JSON.stringify(originalEvent))
      .addEventTag(originalEvent.id)
      .addPubkeyTag(originalEvent.pubkey)
  }

  /**
   * 构建点赞
   */
  like(eventId: string, eventPubkey: string): this {
    return this
      .setKind(EventKind.Reaction)
      .setContent('+')
      .addEventTag(eventId)
      .addPubkeyTag(eventPubkey)
  }

  /**
   * 构建踩
   */
  dislike(eventId: string, eventPubkey: string): this {
    return this
      .setKind(EventKind.Reaction)
      .setContent('-')
      .addEventTag(eventId)
      .addPubkeyTag(eventPubkey)
  }

  /**
   * 构建元数据更新
   */
  metadata(profile: {
    name?: string
    about?: string
    picture?: string
    banner?: string
    nip05?: string
    lud16?: string
    website?: string
  }): this {
    return this
      .setKind(EventKind.Metadata)
      .setContent(JSON.stringify(profile))
  }

  /**
   * 构建联系人列表
   */
  contacts(pubkeys: string[]): this {
    const builder = this.setKind(EventKind.Contacts).setContent('')
    for (const pk of pubkeys) {
      builder.addPubkeyTag(pk)
    }
    return builder
  }

  /**
   * 构建删除事件
   */
  delete(eventIds: string[], reason?: string): this {
    const builder = this
      .setKind(EventKind.EventDeletion)
      .setContent(reason || '')

    for (const id of eventIds) {
      builder.addEventTag(id)
    }

    return builder
  }

  /**
   * 构建加密私信
   */
  encryptedDM(encryptedContent: string, recipientPubkey: string): this {
    return this
      .setKind(EventKind.EncryptedDM)
      .setContent(encryptedContent)
      .addPubkeyTag(recipientPubkey)
  }

  /**
   * 构建频道创建
   */
  channelCreation(metadata: {
    name: string
    about?: string
    picture?: string
  }): this {
    return this
      .setKind(40)
      .setContent(JSON.stringify(metadata))
  }

  /**
   * 构建频道消息
   */
  channelMessage(content: string, channelId: string): this {
    return this
      .setKind(42)
      .setContent(content)
      .addEventTag(channelId, '', 'root')
  }

  /**
   * 构建 OP_CAT Zap 收据
   */
  opcatZapReceipt(params: {
    recipient: string
    amount: bigint
    txid: string
    eventId?: string
    memo?: string
  }): this {
    const builder = this
      .setKind(30080)
      .setContent(params.memo || '')
      .addPubkeyTag(params.recipient)
      .addTag(['amount', params.amount.toString()])
      .addOPCATReference(params.txid, 'zap')

    if (params.eventId) {
      builder.addEventTag(params.eventId)
    }

    return builder
  }

  /**
   * 构建内容锚点
   */
  contentAnchor(params: {
    eventId: string
    anchorHash: string
    txid: string
  }): this {
    return this
      .setKind(30079)
      .setContent('')
      .addEventTag(params.eventId)
      .addTag(['anchor-hash', params.anchorHash])
      .addOPCATReference(params.txid, 'anchor')
  }

  /**
   * 构建未签名事件
   */
  buildUnsigned(): {
    kind: number
    content: string
    tags: string[][]
    created_at: number
    pubkey: string
  } {
    if (!this.keyPair) {
      throw new Error('KeyPair not set. Call setKeyPair() first.')
    }

    return {
      ...createEvent(this.kind, this.content, this.tags),
      created_at: this.createdAt || Math.floor(Date.now() / 1000),
      pubkey: this.keyPair.publicKey,
    }
  }

  /**
   * 构建并签名事件
   */
  async build(): Promise<NostrEvent> {
    if (!this.keyPair) {
      throw new Error('KeyPair not set. Call setKeyPair() first.')
    }

    const unsignedEvent = this.buildUnsigned()
    const id = getEventHash(unsignedEvent)
    const sig = await signEvent(id, this.keyPair.privateKey)

    return {
      ...unsignedEvent,
      id,
      sig,
    }
  }

  /**
   * 重置构建器
   */
  reset(): this {
    this.kind = EventKind.TextNote
    this.content = ''
    this.tags = []
    this.createdAt = undefined
    return this
  }

  /**
   * 创建新的构建器实例
   */
  static create(keyPair?: KeyPair): EventBuilder {
    const builder = new EventBuilder()
    if (keyPair) {
      builder.setKeyPair(keyPair)
    }
    return builder
  }
}
