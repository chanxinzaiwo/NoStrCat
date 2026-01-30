/**
 * 钱包模块
 *
 * 管理 OP_CAT Layer 上的资产
 * 支持 UTXO 管理、交易构建、余额查询
 */

import { KeyPair, signEvent } from '../crypto/keys'
import { OPCATConnection, UTXO, TxResult } from '../client/OPCATConnection'
import { TransactionBuilder } from './TransactionBuilder'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '../utils/encoding'

/**
 * 钱包配置
 */
export interface WalletConfig {
  // 网络类型
  network: 'mainnet' | 'testnet' | 'local'
  // 默认手续费率 (sats/vbyte)
  defaultFeeRate?: number
  // 粉尘限制
  dustLimit?: number
}

/**
 * 交易记录
 */
export interface Transaction {
  txid: string
  type: 'send' | 'receive' | 'zap_sent' | 'zap_received' | 'contract'
  amount: bigint
  fee?: bigint
  counterparty?: string
  memo?: string
  timestamp: number
  status: 'pending' | 'confirmed' | 'failed'
  confirmations: number
  rawTx?: string
}

/**
 * 余额信息
 */
export interface Balance {
  confirmed: bigint
  unconfirmed: bigint
  total: bigint
}

/**
 * 钱包类
 */
export class Wallet {
  private connection: OPCATConnection
  private keyPair: KeyPair
  private config: WalletConfig
  private utxos: UTXO[] = []
  private transactions: Transaction[] = []
  private address: string

  constructor(
    connection: OPCATConnection,
    keyPair: KeyPair,
    config: WalletConfig
  ) {
    this.connection = connection
    this.keyPair = keyPair
    this.config = {
      defaultFeeRate: 1,
      dustLimit: 546,
      ...config,
    }
    this.address = connection.getAddress(keyPair.publicKey)
  }

  /**
   * 获取钱包地址
   */
  getAddress(): string {
    return this.address
  }

  /**
   * 获取公钥
   */
  getPublicKey(): string {
    return this.keyPair.publicKey
  }

  /**
   * 获取余额
   */
  async getBalance(): Promise<Balance> {
    const utxos = await this.connection.getUTXOs(this.address)
    this.utxos = utxos

    let confirmed = 0n
    let unconfirmed = 0n

    for (const utxo of utxos) {
      if (utxo.confirmations > 0) {
        confirmed += utxo.value
      } else {
        unconfirmed += utxo.value
      }
    }

    return {
      confirmed,
      unconfirmed,
      total: confirmed + unconfirmed,
    }
  }

  /**
   * 获取 UTXO 列表
   */
  async getUTXOs(): Promise<UTXO[]> {
    this.utxos = await this.connection.getUTXOs(this.address)
    return this.utxos
  }

  /**
   * 发送交易
   * @param toAddress 接收地址
   * @param amount 金额 (satoshis)
   * @param memo 备注
   */
  async send(toAddress: string, amount: bigint, memo?: string): Promise<TxResult> {
    // 确保有足够的 UTXO
    await this.getUTXOs()

    // 计算手续费
    const feeRate = BigInt(this.config.defaultFeeRate || 1)
    const estimatedSize = 200n // 简化估算
    const fee = feeRate * estimatedSize

    // 选择 UTXO
    const { selectedUtxos, change } = this.selectUtxos(amount + fee)

    if (selectedUtxos.length === 0) {
      return {
        txid: '',
        success: false,
        error: 'Insufficient funds',
      }
    }

    // 构建交易
    const builder = new TransactionBuilder(this.config.network)

    // 添加输入
    for (const utxo of selectedUtxos) {
      builder.addInput(utxo.txid, utxo.vout, utxo.value)
    }

    // 添加输出
    builder.addOutput(toAddress, amount)

    // 添加找零
    if (change > BigInt(this.config.dustLimit || 546)) {
      builder.addOutput(this.address, change)
    }

    // 添加 OP_RETURN 备注
    if (memo) {
      builder.addOpReturn(memo)
    }

    // 签名
    const signedTx = await builder.sign(this.keyPair)

    // 广播
    const result = await this.connection.broadcastTransaction(signedTx)

    if (result.success) {
      // 记录交易
      this.transactions.push({
        txid: result.txid,
        type: 'send',
        amount,
        fee,
        counterparty: toAddress,
        memo,
        timestamp: Date.now(),
        status: 'pending',
        confirmations: 0,
        rawTx: signedTx,
      })
    }

    return result
  }

  /**
   * 选择 UTXO
   */
  private selectUtxos(targetAmount: bigint): {
    selectedUtxos: UTXO[]
    change: bigint
  } {
    // 按金额降序排序
    const sortedUtxos = [...this.utxos].sort((a, b) =>
      Number(b.value - a.value)
    )

    const selectedUtxos: UTXO[] = []
    let totalSelected = 0n

    for (const utxo of sortedUtxos) {
      if (totalSelected >= targetAmount) break

      selectedUtxos.push(utxo)
      totalSelected += utxo.value
    }

    const change = totalSelected - targetAmount

    return {
      selectedUtxos: totalSelected >= targetAmount ? selectedUtxos : [],
      change: change > 0n ? change : 0n,
    }
  }

  /**
   * 获取交易历史
   */
  async getTransactionHistory(limit = 50): Promise<Transaction[]> {
    // TODO: 从区块链获取交易历史
    // 目前返回本地记录
    return this.transactions.slice(0, limit)
  }

  /**
   * 获取交易详情
   */
  async getTransaction(txid: string): Promise<Transaction | null> {
    // 先查本地
    const localTx = this.transactions.find(tx => tx.txid === txid)
    if (localTx) {
      // 更新确认数
      const txInfo = await this.connection.getTransaction(txid)
      if (txInfo) {
        // 更新状态
      }
      return localTx
    }

    // 从网络查询
    const txInfo = await this.connection.getTransaction(txid)
    if (!txInfo) return null

    // TODO: 解析交易信息
    return null
  }

  /**
   * 估算手续费
   */
  estimateFee(numInputs: number, numOutputs: number): bigint {
    // 简化估算: 每个输入约 148 字节，每个输出约 34 字节
    const estimatedSize = numInputs * 148 + numOutputs * 34 + 10
    return BigInt(estimatedSize) * BigInt(this.config.defaultFeeRate || 1)
  }

  /**
   * 获取推荐手续费率
   */
  async getRecommendedFeeRate(): Promise<number> {
    return this.connection.getFeeEstimate()
  }

  /**
   * 验证地址
   */
  isValidAddress(address: string): boolean {
    // 简化验证
    if (!address) return false

    // OP_CAT Layer 地址格式
    if (address.startsWith('bc1') || address.startsWith('tb1')) {
      return address.length >= 42 && address.length <= 62
    }

    // Legacy 地址
    if (address.startsWith('1') || address.startsWith('3') ||
        address.startsWith('m') || address.startsWith('n') ||
        address.startsWith('2')) {
      return address.length >= 26 && address.length <= 35
    }

    return false
  }

  /**
   * 导出私钥 (谨慎使用)
   */
  exportPrivateKey(): string {
    return this.keyPair.privateKey
  }

  /**
   * 签名消息
   */
  async signMessage(message: string): Promise<string> {
    const messageHash = bytesToHex(sha256(new TextEncoder().encode(message)))
    return signEvent(messageHash, this.keyPair.privateKey)
  }

  /**
   * 获取区块浏览器链接
   */
  getExplorerUrl(type: 'address' | 'tx', id?: string): string {
    const target = id || (type === 'address' ? this.address : '')
    return this.connection.getExplorerUrl(type, target)
  }
}
