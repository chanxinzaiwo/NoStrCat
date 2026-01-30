/**
 * 简单的 Nostr 发布工具
 */

// 十六进制转字节
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return bytes
}

// 字节转十六进制
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Nostr 事件类型
export interface NostrEvent {
  id: string
  pubkey: string
  kind: number
  content: string
  tags: string[][]
  created_at: number
  sig: string
}

// 用户资料类型
export interface NostrProfile {
  pubkey: string
  name?: string
  about?: string
  picture?: string
  nip05?: string
  lud16?: string  // Lightning address
  banner?: string
}

// 计算事件 ID (SHA-256)
export async function getEventHash(event: Omit<NostrEvent, 'id' | 'sig'>): Promise<string> {
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ])
  const encoder = new TextEncoder()
  const data = encoder.encode(serialized)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// 发布事件到单个中继
async function publishToRelay(relay: string, event: NostrEvent): Promise<boolean> {
  return new Promise((resolve) => {
    console.log(`Connecting to ${relay}...`)
    try {
      const ws = new WebSocket(relay)
      const timeout = setTimeout(() => {
        console.log(`Timeout connecting to ${relay}`)
        ws.close()
        resolve(false)
      }, 8000)

      ws.onopen = () => {
        console.log(`Connected to ${relay}, sending event...`)
        ws.send(JSON.stringify(['EVENT', event]))
      }

      ws.onmessage = (msg) => {
        console.log(`Message from ${relay}:`, msg.data)
        try {
          const data = JSON.parse(msg.data)
          if (data[0] === 'OK' && data[1] === event.id) {
            clearTimeout(timeout)
            ws.close()
            const success = data[2] === true
            console.log(`${relay} response:`, success ? 'accepted' : 'rejected', data[3] || '')
            resolve(success)
          } else if (data[0] === 'NOTICE') {
            console.log(`${relay} notice:`, data[1])
          }
        } catch {
          // ignore parse errors
        }
      }

      ws.onerror = (err) => {
        console.error(`Error connecting to ${relay}:`, err)
        clearTimeout(timeout)
        ws.close()
        resolve(false)
      }

      ws.onclose = () => {
        console.log(`Connection to ${relay} closed`)
      }
    } catch (err) {
      console.error(`Failed to connect to ${relay}:`, err)
      resolve(false)
    }
  })
}

// 发布事件到多个中继
export async function publishEvent(
  content: string,
  pubkey: string,
  privateKey: string,
  relays: string[]
): Promise<{ success: boolean; event: NostrEvent; results: Record<string, boolean> }> {
  // 验证公钥格式（必须是64个十六进制字符）
  if (pubkey.length !== 64) {
    console.error('Invalid pubkey length:', pubkey.length, 'expected 64')
    throw new Error(`公钥长度错误: ${pubkey.length}, 应为64`)
  }

  // 验证私钥格式
  if (privateKey.length !== 64) {
    console.error('Invalid privateKey length:', privateKey.length, 'expected 64')
    throw new Error(`私钥长度错误: ${privateKey.length}, 应为64`)
  }

  // 创建事件
  const created_at = Math.floor(Date.now() / 1000)
  const kind = 1 // Text Note
  const tags: string[][] = []

  const unsignedEvent = {
    pubkey,
    kind,
    content,
    tags,
    created_at,
  }

  // 计算事件 ID
  const id = await getEventHash(unsignedEvent)
  console.log('Event ID:', id)

  // 使用 Schnorr 签名 (BIP340) - Nostr 标准
  let sig: string
  try {
    // 使用 @noble/curves 的 schnorr 实现
    const { schnorr } = await import('@noble/curves/secp256k1.js')

    const privateKeyBytes = hexToBytes(privateKey)
    const idBytes = hexToBytes(id)

    console.log('Signing with schnorr...')
    const signature = schnorr.sign(idBytes, privateKeyBytes)

    sig = bytesToHex(signature)
    console.log('Schnorr Signature generated:', sig.length, 'chars')

    // 验证签名长度
    if (sig.length !== 128) {
      throw new Error(`签名长度错误: ${sig.length}, 应为 128`)
    }

    // 验证签名是否有效
    const isValid = schnorr.verify(signature, idBytes, hexToBytes(pubkey))
    console.log('Signature verification:', isValid ? 'VALID' : 'INVALID')
    if (!isValid) {
      throw new Error('签名验证失败')
    }

  } catch (signError) {
    console.error('Signing error:', signError)
    throw new Error('签名失败: ' + String(signError))
  }

  // 验证所有字段长度
  console.log('Event fields:', {
    id: id.length + ' chars',
    pubkey: pubkey.length + ' chars',
    sig: sig.length + ' chars'
  })

  const event: NostrEvent = {
    ...unsignedEvent,
    id,
    sig,
  }

  // 发布到所有中继
  const results: Record<string, boolean> = {}
  const promises = relays.map(async (relay) => {
    const success = await publishToRelay(relay, event)
    results[relay] = success
    return success
  })

  const outcomes = await Promise.all(promises)
  const anySuccess = outcomes.some(s => s)

  return { success: anySuccess, event, results }
}

