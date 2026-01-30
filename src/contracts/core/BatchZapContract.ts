import {
  assert,
  hash256,
  method,
  prop,
  PubKey,
  pubKey2Addr,
  Sig,
  SmartContract,
  Utils,
} from 'scrypt-ts'

/**
 * BatchZapContract - 批量打赏合约
 *
 * 允许一次交易打赏多个创作者
 * 适用于：
 * - 批量感谢贡献者
 * - 活动奖励分发
 * - 排行榜奖励
 */
export class BatchZapContract extends SmartContract {
  // 发送方
  @prop()
  readonly sender: PubKey

  // 收款人1
  @prop()
  readonly recipient1: PubKey

  // 收款人2
  @prop()
  readonly recipient2: PubKey

  // 收款人3
  @prop()
  readonly recipient3: PubKey

  // 金额1
  @prop()
  readonly amount1: bigint

  // 金额2
  @prop()
  readonly amount2: bigint

  // 金额3
  @prop()
  readonly amount3: bigint

  // 退款超时
  @prop()
  readonly refundTimeout: bigint

  constructor(
    sender: PubKey,
    recipient1: PubKey,
    recipient2: PubKey,
    recipient3: PubKey,
    amount1: bigint,
    amount2: bigint,
    amount3: bigint,
    refundTimeout: bigint
  ) {
    super(...arguments)
    this.sender = sender
    this.recipient1 = recipient1
    this.recipient2 = recipient2
    this.recipient3 = recipient3
    this.amount1 = amount1
    this.amount2 = amount2
    this.amount3 = amount3
    this.refundTimeout = refundTimeout
  }

  /**
   * 批量领取
   */
  @method()
  public claimAll(sig1: Sig, sig2: Sig, sig3: Sig) {
    // 验证总金额
    const totalRequired = this.amount1 + this.amount2 + this.amount3
    assert(this.ctx.utxo.value >= totalRequired, 'Insufficient funds')

    // 构建输出
    let outputs = Utils.buildPublicKeyHashOutput(
      pubKey2Addr(this.recipient1),
      this.amount1
    )
    outputs += Utils.buildPublicKeyHashOutput(
      pubKey2Addr(this.recipient2),
      this.amount2
    )
    outputs += Utils.buildPublicKeyHashOutput(
      pubKey2Addr(this.recipient3),
      this.amount3
    )
    outputs += this.buildChangeOutput()

    assert(hash256(outputs) == this.ctx.hashOutputs, 'Invalid outputs')

    // 验证所有签名
    assert(this.checkSig(sig1, this.recipient1), 'Invalid signature 1')
    assert(this.checkSig(sig2, this.recipient2), 'Invalid signature 2')
    assert(this.checkSig(sig3, this.recipient3), 'Invalid signature 3')
  }

  /**
   * 批量退款
   */
  @method()
  public refundAll(sig: Sig) {
    assert(this.timeLock(this.refundTimeout), 'Refund timeout not reached')
    assert(this.checkSig(sig, this.sender), 'Invalid sender signature')
  }
}
