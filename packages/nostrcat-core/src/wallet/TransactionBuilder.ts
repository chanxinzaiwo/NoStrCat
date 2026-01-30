/**
 * 交易构建器
 *
 * 构建 OP_CAT Layer 交易
 * 支持标准交易和智能合约交易
 */

import { KeyPair, signEvent } from '../crypto/keys'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex, hexToBytes, stringToBytes } from '../utils/encoding'

/**
 * 交易输入
 */
interface TxInput {
  txid: string
  vout: number
  value: bigint
  scriptPubKey?: string
  sequence?: number
}

/**
 * 交易输出
 */
interface TxOutput {
  address?: string
  value: bigint
  script?: string
  isOpReturn?: boolean
  data?: string
}

/**
 * 交易构建器类
 */
export class TransactionBuilder {
  private network: string
  private inputs: TxInput[] = []
  private outputs: TxOutput[] = []
  private locktime = 0
  private version = 2

  constructor(network: string = 'testnet') {
    this.network = network
  }

  /**
   * 添加输入
   */
  addInput(txid: string, vout: number, value: bigint, scriptPubKey?: string): this {
    this.inputs.push({
      txid,
      vout,
      value,
      scriptPubKey,
      sequence: 0xffffffff,
    })
    return this
  }

  /**
   * 添加输出
   */
  addOutput(address: string, value: bigint): this {
    this.outputs.push({
      address,
      value,
    })
    return this
  }

  /**
   * 添加脚本输出
   */
  addScriptOutput(script: string, value: bigint): this {
    this.outputs.push({
      script,
      value,
    })
    return this
  }

  /**
   * 添加 OP_RETURN 数据
   */
  addOpReturn(data: string): this {
    this.outputs.push({
      isOpReturn: true,
      data,
      value: 0n,
    })
    return this
  }

  /**
   * 设置锁定时间
   */
  setLocktime(locktime: number): this {
    this.locktime = locktime
    return this
  }

  /**
   * 设置版本
   */
  setVersion(version: number): this {
    this.version = version
    return this
  }

  /**
   * 获取输入总额
   */
  getInputTotal(): bigint {
    return this.inputs.reduce((sum, input) => sum + input.value, 0n)
  }

  /**
   * 获取输出总额
   */
  getOutputTotal(): bigint {
    return this.outputs.reduce((sum, output) => sum + output.value, 0n)
  }

  /**
   * 获取手续费
   */
  getFee(): bigint {
    return this.getInputTotal() - this.getOutputTotal()
  }

  /**
   * 估算交易大小 (vbytes)
   */
  estimateSize(): number {
    // 简化估算
    // 版本: 4 bytes
    // 输入数量: 1 byte
    // 每个输入: ~148 bytes (P2PKH)
    // 输出数量: 1 byte
    // 每个输出: ~34 bytes (P2PKH)
    // 锁定时间: 4 bytes

    const baseSize = 4 + 1 + 1 + 4
    const inputSize = this.inputs.length * 148
    const outputSize = this.outputs.length * 34

    return baseSize + inputSize + outputSize
  }

  /**
   * 验证交易
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    // 检查输入
    if (this.inputs.length === 0) {
      errors.push('Transaction must have at least one input')
    }

    // 检查输出
    if (this.outputs.length === 0) {
      errors.push('Transaction must have at least one output')
    }

    // 检查手续费
    const fee = this.getFee()
    if (fee < 0n) {
      errors.push('Insufficient input value to cover outputs')
    }

    // 检查输出金额
    for (let i = 0; i < this.outputs.length; i++) {
      const output = this.outputs[i]
      if (!output.isOpReturn && output.value < 546n) {
        errors.push(`Output ${i} value (${output.value}) is below dust limit`)
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  /**
   * 签名交易
   */
  async sign(keyPair: KeyPair): Promise<string> {
    const validation = this.validate()
    if (!validation.valid) {
      throw new Error(`Invalid transaction: ${validation.errors.join(', ')}`)
    }

    // 构建原始交易
    const rawTx = this.buildRawTransaction()

    // 对每个输入签名
    const signedInputs = await Promise.all(
      this.inputs.map(async (input, index) => {
        const sigHash = this.computeSigHash(index)
        const signature = await signEvent(sigHash, keyPair.privateKey)
        return {
          ...input,
          signature,
          publicKey: keyPair.publicKey,
        }
      })
    )

    // 构建签名后的交易
    return this.buildSignedTransaction(signedInputs)
  }