// 从中继获取事件
export async function fetchEvents(
  relays: string[],
  filter: {
    kinds?: number[]
    authors?: string[]
    limit?: number
    since?: number
  }
): Promise<NostrEvent[]> {
  const events: NostrEvent[] = []
  const seenIds = new Set<string>()

  const fetchFromRelay = (relay: string): Promise<NostrEvent[]> => {
    return new Promise((resolve) => {
      const relayEvents: NostrEvent[] = []
      try {
        const ws = new WebSocket(relay)
        const subId = 'sub_' + Math.random().toString(36).slice(2)

        const timeout = setTimeout(() => {
          ws.close()
          resolve(relayEvents)
        }, 5000)

        ws.onopen = () => {
          ws.send(JSON.stringify(['REQ', subId, filter]))
        }

        ws.onmessage = (msg) => {
          try {
            const data = JSON.parse(msg.data)
            if (data[0] === 'EVENT' && data[1] === subId) {
              relayEvents.push(data[2])
            } else if (data[0] === 'EOSE') {
              clearTimeout(timeout)
              ws.close()
              resolve(relayEvents)
            }
          } catch {
            // ignore
          }
        }

        ws.onerror = () => {
          clearTimeout(timeout)
          ws.close()
          resolve(relayEvents)
        }
      } catch {
        resolve(relayEvents)
      }
    })
  }

  // 从所有中继获取
  const allResults = await Promise.all(relays.map(fetchFromRelay))

  for (const relayEvents of allResults) {
    for (const event of relayEvents) {
      if (!seenIds.has(event.id)) {
        seenIds.add(event.id)
        events.push(event)
      }
    }
  }

  // 按时间排序
  events.sort((a, b) => b.created_at - a.created_at)

  return events
}

