/**
 * 同步引擎
 *
 * 管理本地存储与 Nostr 中继之间的数据同步
 * 支持离线操作和冲突解决
 */

import { NostrEvent, EventKind } from '../events/types'
import { NostrConnection } from '../client/NostrConnection'
import { LocalStorage, StoredUser, StoredMessage } from './LocalStorage'
import { KeyPair, signEvent } from '../crypto/keys'
import { createEvent, getEventHash } from '../events/types'

/**
 * 同步状态
 */
export interface SyncStatus {
  lastSyncTime: number
  pendingEvents: number
  syncInProgress: boolean
  errors: string[]
}

/**
 * 同步配置
 */
export interface SyncConfig {
  autoSync: boolean
  syncInterval: number  // 毫秒
  maxRetries: number
  batchSize: number
}

/**
 * 待处理的离线操作
 */
interface PendingOperation {
  id: string
  type: 'publish' | 'delete'
  event: NostrEvent
  retries: number
  createdAt: number
}

/**
 * 同步引擎类
 */
export class SyncEngine {
  private connection: NostrConnection
  private storage: LocalStorage
  private keyPair: KeyPair | null = null
  private config: SyncConfig
  private pendingOperations: Map<string, PendingOperation> = new Map()
  private syncIntervalId: ReturnType<typeof setInterval> | null = null
  private status: SyncStatus = {
    lastSyncTime: 0,
    pendingEvents: 0,
    syncInProgress: false,
    errors: [],
  }
  private onStatusChangeCallback?: (status: SyncStatus) => void

  constructor(
    connection: NostrConnection,
    storage: LocalStorage,
    config: Partial<SyncConfig> = {}
  ) {
    this.connection = connection
    this.storage = storage
    this.config = {
      autoSync: true,
      syncInterval: 30000,  // 30秒
      maxRetries: 3,
      batchSize: 50,
      ...config,
    }
  }

  /**
   * 设置密钥对
   */
  setKeyPair(keyPair: KeyPair): void {
    this.keyPair = keyPair
  }

  /**
   * 启动同步引擎
   */
  start(): void {
    if (this.syncIntervalId) return

    // 加载待处理的操作
    this.loadPendingOperations()

    // 立即执行一次同步
    this.sync()

    // 设置定时同步
    if (this.config.autoSync) {
      this.syncIntervalId = setInterval(() => {
        this.sync()
      }, this.config.syncInterval)
    }
  }

