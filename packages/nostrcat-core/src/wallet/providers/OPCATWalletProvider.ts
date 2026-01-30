/**
 * OP_CAT 钱包扩展连接器
 *
 * 连接 OPCAT-Labs 钱包扩展
 * https://github.com/OPCAT-Labs/wallet-extension
 */

import {
  WalletProvider,
  WalletError,
  NetworkType,
  ChainInfo,
  SignOptions,
  TransferOptions,
  WalletUTXO,
  WalletEvent,
} from './WalletProvider'

/**
 * 钱包扩展注入的 Provider 接口
 */
interface OpcatProviderAPI {
  requestAccounts(): Promise<string[]>
  getAccounts(): Promise<string[]>
  disconnect(): Promise<void>
  getNetwork(): Promise<NetworkType>
  switchNetwork(network: NetworkType): Promise<void>
  getChain(): Promise<ChainInfo>
  switchChain(chain: string): Promise<void>
  getPublicKey(): Promise<string>
  getBalance(): Promise<{ confirmed: number; unconfirmed: number; total: number }>
  signMessage(text: string, type?: string): Promise<string>
  multiSignMessage(messages: string[]): Promise<string[]>
  verifyMessageOfBIP322Simple(
    address: string,
    message: string,
    signature: string,
    network?: NetworkType
  ): Promise<boolean>
  signData(data: string, type?: string): Promise<string>
  sendTransfer(
    toAddress: string,
    satoshis: number,
    options?: TransferOptions
  ): Promise<string>
  pushTx(rawtx: string): Promise<string>
  signPsbt(psbtHex: string, options?: SignOptions): Promise<string>
  signPsbts(psbtHexs: string[], options?: SignOptions[]): Promise<string[]>
  pushPsbt(psbtHex: string): Promise<string>
  getVersion(): Promise<string>
  getPaymentUtxos(cursor?: number, size?: number): Promise<{
    utxos: WalletUTXO[]
    cursor: number
  }>
  on(event: string, callback: (data: unknown) => void): void
  removeListener(event: string, callback: (data: unknown) => void): void
}

// 声明全局 window 对象上的 opcat 属性
declare global {
  interface Window {
    opcat?: OpcatProviderAPI
  }
}

/**
 * OP_CAT 钱包提供者
 */
export class OPCATWalletProvider implements WalletProvider {
  readonly name = 'OP_CAT Wallet'
  readonly icon = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiByeD0iOCIgZmlsbD0iI0Y3OTMxQSIvPgo8cGF0aCBkPSJNMjggMjBDMjggMjQuNDE4MyAyNC40MTgzIDI4IDIwIDI4QzE1LjU4MTcgMjggMTIgMjQuNDE4MyAxMiAyMEMxMiAxNS41ODE3IDE1LjU4MTcgMTIgMjAgMTJDMjQuNDE4MyAxMiAyOCAxNS41ODE3IDI4IDIwWiIgZmlsbD0id2hpdGUiLz4KPC9zdmc+'

  private provider: OpcatProviderAPI | null = null
  private eventListeners: Map<WalletEvent, Set<(data: unknown) => void>> = new Map()

  constructor() {
    this.initProvider()
  }

  /**
   * 初始化提供者
   */
  private initProvider(): void {
    if (typeof window !== 'undefined' && window.opcat) {
      this.provider = window.opcat
    }
  }

  /**
   * 获取提供者（延迟初始化）
   */
  private getProvider(): OpcatProviderAPI {
    if (!this.provider) {
      this.initProvider()
    }
    if (!this.provider) {
      throw new WalletError('OP_CAT Wallet extension not installed', 4001)
    }
    return this.provider
  }

  /**
   * 检查是否已安装
   */
  isInstalled(): boolean {
    if (typeof window === 'undefined') return false
    return !!window.opcat
  }

  /**
   * 检查是否已连接
   */
  async isConnected(): Promise<boolean> {
    if (!this.isInstalled()) return false
    try {
      const accounts = await this.getProvider().getAccounts()
      return accounts.length > 0
    } catch {
      return false
    }
  }

  /**
   * 请求连接账户
   */
  async requestAccounts(): Promise<string[]> {
    try {
      return await this.getProvider().requestAccounts()
    } catch (error: unknown) {
      const err = error as { message?: string; code?: number }
      throw new WalletError(
        err.message || 'Failed to connect wallet',
        err.code
      )
    }
  }

