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
 * MultiTierSubscriptionContract - 多档位订阅合约
 *
 * 支持多个订阅档位：
 * - 基础档：查看内容
 * - 高级档：参与讨论
 * - VIP档：私信创作者
 */
export class MultiTierSubscriptionContract extends SmartContract {
  // 创作者
  @prop()
  readonly creator: PubKey

  // 订阅者
  @prop()
  readonly subscriber: PubKey

  // 档位1价格（基础）
  @prop()
  readonly tier1Price: bigint

  // 档位2价格（高级）
  @prop()
  readonly tier2Price: bigint

  // 档位3价格（VIP）
  @prop()
  readonly tier3Price: bigint

  // 周期长度
  @prop()
  readonly periodDuration: bigint

  // 当前档位（1-3）
  @prop(true)
  currentTier: bigint

  // 当前期到期
  @prop(true)
  currentExpiry: bigint

  // 状态
  @prop(true)
  subscriptionStatus: bigint

  constructor(
    creator: PubKey,
    subscriber: PubKey,
    tier1Price: bigint,
    tier2Price: bigint,
    tier3Price: bigint,
    periodDuration: bigint,
    initialTier: bigint,
    initialExpiry: bigint
  ) {
    super(...arguments)
    this.creator = creator
    this.subscriber = subscriber
    this.tier1Price = tier1Price
    this.tier2Price = tier2Price
    this.tier3Price = tier3Price
    this.periodDuration = periodDuration
    this.currentTier = initialTier
    this.currentExpiry = initialExpiry
    this.subscriptionStatus = 0n
  }

  /**
   * 获取指定档位价格
   */
  @method()
  private getTierPrice(tier: bigint): bigint {
    let price = 0n
    if (tier == 1n) {
      price = this.tier1Price
    } else if (tier == 2n) {
      price = this.tier2Price
    } else if (tier == 3n) {
      price = this.tier3Price
    }
    return price
  }

  /**
   * 续费当前档位
   */
  @method()
  public renew(sig: Sig) {
    assert(this.subscriptionStatus == 0n || this.subscriptionStatus == 2n, 'Cannot renew')
    assert(this.checkSig(sig, this.subscriber), 'Invalid signature')

    const price = this.getTierPrice(this.currentTier)
    this.currentExpiry += this.periodDuration
    this.subscriptionStatus = 0n

    const creatorOutput = Utils.buildPublicKeyHashOutput(
      pubKey2Addr(this.creator),
      price
    )

    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + creatorOutput + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 升级档位
   * @param newTier 新档位
   * @param sig 订阅者签名
   */
  @method()
  public upgradeTier(newTier: bigint, sig: Sig) {
    assert(newTier > this.currentTier, 'Can only upgrade to higher tier')
    assert(newTier >= 1n && newTier <= 3n, 'Invalid tier')
    assert(this.subscriptionStatus == 0n, 'Subscription not active')
    assert(this.checkSig(sig, this.subscriber), 'Invalid signature')

    // 计算差价（简化：支付新档位全价）
    const newPrice = this.getTierPrice(newTier)
    this.currentTier = newTier

    const creatorOutput = Utils.buildPublicKeyHashOutput(
      pubKey2Addr(this.creator),
      newPrice
    )

    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + creatorOutput + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 降级档位（下期生效）
   */
  @method()
  public downgradeTier(newTier: bigint, sig: Sig) {
    assert(newTier < this.currentTier, 'Can only downgrade to lower tier')
    assert(newTier >= 1n && newTier <= 3n, 'Invalid tier')
    assert(this.subscriptionStatus == 0n, 'Subscription not active')
    assert(this.checkSig(sig, this.subscriber), 'Invalid signature')

    this.currentTier = newTier

    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 取消订阅
   */
  @method()
  public cancel(sig: Sig) {
    assert(this.subscriptionStatus == 0n, 'Subscription not active')
    assert(this.checkSig(sig, this.subscriber), 'Invalid signature')

    this.subscriptionStatus = 1n

    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }
}
