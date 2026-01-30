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

// 计算事件 ID (SHA-256)
async function getEventHash(event: Omit<NostrEvent, 'id' | 'sig'>): Promise<string> {
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