  /**
   * 构建原始交易（未签名）
   */
  private buildRawTransaction(): string {
    let tx = ''

    // 版本 (4 bytes, little-endian)
    tx += this.toLittleEndian(this.version, 4)

    // 输入数量 (varint)
    tx += this.toVarInt(this.inputs.length)

    // 输入
    for (const input of this.inputs) {
      // 前一笔交易 ID (32 bytes, reversed)
      tx += this.reverseHex(input.txid)
      // 输出索引 (4 bytes, little-endian)
      tx += this.toLittleEndian(input.vout, 4)
      // 脚本长度 (暂时为空)
      tx += '00'
      // 序列号 (4 bytes)
      tx += this.toLittleEndian(input.sequence || 0xffffffff, 4)
    }

    // 输出数量
    tx += this.toVarInt(this.outputs.length)

    // 输出
    for (const output of this.outputs) {
      // 金额 (8 bytes, little-endian)
      tx += this.toLittleEndian64(output.value)

      if (output.isOpReturn) {
        // OP_RETURN 输出
        const data = stringToBytes(output.data || '')
        const script = '6a' + this.toVarInt(data.length) + bytesToHex(data)
        tx += this.toVarInt(script.length / 2)
        tx += script
      } else if (output.script) {
        // 自定义脚本
        tx += this.toVarInt(output.script.length / 2)
        tx += output.script
      } else {
        // P2PKH 输出
        const script = this.createP2PKHScript(output.address || '')
        tx += this.toVarInt(script.length / 2)
        tx += script
      }
    }

    // 锁定时间 (4 bytes)
    tx += this.toLittleEndian(this.locktime, 4)

    return tx
  }

  /**
   * 构建签名后的交易
   */
  private buildSignedTransaction(signedInputs: Array<TxInput & { signature: string; publicKey: string }>): string {
    let tx = ''

    // 版本
    tx += this.toLittleEndian(this.version, 4)

    // 输入数量
    tx += this.toVarInt(this.inputs.length)

    // 签名后的输入
    for (const input of signedInputs) {
      tx += this.reverseHex(input.txid)
      tx += this.toLittleEndian(input.vout, 4)

      // 解锁脚本: <signature> <publicKey>
      const sigScript = input.signature + '01' + input.publicKey
      tx += this.toVarInt(sigScript.length / 2)
      tx += sigScript

      tx += this.toLittleEndian(input.sequence || 0xffffffff, 4)
    }

    // 输出数量
    tx += this.toVarInt(this.outputs.length)

    // 输出
    for (const output of this.outputs) {
      tx += this.toLittleEndian64(output.value)

      if (output.isOpReturn) {
        const data = stringToBytes(output.data || '')
        const script = '6a' + this.toVarInt(data.length) + bytesToHex(data)
        tx += this.toVarInt(script.length / 2)
        tx += script
      } else if (output.script) {
        tx += this.toVarInt(output.script.length / 2)
        tx += output.script
      } else {
        const script = this.createP2PKHScript(output.address || '')
        tx += this.toVarInt(script.length / 2)
        tx += script
      }
    }

    // 锁定时间
    tx += this.toLittleEndian(this.locktime, 4)

    return tx
  }

  /**
   * 计算签名哈希
   */
  private computeSigHash(inputIndex: number): string {
    // 简化版本：使用整个交易的哈希
    // 实际应该使用 SIGHASH_ALL 规则
    const rawTx = this.buildRawTransaction()
    const hash = sha256(sha256(hexToBytes(rawTx)))
    return bytesToHex(hash)
  }

  /**
   * 创建 P2PKH 脚本
   */
  private createP2PKHScript(address: string): string {
    // 简化：直接使用地址的哈希
    // 实际需要从地址解码出公钥哈希
    const pubKeyHash = address.slice(0, 40).padEnd(40, '0')
    // OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG
    return '76a914' + pubKeyHash + '88ac'
  }

  /**
   * 转换为小端序
   */
  private toLittleEndian(value: number, bytes: number): string {
    let hex = value.toString(16).padStart(bytes * 2, '0')
    // 反转字节序
    let result = ''
    for (let i = hex.length - 2; i >= 0; i -= 2) {
      result += hex.substr(i, 2)
    }
    return result
  }

  /**
   * 64位小端序
   */
  private toLittleEndian64(value: bigint): string {
    let hex = value.toString(16).padStart(16, '0')
    let result = ''
    for (let i = hex.length - 2; i >= 0; i -= 2) {
      result += hex.substr(i, 2)
    }
    return result
  }

  /**
   * 可变长度整数
   */
  private toVarInt(value: number): string {
    if (value < 0xfd) {
      return value.toString(16).padStart(2, '0')
    } else if (value <= 0xffff) {
      return 'fd' + this.toLittleEndian(value, 2)
    } else if (value <= 0xffffffff) {
      return 'fe' + this.toLittleEndian(value, 4)
    } else {
      return 'ff' + this.toLittleEndian64(BigInt(value))
    }
  }

  /**
   * 反转十六进制字符串
   */
  private reverseHex(hex: string): string {
    let result = ''
    for (let i = hex.length - 2; i >= 0; i -= 2) {
      result += hex.substr(i, 2)
    }
    return result
  }

  /**
   * 重置构建器
   */
  reset(): this {
    this.inputs = []
    this.outputs = []
    this.locktime = 0
    return this
  }
}
