/**
 * Zap 支付管理
 *
 * 使用 OP_CAT Layer 替代闪电网络
 * 实现链上打赏、分成支付、批量支付
 */

import { NostrEvent, EventKind, createEvent, getEventHash } from '../../events/types'
import { signEvent, KeyPair } from '../../crypto/keys'
import { NostrConnection } from '../../client/NostrConnection'
import { OPCATConnection, TxResult } from '../../client/OPCATConnection'
import { Wallet } from '../../wallet/Wallet'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '../../utils/encoding'

/**
 * Zap 请求参数
 */
export interface ZapRequest {
  recipientPubkey: string
  amount: bigint
  eventId?: string      // 关联的事件 ID
  memo?: string         // 留言
  splitRecipients?: Array<{
    pubkey: string
    percentage: number  // 0-100
  }>
}

/**
 * Zap 收据
 */
export interface ZapReceipt {
  id: string
  sender: string
  recipient: string
  amount: bigint
  eventId?: string
  memo?: string
  txid: string
  createdAt: number
  status: 'pending' | 'confirmed' | 'failed'
}

/**
 * Zap 统计
 */
export interface ZapStats {
  totalSent: bigint
  totalReceived: bigint
  zapsSent: number
  zapsReceived: number
}

/**
 * Zap 管理类
 */
export class ZapManager {
  private connection: NostrConnection
  private opcatConnection: OPCATConnection
  private wallet: Wallet
  private keyPair: KeyPair
  private sentZaps: Map<string, ZapReceipt> = new Map()
  private receivedZaps: Map<string, ZapReceipt> = new Map()
  private onZapCallback?: (zap: ZapReceipt, isIncoming: boolean) => void
  private subscriptionId: string | null = null

  constructor(
    connection: NostrConnection,
    opcatConnection: OPCATConnection,
    wallet: Wallet,
    keyPair: KeyPair
  ) {
    this.connection = connection
    this.opcatConnection = opcatConnection
    this.wallet = wallet
    this.keyPair = keyPair
  }

  /**
   * 发送 Zap（OP_CAT Layer 链上交易）
   */
  async sendZap(request: ZapRequest): Promise<ZapReceipt> {
    const {
      recipientPubkey,
      amount,
      eventId,
      memo,
      splitRecipients,
    } = request

    // 验证余额
    const balance = await this.wallet.getBalance()
    if (balance.total < amount) {
      throw new Error('Insufficient balance')
    }

    // 计算分成金额
    let txResult: TxResult

    if (splitRecipients && splitRecipients.length > 0) {
      // 分成支付
      txResult = await this.sendSplitZap(recipientPubkey, amount, splitRecipients, memo)
    } else {
      // 单一接收者
      const recipientAddress = this.opcatConnection.getAddress(recipientPubkey)
      txResult = await this.wallet.send(recipientAddress, amount, memo)
    }

    if (!txResult.success) {
      throw new Error(txResult.error || 'Transaction failed')
    }

    // 创建 Zap 收据事件
    const receiptEvent = await this.createZapReceipt({
      sender: this.keyPair.publicKey,
      recipient: recipientPubkey,
      amount,
      eventId,
      memo,
      txid: txResult.txid,
    })

    // 广播收据
    await this.connection.publish(receiptEvent)

    // 创建收据对象
    const receipt: ZapReceipt = {
      id: receiptEvent.id,
      sender: this.keyPair.publicKey,
      recipient: recipientPubkey,
      amount,
      eventId,
      memo,
      txid: txResult.txid,
      createdAt: Math.floor(Date.now() / 1000),
      status: 'pending',
    }

    this.sentZaps.set(receipt.id, receipt)

    return receipt
  }

  /**
   * 发送分成 Zap
   */
  private async sendSplitZap(
    primaryRecipient: string,
    totalAmount: bigint,
    splits: Array<{ pubkey: string; percentage: number }>,
    memo?: string
  ): Promise<TxResult> {
    // 验证分成比例总和不超过 100
    const totalPercentage = splits.reduce((sum, s) => sum + s.percentage, 0)
    if (totalPercentage > 100) {
      throw new Error('Split percentages exceed 100%')
    }

    // 计算主接收者金额
    const primaryPercentage = 100 - totalPercentage
    const primaryAmount = (totalAmount * BigInt(primaryPercentage)) / 100n

    // 计算分成金额
    const splitAmounts = splits.map(split => ({
      pubkey: split.pubkey,
      address: this.opcatConnection.getAddress(split.pubkey),
      amount: (totalAmount * BigInt(split.percentage)) / 100n,
    }))

    // TODO: 使用 SplitZapContract 实现原子化分成
    // 目前简化为顺序发送多笔交易

    // 发送主接收者金额
    const primaryAddress = this.opcatConnection.getAddress(primaryRecipient)
    const result = await this.wallet.send(primaryAddress, primaryAmount, memo)

    if (!result.success) {
      return result
    }

    // 发送分成金额
    for (const split of splitAmounts) {
      if (split.amount > 0n) {
        await this.wallet.send(split.address, split.amount, `Split from zap`)
      }
    }

    return result
  }

