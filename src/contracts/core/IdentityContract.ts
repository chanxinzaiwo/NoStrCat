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
  toByteString,
} from 'scrypt-ts'

/**
 * IdentityContract - 去中心化身份管理合约
 *
 * 将 Nostr 公钥与链上身份绑定，提供：
 * - 身份验证和声誉系统
 * - 密钥轮换和恢复
 * - 链上活动追踪
 *
 * 与 Nostr NIP-05 互补，提供真正的链上验证
 */
export class IdentityContract extends SmartContract {
  // 主 Nostr 公钥（身份标识）
  @prop()
  readonly nostrPubKey: PubKey

  // 恢复公钥（用于密钥轮换）
  @prop()
  readonly recoveryPubKey: PubKey

  // 声誉积分（可变）
  @prop(true)
  reputationScore: bigint

  // 累计收到的打赏（社交证明）
  @prop(true)
  totalZapsReceived: bigint

  // 账户创建时间
  @prop()
  readonly createdAt: bigint

  // 个人资料元数据哈希（IPFS CID 或类似）
  @prop(true)
  profileMetadataHash: Sha256

  // 是否已验证（可由 oracle 或多签设置）
  @prop(true)
  isVerified: boolean

  // 账户状态：0=活跃, 1=暂停, 2=注销
  @prop(true)
  accountStatus: bigint

  constructor(
    nostrPubKey: PubKey,
    recoveryPubKey: PubKey,
    createdAt: bigint,
    profileMetadataHash: Sha256
  ) {
    super(...arguments)
    this.nostrPubKey = nostrPubKey
    this.recoveryPubKey = recoveryPubKey
    this.reputationScore = 0n
    this.totalZapsReceived = 0n
    this.createdAt = createdAt
    this.profileMetadataHash = profileMetadataHash
    this.isVerified = false
    this.accountStatus = 0n // 活跃
  }

  /**
   * 更新个人资料元数据
   * @param newMetadataHash 新的元数据哈希
   * @param sig 用户签名
   */
  @method()
  public updateProfile(newMetadataHash: Sha256, sig: Sig) {
    // 验证账户活跃
    assert(this.accountStatus == 0n, 'Account is not active')

    // 验证签名
    assert(this.checkSig(sig, this.nostrPubKey), 'Invalid signature')

    // 更新元数据哈希
    this.profileMetadataHash = newMetadataHash

    // 构建状态输出
    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 记录收到的打赏
   * 增加累计打赏和声誉积分
   * @param zapAmount 打赏金额（satoshis）
   * @param sig 用户签名
   */
  @method()
  public recordZap(zapAmount: bigint, sig: Sig) {
    assert(zapAmount > 0n, 'Zap amount must be positive')
    assert(this.accountStatus == 0n, 'Account is not active')

    // 累计打赏
    this.totalZapsReceived += zapAmount

    // 声誉增长（递减收益：每1000 sats 增加1点声誉）
    const reputationGain = zapAmount / 1000n
    if (reputationGain > 0n) {
      this.reputationScore += reputationGain
    }

    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 增加声誉积分
   * 可由其他合约调用（如完成任务、获得认可）
   * @param amount 增加的积分
   * @param sig 授权签名
   */
  @method()
  public incrementReputation(amount: bigint, sig: Sig) {
    assert(amount > 0n, 'Amount must be positive')
    assert(this.accountStatus == 0n, 'Account is not active')
    assert(this.checkSig(sig, this.nostrPubKey), 'Invalid signature')

    this.reputationScore += amount

    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 减少声誉积分（惩罚）
   * @param amount 减少的积分
   * @param sig 授权签名（需要特殊权限）
   */
  @method()
  public decrementReputation(amount: bigint, sig: Sig) {
    assert(amount > 0n, 'Amount must be positive')
    // 使用恢复密钥进行惩罚操作（更高权限）
    assert(this.checkSig(sig, this.recoveryPubKey), 'Invalid recovery signature')

    // 确保声誉不会变成负数
    if (this.reputationScore >= amount) {
      this.reputationScore -= amount
    } else {
      this.reputationScore = 0n
    }

    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 设置验证状态
   * 需要恢复密钥（模拟 oracle/多签验证）
   * @param verified 验证状态
   * @param sig 恢复密钥签名
   */
  @method()
  public setVerified(verified: boolean, sig: Sig) {
    assert(this.checkSig(sig, this.recoveryPubKey), 'Invalid recovery signature')

    this.isVerified = verified

    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 暂停账户
   * @param sig 用户签名
   */
  @method()
  public suspendAccount(sig: Sig) {
    assert(this.accountStatus == 0n, 'Account is not active')
    assert(this.checkSig(sig, this.nostrPubKey), 'Invalid signature')

    this.accountStatus = 1n // 暂停

    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 恢复账户
   * @param sig 恢复密钥签名
   */
  @method()
  public reactivateAccount(sig: Sig) {
    assert(this.accountStatus == 1n, 'Account is not suspended')
    assert(this.checkSig(sig, this.recoveryPubKey), 'Invalid recovery signature')

    this.accountStatus = 0n // 活跃

    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 注销账户（不可逆）
   * @param sig 双重签名验证
   */
  @method()
  public deactivateAccount(sig: Sig, recoverySig: Sig) {
    // 需要两个密钥同时签名
    assert(this.checkSig(sig, this.nostrPubKey), 'Invalid user signature')
    assert(this.checkSig(recoverySig, this.recoveryPubKey), 'Invalid recovery signature')

    this.accountStatus = 2n // 注销

    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 提取身份合约中的资金
   * @param amount 提取金额
   * @param sig 用户签名
   */
  @method()
  public withdraw(amount: bigint, sig: Sig) {
    assert(this.accountStatus == 0n, 'Account is not active')
    assert(amount > 0n, 'Amount must be positive')
    assert(amount <= this.ctx.utxo.value, 'Insufficient balance')
    assert(this.checkSig(sig, this.nostrPubKey), 'Invalid signature')

    const userOutput = Utils.buildPublicKeyHashOutput(
      pubKey2Addr(this.nostrPubKey),
      amount
    )

    const remainingBalance = this.ctx.utxo.value - amount
    let outputs = toByteString('')

    // 如果有剩余余额，保持合约状态
    if (remainingBalance > 0n) {
      outputs = this.buildStateOutput(remainingBalance)
    }
    outputs += userOutput + this.buildChangeOutput()

    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }
}

/**
 * ProfileMetadata - 个人资料元数据结构
 * 存储在链下（IPFS/Nostr），链上只存哈希
 */
export interface ProfileMetadata {
  // 显示名称
  name: string
  // 简介
  about: string
  // 头像 URL
  picture: string
  // 横幅图片 URL
  banner: string
  // NIP-05 验证标识
  nip05: string
  // 个人网站
  website: string
  // 闪电网络地址（兼容）
  lud16: string
  // OP_CAT 支付地址
  opcatAddress: string
  // 额外自定义字段
  [key: string]: string
}
