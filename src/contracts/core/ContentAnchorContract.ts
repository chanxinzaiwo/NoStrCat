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
 * ContentAnchorContract - 链上内容验证锚定合约
 *
 * 将 Nostr 事件哈希锚定到链上，提供：
 * - 存在性证明（时间戳）
 * - 真实性验证
 * - 篡改检测
 * - 法律/合规用途
 *
 * 使用场景：
 * - 重要声明的时间证明
 * - 版权保护
 * - 合同/协议存证
 * - 内容审计追踪
 */
export class ContentAnchorContract extends SmartContract {
  // 作者公钥
  @prop()
  readonly author: PubKey

  // Nostr 事件的 SHA256 哈希
  @prop()
  readonly eventHash: Sha256

  // Nostr 事件类型 (1 = 帖子, 4 = 私信, 等)
  @prop()
  readonly eventKind: bigint

  // 锚定时间戳（Unix 时间）
  @prop()
  readonly anchorTimestamp: bigint

  // 父事件哈希（用于回复/转发）
  @prop()
  readonly parentHash: Sha256

  // 锚定状态：0=有效, 1=已撤销
  @prop(true)
  anchorStatus: bigint

  // 撤销时间（如已撤销）
  @prop(true)
  revokedAt: bigint

  constructor(
    author: PubKey,
    eventHash: Sha256,
    eventKind: bigint,
    anchorTimestamp: bigint,
    parentHash: Sha256
  ) {
    super(...arguments)
    this.author = author
    this.eventHash = eventHash
    this.eventKind = eventKind
    this.anchorTimestamp = anchorTimestamp
    this.parentHash = parentHash
    this.anchorStatus = 0n // 有效
    this.revokedAt = 0n
  }

  /**
   * 验证锚点 - 任何人可验证内容存在性
   * 用于链下验证时确认作者
   * @param sig 作者签名
   */
  @method()
  public verifyAnchor(sig: Sig) {
    // 验证锚点有效
    assert(this.anchorStatus == 0n, 'Anchor has been revoked')

    // 作者签名证明所有权
    assert(
      this.checkSig(sig, this.author),
      'Invalid author signature'
    )
  }

  /**
   * 撤销内容 - 作者可标记内容为已撤销
   * 适用于内容删除/撤回请求
   * @param revokeTimestamp 撤销时间
   * @param sig 作者签名
   */
  @method()
  public revoke(revokeTimestamp: bigint, sig: Sig) {
    // 验证当前有效
    assert(this.anchorStatus == 0n, 'Already revoked')

    // 验证作者
    assert(
      this.checkSig(sig, this.author),
      'Only author can revoke'
    )

    // 更新状态
    this.anchorStatus = 1n // 已撤销
    this.revokedAt = revokeTimestamp

    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'Invalid outputs')
  }
}

// BatchAnchorContract moved to separate file: BatchAnchorContract.ts
// TimestampedAnchorContract moved to separate file: TimestampedAnchorContract.ts
// ReplyChainAnchorContract moved to separate file: ReplyChainAnchorContract.ts