  /**
   * 获取已连接账户
   */
  async getAccounts(): Promise<string[]> {
    try {
      return await this.getProvider().getAccounts()
    } catch (error: unknown) {
      const err = error as { message?: string; code?: number }
      throw new WalletError(
        err.message || 'Failed to get accounts',
        err.code
      )
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    try {
      await this.getProvider().disconnect()
    } catch (error: unknown) {
      const err = error as { message?: string; code?: number }
      throw new WalletError(
        err.message || 'Failed to disconnect',
        err.code
      )
    }
  }

  /**
   * 获取当前网络
   */
  async getNetwork(): Promise<NetworkType> {
    try {
      return await this.getProvider().getNetwork()
    } catch (error: unknown) {
      const err = error as { message?: string; code?: number }
      throw new WalletError(
        err.message || 'Failed to get network',
        err.code
      )
    }
  }

  /**
   * 切换网络
   */
  async switchNetwork(network: NetworkType): Promise<void> {
    try {
      await this.getProvider().switchNetwork(network)
    } catch (error: unknown) {
      const err = error as { message?: string; code?: number }
      throw new WalletError(
        err.message || 'Failed to switch network',
        err.code
      )
    }
  }

  /**
   * 获取链信息
   */
  async getChain(): Promise<ChainInfo> {
    try {
      return await this.getProvider().getChain()
    } catch (error: unknown) {
      const err = error as { message?: string; code?: number }
      throw new WalletError(
        err.message || 'Failed to get chain info',
        err.code
      )
    }
  }

  /**
   * 获取公钥
   */
  async getPublicKey(): Promise<string> {
    try {
      return await this.getProvider().getPublicKey()
    } catch (error: unknown) {
      const err = error as { message?: string; code?: number }
      throw new WalletError(
        err.message || 'Failed to get public key',
        err.code
      )
    }
  }

  /**
   * 获取余额
   */
  async getBalance(): Promise<{ confirmed: number; unconfirmed: number; total: number }> {
    try {
      return await this.getProvider().getBalance()
    } catch (error: unknown) {
      const err = error as { message?: string; code?: number }
      throw new WalletError(
        err.message || 'Failed to get balance',
        err.code
      )
    }
  }

  /**
   * 签名消息
   */
  async signMessage(message: string, type: 'bip322-simple' | 'ecdsa' = 'ecdsa'): Promise<string> {
    try {
      return await this.getProvider().signMessage(message, type)
    } catch (error: unknown) {
      const err = error as { message?: string; code?: number }
      throw new WalletError(
        err.message || 'Failed to sign message',
        err.code
      )
    }
  }

  /**
   * 签名 PSBT
   */
  async signPsbt(psbtHex: string, options?: SignOptions): Promise<string> {
    try {
      return await this.getProvider().signPsbt(psbtHex, options)
    } catch (error: unknown) {
      const err = error as { message?: string; code?: number }
      throw new WalletError(
        err.message || 'Failed to sign PSBT',
        err.code
      )
    }
  }

  /**
   * 签名多个 PSBT
   */
  async signPsbts(psbtHexs: string[], options?: SignOptions[]): Promise<string[]> {
    try {
      return await this.getProvider().signPsbts(psbtHexs, options)
    } catch (error: unknown) {
      const err = error as { message?: string; code?: number }
      throw new WalletError(
        err.message || 'Failed to sign PSBTs',
        err.code
      )
    }
  }

  /**
   * 发送转账
   */
  async sendTransfer(
    toAddress: string,
    satoshis: number,
    options?: TransferOptions
  ): Promise<string> {
    try {
      return await this.getProvider().sendTransfer(toAddress, satoshis, options)
    } catch (error: unknown) {
      const err = error as { message?: string; code?: number }
      throw new WalletError(
        err.message || 'Failed to send transfer',
        err.code
      )
    }
  }

  /**
   * 广播原始交易
   */
  async pushTx(rawTx: string): Promise<string> {
    try {
      return await this.getProvider().pushTx(rawTx)
    } catch (error: unknown) {
      const err = error as { message?: string; code?: number }
      throw new WalletError(
        err.message || 'Failed to push transaction',
        err.code
      )
    }
  }

  /**
   * 广播 PSBT
   */
  async pushPsbt(psbtHex: string): Promise<string> {
    try {
      return await this.getProvider().pushPsbt(psbtHex)
    } catch (error: unknown) {
      const err = error as { message?: string; code?: number }
      throw new WalletError(
        err.message || 'Failed to push PSBT',
        err.code
      )
    }
  }

  /**
   * 获取 UTXO
   */
  async getPaymentUtxos(cursor = 0, size = 100): Promise<{
    utxos: WalletUTXO[]
    cursor: number
  }> {
    try {
      return await this.getProvider().getPaymentUtxos(cursor, size)
    } catch (error: unknown) {
      const err = error as { message?: string; code?: number }
      throw new WalletError(
        err.message || 'Failed to get UTXOs',
        err.code
      )
    }
  }

  /**
   * 获取版本
   */
  async getVersion(): Promise<string> {
    try {
      return await this.getProvider().getVersion()
    } catch (error: unknown) {
      return 'unknown'
    }
  }

  /**
   * 验证 BIP322 签名
   */
  async verifyMessage(
    address: string,
    message: string,
    signature: string,
    network?: NetworkType
  ): Promise<boolean> {
    try {
      return await this.getProvider().verifyMessageOfBIP322Simple(
        address,
        message,
        signature,
        network
      )
    } catch (error: unknown) {
      const err = error as { message?: string; code?: number }
      throw new WalletError(
        err.message || 'Failed to verify message',
        err.code
      )
    }
  }

  /**
   * 监听事件
   */
  on(event: WalletEvent, callback: (data: unknown) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event)!.add(callback)

    if (this.provider) {
      this.provider.on(event, callback)
    }
  }

  /**
   * 移除事件监听
   */
  off(event: WalletEvent, callback: (data: unknown) => void): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.delete(callback)
    }

    if (this.provider) {
      this.provider.removeListener(event, callback)
    }
  }
}

/**
 * 创建 OP_CAT 钱包提供者实例
 */
export function createOPCATWalletProvider(): OPCATWalletProvider {
  return new OPCATWalletProvider()
}
