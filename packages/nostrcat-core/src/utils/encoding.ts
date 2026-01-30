/**
 * 编码工具
 *
 * 处理各种编码转换：
 * - 十六进制
 * - Base64
 * - Bech32（npub/nsec/note 等）
 */

// Bech32 字符集
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'

/**
 * 字节数组转十六进制字符串
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * 十六进制字符串转字节数组
 */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string')
  }
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return bytes
}

/**
 * Bech32 多项式模运算
 */
function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
  let chk = 1
  for (const v of values) {
    const b = chk >> 25
    chk = ((chk & 0x1ffffff) << 5) ^ v
    for (let i = 0; i < 5; i++) {
      if ((b >> i) & 1) {
        chk ^= GEN[i]
      }
    }
  }
  return chk
}

/**
 * 扩展 HRP（Human Readable Part）
 */
function bech32HrpExpand(hrp: string): number[] {
  const ret: number[] = []
  for (const c of hrp) {
    ret.push(c.charCodeAt(0) >> 5)
  }
  ret.push(0)
  for (const c of hrp) {
    ret.push(c.charCodeAt(0) & 31)
  }
  return ret
}

/**
 * 创建 Bech32 校验和
 */
function bech32CreateChecksum(hrp: string, data: number[]): number[] {
  const values = [...bech32HrpExpand(hrp), ...data]
  const polymod = bech32Polymod([...values, 0, 0, 0, 0, 0, 0]) ^ 1
  const ret: number[] = []
  for (let i = 0; i < 6; i++) {
    ret.push((polymod >> (5 * (5 - i))) & 31)
  }
  return ret
}

/**
 * 验证 Bech32 校验和
 */
function bech32VerifyChecksum(hrp: string, data: number[]): boolean {
  return bech32Polymod([...bech32HrpExpand(hrp), ...data]) === 1
}

/**
 * 5 位数组转 8 位数组
 */
function convertBits(data: number[], fromBits: number, toBits: number, pad: boolean): number[] | null {
  let acc = 0
  let bits = 0
  const ret: number[] = []
  const maxv = (1 << toBits) - 1
  for (const value of data) {
    if (value < 0 || value >> fromBits !== 0) {
      return null
    }
    acc = (acc << fromBits) | value
    bits += fromBits
    while (bits >= toBits) {
      bits -= toBits
      ret.push((acc >> bits) & maxv)
    }
  }
  if (pad) {
    if (bits > 0) {
      ret.push((acc << (toBits - bits)) & maxv)
    }
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) {
    return null
  }
  return ret
}

/**
 * Bech32 编码
 */
export function bech32Encode(hrp: string, data: Uint8Array): string {
  const data5 = convertBits(Array.from(data), 8, 5, true)
  if (!data5) {
    throw new Error('Failed to convert bits')
  }
  const checksum = bech32CreateChecksum(hrp, data5)
  const combined = [...data5, ...checksum]
  return hrp + '1' + combined.map(d => BECH32_CHARSET[d]).join('')
}

/**
 * Bech32 解码
 */
export function bech32Decode(str: string): { hrp: string; data: Uint8Array } {
  str = str.toLowerCase()
  const pos = str.lastIndexOf('1')
  if (pos < 1 || pos + 7 > str.length) {
    throw new Error('Invalid bech32 string')
  }

  const hrp = str.slice(0, pos)
  const dataStr = str.slice(pos + 1)

  const data: number[] = []
  for (const c of dataStr) {
    const d = BECH32_CHARSET.indexOf(c)
    if (d === -1) {
      throw new Error('Invalid bech32 character')
    }
    data.push(d)
  }

  if (!bech32VerifyChecksum(hrp, data)) {
    throw new Error('Invalid bech32 checksum')
  }

  const data5 = data.slice(0, -6)
  const data8 = convertBits(data5, 5, 8, false)
  if (!data8) {
    throw new Error('Failed to convert bits')
  }

  return { hrp, data: new Uint8Array(data8) }
}

/**
 * 编码公钥为 npub 格式
 */
export function encodeNpub(pubkey: string): string {
  return bech32Encode('npub', hexToBytes(pubkey))
}

/**
 * 解码 npub 为公钥
 */
export function decodeNpub(npub: string): string {
  const { hrp, data } = bech32Decode(npub)
  if (hrp !== 'npub') {
    throw new Error('Invalid npub prefix')
  }
  return bytesToHex(data)
}

/**
 * 编码私钥为 nsec 格式
 */
export function encodeNsec(privateKey: string): string {
  return bech32Encode('nsec', hexToBytes(privateKey))
}

/**
 * 解码 nsec 为私钥
 */
export function decodeNsec(nsec: string): string {
  const { hrp, data } = bech32Decode(nsec)
  if (hrp !== 'nsec') {
    throw new Error('Invalid nsec prefix')
  }
  return bytesToHex(data)
}

/**
 * 编码事件 ID 为 note 格式
 */
export function encodeNote(eventId: string): string {
  return bech32Encode('note', hexToBytes(eventId))
}

/**
 * 解码 note 为事件 ID
 */
export function decodeNote(note: string): string {
  const { hrp, data } = bech32Decode(note)
  if (hrp !== 'note') {
    throw new Error('Invalid note prefix')
  }
  return bytesToHex(data)
}

/**
 * UTF-8 字符串转字节数组
 */
export function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

/**
 * 字节数组转 UTF-8 字符串
 */
export function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

/**
 * Base64 编码
 */
export function base64Encode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
}

/**
 * Base64 解码
 */
export function base64Decode(str: string): Uint8Array {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0))
}
