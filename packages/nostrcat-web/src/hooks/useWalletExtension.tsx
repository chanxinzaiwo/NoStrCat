'use client'

/**
 * 钱包扩展 Hook
 *
 * 连接 OP_CAT 钱包扩展
 */

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react'

/**
 * 钱包状态
 */
interface WalletExtensionState {
  isInstalled: boolean
  isConnected: boolean
  isConnecting: boolean
  address: string | null
  publicKey: string | null
  network: string | null
  balance: {
    confirmed: number
    unconfirmed: number
    total: number
  } | null
  error: Error | null
}

/**
 * Context 值
 */
interface WalletExtensionContextValue extends WalletExtensionState {
  connect: () => Promise<string[] | null>
  disconnect: () => Promise<void>
  refreshBalance: () => Promise<void>
  signMessage: (message: string) => Promise<string | null>
  sendTransfer: (toAddress: string, satoshis: number) => Promise<string | null>
  getUtxos: () => Promise<unknown[] | null>
}

const WalletExtensionContext = createContext<WalletExtensionContextValue | null>(null)

/**
 * OP_CAT 钱包 Provider API
 */
interface OpcatProvider {
  requestAccounts(): Promise<string[]>
  getAccounts(): Promise<string[]>
  disconnect(): Promise<void>
  getNetwork(): Promise<string>
  getPublicKey(): Promise<string>
  getBalance(): Promise<{ confirmed: number; unconfirmed: number; total: number }>
  signMessage(text: string, type?: string): Promise<string>
  sendTransfer(toAddress: string, satoshis: number, options?: { feeRate?: number }): Promise<string>
  getPaymentUtxos(cursor?: number, size?: number): Promise<{ utxos: unknown[]; cursor: number }>
  on(event: string, callback: (data: unknown) => void): void
  removeListener(event: string, callback: (data: unknown) => void): void
}

declare global {
  interface Window {
    opcat?: OpcatProvider
  }
}

/**
 * Provider Props
 */
interface WalletExtensionProviderProps {
  children: ReactNode
  autoConnect?: boolean
}

/**
 * 钱包扩展 Provider
 */
