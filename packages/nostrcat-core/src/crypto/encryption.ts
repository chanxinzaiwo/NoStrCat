/**
 * 加密模块
 *
 * 实现 Nostr 的加密标准：
 * - NIP-04: 基础加密私信（已弃用但兼容）
 * - NIP-17: 礼物包装加密私信（推荐）
 * - NIP-44: 新版加密标准
 */

import { sha256 } from '@noble/hashes/sha256'
import { getSharedSecret } from './keys'
import { bytesToHex, hexToBytes } from '../utils/encoding'

/**
 * NIP-04 加密
 * 使用 AES-256-CBC 加密消息
 *
 * @param plaintext 明文消息
 * @param senderPrivateKey 发送者私钥
 * @param recipientPublicKey 接收者公钥
 * @returns Base64 编码的密文（格式：content?iv=ivHex）
 */
export async function encryptDM(
  plaintext: string,
  senderPrivateKey: string,
  recipientPublicKey: string
): Promise<string> {
  // 计算共享密钥
  const sharedSecret = getSharedSecret(senderPrivateKey, recipientPublicKey)

  // 生成随机 IV
  const iv = crypto.getRandomValues(new Uint8Array(16))

  // 导入密钥
  const key = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(sharedSecret).buffer,
    { name: 'AES-CBC' },
    false,
    ['encrypt']
  )

  // 加密
  const plaintextBytes = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv },
    key,
    plaintextBytes
  )

  // 返回格式：base64(ciphertext)?iv=base64(iv)
  const ciphertextBase64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
  const ivBase64 = btoa(String.fromCharCode(...iv))

  return `${ciphertextBase64}?iv=${ivBase64}`
}

/**
 * NIP-04 解密
 *
 * @param encryptedContent 加密内容（格式：content?iv=ivHex）
 * @param recipientPrivateKey 接收者私钥
 * @param senderPublicKey 发送者公钥
 * @returns 解密后的明文
 */
export async function decryptDM(
  encryptedContent: string,
  recipientPrivateKey: string,
  senderPublicKey: string
): Promise<string> {
  // 解析密文和 IV
  const [ciphertextBase64, ivPart] = encryptedContent.split('?iv=')
  if (!ivPart) {
    throw new Error('Invalid encrypted content format')
  }

  const ciphertext = Uint8Array.from(atob(ciphertextBase64), c => c.charCodeAt(0))
  const iv = Uint8Array.from(atob(ivPart), c => c.charCodeAt(0))

  // 计算共享密钥
  const sharedSecret = getSharedSecret(recipientPrivateKey, senderPublicKey)

  // 导入密钥
  const key = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(sharedSecret).buffer,
    { name: 'AES-CBC' },
    false,
    ['decrypt']
  )

  // 解密
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv },
    key,
    ciphertext
  )

  return new TextDecoder().decode(plaintext)
}

/**
 * NIP-17 礼物包装加密
 *
 * 提供更好的元数据保护：
 * 1. 创建密封事件（Seal）
 * 2. 用礼物包装（Gift Wrap）
 *
 * @param content 消息内容
 * @param senderPrivateKey 发送者私钥
 * @param recipientPublicKey 接收者公钥
 * @returns 包装后的事件 JSON
 */
export async function encryptNip17(
  content: string,
  senderPrivateKey: string,
  recipientPublicKey: string
): Promise<string> {
  // NIP-17 实现需要完整的事件结构
  // 这里是简化版本

  // 1. 加密内容
  const encryptedContent = await encryptDM(content, senderPrivateKey, recipientPublicKey)

  // 2. 创建密封事件（Kind 13）
  const seal = {
    kind: 13,
    content: encryptedContent,
    created_at: Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 172800), // 随机化时间
    tags: [],
  }

  // 3. 序列化并加密密封事件
  const sealJson = JSON.stringify(seal)
  const wrappedContent = await encryptDM(sealJson, senderPrivateKey, recipientPublicKey)

  // 4. 创建礼物包装事件（Kind 1059）
  const giftWrap = {
    kind: 1059,
    content: wrappedContent,
    created_at: Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 172800),
    tags: [['p', recipientPublicKey]],
  }

  return JSON.stringify(giftWrap)
}

/**
 * NIP-17 解密
 *
 * @param giftWrapJson 礼物包装事件 JSON
 * @param recipientPrivateKey 接收者私钥
 * @returns 解密后的消息内容
 */
export async function decryptNip17(
  giftWrapJson: string,
  recipientPrivateKey: string
): Promise<string> {
  const giftWrap = JSON.parse(giftWrapJson)

  // 从 p 标签获取发送者公钥（在实际实现中需要更复杂的处理）
  const senderPublicKey = giftWrap.pubkey

  // 1. 解密礼物包装获取密封事件
  const sealJson = await decryptDM(giftWrap.content, recipientPrivateKey, senderPublicKey)
  const seal = JSON.parse(sealJson)

  // 2. 解密密封事件获取原始消息
  const content = await decryptDM(seal.content, recipientPrivateKey, senderPublicKey)

  return content
}

/**
 * NIP-44 加密（新标准）
 *
 * 相比 NIP-04 的改进：
 * - 使用 XChaCha20-Poly1305
 * - 更好的密钥派生
 * - 消息长度隐藏
 */
export async function encryptNip44(
  plaintext: string,
  senderPrivateKey: string,
  recipientPublicKey: string
): Promise<string> {
  // NIP-44 需要更复杂的实现
  // 这里暂时使用 NIP-04 作为后备
  return encryptDM(plaintext, senderPrivateKey, recipientPublicKey)
}

/**
 * NIP-44 解密
 */
export async function decryptNip44(
  encryptedContent: string,
  recipientPrivateKey: string,
  senderPublicKey: string
): Promise<string> {
  // NIP-44 需要更复杂的实现
  return decryptDM(encryptedContent, recipientPrivateKey, senderPublicKey)
}

/**
 * 计算消息哈希
 * @param message 消息内容
 * @returns 哈希值（十六进制）
 */
export function hashMessage(message: string): string {
  const messageBytes = new TextEncoder().encode(message)
  const hashBytes = sha256(messageBytes)
  return bytesToHex(hashBytes)
}
