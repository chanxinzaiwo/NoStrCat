/**
 * NIP-44: Encrypted Payloads (Versioned)
 * https://github.com/nostr-protocol/nips/blob/master/44.md
 *
 * 基于 0xchat-core 实现，用 TypeScript 重写
 */

import { xchacha20poly1305 } from '@noble/ciphers/chacha'
import { secp256k1 } from '@noble/curves/secp256k1'
import { sha256 } from '@noble/hashes/sha256'
import { hkdf } from '@noble/hashes/hkdf'
import { randomBytes } from '@noble/hashes/utils'
import { base64 } from '@scure/base'

// NIP-44 版本
const NIP44_VERSION = 2

// 最小消息长度 (padding)
const MIN_PLAINTEXT_SIZE = 1
const MAX_PLAINTEXT_SIZE = 65535

/**
 * 计算会话密钥 (Conversation Key)
 * 使用 ECDH + HKDF 派生
 */
export function getConversationKey(
  privateKey: Uint8Array | string,
  publicKey: Uint8Array | string
): Uint8Array {
  // 转换为 Uint8Array
  const privKey = typeof privateKey === 'string'
    ? hexToBytes(privateKey)
    : privateKey

  const pubKey = typeof publicKey === 'string'
    ? hexToBytes(publicKey)
    : publicKey

  // ECDH 计算共享点
  const sharedPoint = secp256k1.getSharedSecret(privKey, pubKey)

  // 取 X 坐标 (去掉前缀字节)
  const sharedX = sharedPoint.slice(1, 33)

  // HKDF 派生会话密钥
  return hkdf(sha256, sharedX, 'nip44-v2', undefined, 32)
}

/**
 * 计算消息密钥 (Message Key)
 * 从会话密钥和 nonce 派生
 */
function getMessageKeys(
  conversationKey: Uint8Array,
  nonce: Uint8Array
): { chacha_key: Uint8Array; chacha_nonce: Uint8Array; hmac_key: Uint8Array } {
  const keys = hkdf(sha256, conversationKey, nonce, 'nip44-v2', 76)

  return {
    chacha_key: keys.slice(0, 32),
    chacha_nonce: keys.slice(32, 44),
    hmac_key: keys.slice(44, 76)
  }
}

/**
 * 计算填充长度
 * NIP-44 使用指数填充来隐藏消息实际长度
 */
function calcPaddedLen(unpadded_len: number): number {
  if (unpadded_len < MIN_PLAINTEXT_SIZE || unpadded_len > MAX_PLAINTEXT_SIZE) {
    throw new Error(`Invalid plaintext length: ${unpadded_len}`)
  }

  if (unpadded_len <= 32) return 32

  const nextPower = 1 << (Math.floor(Math.log2(unpadded_len - 1)) + 1)
  const chunk = nextPower <= 256 ? 32 : nextPower / 8

  return chunk * Math.ceil(unpadded_len / chunk)
}

/**
 * 添加填充
 */
function pad(plaintext: string): Uint8Array {
  const unpadded = new TextEncoder().encode(plaintext)
  const unpaddedLen = unpadded.length
  const paddedLen = calcPaddedLen(unpaddedLen)

  const padded = new Uint8Array(2 + paddedLen)
  // 写入原始长度 (大端序)
  padded[0] = (unpaddedLen >> 8) & 0xff
  padded[1] = unpaddedLen & 0xff
  // 写入内容
  padded.set(unpadded, 2)
  // 剩余部分已经是 0

  return padded
}

/**
 * 移除填充
 */
function unpad(padded: Uint8Array): string {
  const unpaddedLen = (padded[0] << 8) | padded[1]

  if (unpaddedLen < MIN_PLAINTEXT_SIZE ||
      unpaddedLen > MAX_PLAINTEXT_SIZE ||
      unpaddedLen > padded.length - 2) {
    throw new Error('Invalid padding')
  }

  const unpadded = padded.slice(2, 2 + unpaddedLen)
  return new TextDecoder().decode(unpadded)
}

/**
 * NIP-44 加密
 */
export function encrypt(
  plaintext: string,
  conversationKey: Uint8Array,
  nonce?: Uint8Array
): string {
  // 生成随机 nonce (如果未提供)
  const n = nonce || randomBytes(32)

  // 派生消息密钥
  const { chacha_key, chacha_nonce, hmac_key } = getMessageKeys(conversationKey, n)

  // 填充消息
  const padded = pad(plaintext)

  // XChaCha20-Poly1305 加密
  const cipher = xchacha20poly1305(chacha_key, chacha_nonce)
  const ciphertext = cipher.encrypt(padded)

  // 计算 HMAC (nonce + ciphertext)
  const hmacData = new Uint8Array(32 + ciphertext.length)
  hmacData.set(n, 0)
  hmacData.set(ciphertext, 32)

  // 使用 HMAC-SHA256 (简化实现，实际应使用 @noble/hashes/hmac)
  const mac = hmacSha256(hmac_key, hmacData)

  // 组装最终载荷: version (1) + nonce (32) + ciphertext + mac (32)
  const payload = new Uint8Array(1 + 32 + ciphertext.length + 32)
  payload[0] = NIP44_VERSION
  payload.set(n, 1)
  payload.set(ciphertext, 33)
  payload.set(mac, 33 + ciphertext.length)

  return base64.encode(payload)
}

/**
 * NIP-44 解密
 */
export function decrypt(
  payload: string,
  conversationKey: Uint8Array
): string {
  const data = base64.decode(payload)

  // 检查版本
  const version = data[0]
  if (version !== NIP44_VERSION) {
    throw new Error(`Unsupported NIP-44 version: ${version}`)
  }

  // 解析载荷
  const nonce = data.slice(1, 33)
  const ciphertextWithMac = data.slice(33)
  const mac = ciphertextWithMac.slice(-32)
  const ciphertext = ciphertextWithMac.slice(0, -32)

  // 派生消息密钥
  const { chacha_key, chacha_nonce, hmac_key } = getMessageKeys(conversationKey, nonce)

  // 验证 HMAC
  const hmacData = new Uint8Array(32 + ciphertext.length)
  hmacData.set(nonce, 0)
  hmacData.set(ciphertext, 32)
  const expectedMac = hmacSha256(hmac_key, hmacData)

  if (!constantTimeEqual(mac, expectedMac)) {
    throw new Error('Invalid MAC')
  }

  // 解密
  const cipher = xchacha20poly1305(chacha_key, chacha_nonce)
  const padded = cipher.decrypt(ciphertext)

  // 移除填充
  return unpad(padded)
}

// ============ 辅助函数 ============

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string')
  }
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  // HMAC-SHA256 实现
  const blockSize = 64
  let k = key

  if (k.length > blockSize) {
    k = sha256(k)
  }

  const iPad = new Uint8Array(blockSize)
  const oPad = new Uint8Array(blockSize)

  for (let i = 0; i < blockSize; i++) {
    iPad[i] = (k[i] || 0) ^ 0x36
    oPad[i] = (k[i] || 0) ^ 0x5c
  }

  const inner = new Uint8Array(blockSize + data.length)
  inner.set(iPad)
  inner.set(data, blockSize)
  const innerHash = sha256(inner)

  const outer = new Uint8Array(blockSize + 32)
  outer.set(oPad)
  outer.set(innerHash, blockSize)

  return sha256(outer)
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false

  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i]
  }

  return result === 0
}

export { hexToBytes, bytesToHex }