export function WalletExtensionProvider({
  children,
  autoConnect = false,
}: WalletExtensionProviderProps) {
  const [state, setState] = useState<WalletExtensionState>({
    isInstalled: false,
    isConnected: false,
    isConnecting: false,
    address: null,
    publicKey: null,
    network: null,
    balance: null,
    error: null,
  })

  // 检查钱包是否安装
  useEffect(() => {
    const checkInstalled = () => {
      const installed = typeof window !== 'undefined' && !!window.opcat
      setState(prev => ({ ...prev, isInstalled: installed }))

      if (installed && autoConnect) {
        // 检查是否已连接
        window.opcat!.getAccounts().then(accounts => {
          if (accounts.length > 0) {
            refreshState()
          }
        }).catch(() => {
          // 忽略错误
        })
      }
    }

    // 延迟检查，等待扩展注入
    const timer = setTimeout(checkInstalled, 100)
    return () => clearTimeout(timer)
  }, [autoConnect])

  // 刷新状态
  const refreshState = useCallback(async () => {
    if (!window.opcat) return

    try {
      const [accounts, publicKey, network, balance] = await Promise.all([
        window.opcat.getAccounts(),
        window.opcat.getPublicKey(),
        window.opcat.getNetwork(),
        window.opcat.getBalance(),
      ])

      setState(prev => ({
        ...prev,
        isConnected: accounts.length > 0,
        address: accounts[0] || null,
        publicKey,
        network,
        balance,
        error: null,
      }))
    } catch (error) {
      setState(prev => ({ ...prev, error: error as Error }))
    }
  }, [])

  // 监听钱包事件
  useEffect(() => {
    if (!window.opcat || !state.isConnected) return

    const handleAccountsChanged = (accounts: unknown) => {
      const accts = accounts as string[]
      if (accts.length === 0) {
        setState(prev => ({
          ...prev,
          isConnected: false,
          address: null,
          publicKey: null,
          balance: null,
        }))
      } else {
        refreshState()
      }
    }

    const handleNetworkChanged = (network: unknown) => {
      setState(prev => ({ ...prev, network: network as string }))
      refreshState()
    }

    window.opcat.on('accountsChanged', handleAccountsChanged)
    window.opcat.on('networkChanged', handleNetworkChanged)

    return () => {
      window.opcat?.removeListener('accountsChanged', handleAccountsChanged)
      window.opcat?.removeListener('networkChanged', handleNetworkChanged)
    }
  }, [state.isConnected, refreshState])

  // 连接钱包
  const connect = useCallback(async (): Promise<string[] | null> => {
    if (!window.opcat) {
      setState(prev => ({
        ...prev,
        error: new Error('OP_CAT Wallet extension not installed'),
      }))
      return null
    }

    setState(prev => ({ ...prev, isConnecting: true, error: null }))

    try {
      const accounts = await window.opcat.requestAccounts()

      if (accounts.length > 0) {
        await refreshState()
      }

      setState(prev => ({ ...prev, isConnecting: false }))
      return accounts
    } catch (error) {
      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: error as Error,
      }))
      return null
    }
  }, [refreshState])

  // 断开连接
  const disconnect = useCallback(async () => {
    if (!window.opcat) return

    try {
      await window.opcat.disconnect()
    } catch {
      // 忽略错误
    }

    setState(prev => ({
      ...prev,
      isConnected: false,
      address: null,
      publicKey: null,
      balance: null,
    }))
  }, [])

  // 刷新余额
  const refreshBalance = useCallback(async () => {
    if (!window.opcat || !state.isConnected) return

    try {
      const balance = await window.opcat.getBalance()
      setState(prev => ({ ...prev, balance }))
    } catch (error) {
      setState(prev => ({ ...prev, error: error as Error }))
    }
  }, [state.isConnected])

  // 签名消息
  const signMessage = useCallback(async (message: string): Promise<string | null> => {
    if (!window.opcat || !state.isConnected) return null

    try {
      return await window.opcat.signMessage(message)
    } catch (error) {
      setState(prev => ({ ...prev, error: error as Error }))
      return null
    }
  }, [state.isConnected])

  // 发送转账
  const sendTransfer = useCallback(async (
    toAddress: string,
    satoshis: number
  ): Promise<string | null> => {
    if (!window.opcat || !state.isConnected) return null

    try {
      const txid = await window.opcat.sendTransfer(toAddress, satoshis)
      // 刷新余额
      await refreshBalance()
      return txid
    } catch (error) {
      setState(prev => ({ ...prev, error: error as Error }))
      return null
    }
  }, [state.isConnected, refreshBalance])

  // 获取 UTXO
  const getUtxos = useCallback(async (): Promise<unknown[] | null> => {
    if (!window.opcat || !state.isConnected) return null

    try {
      const result = await window.opcat.getPaymentUtxos()
      return result.utxos
    } catch (error) {
      setState(prev => ({ ...prev, error: error as Error }))
      return null
    }
  }, [state.isConnected])

  const value: WalletExtensionContextValue = {
    ...state,
    connect,
    disconnect,
    refreshBalance,
    signMessage,
    sendTransfer,
    getUtxos,
  }

  return (
    <WalletExtensionContext.Provider value={value}>
      {children}
    </WalletExtensionContext.Provider>
  )
}

/**
 * 使用钱包扩展 Hook
 */
export function useWalletExtension() {
  const context = useContext(WalletExtensionContext)

  if (!context) {
    throw new Error('useWalletExtension must be used within a WalletExtensionProvider')
  }

  return context
}

/**
 * 钱包连接按钮 Hook
 */
export function useWalletConnect() {
  const {
    isInstalled,
    isConnected,
    isConnecting,
    address,
    connect,
    disconnect,
    error,
  } = useWalletExtension()

  const shortAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : null

  const handleConnect = useCallback(async () => {
    if (isConnected) {
      await disconnect()
    } else {
      await connect()
    }
  }, [isConnected, connect, disconnect])

  return {
    isInstalled,
    isConnected,
    isConnecting,
    address,
    shortAddress,
    error,
    handleConnect,
    buttonText: isConnecting
      ? 'Connecting...'
      : isConnected
        ? shortAddress
        : isInstalled
          ? 'Connect Wallet'
          : 'Install Wallet',
  }
}
