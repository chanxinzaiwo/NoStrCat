import {
  assert,
  hash256,
  method,
  prop,
  PubKey,
  Sig,
  SmartContract,
  Sha256,
} from 'scrypt-ts'

/**
 * ReplyChainAnchorContract - 回复链锚定合约
 *
 * 锚定一个完整的对话/回复链
 * 保持上下文完整性
 */
export class ReplyChainAnchorContract extends SmartContract {
  // 原始帖子作者
  @prop()
  readonly originalAuthor: PubKey

  // 原始帖子哈希
  @prop()
  readonly originalEventHash: Sha256

  // 回复链 Merkle 根（包含所有回复）
  @prop(true)
  replyChainRoot: Sha256

  // 回复数量
  @prop(true)
  replyCount: bigint

  // 最后更新时间
  @prop(true)
  lastUpdated: bigint

  // 锚定时间
  @prop()
  readonly anchoredAt: bigint

  constructor(
    originalAuthor: PubKey,
    originalEventHash: Sha256,
    replyChainRoot: Sha256,
    replyCount: bigint,
    anchoredAt: bigint
  ) {
    super(...arguments)
    this.originalAuthor = originalAuthor
    this.originalEventHash = originalEventHash
    this.replyChainRoot = replyChainRoot
    this.replyCount = replyCount
    this.lastUpdated = anchoredAt
    this.anchoredAt = anchoredAt
  }

  /**
   * 更新回复链
   * 添加新回复时更新 Merkle 根
   * @param newReplyChainRoot 新的回复链根
   * @param newReplyCount 新的回复数量
   * @param updateTimestamp 更新时间
   * @param sig 原始作者签名
   */
  @method()
  public updateReplyChain(
    newReplyChainRoot: Sha256,
    newReplyCount: bigint,
    updateTimestamp: bigint,
    sig: Sig
  ) {
    assert(this.checkSig(sig, this.originalAuthor), 'Only original author can update')
    assert(newReplyCount >= this.replyCount, 'Reply count cannot decrease')

    this.replyChainRoot = newReplyChainRoot
    this.replyCount = newReplyCount
    this.lastUpdated = updateTimestamp

    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }
}
