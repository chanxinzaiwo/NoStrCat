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

// 最大管理员数量
const MAX_ADMINS = 5

/**
 * GroupContract - 链上群组管理合约
 *
 * 管理去中心化群组的：
 * - 群组创建和所有权
 * - 管理员角色
 * - 成员费用（可选）
 * - 群组金库
 *
 * 注意：实际消息加密在 Nostr 层通过 NIP-17/NIP-EE 处理
 * 此合约只负责链上的群组治理和经济模型
 */
export class GroupContract extends SmartContract {
  // 群主公钥
  @prop()
  readonly owner: PubKey

  // 群组 ID（从创建交易派生）
  @prop()
  readonly groupId: Sha256

  // 群组元数据哈希（名称、描述、规则）
  @prop(true)
  metadataHash: Sha256

  // 管理员公钥数组
  @prop(true)
  admins: FixedArray<PubKey, typeof MAX_ADMINS>

  // 入群费用（satoshis，0 = 免费）
  @prop(true)
  membershipFee: bigint

  // 成员总数（统计）
  @prop(true)
  memberCount: bigint

  // 金库余额（来自费用）
  @prop(true)
  treasuryBalance: bigint

  // 是否公开群组
  @prop()
  readonly isPublic: boolean

  // 群组状态：0=活跃, 1=暂停, 2=解散
  @prop(true)
  groupStatus: bigint

  // 创建时间
  @prop()
  readonly createdAt: bigint

  constructor(
    owner: PubKey,
    groupId: Sha256,
    metadataHash: Sha256,
    admins: FixedArray<PubKey, typeof MAX_ADMINS>,
    membershipFee: bigint,
    isPublic: boolean,
    createdAt: bigint
  ) {
    super(...arguments)
    this.owner = owner
    this.groupId = groupId
    this.metadataHash = metadataHash
    this.admins = admins
    this.membershipFee = membershipFee
    this.memberCount = 1n // 群主自动是第一个成员
    this.treasuryBalance = 0n
    this.isPublic = isPublic
    this.groupStatus = 0n // 活跃
    this.createdAt = createdAt
  }

  /**
   * 加入群组（支付入群费用）
   * @param memberPubKey 新成员公钥
   * @param sig 新成员签名
   */
  @method()
  public join(memberPubKey: PubKey, sig: Sig) {
    // 验证群组活跃
    assert(this.groupStatus == 0n, 'Group is not active')

    // 验证成员签名
    assert(this.checkSig(sig, memberPubKey), 'Invalid member signature')

    // 如有入群费，增加金库余额
    if (this.membershipFee > 0n) {
      this.treasuryBalance += this.membershipFee
    }

    // 增加成员计数
    this.memberCount += 1n

    // 构建输出（包含入群费）
    const outputs = this.buildStateOutput(this.ctx.utxo.value + this.membershipFee)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 退出群组
   * 注意：不退还入群费
   * @param memberPubKey 成员公钥
   * @param sig 成员签名
   */
  @method()
  public leave(memberPubKey: PubKey, sig: Sig) {
    assert(this.groupStatus == 0n, 'Group is not active')
    assert(this.checkSig(sig, memberPubKey), 'Invalid member signature')
    assert(this.memberCount > 1n, 'Cannot leave: you are the last member')

    this.memberCount -= 1n

    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 更新群组元数据（仅群主/管理员）
   * @param newMetadataHash 新的元数据哈希
   * @param sig 群主或管理员签名
   */
  @method()
  public updateMetadata(newMetadataHash: Sha256, sig: Sig) {
    assert(this.groupStatus == 0n, 'Group is not active')

    // 验证是群主（简化版，完整版需检查管理员）
    assert(this.checkSig(sig, this.owner), 'Only owner can update metadata')

    this.metadataHash = newMetadataHash

    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 更新入群费用（仅群主）
   * @param newFee 新费用
   * @param sig 群主签名
   */
  @method()
  public updateFee(newFee: bigint, sig: Sig) {
    assert(this.groupStatus == 0n, 'Group is not active')
    assert(newFee >= 0n, 'Fee cannot be negative')
    assert(this.checkSig(sig, this.owner), 'Only owner can update fee')

    this.membershipFee = newFee

    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 从金库提取资金（仅群主）
   * @param amount 提取金额
   * @param sig 群主签名
   */
  @method()
  public withdrawTreasury(amount: bigint, sig: Sig) {
    assert(this.groupStatus == 0n, 'Group is not active')
    assert(this.checkSig(sig, this.owner), 'Only owner can withdraw')
    assert(amount > 0n, 'Amount must be positive')
    assert(amount <= this.treasuryBalance, 'Insufficient treasury balance')

    this.treasuryBalance -= amount

    const ownerOutput = Utils.buildPublicKeyHashOutput(
      pubKey2Addr(this.owner),
      amount
    )

    const outputs = this.buildStateOutput(this.ctx.utxo.value - amount)
      + ownerOutput + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 向金库捐款
   * @param donorPubKey 捐款人公钥
   * @param amount 捐款金额
   * @param sig 捐款人签名
   */
  @method()
  public donate(donorPubKey: PubKey, amount: bigint, sig: Sig) {
    assert(this.groupStatus == 0n, 'Group is not active')
    assert(amount > 0n, 'Amount must be positive')
    assert(this.checkSig(sig, donorPubKey), 'Invalid donor signature')

    this.treasuryBalance += amount

    const outputs = this.buildStateOutput(this.ctx.utxo.value + amount)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 暂停群组（仅群主）
   * @param sig 群主签名
   */
  @method()
  public suspendGroup(sig: Sig) {
    assert(this.groupStatus == 0n, 'Group is not active')
    assert(this.checkSig(sig, this.owner), 'Only owner can suspend')

    this.groupStatus = 1n // 暂停

    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 恢复群组（仅群主）
   * @param sig 群主签名
   */
  @method()
  public resumeGroup(sig: Sig) {
    assert(this.groupStatus == 1n, 'Group is not suspended')
    assert(this.checkSig(sig, this.owner), 'Only owner can resume')

    this.groupStatus = 0n // 活跃

    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 解散群组（仅群主，金库资金退回群主）
   * @param sig 群主签名
   */
  @method()
  public dissolveGroup(sig: Sig) {
    assert(this.checkSig(sig, this.owner), 'Only owner can dissolve')

    this.groupStatus = 2n // 解散

    // 金库资金全部退回群主
    const ownerOutput = Utils.buildPublicKeyHashOutput(
      pubKey2Addr(this.owner),
      this.ctx.utxo.value
    )

    assert(this.ctx.hashOutputs == hash256(ownerOutput + this.buildChangeOutput()), 'Invalid outputs')
  }
}

// PaidGroupContract moved to separate file: PaidGroupContract.ts

/**
 * GroupMetadata - 群组元数据结构
 * 存储在链下，链上只存哈希
 */
export interface GroupMetadata {
  // 群组名称
  name: string
  // 群组描述
  description: string
  // 群组图标 URL
  picture: string
  // 群组横幅 URL
  banner: string
  // 群组规则
  rules: string[]
  // 群组标签
  tags: string[]
  // 创建时间
  createdAt: number
  // 最后更新时间
  updatedAt: number
}
