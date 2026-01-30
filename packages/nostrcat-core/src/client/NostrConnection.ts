/**
 * Nostr 中继连接管理
 *
 * 处理与 Nostr 中继服务器的 WebSocket 连接
 */

import { NostrEvent, EventFilter } from '../events/types'
import { MESSAGE_TYPES, SUBSCRIPTION_CONFIG } from '../utils/constants'

/**
 * 中继配置
 */
export interface RelayConfig {
  url: string
  read?: boolean
  write?: boolean
}

/**
 * 中继状态
 */
export interface RelayStatus {
  url: string
  connected: boolean
  lastConnected?: number
  error?: string
}

/**
 * 订阅信息
 */
interface Subscription {
  id: string
  filter: EventFilter
  onEvent: (event: NostrEvent) => void
  onEose?: () => void
}

/**
 * Nostr 中继连接类
 */
export class NostrConnection {
  private relays: Map<string, WebSocket> = new Map()
  private relayConfigs: RelayConfig[]
  private subscriptions: Map<string, Subscription> = new Map()
  private pendingMessages: Map<string, Array<() => void>> = new Map()
  private reconnectAttempts: Map<string, number> = new Map()
  private subscriptionCounter = 0

  constructor(relays: RelayConfig[]) {
    this.relayConfigs = relays
  }

  /**
   * 连接到所有中继
   */
  async connect(): Promise<void> {
    const promises = this.relayConfigs.map(config =>
      this.connectToRelay(config.url)
    )
    await Promise.allSettled(promises)
  }

