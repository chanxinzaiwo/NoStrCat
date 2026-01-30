/**
 * 本地存储模块
 *
 * 提供统一的本地数据存储接口
 * 支持 Web (IndexedDB/localStorage) 和移动端
 */

import { NostrEvent } from '../events/types'

/**
 * 存储的用户数据
 */
export interface StoredUser {
  pubkey: string
  profile?: {
    name?: string
    picture?: string
    about?: string
    nip05?: string
  }
  opcatIdentityUtxo?: string
  reputationScore: number
  verified: boolean
  updatedAt: number
}

/**
 * 存储的消息数据
 */
export interface StoredMessage {
  id: string
  senderPubkey: string
  recipientPubkey: string
  encryptedContent: string
  conversationId: string
  read: boolean
  createdAt: number
}

/**
 * 存储配置
 */
export interface StorageConfig {
  dbName: string
  version: number
  encryptionKey?: string
}

/**
 * 本地存储类
 */
export class LocalStorage {
  private dbName: string
  private version: number
  private encryptionKey?: string
  private db: IDBDatabase | null = null
  private memoryCache: Map<string, unknown> = new Map()

  constructor(config: StorageConfig = { dbName: 'nostrcat', version: 1 }) {
    this.dbName = config.dbName
    this.version = config.version
    this.encryptionKey = config.encryptionKey
  }

