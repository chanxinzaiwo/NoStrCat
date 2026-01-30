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
 * SplitZapContract - 分成打赏合约
 *
 * 支持自动收入分成，适用于：
 * - 内容协作
 * - 平台抽成
 * - 推荐奖励
 *
 * 使用场景：
 * - 创作者和平台 90/10 分成
 * - 转发者获得 10% 打赏分成
 * - 团队内容收益分配
 */
export class SplitZapContract extends SmartContract {
  // 主要收款人（如内容创作者）
  @prop()
  readonly primaryRecipient: PubKey

  // 次要收款人（如平台或协作者）
  @prop()
  readonly secondaryRecipient: PubKey

  // 分成比例（主要收款人百分比，0-100）
  @prop()
  readonly splitRatio: bigint

  // 被打赏的 Nostr 事件
  @prop()
  readonly eventId: Sha256

  // 最小金额
  @prop()
  readonly minAmount: bigint

  constructor(
    primaryRecipient: PubKey,
    secondaryRecipient: PubKey,
    splitRatio: bigint,
    eventId: Sha256,
    minAmount: bigint
  ) {
    super(...arguments)
    this.primaryRecipient = primaryRecipient
    this.secondaryRecipient = secondaryRecipient
    this.splitRatio = splitRatio
    this.eventId = eventId
    this.minAmount = minAmount
  }

  /**
   * 领取分成打赏
   * 自动按比例分配给两个收款人
   * @param primarySig 主要收款人签名
   * @param secondarySig 次要收款人签名
   */
  @method()
  public claim(primarySig: Sig, secondarySig: Sig) {
    // 验证最小金额
    const totalAmount = this.ctx.utxo.value
    assert(totalAmount >= this.minAmount, 'Below minimum zap amount')

    // 验证分成比例有效
    assert(this.splitRatio >= 0n && this.splitRatio <= 100n, 'Invalid split ratio')

    // 计算分成金额
    const primaryAmount = (totalAmount * this.splitRatio) / 100n
    const secondaryAmount = totalAmount - primaryAmount

    // 构建分成输出
    let outputs = Utils.buildPublicKeyHashOutput(
      pubKey2Addr(this.primaryRecipient),
      primaryAmount
    )
    outputs += Utils.buildPublicKeyHashOutput(
      pubKey2Addr(this.secondaryRecipient),
      secondaryAmount
    )
    outputs += this.buildChangeOutput()

    // 验证输出
    assert(hash256(outputs) == this.ctx.hashOutputs, 'Invalid outputs')

    // 验证双方签名
    assert(this.checkSig(primarySig, this.primaryRecipient), 'Invalid primary signature')
    assert(this.checkSig(secondarySig, this.secondaryRecipient), 'Invalid secondary signature')
  }
}
