/**
 * 钱包提供者接口
 *
 * 定义钱包连接器的通用接口
 * 支持多种钱包扩展（OP_CAT Wallet、UniSat 等）
 */

/**
 * 网络类型
 */
export type NetworkType = 'livenet' | 'testnet' | 'signet'

/**
 * 链信息
 */
export interface ChainInfo {
  enum: string
  name: string
  network: NetworkType
}

/**
 * UTXO
 */
export interface WalletUTXO {
  txid: string
  vout: number
  satoshis: number
  scriptPk: string
  addressType: number
  inscriptions: unknown[]
  atomicals: unknown[]
}

/**
 * 签名选项
 */
export interface SignOptions {
  autoFinalized?: boolean
  toSignInputs?: Array<{
    index: number
    address?: string
    publicKey?: string
    sighashTypes?: number[]
    disableTweakSigner?: boolean
  }>
}

/**
 * 转账选项
 */
export interface TransferOptions {
  feeRate?: number
}

/**
 * 钱包事件类型
 */
export type WalletEvent =
  | 'accountsChanged'
  | 'networkChanged'
  | 'chainChanged'

/**
 * 钱包提供者接口
 */
export interface WalletProvider {
  // 基本信息
  readonly name: string
  readonly icon?: string

  // 连接状态
  isInstalled(): boolean
  isConnected(): Promise<boolean>

  // 账户管理
  requestAccounts(): Promise<string[]>
  getAccounts(): Promise<string[]>
  disconnect(): Promise<void>

  // 网络
  getNetwork(): Promise<NetworkType>
  switchNetwork(network: NetworkType): Promise<void>
  getChain(): Promise<ChainInfo>

  // 密钥
  getPublicKey(): Promise<string>
  getBalance(): Promise<{ confirmed: number; unconfirmed: number; total: number }>

  // 签名
  signMessage(message: string, type?: 'bip322-simple' | 'ecdsa'): Promise<string>
  signPsbt(psbtHex: string, options?: SignOptions): Promise<string>
  signPsbts(psbtHexs: string[], options?: SignOptions[]): Promise<string[]>

  // 交易
  sendTransfer(toAddress: string, satoshis: number, options?: TransferOptions): Promise<string>
  pushTx(rawTx: string): Promise<string>
  pushPsbt(psbtHex: string): Promise<string>

  // UTXO
  getPaymentUtxos(cursor?: number, size?: number): Promise<{
    utxos: WalletUTXO[]
    cursor: number
  }>

  // 事件
  on(event: WalletEvent, callback: (data: unknown) => void): void
  off(event: WalletEvent, callback: (data: unknown) => void): void
}

/**
 * 钱包连接状态
 */
export interface WalletState {
  isInstalled: boolean
  isConnected: boolean
  address: string | null
  publicKey: string | null
  network: NetworkType | null
  balance: {
    confirmed: number
    unconfirmed: number
    total: number
  } | null
}

/**
 * 钱包连接错误
 */
export class WalletError extends Error {
  constructor(
    message: string,
    public code?: number,
    public data?: unknown
  ) {
    super(message)
    this.name = 'WalletError'
  }
}