  /**
   * 停止同步引擎
   */
  stop(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId)
      this.syncIntervalId = null
    }
  }

  /**
   * 执行同步
   */
  async sync(): Promise<void> {
    if (this.status.syncInProgress) return

    this.status.syncInProgress = true
    this.status.errors = []
    this.notifyStatusChange()

    try {
      // 1. 推送待处理的本地操作
      await this.pushPendingOperations()

      // 2. 拉取远程更新
      await this.pullRemoteUpdates()

      this.status.lastSyncTime = Date.now()
    } catch (error) {
      this.status.errors.push((error as Error).message)
    } finally {
      this.status.syncInProgress = false
      this.notifyStatusChange()
    }
  }

  /**
   * 推送待处理的操作
   */
  private async pushPendingOperations(): Promise<void> {
    const operations = Array.from(this.pendingOperations.values())
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, this.config.batchSize)

    for (const op of operations) {
      try {
        if (op.type === 'publish') {
          await this.connection.publish(op.event)
        }
        // 删除成功的操作
        this.pendingOperations.delete(op.id)
      } catch (error) {
        op.retries++
        if (op.retries >= this.config.maxRetries) {
          this.pendingOperations.delete(op.id)
          this.status.errors.push(`Failed to sync event ${op.id}: ${(error as Error).message}`)
        }
      }
    }

    this.status.pendingEvents = this.pendingOperations.size
    this.savePendingOperations()
  }

  /**
   * 拉取远程更新
   */
  private async pullRemoteUpdates(): Promise<void> {
    if (!this.keyPair) return

    const since = Math.floor(this.status.lastSyncTime / 1000) || undefined

    // 拉取自己的事件
    const myEvents = await this.connection.fetch({
      authors: [this.keyPair.publicKey],
      since,
      limit: this.config.batchSize,
    })

    for (const event of myEvents) {
      await this.storage.saveEvent(event)
    }

    // 拉取发给自己的私信
    const dms = await this.connection.fetch({
      kinds: [EventKind.EncryptedDM],
      '#p': [this.keyPair.publicKey],
      since,
      limit: this.config.batchSize,
    })

    for (const event of dms) {
      await this.storage.saveEvent(event)
    }

    // 拉取关注列表的更新
    const following = await this.getFollowing()
    if (following.length > 0) {
      const feedEvents = await this.connection.fetch({
        kinds: [EventKind.TextNote, EventKind.Repost],
        authors: following.slice(0, 100),  // 限制作者数量
        since,
        limit: this.config.batchSize,
      })

      for (const event of feedEvents) {
        await this.storage.saveEvent(event)
      }
    }
  }

  /**
   * 获取关注列表
   */
  private async getFollowing(): Promise<string[]> {
    if (!this.keyPair) return []

    const events = await this.connection.fetch({
      kinds: [EventKind.Contacts],
      authors: [this.keyPair.publicKey],
      limit: 1,
    })

    if (events.length === 0) return []

    return events[0].tags
      .filter(tag => tag[0] === 'p')
      .map(tag => tag[1])
  }

  /**
   * 添加待处理操作（用于离线发布）
   */
  queuePublish(event: NostrEvent): void {
    const operation: PendingOperation = {
      id: event.id,
      type: 'publish',
      event,
      retries: 0,
      createdAt: Date.now(),
    }

    this.pendingOperations.set(event.id, operation)
    this.status.pendingEvents = this.pendingOperations.size
    this.savePendingOperations()
    this.notifyStatusChange()

    // 尝试立即同步
    if ((this.connection as any).connected) {
      this.sync()
    }
  }

  /**
   * 离线发布事件
   */
  async publishOffline(
    kind: EventKind | number,
    content: string,
    tags: string[][] = []
  ): Promise<NostrEvent | null> {
    if (!this.keyPair) return null

    const unsignedEvent = {
      ...createEvent(kind, content, tags),
      pubkey: this.keyPair.publicKey,
    }

    const id = getEventHash(unsignedEvent)
    const sig = await signEvent(id, this.keyPair.privateKey)

    const event: NostrEvent = {
      ...unsignedEvent,
      id,
      sig,
    }

    // 保存到本地
    await this.storage.saveEvent(event)

    // 加入同步队列
    this.queuePublish(event)

    return event
  }

  /**
   * 获取同步状态
   */
  getStatus(): SyncStatus {
    return { ...this.status }
  }

  /**
   * 订阅状态变化
   */
  onStatusChange(callback: (status: SyncStatus) => void): void {
    this.onStatusChangeCallback = callback
  }

  /**
   * 通知状态变化
   */
  private notifyStatusChange(): void {
    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback(this.getStatus())
    }
  }

  /**
   * 保存待处理操作到本地
   */
  private async savePendingOperations(): Promise<void> {
    const data = Array.from(this.pendingOperations.entries())
    await this.storage.saveSetting('pendingOperations', data)
  }

  /**
   * 加载待处理操作
   */
  private async loadPendingOperations(): Promise<void> {
    const data = await this.storage.getSetting<Array<[string, PendingOperation]>>('pendingOperations')
    if (data) {
      this.pendingOperations = new Map(data)
      this.status.pendingEvents = this.pendingOperations.size
    }
  }

  /**
   * 同步用户资料
   */
  async syncUserProfile(pubkey: string): Promise<StoredUser | null> {
    const events = await this.connection.fetch({
      kinds: [EventKind.Metadata],
      authors: [pubkey],
      limit: 1,
    })

    if (events.length === 0) return null

    try {
      const metadata = JSON.parse(events[0].content)
      const user: StoredUser = {
        pubkey,
        profile: {
          name: metadata.name || metadata.display_name,
          picture: metadata.picture,
          about: metadata.about,
          nip05: metadata.nip05,
        },
        reputationScore: 0,
        verified: false,
        updatedAt: Date.now(),
      }

      await this.storage.saveUser(user)
      return user
    } catch {
      return null
    }
  }

  /**
   * 清除同步队列
   */
  clearQueue(): void {
    this.pendingOperations.clear()
    this.status.pendingEvents = 0
    this.savePendingOperations()
    this.notifyStatusChange()
  }

  /**
   * 强制完全同步
   */
  async fullSync(): Promise<void> {
    // 重置最后同步时间以拉取所有数据
    this.status.lastSyncTime = 0
    await this.sync()
  }
}
