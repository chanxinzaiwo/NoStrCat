'use client'

import { ReactNode, useEffect } from 'react'
import { useUserStore } from '@/stores/userStore'

export function Providers({ children }: { children: ReactNode }) {
  const initialize = useUserStore((state) => state.initialize)

  useEffect(() => {
    initialize()
  }, [initialize])

  // 过滤掉来自浏览器扩展（如 MetaMask）的控制台错误
  useEffect(() => {
    const originalConsoleError = console.error
    console.error = (...args: unknown[]) => {
      // 过滤 MetaMask 和其他 Web3 钱包扩展的错误
      const errorString = args.join(' ')
      if (
        errorString.includes('chrome-extension://') ||
        errorString.includes('MetaMask') ||
        errorString.includes('inpage.js') ||
        errorString.includes('nkbihfbeogaeaoehlefnkodbefgpgknn')
      ) {
        return // 忽略这些错误
      }
      originalConsoleError.apply(console, args)
    }

    return () => {
      console.error = originalConsoleError
    }
  }, [])

  // 暂时禁用 NostrCatProvider，直接使用 userStore
  return <>{children}</>
}
