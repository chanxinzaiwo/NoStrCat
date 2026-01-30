'use client'

/**
 * Zap Hook
 *
 * 管理 OP_CAT Layer 打赏功能
 */

import { useState, useEffect, useCallback } from 'react'
import { ZapReceipt, ZapStats } from '@nostrcat/core'
import { useNostrCat } from './useNostrCat'

/**
 * Zap Hook 返回值
 */
interface UseZapReturn {
  sentZaps: ZapReceipt[]
  receivedZaps: ZapReceipt[]
  stats: ZapStats | null
  isLoading: boolean
  error: Error | null
  sendZap: (params: SendZapParams) => Promise<ZapReceipt | null>
  batchZap: (requests: BatchZapRequest[]) => Promise<ZapReceipt[]>
  getZapsForEvent: (eventId: string) => Promise<ZapReceipt[]>
  verifyZap: (receiptId: string) => Promise<ZapVerifyResult>
  loadHistory: () => Promise<void>
}

interface SendZapParams {
  recipientPubkey: string
  amount: bigint
  eventId?: string
  memo?: string
  splitRecipients?: Array<{
    pubkey: string
    percentage: number
  }>
}

interface BatchZapRequest {
  pubkey: string
  amount: bigint
  eventId?: string
  memo?: string
}

interface ZapVerifyResult {
  valid: boolean
  onChainConfirmed: boolean
  error?: string
}

/**
 * Zap Hook
 */
export function useZap(): UseZapReturn {
  const { client, isLoggedIn } = useNostrCat()
  const [sentZaps, setSentZaps] = useState<ZapReceipt[]>([])
  const [receivedZaps, setReceivedZaps] = useState<ZapReceipt[]>([])
  const [stats, setStats] = useState<ZapStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // 初始化并订阅 Zap
  useEffect(() => {
    if (!client || !isLoggedIn) return

    const initZaps = async () => {
      setIsLoading(true)
      try {
        const zapManager = client.zapManager

        // 加载历史记录
        await zapManager.loadHistory()

        // 获取当前数据
        setSentZaps(zapManager.getSentZaps())
        setReceivedZaps(zapManager.getReceivedZaps())

        const zapStats = await zapManager.getStats()
        setStats(zapStats)
      } catch (err) {
        setError(err as Error)
      } finally {
        setIsLoading(false)
      }
    }

    initZaps()

    // 订阅新 Zap
    const zapManager = client.zapManager
    zapManager.subscribe((zap, isIncoming) => {
      if (isIncoming) {
        setReceivedZaps(zapManager.getReceivedZaps())
      } else {
        setSentZaps(zapManager.getSentZaps())
      }

      // 更新统计
      zapManager.getStats().then(setStats)
    })

    return () => {
      zapManager.unsubscribe()
    }
  }, [client, isLoggedIn])

  // 发送 Zap
  const sendZap = useCallback(async (params: SendZapParams): Promise<ZapReceipt | null> => {
    if (!client || !isLoggedIn) return null

    setIsLoading(true)
    setError(null)

    try {
      const zapManager = client.zapManager
      const receipt = await zapManager.sendZap({
        recipientPubkey: params.recipientPubkey,
        amount: params.amount,
        eventId: params.eventId,
        memo: params.memo,
        splitRecipients: params.splitRecipients,
      })

      // 更新列表
      setSentZaps(zapManager.getSentZaps())
      const zapStats = await zapManager.getStats()
      setStats(zapStats)

      return receipt
    } catch (err) {
      setError(err as Error)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [client, isLoggedIn])

  // 批量 Zap
  const batchZap = useCallback(async (requests: BatchZapRequest[]): Promise<ZapReceipt[]> => {
    if (!client || !isLoggedIn) return []

    setIsLoading(true)
    setError(null)

    try {
      const zapManager = client.zapManager
      const receipts = await zapManager.batchZap(requests)

      // 更新列表
      setSentZaps(zapManager.getSentZaps())
      const zapStats = await zapManager.getStats()
      setStats(zapStats)

      return receipts
    } catch (err) {
      setError(err as Error)
      return []
    } finally {
      setIsLoading(false)
    }
  }, [client, isLoggedIn])

  // 获取事件的 Zap 列表
  const getZapsForEvent = useCallback(async (eventId: string): Promise<ZapReceipt[]> => {
    if (!client || !isLoggedIn) return []

    try {
      const zapManager = client.zapManager
      return await zapManager.getZapsForEvent(eventId)
    } catch (err) {
      setError(err as Error)
      return []
    }
  }, [client, isLoggedIn])

  // 验证 Zap
  const verifyZap = useCallback(async (receiptId: string): Promise<ZapVerifyResult> => {
    if (!client || !isLoggedIn) {
      return { valid: false, onChainConfirmed: false, error: 'Not logged in' }
    }

    try {
      const zapManager = client.zapManager
      return await zapManager.verifyZapReceipt(receiptId)
    } catch (err) {
      return { valid: false, onChainConfirmed: false, error: (err as Error).message }
    }
  }, [client, isLoggedIn])

  // 加载历史记录
  const loadHistory = useCallback(async () => {
    if (!client || !isLoggedIn) return

    setIsLoading(true)
    try {
      const zapManager = client.zapManager
      await zapManager.loadHistory()

      setSentZaps(zapManager.getSentZaps())
      setReceivedZaps(zapManager.getReceivedZaps())

      const zapStats = await zapManager.getStats()
      setStats(zapStats)
    } catch (err) {
      setError(err as Error)
    } finally {
      setIsLoading(false)
    }
  }, [client, isLoggedIn])

  return {
    sentZaps,
    receivedZaps,
    stats,
    isLoading,
    error,
    sendZap,
    batchZap,
    getZapsForEvent,
    verifyZap,
    loadHistory,
  }
}

/**
 * 快捷 Zap Hook（常用金额）
 */
export function useQuickZap() {
  const { sendZap, isLoading, error } = useZap()

  const quickAmounts = [
    { label: '21', amount: 21n },
    { label: '100', amount: 100n },
    { label: '500', amount: 500n },
    { label: '1K', amount: 1000n },
    { label: '5K', amount: 5000n },
    { label: '10K', amount: 10000n },
  ]

  const quickZap = useCallback(async (
    recipientPubkey: string,
    amountIndex: number,
    eventId?: string,
    memo?: string
  ) => {
    const amount = quickAmounts[amountIndex]?.amount
    if (!amount) return null

    return sendZap({
      recipientPubkey,
      amount,
      eventId,
      memo,
    })
  }, [sendZap])

  return {
    quickAmounts,
    quickZap,
    isLoading,
    error,
  }
}

/**
 * 事件 Zap 统计 Hook
 */
export function useEventZaps(eventId: string) {
  const { client, isLoggedIn } = useNostrCat()
  const [zaps, setZaps] = useState<ZapReceipt[]>([])
  const [totalAmount, setTotalAmount] = useState(0n)
  const [zapCount, setZapCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!client || !isLoggedIn || !eventId) return

    const loadZaps = async () => {
      setIsLoading(true)
      try {
        const zapManager = client.zapManager
        const eventZaps = await zapManager.getZapsForEvent(eventId)

        setZaps(eventZaps)
        setZapCount(eventZaps.length)

        const total = eventZaps.reduce((sum, z) => sum + z.amount, 0n)
        setTotalAmount(total)
      } catch (err) {
        setError(err as Error)
      } finally {
        setIsLoading(false)
      }
    }

    loadZaps()
  }, [client, isLoggedIn, eventId])

  return {
    zaps,
    totalAmount,
    zapCount,
    isLoading,
    error,
  }
}