  /**
   * 创建 Zap 收据事件
   */
  private async createZapReceipt(data: {
    sender: string
    recipient: string
    amount: bigint
    eventId?: string
    memo?: string
    txid: string
  }): Promise<NostrEvent> {
    const tags: string[][] = [
      ['p', data.recipient],
      ['amount', data.amount.toString()],
      ['opcat', data.txid],
      ['opcat-type', 'zap'],
    ]

    if (data.eventId) {
      tags.push(['e', data.eventId])
    }

    // Kind 30080: OP_CAT Zap 收据（自定义协议）
    const unsignedEvent = {
      ...createEvent(30080, data.memo || '', tags),
      pubkey: data.sender,
    }

    const id = getEventHash(unsignedEvent)
    const sig = await signEvent(id, this.keyPair.privateKey)

    return {
      ...unsignedEvent,
      id,
      sig,
    }
  }

  /**
   * 订阅收到的 Zap
   */
  subscribe(onZap: (zap: ZapReceipt, isIncoming: boolean) => void): void {
    this.onZapCallback = onZap

    // 订阅发给我的 Zap 收据
    this.subscriptionId = this.connection.subscribe(
      {
        kinds: [30080], // OP_CAT Zap 收据
        '#p': [this.keyPair.publicKey],
      },
      async (event) => {
        await this.handleZapReceipt(event, true)
      }
    )

    // 同时订阅我发出的 Zap（用于同步）
    this.connection.subscribe(
      {
        kinds: [30080],
        authors: [this.keyPair.publicKey],
      },
      async (event) => {
        await this.handleZapReceipt(event, false)
      }
    )
  }

  /**
   * 取消订阅
   */
  unsubscribe(): void {
    if (this.subscriptionId) {
      this.connection.unsubscribe(this.subscriptionId)
      this.subscriptionId = null
    }
  }

  /**
   * 处理 Zap 收据事件
   */
  private async handleZapReceipt(event: NostrEvent, isIncoming: boolean): Promise<void> {
    const recipientTag = event.tags.find(t => t[0] === 'p')
    const amountTag = event.tags.find(t => t[0] === 'amount')
    const opcatTag = event.tags.find(t => t[0] === 'opcat')
    const eventTag = event.tags.find(t => t[0] === 'e')

    if (!recipientTag || !amountTag || !opcatTag) return

    const receipt: ZapReceipt = {
      id: event.id,
      sender: event.pubkey,
      recipient: recipientTag[1],
      amount: BigInt(amountTag[1]),
      eventId: eventTag?.[1],
      memo: event.content,
      txid: opcatTag[1],
      createdAt: event.created_at,
      status: 'pending',
    }

    // 验证链上交易
    const txInfo = await this.opcatConnection.getTransaction(receipt.txid)
    if (txInfo) {
      receipt.status = 'confirmed'
    }

    if (isIncoming) {
      this.receivedZaps.set(receipt.id, receipt)
    } else {
      this.sentZaps.set(receipt.id, receipt)
    }

    if (this.onZapCallback) {
      this.onZapCallback(receipt, isIncoming)
    }
  }

