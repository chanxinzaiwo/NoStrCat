/**
 * NoStrCat 主客户端
 *
 * 统一管理 Nostr 连接和 OP_CAT Layer 交互
 * 提供私聊、群聊、Feed、钱包等功能模块
 */

import { NostrConnection, RelayConfig } from './NostrConnection'
import { OPCATConnection, OPCATConfig } from './OPCATConnection'
import { KeyPair, generateKeyPair, derivePublicKey } from '../crypto/keys'
import { NostrEvent, EventFilter, EventKind, createEvent, getEventHash } from '../events/types'
import { signEvent } from '../crypto/keys'
import { DEFAULT_RELAYS, OPCAT_NETWORK } from '../utils/constants'
import { PrivateChat } from '../modules/chat/PrivateChat'
import { GroupChat } from '../modules/chat/GroupChat'
import { Timeline } from '../modules/feed/Timeline'
import { ZapManager } from '../modules/payments/ZapManager'
import { Wallet, WalletConfig } from '../wallet/Wallet'

/**
 * 客户端配置
 */
export interface NostrCatClientConfig {
  // Nostr 中继配置
  relays?: RelayConfig[]
  // OP_CAT 网络配置
  opcatNetwork?: 'mainnet' | 'testnet' | 'local'
  // 自定义 OP_CAT 配置
  opcatConfig?: OPCATConfig
  // 是否自动连接
  autoConnect?: boolean
  // 调试模式
  debug?: boolean
}

/**
 * 用户资料
 */
export interface UserProfile {
  name?: string
  about?: string
  picture?: string
  banner?: string
  nip05?: string
  lud16?: string
  website?: string
  opcatAddress?: string
}

/**
 * NoStrCat 主客户端类
 */
export class NostrCatClient {
  private nostrConnection: NostrConnection
  private opcatConnection: OPCATConnection
  private keyPair: KeyPair | null = null
  private config: NostrCatClientConfig
  private eventListeners: Map<string, Set<(event: NostrEvent) => void>> = new Map()
  private debug: boolean

  // 功能模块
  private _privateChat: PrivateChat | null = null
  private _groupChat: GroupChat | null = null
  private _timeline: Timeline | null = null
  private _zapManager: ZapManager | null = null
  private _wallet: Wallet | null = null

  constructor(config: NostrCatClientConfig = {}) {
    this.config = config
    this.debug = config.debug || false

    // 初始化 Nostr 连接
    const relays = config.relays || DEFAULT_RELAYS.map(url => ({ url }))
    this.nostrConnection = new NostrConnection(relays)

    // 初始化 OP_CAT 连接
    const opcatConfig = config.opcatConfig ||
      OPCAT_NETWORK[config.opcatNetwork?.toUpperCase() as keyof typeof OPCAT_NETWORK] ||
      OPCAT_NETWORK.TESTNET
    this.opcatConnection = new OPCATConnection(opcatConfig)

    // 自动连接
    if (config.autoConnect !== false) {
      this.connect()
    }
  }

  /**
   * 连接到所有服务
   */
  async connect(): Promise<void> {
    this.log('Connecting to services...')
    await Promise.all([
      this.nostrConnection.connect(),
      this.opcatConnection.connect(),
    ])
    this.log('Connected to all services')
  }

  /**
   * 断开所有连接
   */
  async disconnect(): Promise<void> {
    this.log('Disconnecting from services...')
    await Promise.all([
      this.nostrConnection.disconnect(),
      this.opcatConnection.disconnect(),
    ])
    this.log('Disconnected from all services')
  }

  /**
   * 使用现有密钥登录
   */
  login(privateKey: string): void {
    const publicKey = derivePublicKey(privateKey)
    this.keyPair = { privateKey, publicKey }
    this.initializeModules()
    this.log(`Logged in as ${publicKey.slice(0, 8)}...`)
  }

