'use client'

/**
 * NoStrCat 主 Hook
 *
 * 管理客户端实例和连接状态
 */

import { useEffect, useState, useCallback, createContext, useContext, ReactNode } from 'react'
import {
  NostrCatClient,
  NostrCatClientConfig,
  UserProfile,
  generateKeyPair,
  derivePublicKey,
} from '@nostrcat/core'

/**
 * 连接状态
 */
export interface ConnectionStatus {
  nostr: 'connecting' | 'connected' | 'disconnected' | 'error'
  opcat: 'connecting' | 'connected' | 'disconnected' | 'error'
}

/**
 * Context 值类型
 */
interface NostrCatContextValue {
  client: NostrCatClient | null
  isConnected: boolean
  isLoggedIn: boolean
  publicKey: string | null
  profile: UserProfile | null
  connectionStatus: ConnectionStatus
  login: (privateKey: string) => void
  logout: () => void
  createAccount: () => { privateKey: string; publicKey: string }
  updateProfile: (profile: UserProfile) => Promise<void>
  error: Error | null
}

const NostrCatContext = createContext<NostrCatContextValue | null>(null)

/**
 * Provider Props
 */
interface NostrCatProviderProps {
  children: ReactNode
  config?: NostrCatClientConfig
}

/**
 * NoStrCat Provider 组件
 */
export function NostrCatProvider({ children, config }: NostrCatProviderProps) {
  const [client, setClient] = useState<NostrCatClient | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    nostr: 'disconnected',
    opcat: 'disconnected',
  })

  // 初始化客户端
  useEffect(() => {
    const initClient = async () => {
      try {
        setConnectionStatus({
          nostr: 'connecting',
          opcat: 'connecting',
        })

        const newClient = new NostrCatClient({
          ...config,
          autoConnect: false,
          debug: process.env.NODE_ENV === 'development',
        })

        // 先设置客户端，允许立即使用
        setClient(newClient)

        // 后台连接，不阻塞 UI
        newClient.connect().then(() => {
          setIsConnected(true)
          setConnectionStatus({
            nostr: 'connected',
            opcat: 'connected',
          })
        }).catch((err) => {
          console.warn('Connection partial failure:', err)
          // 即使部分连接失败，仍标记为已连接
          setIsConnected(true)
          setConnectionStatus({
            nostr: 'connected',
            opcat: 'error',
          })
        })

        // 检查本地存储的密钥
        const storedKey = localStorage.getItem('nostrcat_private_key')
        if (storedKey) {
          newClient.login(storedKey)
          setIsLoggedIn(true)
          setPublicKey(newClient.getPublicKey())

          // 加载用户资料（非阻塞）
          newClient.getProfile(newClient.getPublicKey()!).then((userProfile) => {
            if (userProfile) {
              setProfile(userProfile)
            }
          }).catch(() => {
            // 忽略资料加载失败
          })
        }
      } catch (err) {
        setError(err as Error)
        setConnectionStatus({
          nostr: 'error',
          opcat: 'error',
        })
      }
    }

    initClient()

    return () => {
      client?.disconnect()
    }
  }, [])

  // 登录
  const login = useCallback((privateKey: string) => {
    if (!client) return

    try {
      client.login(privateKey)
      setIsLoggedIn(true)
      setPublicKey(client.getPublicKey())

      // 保存到本地存储
      localStorage.setItem('nostrcat_private_key', privateKey)

      // 加载用户资料
      client.getProfile(client.getPublicKey()!).then((userProfile) => {
        if (userProfile) {
          setProfile(userProfile)
        }
      })
    } catch (err) {
      setError(err as Error)
    }
  }, [client])

  // 登出
  const logout = useCallback(() => {
    if (!client) return

    client.logout()
    setIsLoggedIn(false)
    setPublicKey(null)
    setProfile(null)

    localStorage.removeItem('nostrcat_private_key')
  }, [client])

  // 创建账户
  const createAccount = useCallback(() => {
    if (!client) {
      throw new Error('Client not initialized')
    }

    const keyPair = client.createAccount()
    setIsLoggedIn(true)
    setPublicKey(keyPair.publicKey)

    // 保存到本地存储
    localStorage.setItem('nostrcat_private_key', keyPair.privateKey)

    return keyPair
  }, [client])

  // 更新资料
  const updateProfile = useCallback(async (newProfile: UserProfile) => {
    if (!client || !isLoggedIn) {
      throw new Error('Not logged in')
    }

    await client.updateProfile(newProfile)
    setProfile(newProfile)
  }, [client, isLoggedIn])

  const value: NostrCatContextValue = {
    client,
    isConnected,
    isLoggedIn,
    publicKey,
    profile,
    connectionStatus,
    login,
    logout,
    createAccount,
    updateProfile,
    error,
  }

  return (
    <NostrCatContext.Provider value={value}>
      {children}
    </NostrCatContext.Provider>
  )
}

/**
 * 使用 NoStrCat 客户端 Hook
 */
export function useNostrCat() {
  const context = useContext(NostrCatContext)

  if (!context) {
    throw new Error('useNostrCat must be used within a NostrCatProvider')
  }

  return context
}

/**
 * 简化的连接状态 Hook
 */
export function useConnectionStatus() {
  const { connectionStatus, isConnected, error } = useNostrCat()

  return {
    nostrStatus: connectionStatus.nostr,
    opcatStatus: connectionStatus.opcat,
    isFullyConnected: isConnected,
    hasError: !!error,
    error,
  }
}
