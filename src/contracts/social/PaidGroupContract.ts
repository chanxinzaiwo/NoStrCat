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
  Sha256,
} from 'scrypt-ts'

/**
 * PaidGroupContract - 付费群组合约
 *
 * 支持订阅制群组：
 * - 月费/年费
 * - 自动续费检查
 * - 会员到期处理
 */
export class PaidGroupContract extends SmartContract {
  // 群主
  @prop()
  readonly owner: PubKey

  // 群组 ID
  @prop()
  readonly groupId: Sha256

  // 订阅周期费用
  @prop()
  readonly subscriptionFee: bigint

  // 订阅周期长度（秒）
  @prop()
  readonly periodDuration: bigint

  // 金库余额
  @prop(true)
  treasuryBalance: bigint

  // 活跃订阅数
  @prop(true)
  activeSubscriptions: bigint

  constructor(
    owner: PubKey,
    groupId: Sha256,
    subscriptionFee: bigint,
    periodDuration: bigint
  ) {
    super(...arguments)
    this.owner = owner
    this.groupId = groupId
    this.subscriptionFee = subscriptionFee
    this.periodDuration = periodDuration
    this.treasuryBalance = 0n
    this.activeSubscriptions = 0n
  }

  /**
   * 订阅群组
   * @param subscriberPubKey 订阅者公钥
   * @param sig 订阅者签名
   */
  @method()
  public subscribe(subscriberPubKey: PubKey, sig: Sig) {
    assert(this.checkSig(sig, subscriberPubKey), 'Invalid subscriber signature')

    this.treasuryBalance += this.subscriptionFee
    this.activeSubscriptions += 1n

    const outputs = this.buildStateOutput(this.ctx.utxo.value + this.subscriptionFee)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 续费
   * @param subscriberPubKey 订阅者公钥
   * @param sig 订阅者签名
   */
  @method()
  public renew(subscriberPubKey: PubKey, sig: Sig) {
    assert(this.checkSig(sig, subscriberPubKey), 'Invalid subscriber signature')

    this.treasuryBalance += this.subscriptionFee

    const outputs = this.buildStateOutput(this.ctx.utxo.value + this.subscriptionFee)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 群主提取收益
   * @param amount 提取金额
   * @param sig 群主签名
   */
  @method()
  public withdraw(amount: bigint, sig: Sig) {
    assert(this.checkSig(sig, this.owner), 'Only owner can withdraw')
    assert(amount <= this.treasuryBalance, 'Insufficient balance')

    this.treasuryBalance -= amount

    const ownerOutput = Utils.buildPublicKeyHashOutput(
      pubKey2Addr(this.owner),
      amount
    )

    const outputs = this.buildStateOutput(this.ctx.utxo.value - amount)
      + ownerOutput + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }
}