// 获取用户资料 (kind:0)
export async function fetchProfiles(
  relays: string[],
  pubkeys: string[]
): Promise<Record<string, NostrProfile>> {
  const profiles: Record<string, NostrProfile> = {}

  if (pubkeys.length === 0) return profiles

  const filter = {
    kinds: [0],
    authors: pubkeys,
  }

  const fetchFromRelay = (relay: string): Promise<NostrEvent[]> => {
    return new Promise((resolve) => {
      const events: NostrEvent[] = []
      try {
        const ws = new WebSocket(relay)
        const subId = 'profile_' + Math.random().toString(36).slice(2)

        const timeout = setTimeout(() => {
          ws.close()
          resolve(events)
        }, 3000)

        ws.onopen = () => {
          ws.send(JSON.stringify(['REQ', subId, filter]))
        }

        ws.onmessage = (msg) => {
          try {
            const data = JSON.parse(msg.data)
            if (data[0] === 'EVENT' && data[1] === subId) {
              events.push(data[2])
            } else if (data[0] === 'EOSE') {
              clearTimeout(timeout)
              ws.close()
              resolve(events)
            }
          } catch {
            // ignore
          }
        }

        ws.onerror = () => {
          clearTimeout(timeout)
          ws.close()
          resolve(events)
        }
      } catch {
        resolve(events)
      }
    })
  }

  // 从所有中继获取
  const allResults = await Promise.all(relays.slice(0, 3).map(fetchFromRelay))

  // 合并结果，保留最新的资料
  const latestEvents = new Map<string, NostrEvent>()
  for (const events of allResults) {
    for (const event of events) {
      const existing = latestEvents.get(event.pubkey)
      if (!existing || event.created_at > existing.created_at) {
        latestEvents.set(event.pubkey, event)
      }
    }
  }

  // 解析资料
  for (const [pubkey, event] of latestEvents) {
    try {
      const content = JSON.parse(event.content)
      profiles[pubkey] = {
        pubkey,
        name: content.name || content.display_name,
        about: content.about,
        picture: content.picture,
        nip05: content.nip05,
        lud16: content.lud16,
        banner: content.banner,
      }
    } catch {
      // 忽略解析错误
    }
  }

  return profiles
}

// Bech32 编码/解码 (用于 nsec/npub)
const BECH32_ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'

function bech32Decode(str: string): { prefix: string; data: Uint8Array } | null {
  const lowered = str.toLowerCase()
  const pos = lowered.lastIndexOf('1')
  if (pos < 1 || pos + 7 > lowered.length) return null

  const prefix = lowered.slice(0, pos)
  const dataChars = lowered.slice(pos + 1)

  const data: number[] = []
  for (const c of dataChars) {
    const idx = BECH32_ALPHABET.indexOf(c)
    if (idx === -1) return null
    data.push(idx)
  }

  // 移除校验和 (最后6个字符)
  const values = data.slice(0, -6)

  // 5-bit 转 8-bit
  let acc = 0
  let bits = 0
  const result: number[] = []
  for (const v of values) {
    acc = (acc << 5) | v
    bits += 5
    while (bits >= 8) {
      bits -= 8
      result.push((acc >> bits) & 0xff)
    }
  }

  return { prefix, data: new Uint8Array(result) }
}

function bech32Encode(prefix: string, data: Uint8Array): string {
  // 8-bit 转 5-bit
  const values: number[] = []
  let acc = 0
  let bits = 0
  for (const b of data) {
    acc = (acc << 8) | b
    bits += 8
    while (bits >= 5) {
      bits -= 5
      values.push((acc >> bits) & 0x1f)
    }
  }
  if (bits > 0) {
    values.push((acc << (5 - bits)) & 0x1f)
  }

  // 计算校验和
  const checksum = bech32Checksum(prefix, values)
  values.push(...checksum)

  return prefix + '1' + values.map(v => BECH32_ALPHABET[v]).join('')
}

function bech32Checksum(prefix: string, values: number[]): number[] {
  const prefixExpand = [...prefix].map(c => c.charCodeAt(0) >> 5)
    .concat([0])
    .concat([...prefix].map(c => c.charCodeAt(0) & 31))

  let chk = 1
  for (const v of [...prefixExpand, ...values, 0, 0, 0, 0, 0, 0]) {
    const top = chk >> 25
    chk = ((chk & 0x1ffffff) << 5) ^ v
    for (let i = 0; i < 5; i++) {
      if ((top >> i) & 1) {
        chk ^= [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3][i]
      }
    }
  }
  chk ^= 1

  const result: number[] = []
  for (let i = 0; i < 6; i++) {
    result.push((chk >> (5 * (5 - i))) & 31)
  }
  return result
}

// nsec 转 hex 私钥
export function nsecToHex(nsec: string): string | null {
  const decoded = bech32Decode(nsec)
  if (!decoded || decoded.prefix !== 'nsec') return null
  return bytesToHex(decoded.data)
}

