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
 * PaidContentContract - 付费内容访问合约
 *
 * 单次付费解锁特定内容
 * 适用于：
 * - 付费文章
 * - 付费教程
 * - 独家内容
 */
export class PaidContentContract extends SmartContract {
  // 创作者
  @prop()
  readonly creator: PubKey

  // 内容哈希（用于验证内容真实性）
  @prop()
  readonly contentHash: Sha256

  // 解锁价格
  @prop()
  readonly unlockPrice: bigint

  // 内容 ID
  @prop()
  readonly contentId: Sha256

  // 已解锁次数（统计）
  @prop(true)
  unlockCount: bigint

  // 总收入
  @prop(true)
  totalRevenue: bigint

  constructor(
    creator: PubKey,
    contentHash: Sha256,
    unlockPrice: bigint,
    contentId: Sha256
  ) {
    super(...arguments)
    this.creator = creator
    this.contentHash = contentHash
    this.unlockPrice = unlockPrice
    this.contentId = contentId
    this.unlockCount = 0n
    this.totalRevenue = 0n
  }

  /**
   * 购买解锁内容
   * @param buyer 购买者公钥
   * @param sig 购买者签名
   */
  @method()
  public unlock(buyer: PubKey, sig: Sig) {
    assert(this.checkSig(sig, buyer), 'Invalid buyer signature')

    this.unlockCount += 1n
    this.totalRevenue += this.unlockPrice

    // 创作者收到付款
    const creatorOutput = Utils.buildPublicKeyHashOutput(
      pubKey2Addr(this.creator),
      this.unlockPrice
    )

    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + creatorOutput + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }

  /**
   * 创作者更新价格
   * @param newPrice 新价格
   * @param sig 创作者签名
   */
  @method()
  public updatePrice(newPrice: bigint, sig: Sig) {
    assert(this.checkSig(sig, this.creator), 'Invalid creator signature')
    // 注意：价格是不可变的，这里只是示例
    // 实际实现可能需要创建新合约

    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }
}
