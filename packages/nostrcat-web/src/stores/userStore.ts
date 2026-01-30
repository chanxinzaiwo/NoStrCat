import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UserProfile {
  name?: string
  about?: string
  picture?: string
  nip05?: string
}

interface UserState {
  // 认证状态
  isLoggedIn: boolean
  publicKey: string | null
  privateKey: string | null

  // 用户资料
  profile: UserProfile | null

  // 设置
  relays: string[]

  // 方法
  login: (privateKey: string) => void
  logout: () => void
  setProfile: (profile: UserProfile) => void
  addRelay: (url: string) => void
  removeRelay: (url: string) => void
  initialize: () => void
}

// 从私钥派生公钥（使用 secp256k1）
async function derivePublicKey(privateKey: string): Promise<string> {
  console.log('Deriving public key from private key:', privateKey.length, 'chars')

  if (privateKey.length !== 64) {
    console.error('Invalid private key length:', privateKey.length)
    throw new Error(`私钥长度错误: ${privateKey.length}, 应为 64`)
  }

  try {
    const secp = await import('@noble/secp256k1')
    const privKeyBytes = Uint8Array.from(
      privateKey.match(/.{2}/g)!.map(byte => parseInt(byte, 16))
    )
    const pubKeyBytes = secp.getPublicKey(privKeyBytes, true) // compressed
    // 去掉前缀字节，只保留 x 坐标（32字节）
    const pubKey = Array.from(pubKeyBytes.slice(1))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    console.log('Derived public key:', pubKey.length, 'chars')
    if (pubKey.length !== 64) {
      throw new Error(`派生公钥长度错误: ${pubKey.length}, 应为 64`)
    }

    return pubKey
  } catch (err) {
    console.error('Public key derivation failed:', err)
    throw err
  }
}


export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      isLoggedIn: false,
      publicKey: null,
      privateKey: null,
      profile: null,
      relays: [
        'wss://relay.damus.io',
        'wss://nos.lol',
        'wss://relay.snort.social',
        'wss://nostr.wine',
        'wss://relay.primal.net',
      ],

      login: async (privateKey: string) => {
        console.log('Login called with private key:', privateKey.length, 'chars')
        try {
          const publicKey = await derivePublicKey(privateKey)
          console.log('Login successful, public key:', publicKey.length, 'chars')
          set({
            isLoggedIn: true,
            privateKey,
            publicKey,
          })
        } catch (err) {
          console.error('Login failed:', err)
          throw err
        }
      },

      logout: () => {
        set({
          isLoggedIn: false,
          privateKey: null,
          publicKey: null,
          profile: null,
        })
      },

      setProfile: (profile: UserProfile) => {
        set({ profile })
      },

      addRelay: (url: string) => {
        const { relays } = get()
        if (!relays.includes(url)) {
          set({ relays: [...relays, url] })
        }
      },

      removeRelay: (url: string) => {
        const { relays } = get()
        set({ relays: relays.filter(r => r !== url) })
      },

      initialize: async () => {
        // 初始化时检查本地存储的状态
        const { privateKey } = get()
        console.log('Initialize called, privateKey exists:', !!privateKey)
        if (privateKey) {
          try {
            const publicKey = await derivePublicKey(privateKey)
            console.log('Initialize: derived public key:', publicKey.length, 'chars')
            set({ publicKey, isLoggedIn: true })
          } catch (err) {
            console.error('Initialize failed to derive public key:', err)
            // 清除无效的私钥
            set({ privateKey: null, publicKey: null, isLoggedIn: false })
          }
        }
      },
    }),
    {
      name: 'nostrcat-user',
      partialize: (state) => ({
        privateKey: state.privateKey,
        relays: state.relays,
      }),
    }
  )
)
