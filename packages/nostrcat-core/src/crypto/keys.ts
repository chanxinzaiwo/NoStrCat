/**
 * 密钥管理模块
 *
 * 处理 Nostr 和 OP_CAT Layer 的密钥生成、派生和签名
 * 使用 secp256k1 椭圆曲线
 */

import * as secp256k1 from '@noble/secp256k1'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex, hexToBytes } from '../utils/encoding'

/**
 * 密钥对接口
 */
export interface KeyPair {
  privateKey: string  // 十六进制私钥
  publicKey: string   // 十六进制公钥（压缩格式，无前缀）
}

/**
 * 生成新的密钥对
 * @returns 新生成的密钥对
 */
export function generateKeyPair(): KeyPair {
  // 生成随机私钥
  const privateKeyBytes = secp256k1.utils.randomPrivateKey()
  const privateKey = bytesToHex(privateKeyBytes)

  // 派生公钥
  const publicKey = derivePublicKey(privateKey)

  return { privateKey, publicKey }
}

/**
 * 从私钥派生公钥
 * @param privateKey 十六进制私钥
 * @returns 十六进制公钥（无前缀）
 */
export function derivePublicKey(privateKey: string): string {
  const privateKeyBytes = hexToBytes(privateKey)
  const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, true)
  // 返回不带前缀的公钥（32字节）
  return bytesToHex(publicKeyBytes.slice(1))
}

/**
 * 签名事件
 * @param eventHash 事件哈希（32字节十六进制）
 * @param privateKey 私钥（十六进制）
 * @returns 签名（十六进制）
 */
export async function signEvent(eventHash: string, privateKey: string): Promise<string> {
  const hashBytes = hexToBytes(eventHash)
  const privateKeyBytes = hexToBytes(privateKey)

  const signature = await secp256k1.signAsync(hashBytes, privateKeyBytes)
  return bytesToHex(signature.toCompactRawBytes())
}

/**
 * 验证签名
 * @param eventHash 事件哈希
 * @param signature 签名
 * @param publicKey 公钥
 * @returns 是否有效
 */
export function verifySignature(
  eventHash: string,
  signature: string,
  publicKey: string
): boolean {
  try {
    const hashBytes = hexToBytes(eventHash)
    const sigBytes = hexToBytes(signature)
    // 添加压缩公钥前缀
    const pubKeyBytes = hexToBytes('02' + publicKey)

    return secp256k1.verify(sigBytes, hashBytes, pubKeyBytes)
  } catch {
    return false
  }
}

/**
 * 计算共享密钥（用于 NIP-04 加密）
 * @param privateKey 自己的私钥
 * @param publicKey 对方的公钥
 * @returns 共享密钥
 */
export function getSharedSecret(privateKey: string, publicKey: string): Uint8Array {
  const privateKeyBytes = hexToBytes(privateKey)
  const publicKeyBytes = hexToBytes('02' + publicKey)

  const sharedPoint = secp256k1.getSharedSecret(privateKeyBytes, publicKeyBytes)
  // 只返回 x 坐标作为共享密钥
  return sharedPoint.slice(1, 33)
}

/**
 * 从助记词派生密钥（BIP-39/BIP-32）
 * @param mnemonic 助记词
 * @param path 派生路径
 * @returns 密钥对
 */
export function deriveFromMnemonic(mnemonic: string, path: string): KeyPair {
  // 简化实现：实际应使用完整的 BIP-39/BIP-32 实现
  // 这里只做哈希派生演示
  const seed = sha256(new TextEncoder().encode(mnemonic + path))
  const privateKey = bytesToHex(seed)
  const publicKey = derivePublicKey(privateKey)

  return { privateKey, publicKey }
}

/**
 * 验证私钥是否有效
 * @param privateKey 十六进制私钥
 * @returns 是否有效
 */
export function isValidPrivateKey(privateKey: string): boolean {
  try {
    if (!/^[0-9a-f]{64}$/i.test(privateKey)) {
      return false
    }
    const keyBytes = hexToBytes(privateKey)
    return secp256k1.utils.isValidPrivateKey(keyBytes)
  } catch {
    return false
  }
}

/**
 * 验证公钥是否有效
 * @param publicKey 十六进制公钥（无前缀）
 * @returns 是否有效
 */
export function isValidPublicKey(publicKey: string): boolean {
  try {
    if (!/^[0-9a-f]{64}$/i.test(publicKey)) {
      return false
    }
    // 尝试用公钥验证一个假签名，如果公钥无效会抛出异常
    const pubKeyBytes = hexToBytes('02' + publicKey)
    // 验证点在曲线上
    secp256k1.ProjectivePoint.fromHex(pubKeyBytes)
    return true
  } catch {
    return false
  }
}
