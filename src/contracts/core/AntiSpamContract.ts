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
 * AntiSpamContract - 质押防垃圾合约
 *
 * 经济激励机制防止垃圾内容：
 * 1. 用户质押 satoshis 获得发帖配额
 * 2. 配额用完后可解锁质押（如无举报）
 * 3. 被举报达到阈值会被惩罚（扣除质押）
 * 4. 高声誉用户可享受更低质押要求
 *
 * 机制设计：
 * - 质押成本使垃圾攻击昂贵
 * - 社区举报筛选垃圾内容
 * - 举报者获得部分惩罚奖励
 */
export class AntiSpamContract extends SmartContract {
  // 质押者公钥
  @prop()
  readonly staker: PubKey

  // 质押金额（satoshis）
  @prop()
  readonly stakeAmount: bigint

  // 此质押允许的发帖次数
  @prop(true)
  postsRemaining: bigint

  // 质押锁定到期时间（可提取的最早时间）
  @prop()
  readonly lockExpiry: bigint

  // 惩罚阈值（达到多少举报会被惩罚）
  @prop()
  readonly slashThreshold: bigint

  // 当前垃圾举报数
  @prop(true)
  spamReports: bigint

  // 质押状态：0=活跃, 1=已提取, 2=已惩罚
  @prop(true)
  stakeStatus: bigint

  // 每次发帖成本（从质押扣除）
  @prop()
  readonly costPerPost: bigint

  constructor(
    staker: PubKey,
    stakeAmount: bigint,
    postsAllowed: bigint,
    lockExpiry: bigint,
    slashThreshold: bigint,
    costPerPost: bigint
  ) {
    super(...arguments)
    this.staker = staker
    this.stakeAmount = stakeAmount
    this.postsRemaining = postsAllowed
    this.lockExpiry = lockExpiry
    this.slashThreshold = slashThreshold
    this.spamReports = 0n
    this.stakeStatus = 0n // 活跃
    this.costPerPost = costPerPost
  }

  /**
   * 使用发帖配额
   * 每次发帖消耗一个配额
   * @param sig 质押者签名
   */
  @method()
  public usePost(sig: Sig) {
    // 验证质押活跃
    assert(this.stakeStatus == 0n, 'Stake is not active')

    // 验证还有配额
    assert(this.postsRemaining > 0n, 'No posts remaining')

    // 验证签名
    assert(this.checkSig(sig, this.staker), 'Invalid staker signature')

    // 消耗配额
    this.postsRemaining -= 1n

    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 举报垃圾内容
   * 任何人可举报，累计到阈值触发惩罚
   * @param reporter 举报者公钥
   * @param contentHash 被举报内容的哈希
   * @param sig 举报者签名
   */
  @method()
  public reportSpam(reporter: PubKey, contentHash: Sha256, sig: Sig) {
    // 验证质押活跃
    assert(this.stakeStatus == 0n, 'Stake is not active')

    // 验证举报者签名
    assert(this.checkSig(sig, reporter), 'Invalid reporter signature')

    // 防止自我举报
    // 注意：实际需要更复杂的身份验证

    // 增加举报计数
    this.spamReports += 1n

    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 提取质押（锁定期后且未被惩罚）
   * @param sig 质押者签名
   */
  @method()
  public withdraw(sig: Sig) {
    // 验证锁定期已过
    assert(this.timeLock(this.lockExpiry), 'Stake still locked')

    // 验证质押活跃
    assert(this.stakeStatus == 0n, 'Stake is not active')

    // 验证未达到惩罚阈值
    assert(this.spamReports < this.slashThreshold, 'Stake has been slashed due to spam reports')

    // 验证签名
    assert(this.checkSig(sig, this.staker), 'Invalid signature')

    // 更新状态
    this.stakeStatus = 1n // 已提取

    // 返还质押给用户
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
   * 执行惩罚（举报达到阈值）
   * 质押被没收，部分奖励给举报者
   * @param slasher 执行惩罚者公钥
   * @param sig 执行者签名
   */
  @method()
  public slash(slasher: PubKey, sig: Sig) {
    // 验证达到惩罚阈值
    assert(this.spamReports >= this.slashThreshold, 'Below slash threshold')

    // 验证质押活跃
    assert(this.stakeStatus == 0n, 'Stake already processed')

    // 验证签名
    assert(this.checkSig(sig, slasher), 'Invalid slasher signature')

    // 更新状态
    this.stakeStatus = 2n // 已惩罚

    // 奖励给执行者（例如 50% 奖励，50% 销毁）
    const reward = this.ctx.utxo.value / 2n
    const slasherOutput = Utils.buildPublicKeyHashOutput(
      pubKey2Addr(slasher),
      reward
    )
    // 剩余部分可销毁或转入社区基金

    assert(
      hash256(slasherOutput + this.buildChangeOutput()) == this.ctx.hashOutputs,
      'Invalid outputs'
    )
  }

  /**
   * 增加配额（充值更多质押）
   * @param additionalPosts 增加的配额数
   * @param sig 质押者签名
   */
  @method()
  public addQuota(additionalPosts: bigint, sig: Sig) {
    assert(this.stakeStatus == 0n, 'Stake is not active')
    assert(additionalPosts > 0n, 'Must add at least one post')
    assert(this.checkSig(sig, this.staker), 'Invalid signature')

    // 需要支付对应的费用
    const requiredPayment = additionalPosts * this.costPerPost

    this.postsRemaining += additionalPosts

    const outputs = this.buildStateOutput(this.ctx.utxo.value + requiredPayment)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }
}

// ReputationBasedAntiSpamContract moved to separate file: ReputationBasedAntiSpamContract.ts
