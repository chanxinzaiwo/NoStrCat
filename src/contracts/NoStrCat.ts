import {
  assert,
  ByteString,
  hash256,
  method,
  prop,
  SmartContract,
} from 'scrypt-ts'

/**
 * NoStrCat 示例合约
 *
 * 这是一个基础模板，请根据需求修改
 */
export class NoStrCat extends SmartContract {
  // 声明属性
  @prop()
  readonly owner: ByteString

  // 可变状态使用 @prop(true)
  @prop(true)
  value: bigint

  constructor(owner: ByteString, initialValue: bigint) {
    super(...arguments)
    this.owner = owner
    this.value = initialValue
  }

  /**
   * 示例方法
   */
  @method()
  public update(newValue: bigint) {
    // 更新状态
    this.value = newValue

    // 验证输出
    const outputs = this.buildStateOutput(this.ctx.utxo.value)
      + this.buildChangeOutput()
    assert(this.ctx.hashOutputs == hash256(outputs), 'hashOutputs mismatch')
  }
}
