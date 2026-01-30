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
 * ReputationBasedAntiSpamContract - 基于声誉的防垃圾合约
 *
 * 声誉越高，质押要求越低
 * 新用户需要更高质押
 */
export class ReputationBasedAntiSpamContract extends SmartContract {
  // 质押者公钥
  @prop()
  readonly staker: PubKey

  // 质押者声誉分（创建时快照）
  @prop()
  readonly reputationSnapshot: bigint

  // 质押金额
  @prop()
  readonly stakeAmount: bigint

  // 剩余配额
  @prop(true)
  postsRemaining: bigint

  // 锁定到期
  @prop()
  readonly lockExpiry: bigint

  // 举报数
  @prop(true)
  spamReports: bigint

  // 状态
  @prop(true)
  stakeStatus: bigint

  // 基础惩罚阈值
  @prop()
  readonly baseSlashThreshold: bigint

  constructor(
    staker: PubKey,
    reputationSnapshot: bigint,
    stakeAmount: bigint,
    postsAllowed: bigint,
    lockExpiry: bigint,
    baseSlashThreshold: bigint
  ) {
    super(...arguments)
    this.staker = staker
    this.reputationSnapshot = reputationSnapshot
    this.stakeAmount = stakeAmount
    this.postsRemaining = postsAllowed
    this.lockExpiry = lockExpiry
    this.spamReports = 0n
    this.stakeStatus = 0n
    this.baseSlashThreshold = baseSlashThreshold
  }

  /**
   * 计算实际惩罚阈值（声誉越高阈值越高）
   */
  @method()
  private calculateSlashThreshold(): bigint {
    // 每 100 声誉增加 1 点阈值
    const reputationBonus = this.reputationSnapshot / 100n
    return this.baseSlashThreshold + reputationBonus
  }

  /**
   * 使用发帖配额
   */
  @method()
  public usePost(sig: Sig) {
    assert(this.stakeStatus == 0n, 'Stake is not active')
    assert(this.postsRemaining > 0n, 'No posts remaining')
    assert(this.checkSig(sig, this.staker), 'Invalid staker signature')

    this.postsRemaining -= 1n

    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 举报
   */
  @method()
  public reportSpam(reporter: PubKey, sig: Sig) {
    assert(this.stakeStatus == 0n, 'Stake is not active')
    assert(this.checkSig(sig, reporter), 'Invalid reporter signature')

    this.spamReports += 1n

    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 提取质押
   */
  @method()
  public withdraw(sig: Sig) {
    assert(this.timeLock(this.lockExpiry), 'Stake still locked')
    assert(this.stakeStatus == 0n, 'Stake is not active')

    // 使用声誉调整后的阈值
    const effectiveThreshold = this.calculateSlashThreshold()
    assert(this.spamReports < effectiveThreshold, 'Stake has been slashed')

    assert(this.checkSig(sig, this.staker), 'Invalid signature')

    this.stakeStatus = 1n

    const stakerOutput = Utils.buildPublicKeyHashOutput(
      pubKey2Addr(this.staker),
      this.ctx.utxo.value
    )

    assert(
      hash256(stakerOutput + this.buildChangeOutput()) == this.ctx.hashOutputs,
      'Invalid outputs'
    )
  }

  /**
   * 惩罚
   */
  @method()
  public slash(slasher: PubKey, sig: Sig) {
    const effectiveThreshold = this.calculateSlashThreshold()
    assert(this.spamReports >= effectiveThreshold, 'Below slash threshold')
    assert(this.stakeStatus == 0n, 'Stake already processed')
    assert(this.checkSig(sig, slasher), 'Invalid slasher signature')

    this.stakeStatus = 2n

    const reward = this.ctx.utxo.value / 2n
    const slasherOutput = Utils.buildPublicKeyHashOutput(
      pubKey2Addr(slasher),
      reward
    )

    assert(
      hash256(slasherOutput + this.buildChangeOutput()) == this.ctx.hashOutputs,
      'Invalid outputs'
    )
  }
}