  /**
   * 连接到单个中继
   */
  private connectToRelay(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(url)

        ws.onopen = () => {
          this.relays.set(url, ws)
          this.reconnectAttempts.set(url, 0)

          // 发送待发消息
          const pending = this.pendingMessages.get(url) || []
          pending.forEach(fn => fn())
          this.pendingMessages.delete(url)

          // 重新订阅
          this.resubscribeAll(url)

          resolve()
        }

        ws.onmessage = (event) => {
          this.handleMessage(url, event.data)
        }

        ws.onerror = (error) => {
          console.error(`Relay error (${url}):`, error)
        }

        ws.onclose = () => {
          this.relays.delete(url)
          this.scheduleReconnect(url)
        }

        // 超时处理
        setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            ws.close()
            reject(new Error(`Connection timeout: ${url}`))
          }
        }, SUBSCRIPTION_CONFIG.TIMEOUT)
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(relayUrl: string, data: string): void {
    try {
      const message = JSON.parse(data) as unknown[]

      if (!Array.isArray(message) || message.length < 2) {
        return
      }

      const [type, ...rest] = message

      switch (type) {
        case MESSAGE_TYPES.EVENT: {
          const [subId, event] = rest as [string, NostrEvent]
          const sub = this.subscriptions.get(subId)
          if (sub) {
            sub.onEvent(event)
          }
          break
        }

        case MESSAGE_TYPES.EOSE: {
          const [subId] = rest as [string]
          const sub = this.subscriptions.get(subId)
          if (sub?.onEose) {
            sub.onEose()
          }
          break
        }

        case MESSAGE_TYPES.OK: {
          const [eventId, success, message] = rest as [string, boolean, string]
          if (!success) {
            console.warn(`Event rejected (${eventId}): ${message}`)
          }
          break
        }

        case MESSAGE_TYPES.NOTICE: {
          const [notice] = rest as [string]
          console.log(`Relay notice (${relayUrl}): ${notice}`)
          break
        }
      }
    } catch (error) {
      console.error('Failed to parse message:', error)
    }
  }

  /**
   * 安排重连
   */
  private scheduleReconnect(url: string): void {
    const attempts = this.reconnectAttempts.get(url) || 0

    if (attempts >= SUBSCRIPTION_CONFIG.MAX_RECONNECT_ATTEMPTS) {
      console.error(`Max reconnect attempts reached for ${url}`)
      return
    }

    this.reconnectAttempts.set(url, attempts + 1)

    const delay = SUBSCRIPTION_CONFIG.RECONNECT_DELAY * Math.pow(2, attempts)

    setTimeout(() => {
      this.connectToRelay(url).catch(error => {
        console.error(`Reconnect failed (${url}):`, error)
      })
    }, delay)
  }

  /**
   * 重新订阅所有活跃订阅
   */
  private resubscribeAll(url: string): void {
    const ws = this.relays.get(url)
    if (!ws) return

    for (const [subId, sub] of this.subscriptions) {
      const message = JSON.stringify([MESSAGE_TYPES.REQ, subId, sub.filter])
      ws.send(message)
    }
  }

  /**
   * 断开所有连接
   */
  async disconnect(): Promise<void> {
    for (const ws of this.relays.values()) {
      ws.close()
    }
    this.relays.clear()
    this.subscriptions.clear()
  }

  /**
   * 发布事件
   */
  async publish(event: NostrEvent): Promise<void> {
    const message = JSON.stringify([MESSAGE_TYPES.EVENT, event])

    const writeRelays = this.relayConfigs.filter(r => r.write !== false)

    for (const config of writeRelays) {
      const ws = this.relays.get(config.url)
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(message)
      } else {
        // 存储待发送消息
        const pending = this.pendingMessages.get(config.url) || []
        pending.push(() => {
          const ws = this.relays.get(config.url)
          ws?.send(message)
        })
        this.pendingMessages.set(config.url, pending)
      }
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
    const subId = `sub_${++this.subscriptionCounter}`

    this.subscriptions.set(subId, {
      id: subId,
      filter,
      onEvent,
      onEose,
    })

    const message = JSON.stringify([MESSAGE_TYPES.REQ, subId, filter])

    // 向所有可读中继发送订阅
    const readRelays = this.relayConfigs.filter(r => r.read !== false)

    for (const config of readRelays) {
      const ws = this.relays.get(config.url)
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(message)
      }
    }

    return subId
  }

  /**
   * 取消订阅
   */
  unsubscribe(subscriptionId: string): void {
    this.subscriptions.delete(subscriptionId)

    const message = JSON.stringify([MESSAGE_TYPES.CLOSE, subscriptionId])

    for (const ws of this.relays.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message)
      }
    }
  }

  /**
   * 获取事件（一次性查询）
   */
  async fetch(filter: EventFilter): Promise<NostrEvent[]> {
    return new Promise((resolve) => {
      const events: NostrEvent[] = []
      const seenIds = new Set<string>()
      let eoseCount = 0
      const totalRelays = this.relays.size

      const subId = this.subscribe(
        filter,
        (event) => {
          if (!seenIds.has(event.id)) {
            seenIds.add(event.id)
            events.push(event)
          }
        },
        () => {
          eoseCount++
          if (eoseCount >= totalRelays || eoseCount >= 3) {
            this.unsubscribe(subId)
            resolve(events)
          }
        }
      )

      // 超时保护
      setTimeout(() => {
        this.unsubscribe(subId)
        resolve(events)
      }, SUBSCRIPTION_CONFIG.TIMEOUT)
    })
  }

  /**
   * 获取所有中继状态
   */
  getRelayStatuses(): RelayStatus[] {
    return this.relayConfigs.map(config => ({
      url: config.url,
      connected: this.relays.has(config.url) &&
        this.relays.get(config.url)?.readyState === WebSocket.OPEN,
    }))
  }

  /**
   * 添加中继
   */
  addRelay(config: RelayConfig): void {
    this.relayConfigs.push(config)
    this.connectToRelay(config.url).catch(console.error)
  }

  /**
   * 移除中继
   */
  removeRelay(url: string): void {
    const ws = this.relays.get(url)
    ws?.close()
    this.relays.delete(url)
    this.relayConfigs = this.relayConfigs.filter(c => c.url !== url)
  }
}