  /**
   * 初始化功能模块
   */
  private initializeModules(): void {
    if (!this.keyPair) return

    // 初始化钱包
    const walletConfig: WalletConfig = {
      network: (this.config.opcatNetwork || 'testnet') as 'mainnet' | 'testnet' | 'local',
      defaultFeeRate: 1,
      dustLimit: 546,
    }
    this._wallet = new Wallet(this.opcatConnection, this.keyPair, walletConfig)

    // 初始化私聊模块
    this._privateChat = new PrivateChat(this.nostrConnection, this.keyPair)

    // 初始化群聊模块
    this._groupChat = new GroupChat(this.nostrConnection, this.keyPair)

    // 初始化时间线模块
    this._timeline = new Timeline(
      this.nostrConnection,
      this.keyPair,
      this.opcatConnection
    )

    // 初始化 Zap 管理器
    this._zapManager = new ZapManager(
      this.nostrConnection,
      this.opcatConnection,
      this._wallet,
      this.keyPair
    )
  }

  /**
   * 获取私聊模块
   */
  get privateChat(): PrivateChat {
    if (!this._privateChat) {
      throw new Error('Not logged in. Call login() first.')
    }
    return this._privateChat
  }

  /**
   * 获取群聊模块
   */
  get groupChat(): GroupChat {
    if (!this._groupChat) {
      throw new Error('Not logged in. Call login() first.')
    }
    return this._groupChat
  }

  /**
   * 获取时间线模块
   */
  get timeline(): Timeline {
    if (!this._timeline) {
      throw new Error('Not logged in. Call login() first.')
    }
    return this._timeline
  }

  /**
   * 获取 Zap 管理器
   */
  get zapManager(): ZapManager {
    if (!this._zapManager) {
      throw new Error('Not logged in. Call login() first.')
    }
    return this._zapManager
  }

  /**
   * 获取钱包
   */
  get wallet(): Wallet {
    if (!this._wallet) {
      throw new Error('Not logged in. Call login() first.')
    }
    return this._wallet
  }

  /**
   * 创建新账户
   */
  createAccount(): KeyPair {
    this.keyPair = generateKeyPair()
    this.initializeModules()
    this.log(`Created new account: ${this.keyPair.publicKey.slice(0, 8)}...`)
    return this.keyPair
  }

  /**
   * 登出
   */
  logout(): void {
    // 清理模块
    this._privateChat?.unsubscribe()
    this._zapManager?.unsubscribe()

    this._privateChat = null
    this._groupChat = null
    this._timeline = null
    this._zapManager = null
    this._wallet = null
    this.keyPair = null

    this.log('Logged out')
  }

  /**
   * 获取密钥对（谨慎使用）
   */
  getKeyPair(): KeyPair | null {
    return this.keyPair
  }

  /**
   * 获取当前公钥
   */
  getPublicKey(): string | null {
    return this.keyPair?.publicKey || null
  }

  /**
   * 检查是否已登录
   */
  isLoggedIn(): boolean {
    return this.keyPair !== null
  }

  /**
   * 发布事件
   */
  async publishEvent(
    kind: EventKind | number,
    content: string,
    tags: string[][] = []
  ): Promise<NostrEvent> {
    if (!this.keyPair) {
      throw new Error('Not logged in')
    }

    // 创建事件
    const unsignedEvent = {
      ...createEvent(kind, content, tags),
      pubkey: this.keyPair.publicKey,
    }

    // 计算哈希
    const id = getEventHash(unsignedEvent)

    // 签名
    const sig = await signEvent(id, this.keyPair.privateKey)

    // 完整事件
    const event: NostrEvent = {
      ...unsignedEvent,
      id,
      sig,
    }

    // 发布到中继
    await this.nostrConnection.publish(event)

    this.log(`Published event: ${id.slice(0, 8)}...`)
    return event
  }

  /**
   * 发布文本帖子
   */
  async postNote(content: string, tags: string[][] = []): Promise<NostrEvent> {
    return this.publishEvent(EventKind.TextNote, content, tags)
  }

  /**
   * 更新用户资料
   */
  async updateProfile(profile: UserProfile): Promise<NostrEvent> {
    const content = JSON.stringify(profile)
    return this.publishEvent(EventKind.Metadata, content)
  }

  /**
   * 获取用户资料
   */
  async getProfile(pubkey: string): Promise<UserProfile | null> {
    const events = await this.nostrConnection.fetch({
      kinds: [EventKind.Metadata],
      authors: [pubkey],
      limit: 1,
    })

    if (events.length === 0) {
      return null
    }

    try {
      return JSON.parse(events[0].content) as UserProfile
    } catch {
      return null
    }
  }

