import {
  assert,
  ByteString,
  hash256,
  method,
  prop,
  PubKey,
  pubKey2Addr,
  Sig,
  SmartContract,
  Utils,
  Sha256,
} from 'scrypt-ts'

/**
 * ZapContract - NoStrCat 原生微支付系统
 *
 * 替代 NIP-57 闪电网络 Zaps，实现链上微支付
 *
 * 特性：
 * - 直接 satoshi 转账（无闪电网络复杂性）
 * - 可选留言附加（通过 OP_RETURN）
 * - 支持超时退款
 * - 最小金额限制防止粉尘攻击
 *
 * 使用流程：
 * 1. 发送方创建 Zap 合约，锁定资金
 * 2. 接收方签名领取资金
 * 3. 如超时未领取，发送方可退款
 */
export class ZapContract extends SmartContract {
  // 收款人公钥
  @prop()
  readonly recipient: PubKey

  // 发送方公钥（用于退款）
  @prop()
  readonly sender: PubKey

  // 被打赏的 Nostr 事件 ID (sha256 哈希)
  @prop()
  readonly eventId: Sha256

  // 打赏留言哈希
  @prop()
  readonly memoHash: Sha256

  // 退款超时时间（区块高度或时间戳）
  @prop()
  readonly refundTimeout: bigint

  // 最小打赏金额（satoshis）
  @prop()
  readonly minAmount: bigint

  constructor(
    recipient: PubKey,
    sender: PubKey,
    eventId: Sha256,
    memoHash: Sha256,
    refundTimeout: bigint,
    minAmount: bigint
  ) {
    super(...arguments)
    this.recipient = recipient
    this.sender = sender
    this.eventId = eventId
    this.memoHash = memoHash
    this.refundTimeout = refundTimeout
    this.minAmount = minAmount
  }

  /**
   * 领取打赏 - 收款人收取资金
   * @param sig 收款人签名
   */
  @method()
  public claim(sig: Sig) {
    // 验证最小金额
    assert(this.ctx.utxo.value >= this.minAmount, 'Below minimum zap amount')

    // 验证收款人签名
    assert(
      this.checkSig(sig, this.recipient),
      'Invalid recipient signature'
    )
  }

  /**
   * 退款 - 发送方在超时后可取回资金
   * @param sig 发送方签名
   */
  @method()
  public refund(sig: Sig) {
    // 验证超时已到
    assert(this.timeLock(this.refundTimeout), 'Refund timeout not reached')

    // 验证发送方签名
    assert(
      this.checkSig(sig, this.sender),
      'Invalid sender signature'
    )
  }
}

// SplitZapContract moved to separate file: SplitZapContract.ts
// BatchZapContract moved to separate file: BatchZapContract.ts
