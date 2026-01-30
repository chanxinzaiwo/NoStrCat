/**
 * OP_CAT Layer 连接管理
 *
 * 处理与 OP_CAT Layer 区块链的交互
 */

import { KeyPair } from '../crypto/keys'
import { bytesToHex, hexToBytes } from '../utils/encoding'
import { sha256 } from '@noble/hashes/sha256'

/**
 * OP_CAT 网络配置
 */
export interface OPCATConfig {
  name: string
  rpcUrl: string
  explorerUrl: string
  electrsUrl: string
}

/**
 * UTXO 结构
 */
export interface UTXO {
  txid: string
  vout: number
  value: bigint
  scriptPubKey: string
  confirmations: number
}

/**
 * 交易输出
 */
export interface TxOutput {
  address: string
  value: bigint
  script?: string
}

/**
 * 交易结果
 */
export interface TxResult {
  txid: string
  success: boolean
  error?: string
}

/**
 * OP_CAT Layer 连接类
 */
export class OPCATConnection {
  private config: OPCATConfig
  private connected = false

  constructor(config: OPCATConfig) {
    this.config = config
  }

  /**
   * 连接到 OP_CAT 网络
   */
  async connect(): Promise<void> {
    try {
      // 检查网络状态
      const response = await fetch(`${this.config.electrsUrl}/blocks/tip/height`, {
        signal: AbortSignal.timeout(5000), // 5秒超时
      })
      if (response.ok) {
        this.connected = true
      }
    } catch (error) {
      console.warn('Failed to connect to OP_CAT network (non-blocking):', error)
      // 不抛出错误，允许 Nostr 独立工作
      this.connected = false
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    this.connected = false
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.connected
  }

  /**
   * 从公钥派生地址
   */
  getAddress(publicKey: string): string {
    // P2PKH 地址生成（简化版）
    const pubKeyBytes = hexToBytes(publicKey)
    const hash160 = this.hash160(pubKeyBytes)
    // 实际实现需要 Base58Check 编码
    return 'bc1q' + bytesToHex(hash160).slice(0, 40)
  }

  /**
   * 获取地址余额
   */
  async getBalance(address: string): Promise<bigint> {
    try {
      const response = await fetch(`${this.config.electrsUrl}/address/${address}`)
      const data = await response.json()
      return BigInt(data.chain_stats?.funded_txo_sum || 0) -
        BigInt(data.chain_stats?.spent_txo_sum || 0)
    } catch (error) {
      console.error('Failed to get balance:', error)
      return 0n
    }
  }

  /**
   * 获取地址的 UTXO 列表
   */
  async getUTXOs(address: string): Promise<UTXO[]> {
    try {
      const response = await fetch(`${this.config.electrsUrl}/address/${address}/utxo`)
      const data = await response.json()
      return data.map((utxo: {
        txid: string
        vout: number
        value: number
        status: { confirmed: boolean; block_height?: number }
      }) => ({
        txid: utxo.txid,
        vout: utxo.vout,
        value: BigInt(utxo.value),
        scriptPubKey: '',
        confirmations: utxo.status.confirmed ? 1 : 0,
      }))
    } catch (error) {
      console.error('Failed to get UTXOs:', error)
      return []
    }
  }

  /**
   * 获取交易详情
   */
  async getTransaction(txid: string): Promise<object | null> {
    try {
      const response = await fetch(`${this.config.electrsUrl}/tx/${txid}`)
      return await response.json()
    } catch (error) {
      console.error('Failed to get transaction:', error)
      return null
    }
  }

  /**
   * 广播交易
   */
  async broadcastTransaction(txHex: string): Promise<TxResult> {
    try {
      const response = await fetch(`${this.config.electrsUrl}/tx`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: txHex,
      })

      if (response.ok) {
        const txid = await response.text()
        return { txid, success: true }
      } else {
        const error = await response.text()
        return { txid: '', success: false, error }
      }
    } catch (error) {
      return {
        txid: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * 发送 Zap（链上打赏）
   *
   * 创建并广播 ZapContract 交易
   */
  async sendZap(
    sender: KeyPair,
    recipientPubkey: string,
    amount: bigint,
    eventId?: string,
    memo?: string
  ): Promise<string> {
    // 简化实现：实际需要完整的交易构建和合约部署
    const zapData = {
      type: 'zap',
      sender: sender.publicKey,
      recipient: recipientPubkey,
      amount: amount.toString(),
      eventId: eventId || '',
      memo: memo || '',
      timestamp: Date.now(),
    }

    // 计算 Zap ID
    const zapId = bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(zapData))))

    console.log('Zap created:', zapId)
    console.log('Zap data:', zapData)

    // 实际实现需要：
    // 1. 获取发送者的 UTXOs
    // 2. 构建 ZapContract 部署交易
    // 3. 签名交易
    // 4. 广播交易

    return zapId
  }