  /**
   * 订阅事件
   */
  subscribe(
    filter: EventFilter,
    onEvent: (event: NostrEvent) => void,
    onEose?: () => void
  ): string {
    return this.nostrConnection.subscribe(filter, onEvent, onEose)
  }

  /**
   * 取消订阅
   */
  unsubscribe(subscriptionId: string): void {
    this.nostrConnection.unsubscribe(subscriptionId)
  }

  /**
   * 获取时间线
   */
  async getTimeline(options: {
    authors?: string[]
    limit?: number
    since?: number
    until?: number
  } = {}): Promise<NostrEvent[]> {
    return this.nostrConnection.fetch({
      kinds: [EventKind.TextNote, EventKind.Repost],
      authors: options.authors,
      limit: options.limit || 50,
      since: options.since,
      until: options.until,
    })
  }

  /**
   * 关注用户
   */
  async follow(pubkeys: string[]): Promise<NostrEvent> {
    // 获取当前关注列表
    const currentContacts = await this.getFollowing()
    const allFollowing = [...new Set([...currentContacts, ...pubkeys])]

    // 创建新的关注列表事件
    const tags = allFollowing.map(pk => ['p', pk])
    return this.publishEvent(EventKind.Contacts, '', tags)
  }

  /**
   * 获取关注列表
   */
  async getFollowing(pubkey?: string): Promise<string[]> {
    const pk = pubkey || this.keyPair?.publicKey
    if (!pk) {
      throw new Error('No public key specified')
    }

    const events = await this.nostrConnection.fetch({
      kinds: [EventKind.Contacts],
      authors: [pk],
      limit: 1,
    })

    if (events.length === 0) {
      return []
    }

    return events[0].tags
      .filter(tag => tag[0] === 'p')
      .map(tag => tag[1])
  }

  /**
   * 发送反应（点赞）
   */
  async react(eventId: string, eventPubkey: string, content = '+'): Promise<NostrEvent> {
    return this.publishEvent(EventKind.Reaction, content, [
      ['e', eventId],
      ['p', eventPubkey],
    ])
  }

  /**
   * 转发
   */
  async repost(event: NostrEvent): Promise<NostrEvent> {
    return this.publishEvent(EventKind.Repost, JSON.stringify(event), [
      ['e', event.id],
      ['p', event.pubkey],
    ])
  }

  /**
   * 删除事件
   */
  async deleteEvent(eventId: string): Promise<NostrEvent> {
    return this.publishEvent(EventKind.EventDeletion, '', [
      ['e', eventId],
    ])
  }

  // ============ OP_CAT Layer 方法 ============

  /**
   * 获取 OP_CAT 地址余额
   */
  async getBalance(address?: string): Promise<bigint> {
    const addr = address || this.opcatConnection.getAddress(this.keyPair?.publicKey || '')
    return this.opcatConnection.getBalance(addr)
  }

  /**
   * 发送 Zap（链上打赏）
   */
  async sendZap(
    recipientPubkey: string,
    amount: bigint,
    eventId?: string,
    memo?: string
  ): Promise<string> {
    if (!this.keyPair) {
      throw new Error('Not logged in')
    }

    return this.opcatConnection.sendZap(
      this.keyPair,
      recipientPubkey,
      amount,
      eventId,
      memo
    )
  }

  /**
   * 锚定内容到链上
   */
  async anchorContent(eventId: string, eventHash: string): Promise<string> {
    if (!this.keyPair) {
      throw new Error('Not logged in')
    }

    return this.opcatConnection.anchorContent(
      this.keyPair,
      eventId,
      eventHash
    )
  }

  /**
   * 验证内容锚点
   */
  async verifyAnchor(eventId: string): Promise<boolean> {
    return this.opcatConnection.verifyAnchor(eventId)
  }

  /**
   * 获取 Nostr 连接实例
   */
  getNostrConnection(): NostrConnection {
    return this.nostrConnection
  }

  /**
   * 获取 OP_CAT 连接实例
   */
  getOPCATConnection(): OPCATConnection {
    return this.opcatConnection
  }

  /**
   * 调试日志
   */
  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log('[NoStrCat]', ...args)
    }
  }
}