  /**
   * 获取发送的 Zap 列表
   */
  getSentZaps(): ZapReceipt[] {
    return Array.from(this.sentZaps.values())
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  /**
   * 获取收到的 Zap 列表
   */
  getReceivedZaps(): ZapReceipt[] {
    return Array.from(this.receivedZaps.values())
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  /**
   * 获取特定事件的 Zap 列表
   */
  async getZapsForEvent(eventId: string): Promise<ZapReceipt[]> {
    const events = await this.connection.fetch({
      kinds: [30080],
      '#e': [eventId],
      limit: 1000,
    })

    const zaps: ZapReceipt[] = []

    for (const event of events) {
      const recipientTag = event.tags.find(t => t[0] === 'p')
      const amountTag = event.tags.find(t => t[0] === 'amount')
      const opcatTag = event.tags.find(t => t[0] === 'opcat')

      if (!recipientTag || !amountTag || !opcatTag) continue

      zaps.push({
        id: event.id,
        sender: event.pubkey,
        recipient: recipientTag[1],
        amount: BigInt(amountTag[1]),
        eventId,
        memo: event.content,
        txid: opcatTag[1],
        createdAt: event.created_at,
        status: 'confirmed',
      })
    }

    return zaps.sort((a, b) => b.createdAt - a.createdAt)
  }

  /**
   * 获取特定用户收到的 Zap 总额
   */
  async getZapTotalForUser(pubkey: string): Promise<bigint> {
    const events = await this.connection.fetch({
      kinds: [30080],
      '#p': [pubkey],
      limit: 10000,
    })

    let total = 0n

    for (const event of events) {
      const amountTag = event.tags.find(t => t[0] === 'amount')
      if (amountTag) {
        total += BigInt(amountTag[1])
      }
    }

    return total
  }

  /**
   * 获取 Zap 统计
   */
  async getStats(): Promise<ZapStats> {
    const sentZaps = Array.from(this.sentZaps.values())
    const receivedZaps = Array.from(this.receivedZaps.values())

    return {
      totalSent: sentZaps.reduce((sum, z) => sum + z.amount, 0n),
      totalReceived: receivedZaps.reduce((sum, z) => sum + z.amount, 0n),
      zapsSent: sentZaps.length,
      zapsReceived: receivedZaps.length,
    }
  }

  /**
   * 加载历史 Zap 记录
   */
  async loadHistory(limit = 100): Promise<void> {
    // 加载收到的
    const received = await this.connection.fetch({
      kinds: [30080],
      '#p': [this.keyPair.publicKey],
      limit,
    })

    for (const event of received) {
      await this.handleZapReceipt(event, true)
    }

    // 加载发送的
    const sent = await this.connection.fetch({
      kinds: [30080],
      authors: [this.keyPair.publicKey],
      limit,
    })

    for (const event of sent) {
      await this.handleZapReceipt(event, false)
    }
  }

  /**
   * 批量 Zap（一次性给多个用户打赏）
   */
  async batchZap(requests: Array<{
    pubkey: string
    amount: bigint
    eventId?: string
    memo?: string
  }>): Promise<ZapReceipt[]> {
    const receipts: ZapReceipt[] = []

    // TODO: 使用 BatchZapContract 实现原子化批量支付
    // 目前简化为顺序发送

    for (const request of requests) {
      try {
        const receipt = await this.sendZap({
          recipientPubkey: request.pubkey,
          amount: request.amount,
          eventId: request.eventId,
          memo: request.memo,
        })
        receipts.push(receipt)
      } catch (error) {
        console.error(`Failed to zap ${request.pubkey}:`, error)
      }
    }

    return receipts
  }

  /**
   * 生成 Zap 请求（用于接收 Zap）
   */
  async generateZapRequest(amount: bigint, memo?: string): Promise<string> {
    // 创建包含金额和接收地址的请求
    const address = this.wallet.getAddress()

    const requestData = {
      pubkey: this.keyPair.publicKey,
      address,
      amount: amount.toString(),
      memo,
      timestamp: Date.now(),
    }

    // 签名请求
    const dataHash = bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(requestData))))
    const signature = await signEvent(dataHash, this.keyPair.privateKey)

    return JSON.stringify({
      ...requestData,
      signature,
    })
  }

  /**
   * 验证 Zap 收据
   */
  async verifyZapReceipt(receiptId: string): Promise<{
    valid: boolean
    onChainConfirmed: boolean
    error?: string
  }> {
    const receipt = this.receivedZaps.get(receiptId) || this.sentZaps.get(receiptId)

    if (!receipt) {
      return { valid: false, onChainConfirmed: false, error: 'Receipt not found' }
    }

    // 验证链上交易
    const txInfo = await this.opcatConnection.getTransaction(receipt.txid)

    if (!txInfo) {
      return { valid: true, onChainConfirmed: false, error: 'Transaction not found on chain' }
    }

    // TODO: 验证交易金额是否匹配
    // TODO: 验证接收地址是否正确

    return { valid: true, onChainConfirmed: true }
  }
}
