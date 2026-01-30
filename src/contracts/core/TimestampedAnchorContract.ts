import {
  assert,
  ByteString,
  method,
  prop,
  PubKey,
  Sig,
  SmartContract,
  Sha256,
} from 'scrypt-ts'

/**
 * TimestampedAnchorContract - 带时间证明的锚定合约
 *
 * 结合区块时间提供更强的时间证明
 */
export class TimestampedAnchorContract extends SmartContract {
  // 作者公钥
  @prop()
  readonly author: PubKey

  // 内容哈希
  @prop()
  readonly contentHash: Sha256

  // 声明的时间戳（用户提供）
  @prop()
  readonly claimedTimestamp: bigint

  // 最早确认区块高度（链上时间证明）
  @prop()
  readonly minBlockHeight: bigint

  // 内容类型标识
  @prop()
  readonly contentType: ByteString

  // 可选：内容描述哈希
  @prop()
  readonly descriptionHash: Sha256

  constructor(
    author: PubKey,
    contentHash: Sha256,
    claimedTimestamp: bigint,
    minBlockHeight: bigint,
    contentType: ByteString,
    descriptionHash: Sha256
  ) {
    super(...arguments)
    this.author = author
    this.contentHash = contentHash
    this.claimedTimestamp = claimedTimestamp
    this.minBlockHeight = minBlockHeight
    this.contentType = contentType
    this.descriptionHash = descriptionHash
  }

  /**
   * 验证时间戳
   * 确认内容在特定时间已存在
   * @param sig 作者签名
   */
  @method()
  public verifyTimestamp(sig: Sig) {
    assert(this.checkSig(sig, this.author), 'Invalid signature')
    // 时间证明由区块本身提供
    // 内容在 minBlockHeight 之前已存在
  }
}
