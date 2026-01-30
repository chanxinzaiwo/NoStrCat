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
  FixedArray,
} from 'scrypt-ts'

/**
 * SubscriptionContract - 创作者订阅系统合约
 *
 * 支持创作者经济的核心合约：
 * - 月费/年费订阅
 * - 多档位订阅
 * - 自动续费逻辑
 * - 优惠期/宽限期
 *
 * 类似 Patreon/Substack 的功能，但完全去中心化
 */
export class SubscriptionContract extends SmartContract {
  // 内容创作者公钥
  @prop()
  readonly creator: PubKey

  // 订阅者公钥
  @prop()
  readonly subscriber: PubKey

  // 每期订阅价格（satoshis）
  @prop()
  readonly pricePerPeriod: bigint

  // 订阅周期长度（秒）
  // 例如：2592000 = 30天，31536000 = 365天
  @prop()
  readonly periodDuration: bigint

  // 当前期到期时间
  @prop(true)
  currentExpiry: bigint

  // 已订阅总期数
  @prop(true)
  totalPeriods: bigint

  // 订阅档位 ID
  @prop()
  readonly tierId: Sha256

  // 订阅状态：0=活跃, 1=已取消, 2=已过期
  @prop(true)
  subscriptionStatus: bigint

  // 宽限期（过期后多久还能续费，秒）
  @prop()
  readonly gracePeriod: bigint

  constructor(
    creator: PubKey,
    subscriber: PubKey,
    pricePerPeriod: bigint,
    periodDuration: bigint,
    initialExpiry: bigint,
    tierId: Sha256,
    gracePeriod: bigint
  ) {
    super(...arguments)
    this.creator = creator
    this.subscriber = subscriber
    this.pricePerPeriod = pricePerPeriod
    this.periodDuration = periodDuration
    this.currentExpiry = initialExpiry
    this.totalPeriods = 1n
    this.tierId = tierId
    this.subscriptionStatus = 0n // 活跃
    this.gracePeriod = gracePeriod
  }

  /**
   * 续费订阅
   * 订阅者支付下一期费用
   * @param sig 订阅者签名
   */
  @method()
  public renew(sig: Sig) {
    // 验证订阅者
    assert(this.checkSig(sig, this.subscriber), 'Invalid subscriber signature')

    // 验证可续费（活跃或在宽限期内）
    assert(
      this.subscriptionStatus == 0n ||
      (this.subscriptionStatus == 2n),
      'Cannot renew: subscription cancelled'
    )

    // 延长到期时间
    this.currentExpiry += this.periodDuration
    this.totalPeriods += 1n
    this.subscriptionStatus = 0n // 确保状态为活跃

    // 创作者收到订阅费
    const creatorOutput = Utils.buildPublicKeyHashOutput(
      pubKey2Addr(this.creator),
      this.pricePerPeriod
    )

    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + creatorOutput + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 批量续费多期
   * @param periods 续费期数
   * @param sig 订阅者签名
   */
  @method()
  public renewMultiple(periods: bigint, sig: Sig) {
    assert(periods > 0n, 'Must renew at least one period')
    assert(this.checkSig(sig, this.subscriber), 'Invalid subscriber signature')
    assert(
      this.subscriptionStatus == 0n || this.subscriptionStatus == 2n,
      'Cannot renew: subscription cancelled'
    )

    // 计算总费用
    const totalPayment = this.pricePerPeriod * periods

    // 延长到期时间
    this.currentExpiry += this.periodDuration * periods
    this.totalPeriods += periods
    this.subscriptionStatus = 0n

    const creatorOutput = Utils.buildPublicKeyHashOutput(
      pubKey2Addr(this.creator),
      totalPayment
    )

    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + creatorOutput + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 取消订阅
   * 订阅者主动取消，当前期仍有效
   * @param sig 订阅者签名
   */
  @method()
  public cancel(sig: Sig) {
    assert(this.subscriptionStatus == 0n, 'Subscription not active')
    assert(this.checkSig(sig, this.subscriber), 'Invalid subscriber signature')

    this.subscriptionStatus = 1n // 已取消

    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 标记过期
   * 任何人可在到期后调用，更新状态
   * @param currentTimestamp 当前时间戳
   */
  @method()
  public markExpired(currentTimestamp: bigint) {
    // 验证确实已过期
    assert(currentTimestamp > this.currentExpiry, 'Subscription not expired yet')
    assert(this.subscriptionStatus == 0n, 'Subscription not active')

    this.subscriptionStatus = 2n // 已过期

    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 创作者领取合约中累积的资金
   * @param sig 创作者签名
   */
  @method()
  public creatorWithdraw(sig: Sig) {
    assert(this.checkSig(sig, this.creator), 'Invalid creator signature')

    const creatorOutput = Utils.buildPublicKeyHashOutput(
      pubKey2Addr(this.creator),
      this.ctx.utxo.value
    )

    assert(
      hash256(creatorOutput + this.buildChangeOutput()) == this.ctx.hashOutputs,
      'Invalid outputs'
    )
  }
}

// MultiTierSubscriptionContract moved to separate file: MultiTierSubscriptionContract.ts
// PaidContentContract moved to separate file: PaidContentContract.ts

/**
 * SubscriptionTier - 订阅档位信息
 * 存储在链下
 */
export interface SubscriptionTier {
  // 档位 ID
  id: string
  // 档位名称
  name: string
  // 档位描述
  description: string
  // 价格（satoshis）
  price: number
  // 周期（天）
  periodDays: number
  // 权益列表
  benefits: string[]
  // 是否推荐
  recommended: boolean
}