  /**
   * 初始化数据库
   */
  async init(): Promise<void> {
    if (typeof indexedDB === 'undefined') {
      // 降级到内存存储
      console.log('IndexedDB not available, using memory storage')
      return
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version)

      request.onerror = () => {
        console.error('Failed to open IndexedDB')
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // 用户存储
        if (!db.objectStoreNames.contains('users')) {
          const usersStore = db.createObjectStore('users', { keyPath: 'pubkey' })
          usersStore.createIndex('updatedAt', 'updatedAt')
        }

        // 事件存储
        if (!db.objectStoreNames.contains('events')) {
          const eventsStore = db.createObjectStore('events', { keyPath: 'id' })
          eventsStore.createIndex('pubkey', 'pubkey')
          eventsStore.createIndex('kind', 'kind')
          eventsStore.createIndex('created_at', 'created_at')
        }

        // 消息存储
        if (!db.objectStoreNames.contains('messages')) {
          const messagesStore = db.createObjectStore('messages', { keyPath: 'id' })
          messagesStore.createIndex('conversationId', 'conversationId')
          messagesStore.createIndex('createdAt', 'createdAt')
        }

        // 群组存储
        if (!db.objectStoreNames.contains('groups')) {
          const groupsStore = db.createObjectStore('groups', { keyPath: 'id' })
          groupsStore.createIndex('name', 'name')
        }

        // 支付记录存储
        if (!db.objectStoreNames.contains('zaps')) {
          const zapsStore = db.createObjectStore('zaps', { keyPath: 'id' })
          zapsStore.createIndex('senderPubkey', 'senderPubkey')
          zapsStore.createIndex('recipientPubkey', 'recipientPubkey')
          zapsStore.createIndex('createdAt', 'createdAt')
        }

        // 设置存储
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' })
        }
      }
    })
  }

  /**
   * 关闭数据库
   */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  /**
   * 保存用户
   */
  async saveUser(user: StoredUser): Promise<void> {
    if (!this.db) {
      this.memoryCache.set(`user:${user.pubkey}`, user)
      return
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('users', 'readwrite')
      const store = tx.objectStore('users')
      const request = store.put(user)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * 获取用户
   */
  async getUser(pubkey: string): Promise<StoredUser | null> {
    if (!this.db) {
      return (this.memoryCache.get(`user:${pubkey}`) as StoredUser) || null
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('users', 'readonly')
      const store = tx.objectStore('users')
      const request = store.get(pubkey)

      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * 保存事件
   */
  async saveEvent(event: NostrEvent): Promise<void> {
    if (!this.db) {
      this.memoryCache.set(`event:${event.id}`, event)
      return
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('events', 'readwrite')
      const store = tx.objectStore('events')
      const request = store.put(event)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * 获取事件
   */
  async getEvent(id: string): Promise<NostrEvent | null> {
    if (!this.db) {
      return (this.memoryCache.get(`event:${id}`) as NostrEvent) || null
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('events', 'readonly')
      const store = tx.objectStore('events')
      const request = store.get(id)

      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * 按条件查询事件
   */
  async queryEvents(options: {
    pubkey?: string
    kind?: number
    since?: number
    until?: number
    limit?: number
  }): Promise<NostrEvent[]> {
    if (!this.db) {
      // 内存模式下的简单过滤
      const events: NostrEvent[] = []
      this.memoryCache.forEach((value, key) => {
        if (key.startsWith('event:')) {
          const event = value as NostrEvent
          if (options.pubkey && event.pubkey !== options.pubkey) return
          if (options.kind && event.kind !== options.kind) return
          if (options.since && event.created_at < options.since) return
          if (options.until && event.created_at > options.until) return
          events.push(event)
        }
      })
      return events.slice(0, options.limit || 100)
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('events', 'readonly')
      const store = tx.objectStore('events')
      const events: NostrEvent[] = []

      // 使用游标遍历
      const request = store.openCursor()

      request.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          const event = cursor.value as NostrEvent

          // 应用过滤条件
          let match = true
          if (options.pubkey && event.pubkey !== options.pubkey) match = false
          if (options.kind && event.kind !== options.kind) match = false
          if (options.since && event.created_at < options.since) match = false
          if (options.until && event.created_at > options.until) match = false

          if (match) {
            events.push(event)
          }

          if (events.length >= (options.limit || 100)) {
            resolve(events)
          } else {
            cursor.continue()
          }
        } else {
          resolve(events)
        }
      }

      request.onerror = () => reject(request.error)
    })
  }

  /**
   * 保存消息
   */
  async saveMessage(message: StoredMessage): Promise<void> {
    if (!this.db) {
      this.memoryCache.set(`message:${message.id}`, message)
      return
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('messages', 'readwrite')
      const store = tx.objectStore('messages')
      const request = store.put(message)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * 获取会话消息
   */
  async getConversationMessages(conversationId: string): Promise<StoredMessage[]> {
    if (!this.db) {
      const messages: StoredMessage[] = []
      this.memoryCache.forEach((value, key) => {
        if (key.startsWith('message:')) {
          const msg = value as StoredMessage
          if (msg.conversationId === conversationId) {
            messages.push(msg)
          }
        }
      })
      return messages.sort((a, b) => a.createdAt - b.createdAt)
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('messages', 'readonly')
      const store = tx.objectStore('messages')
      const index = store.index('conversationId')
      const request = index.getAll(conversationId)

      request.onsuccess = () => {
        const messages = request.result as StoredMessage[]
        resolve(messages.sort((a, b) => a.createdAt - b.createdAt))
      }
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * 保存设置
   */
  async saveSetting(key: string, value: unknown): Promise<void> {
    if (!this.db) {
      this.memoryCache.set(`setting:${key}`, value)
      return
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('settings', 'readwrite')
      const store = tx.objectStore('settings')
      const request = store.put({ key, value })

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * 获取设置
   */
  async getSetting<T>(key: string): Promise<T | null> {
    if (!this.db) {
      return (this.memoryCache.get(`setting:${key}`) as T) || null
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('settings', 'readonly')
      const store = tx.objectStore('settings')
      const request = store.get(key)

      request.onsuccess = () => {
        resolve(request.result?.value || null)
      }
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * 删除设置
   */
  async deleteSetting(key: string): Promise<void> {
    if (!this.db) {
      this.memoryCache.delete(`setting:${key}`)
      return
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('settings', 'readwrite')
      const store = tx.objectStore('settings')
      const request = store.delete(key)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * 清空所有数据
   */
  async clear(): Promise<void> {
    if (!this.db) {
      this.memoryCache.clear()
      return
    }

    const stores = ['users', 'events', 'messages', 'groups', 'zaps', 'settings']

    for (const storeName of stores) {
      await new Promise<void>((resolve, reject) => {
        const tx = this.db!.transaction(storeName, 'readwrite')
        const store = tx.objectStore(storeName)
        const request = store.clear()

        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    }
  }
}
