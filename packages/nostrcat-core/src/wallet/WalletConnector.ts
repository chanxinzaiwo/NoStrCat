/**
 * 钱包连接器
 *
 * 统一管理钱包扩展连接
 * 支持多种钱包提供者
 */

import {
  WalletProvider,
  WalletState,
  WalletError,
  NetworkType,
  WalletEvent,
  SignOptions,
  TransferOptions,
} from './providers/WalletProvider'
import { OPCATWalletProvider } from './providers/OPCATWalletProvider'

/**
 * 支持的钱包类型
 */
export type WalletType = 'opcat' | 'unisat'

/**
 * 连接器配置
 */
export interface WalletConnectorConfig {
  autoConnect?: boolean
  preferredWallet?: WalletType
  network?: NetworkType
}

/**
 * 钱包连接器事件
 */
export type ConnectorEvent =
  | 'connect'
  | 'disconnect'
  | 'accountsChanged'
  | 'networkChanged'
  | 'error'

/**
 * 钱包连接器
 */
export class WalletConnector {
  private providers: Map<WalletType, WalletProvider> = new Map()
  private activeProvider: WalletProvider | null = null
  private activeWalletType: WalletType | null = null
  private state: WalletState = {
    isInstalled: false,
    isConnected: false,
    address: null,
    publicKey: null,
    network: null,
    balance: null,
  }
  private eventListeners: Map<ConnectorEvent, Set<(data: unknown) => void>> = new Map()
  private config: WalletConnectorConfig

  constructor(config: WalletConnectorConfig = {}) {
    this.config = {
      autoConnect: false,
      preferredWallet: 'opcat',
      network: 'testnet',
      ...config,
    }

    this.initProviders()
  }

  /**
   * 初始化钱包提供者
   */
  private initProviders(): void {
    // 注册 OP_CAT 钱包
    this.providers.set('opcat', new OPCATWalletProvider())

    // TODO: 支持更多钱包
    // this.providers.set('unisat', new UnisatWalletProvider())

    // 检查安装状态
    this.updateInstalledState()
  }

  /**
   * 更新安装状态
   */
  private updateInstalledState(): void {
    for (const [_, provider] of this.providers) {
      if (provider.isInstalled()) {
        this.state.isInstalled = true
        return
      }
    }
    this.state.isInstalled = false
  }

  /**
   * 获取可用的钱包列表
   */
  getAvailableWallets(): Array<{
    type: WalletType
    name: string
    icon?: string
    installed: boolean
  }> {
    const wallets: Array<{
      type: WalletType
      name: string
      icon?: string
      installed: boolean
    }> = []

    for (const [type, provider] of this.providers) {
      wallets.push({
        type,
        name: provider.name,
        icon: provider.icon,
        installed: provider.isInstalled(),
      })
    }

    return wallets
  }