// hex 私钥转 nsec
export function hexToNsec(hex: string): string {
  return bech32Encode('nsec', hexToBytes(hex))
}

// npub 转 hex 公钥
export function npubToHex(npub: string): string | null {
  const decoded = bech32Decode(npub)
  if (!decoded || decoded.prefix !== 'npub') return null
  return bytesToHex(decoded.data)
}

// hex 公钥转 npub
export function hexToNpub(hex: string): string {
  return bech32Encode('npub', hexToBytes(hex))
}

// 实时订阅类
export class NostrSubscription {
  private ws: WebSocket | null = null
  private subId: string
  private relay: string
  private onEvent: (event: NostrEvent) => void
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(relay: string, filter: object, onEvent: (event: NostrEvent) => void) {
    this.relay = relay
    this.subId = 'live_' + Math.random().toString(36).slice(2)
    this.onEvent = onEvent
    this.connect(filter)
  }

  private connect(filter: object) {
    try {
      this.ws = new WebSocket(this.relay)

      this.ws.onopen = () => {
        console.log(`[Subscription] Connected to ${this.relay}`)
        this.ws?.send(JSON.stringify(['REQ', this.subId, filter]))
      }

      this.ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data)
          if (data[0] === 'EVENT' && data[1] === this.subId) {
            this.onEvent(data[2])
          }
        } catch {
          // ignore
        }
      }

      this.ws.onerror = () => {
        console.log(`[Subscription] Error on ${this.relay}`)
      }

      this.ws.onclose = () => {
        console.log(`[Subscription] Disconnected from ${this.relay}`)
        // 自动重连
        this.reconnectTimer = setTimeout(() => this.connect(filter), 5000)
      }
    } catch (err) {
      console.error(`[Subscription] Failed to connect to ${this.relay}:`, err)
    }
  }

  close() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
}

// 发布 Reaction (点赞)
export async function publishReaction(
  eventId: string,
  eventPubkey: string,
  content: string, // "+" 为点赞, "-" 为踩
  pubkey: string,
  privateKey: string,
  relays: string[]
): Promise<boolean> {
  const created_at = Math.floor(Date.now() / 1000)
  const kind = 7 // Reaction

  const tags = [
    ['e', eventId],
    ['p', eventPubkey],
  ]

  const unsignedEvent = {
    pubkey,
    kind,
    content,
    tags,
    created_at,
  }

  const id = await getEventHash(unsignedEvent)

  const { schnorr } = await import('@noble/curves/secp256k1.js')
  const signature = schnorr.sign(hexToBytes(id), hexToBytes(privateKey))
  const sig = bytesToHex(signature)

  const event: NostrEvent = {
    ...unsignedEvent,
    id,
    sig,
  }

  const results = await Promise.all(relays.map(r => publishToRelay(r, event)))
  return results.some(r => r)
}

// 发布 Repost (转发)
export async function publishRepost(
  eventId: string,
  eventPubkey: string,
  originalEvent: NostrEvent,
  pubkey: string,
  privateKey: string,
  relays: string[]
): Promise<boolean> {
  const created_at = Math.floor(Date.now() / 1000)
  const kind = 6 // Repost

  const tags = [
    ['e', eventId, relays[0] || ''],
    ['p', eventPubkey],
  ]

  const unsignedEvent = {
    pubkey,
    kind,
    content: JSON.stringify(originalEvent),
    tags,
    created_at,
  }

  const id = await getEventHash(unsignedEvent)

  const { schnorr } = await import('@noble/curves/secp256k1.js')
  const signature = schnorr.sign(hexToBytes(id), hexToBytes(privateKey))
  const sig = bytesToHex(signature)

  const event: NostrEvent = {
    ...unsignedEvent,
    id,
    sig,
  }

  const results = await Promise.all(relays.map(r => publishToRelay(r, event)))
  return results.some(r => r)
}
