'use client'

/**
 * 钱包 Hook
 *
 * 管理 OP_CAT Layer 钱包功能
 */

import { useState, useEffect, useCallback } from 'react'
import { Balance, Transaction } from '@nostrcat/core'
import { useNostrCat } from './useNostrCat'

/**
 * 钱包 Hook 返回值
 */
interface UseWalletReturn {
  address: string | null
  balance: Balance | null
  transactions: Transaction[]
  isLoading: boolean
  error: Error | null
  refreshBalance: () => Promise<void>
  send: (toAddress: string, amount: bigint, memo?: string) => Promise<SendResult>
  getTransactionHistory: (limit?: number) => Promise<void>
  estimateFee: (numInputs: number, numOutputs: number) => bigint
  isValidAddress: (address: string) => boolean
  getExplorerUrl: (type: 'address' | 'tx', id?: string) => string
}

interface SendResult {
  success: boolean
  txid?: string
  error?: string
}

/**
 * 钱包 Hook
 */
export function useWallet(): UseWalletReturn {
  const { client, isLoggedIn } = useNostrCat()
  const [address, setAddress] = useState<string | null>(null)
  const [balance, setBalance] = useState<Balance | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // 初始化钱包数据
  useEffect(() => {
    if (!client || !isLoggedIn) {
      setAddress(null)
      setBalance(null)
      setTransactions([])
      return
    }

    const initWallet = async () => {
      setIsLoading(true)
      try {
        const wallet = client.wallet
        setAddress(wallet.getAddress())

        const bal = await wallet.getBalance()
        setBalance(bal)

        const txHistory = await wallet.getTransactionHistory()
        setTransactions(txHistory)
      } catch (err) {
        setError(err as Error)
      } finally {
        setIsLoading(false)
      }
    }

    initWallet()
  }, [client, isLoggedIn])

  // 刷新余额
  const refreshBalance = useCallback(async () => {
    if (!client || !isLoggedIn) return

    setIsLoading(true)
    try {
      const wallet = client.wallet
      const bal = await wallet.getBalance()
      setBalance(bal)
    } catch (err) {
      setError(err as Error)
    } finally {
      setIsLoading(false)
    }
  }, [client, isLoggedIn])

  // 发送交易
  const send = useCallback(async (
    toAddress: string,
    amount: bigint,
    memo?: string
  ): Promise<SendResult> => {
    if (!client || !isLoggedIn) {
      return { success: false, error: 'Not logged in' }
    }

    setIsLoading(true)
    try {
      const wallet = client.wallet
      const result = await wallet.send(toAddress, amount, memo)

      if (result.success) {
        // 刷新余额和交易记录
        await refreshBalance()
        const txHistory = await wallet.getTransactionHistory()
        setTransactions(txHistory)
      }

      return {
        success: result.success,
        txid: result.txid,
        error: result.error,
      }
    } catch (err) {
      const errorMessage = (err as Error).message
      setError(err as Error)
      return { success: false, error: errorMessage }
    } finally {
      setIsLoading(false)
    }
  }, [client, isLoggedIn, refreshBalance])

  // 获取交易历史
  const getTransactionHistory = useCallback(async (limit = 50) => {
    if (!client || !isLoggedIn) return

    setIsLoading(true)
    try {
      const wallet = client.wallet
      const txHistory = await wallet.getTransactionHistory(limit)
      setTransactions(txHistory)
    } catch (err) {
      setError(err as Error)
    } finally {
      setIsLoading(false)
    }
  }, [client, isLoggedIn])

  // 估算手续费
  const estimateFee = useCallback((numInputs: number, numOutputs: number): bigint => {
    if (!client || !isLoggedIn) return 0n

    return client.wallet.estimateFee(numInputs, numOutputs)
  }, [client, isLoggedIn])

  // 验证地址
  const isValidAddress = useCallback((addr: string): boolean => {
    if (!client || !isLoggedIn) return false
    return client.wallet.isValidAddress(addr)
  }, [client, isLoggedIn])

  // 获取区块浏览器链接
  const getExplorerUrl = useCallback((type: 'address' | 'tx', id?: string): string => {
    if (!client || !isLoggedIn) return ''
    return client.wallet.getExplorerUrl(type, id)
  }, [client, isLoggedIn])

  return {
    address,
    balance,
    transactions,
    isLoading,
    error,
    refreshBalance,
    send,
    getTransactionHistory,
    estimateFee,
    isValidAddress,
    getExplorerUrl,
  }
}

/**
 * 余额显示格式化 Hook
 */
export function useFormattedBalance() {
  const { balance } = useWallet()

  const formatSats = (sats: bigint): string => {
    return sats.toLocaleString()
  }

  const formatBTC = (sats: bigint): string => {
    const btc = Number(sats) / 100_000_000
    return btc.toFixed(8)
  }

  const formatUSD = (sats: bigint, btcPrice = 43000): string => {
    const btc = Number(sats) / 100_000_000
    const usd = btc * btcPrice
    return `$${usd.toFixed(2)}`
  }

  return {
    sats: balance ? formatSats(balance.total) : '0',
    btc: balance ? formatBTC(balance.total) : '0.00000000',
    usd: balance ? formatUSD(balance.total) : '$0.00',
    confirmed: balance ? formatSats(balance.confirmed) : '0',
    unconfirmed: balance ? formatSats(balance.unconfirmed) : '0',
  }
}