  /**
   * 连接钱包
   */
  async connect(walletType?: WalletType): Promise<string[]> {
    const type = walletType || this.config.preferredWallet || 'opcat'
    const provider = this.providers.get(type)

    if (!provider) {
      throw new WalletError(`Wallet type '${type}' not supported`)
    }

    if (!provider.isInstalled()) {
      throw new WalletError(`${provider.name} is not installed`, 4001)
    }

    try {
      const accounts = await provider.requestAccounts()

      if (accounts.length === 0) {
        throw new WalletError('No accounts returned')
      }

      this.activeProvider = provider
      this.activeWalletType = type

      // 设置事件监听
      this.setupEventListeners(provider)

      // 更新状态
      await this.refreshState()

      // 触发连接事件
      this.emit('connect', {
        address: this.state.address,
        publicKey: this.state.publicKey,
        network: this.state.network,
      })

      return accounts
    } catch (error) {
      this.emit('error', error)
      throw error
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (!this.activeProvider) return

    try {
      await this.activeProvider.disconnect()
    } catch {
      // 忽略断开连接错误
    }

    this.activeProvider = null
    this.activeWalletType = null

    this.state = {
      ...this.state,
      isConnected: false,
      address: null,
      publicKey: null,
      balance: null,
    }

    this.emit('disconnect', null)
  }

  /**
   * 设置事件监听
   */
  private setupEventListeners(provider: WalletProvider): void {
    provider.on('accountsChanged', async (accounts) => {
      if (Array.isArray(accounts) && accounts.length === 0) {
        await this.disconnect()
      } else {
        await this.refreshState()
        this.emit('accountsChanged', accounts)
      }
    })

    provider.on('networkChanged', async (network) => {
      this.state.network = network as NetworkType
      this.emit('networkChanged', network)
    })
  }

  /**
   * 刷新状态
   */
  async refreshState(): Promise<WalletState> {
    if (!this.activeProvider) {
      return this.state
    }

    try {
      const [accounts, publicKey, network, balance] = await Promise.all([
        this.activeProvider.getAccounts(),
        this.activeProvider.getPublicKey(),
        this.activeProvider.getNetwork(),
        this.activeProvider.getBalance(),
      ])

      this.state = {
        isInstalled: true,
        isConnected: accounts.length > 0,
        address: accounts[0] || null,
        publicKey,
        network,
        balance,
      }
    } catch (error) {
      console.error('Failed to refresh wallet state:', error)
    }

    return this.state
  }

  /**
   * 获取当前状态
   */
  getState(): WalletState {
    return { ...this.state }
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.state.isConnected
  }

  /**
   * 获取当前地址
   */
  getAddress(): string | null {
    return this.state.address
  }

  /**
   * 获取公钥
   */
  getPublicKey(): string | null {
    return this.state.publicKey
  }

  /**
   * 获取余额
   */
  async getBalance(): Promise<{ confirmed: number; unconfirmed: number; total: number }> {
    if (!this.activeProvider) {
      throw new WalletError('Wallet not connected')
    }
    return this.activeProvider.getBalance()
  }

  /**
   * 获取网络
   */
  async getNetwork(): Promise<NetworkType> {
    if (!this.activeProvider) {
      throw new WalletError('Wallet not connected')
    }
    return this.activeProvider.getNetwork()
  }

  /**
   * 切换网络
   */
  async switchNetwork(network: NetworkType): Promise<void> {
    if (!this.activeProvider) {
      throw new WalletError('Wallet not connected')
    }
    await this.activeProvider.switchNetwork(network)
    this.state.network = network
  }

  /**
   * 签名消息
   */
  async signMessage(message: string, type?: 'bip322-simple' | 'ecdsa'): Promise<string> {
    if (!this.activeProvider) {
      throw new WalletError('Wallet not connected')
    }
    return this.activeProvider.signMessage(message, type)
  }

  /**
   * 签名 PSBT
   */
  async signPsbt(psbtHex: string, options?: SignOptions): Promise<string> {
    if (!this.activeProvider) {
      throw new WalletError('Wallet not connected')
    }
    return this.activeProvider.signPsbt(psbtHex, options)
  }

  /**
   * 发送转账
   */
  async sendTransfer(
    toAddress: string,
    satoshis: number,
    options?: TransferOptions
  ): Promise<string> {
    if (!this.activeProvider) {
      throw new WalletError('Wallet not connected')
    }
    const txid = await this.activeProvider.sendTransfer(toAddress, satoshis, options)

    // 刷新余额
    await this.refreshState()

    return txid
  }

  /**
   * 广播交易
   */
  async pushTx(rawTx: string): Promise<string> {
    if (!this.activeProvider) {
      throw new WalletError('Wallet not connected')
    }
    return this.activeProvider.pushTx(rawTx)
  }

  /**
   * 获取 UTXO
   */
  async getUtxos(cursor = 0, size = 100) {
    if (!this.activeProvider) {
      throw new WalletError('Wallet not connected')
    }
    return this.activeProvider.getPaymentUtxos(cursor, size)
  }

  /**
   * 监听事件
   */
  on(event: ConnectorEvent, callback: (data: unknown) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event)!.add(callback)
  }

  /**
   * 移除事件监听
   */
  off(event: ConnectorEvent, callback: (data: unknown) => void): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.delete(callback)
    }
  }

  /**
   * 触发事件
   */
  private emit(event: ConnectorEvent, data: unknown): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(data)
        } catch (error) {
          console.error('Event listener error:', error)
        }
      }
    }
  }

  /**
   * 获取活跃的钱包类型
   */
  getActiveWalletType(): WalletType | null {
    return this.activeWalletType
  }
}

/**
 * 创建钱包连接器实例
 */
export function createWalletConnector(config?: WalletConnectorConfig): WalletConnector {
  return new WalletConnector(config)
}