  /**
   * 锚定内容到链上
   */
  async anchorContent(
    author: KeyPair,
    eventId: string,
    eventHash: string
  ): Promise<string> {
    const anchorData = {
      type: 'anchor',
      author: author.publicKey,
      eventId,
      eventHash,
      timestamp: Date.now(),
    }

    // 计算锚点 ID
    const anchorId = bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(anchorData))))

    console.log('Anchor created:', anchorId)
    console.log('Anchor data:', anchorData)

    // 实际实现需要：
    // 1. 构建 ContentAnchorContract 部署交易
    // 2. 签名并广播

    return anchorId
  }

  /**
   * 验证内容锚点
   */
  async verifyAnchor(eventId: string): Promise<boolean> {
    // 实际实现需要：
    // 1. 在链上查询对应的锚点合约
    // 2. 验证事件哈希匹配
    console.log('Verifying anchor for event:', eventId)
    return true
  }

  /**
   * 部署智能合约
   */
  async deployContract(
    contractCode: string,
    constructorArgs: unknown[],
    signer: KeyPair
  ): Promise<TxResult> {
    // 实际实现需要：
    // 1. 编译合约代码
    // 2. 构建部署交易
    // 3. 签名并广播
    console.log('Deploying contract:', contractCode.slice(0, 50) + '...')
    console.log('Constructor args:', constructorArgs)

    return {
      txid: 'mock_deploy_tx_' + Date.now(),
      success: true,
    }
  }

  /**
   * 调用智能合约方法
   */
  async callContract(
    contractUtxo: UTXO,
    methodName: string,
    args: unknown[],
    signer: KeyPair
  ): Promise<TxResult> {
    console.log('Calling contract method:', methodName)
    console.log('Args:', args)

    return {
      txid: 'mock_call_tx_' + Date.now(),
      success: true,
    }
  }

  /**
   * 获取当前区块高度
   */
  async getBlockHeight(): Promise<number> {
    try {
      const response = await fetch(`${this.config.electrsUrl}/blocks/tip/height`)
      return parseInt(await response.text())
    } catch {
      return 0
    }
  }

  /**
   * 获取交易费率估算
   */
  async getFeeEstimate(): Promise<number> {
    try {
      const response = await fetch(`${this.config.electrsUrl}/fee-estimates`)
      const data = await response.json()
      return data['1'] || 1 // 1 区块确认的费率
    } catch {
      return 1 // 默认 1 sat/vbyte
    }
  }

  /**
   * 获取浏览器链接
   */
  getExplorerUrl(type: 'tx' | 'address' | 'block', id: string): string {
    return `${this.config.explorerUrl}/${type}/${id}`
  }

  /**
   * HASH160 (SHA256 + RIPEMD160)
   * 简化实现
   */
  private hash160(data: Uint8Array): Uint8Array {
    // 实际需要 RIPEMD160
    // 这里用 SHA256 的前 20 字节模拟
    const hash = sha256(data)
    return hash.slice(0, 20)
  }
}
