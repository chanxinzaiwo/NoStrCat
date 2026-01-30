'use client'

import { useState } from 'react'
import { useUserStore } from '@/stores/userStore'
import { nsecToHex, hexToNsec, hexToNpub } from '@/lib/nostr'

interface LoginModalProps {
  onClose: () => void
}

type TabType = 'login' | 'create' | 'import'

export function LoginModal({ onClose }: LoginModalProps) {
  const [tab, setTab] = useState<TabType>('create')
  const [privateKey, setPrivateKey] = useState('')
  const [error, setError] = useState('')
  const [generatedKeys, setGeneratedKeys] = useState<{
    privateKey: string
    publicKey: string
    nsec: string
    npub: string
  } | null>(null)

  const login = useUserStore((state) => state.login)

  // 登录函数
  const doLogin = async (hexKey: string) => {
    try {
      await login(hexKey)
      localStorage.setItem('nostrcat_private_key', hexKey)
    } catch (e) {
      console.error('Login error:', e)
      throw new Error('登录失败')
    }
  }

  // 生成随机密钥对
  const generateKeyPair = async () => {
    try {
      const randomBytes = new Uint8Array(32)
      crypto.getRandomValues(randomBytes)
      const privKey = Array.from(randomBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')

      const secp = await import('@noble/secp256k1')
      const privKeyBytes = Uint8Array.from(
        privKey.match(/.{2}/g)!.map(byte => parseInt(byte, 16))
      )
      const pubKeyBytes = secp.getPublicKey(privKeyBytes, true)
      const pubKey = Array.from(pubKeyBytes.slice(1))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')

      setGeneratedKeys({
        privateKey: privKey,
        publicKey: pubKey,
        nsec: hexToNsec(privKey),
        npub: hexToNpub(pubKey),
      })
    } catch (err) {
      console.error('Key generation error:', err)
      setError('密钥生成失败')
    }
  }

  const handleLogin = async () => {
    if (!privateKey.trim()) {
      setError('请输入私钥')
      return
    }

    let hexKey = privateKey.trim()

    // 如果是 nsec 格式，转换为 hex
    if (hexKey.startsWith('nsec')) {
      const converted = nsecToHex(hexKey)
      if (!converted) {
        setError('nsec 格式无效')
        return
      }
      hexKey = converted
    }

    // 验证是否为有效的 64 位十六进制
    if (!/^[0-9a-f]{64}$/i.test(hexKey)) {
      setError('私钥格式无效（需要 64 位十六进制或 nsec 格式）')
      return
    }

    try {
      await doLogin(hexKey)
      onClose()
    } catch {
      setError('登录失败')
    }
  }

  const handleCreateAccount = async () => {
    if (!generatedKeys) {
      await generateKeyPair()
      return
    }

    try {
      await doLogin(generatedKeys.privateKey)
      onClose()
    } catch {
      setError('登录失败')
    }
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    alert(`${label} 已复制到剪贴板`)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative card w-full md:max-w-md bg-dark-900 rounded-t-2xl md:rounded-2xl max-h-[90vh] overflow-y-auto safe-area-pb">
        <div className="md:hidden flex justify-center py-2">
          <div className="w-10 h-1 bg-dark-600 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-4 md:px-6 py-4">
          <h2 className="text-lg md:text-xl font-bold">欢迎使用 NoStrCat</h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-dark-400 hover:text-dark-200 rounded-lg"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex border-b border-dark-700 px-4 md:px-6">
          {[
            { key: 'login', label: '快速登录' },
            { key: 'create', label: '创建账户' },
            { key: 'import', label: '导入私钥' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key as TabType)
                setError('')
                setGeneratedKeys(null)
              }}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'text-primary-400 border-b-2 border-primary-400'
                  : 'text-dark-400 hover:text-dark-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4 md:p-6 space-y-4">
          {tab === 'login' && (
            <>
              <p className="text-dark-400 text-sm">
                使用浏览器扩展（如 Alby、nos2x）登录，无需输入私钥。
              </p>
              <button
                onClick={async () => {
                  const w = window as unknown as { nostr?: { getPublicKey: () => Promise<string> } }
                  if (w.nostr) {
                    try {
                      const pubkey = await w.nostr.getPublicKey()
                      // NIP-07 模式：只有公钥，无私钥
                      alert(`已获取公钥: ${pubkey.slice(0, 8)}...（NIP-07 模式暂不完全支持）`)
                    } catch {
                      setError('扩展授权被拒绝')
                    }
                  } else {
                    setError('未检测到 Nostr 浏览器扩展')
                  }
                }}
                className="btn btn-primary w-full py-3"
              >
                使用扩展登录
              </button>
              {error && <p className="text-red-400 text-sm text-center">{error}</p>}
              <p className="text-dark-500 text-xs text-center">
                推荐使用 Alby 或 nos2x 扩展
              </p>
            </>
          )}

          {tab === 'create' && (
            <>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              {!generatedKeys ? (
                <>
                  <p className="text-dark-400 text-sm">
                    创建新的 Nostr 账户。请务必保存好您的私钥！
                  </p>
                  <button onClick={generateKeyPair} className="btn btn-primary w-full py-3">
                    生成新密钥对
                  </button>
                </>
              ) : (
                <>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-dark-400 mb-1">公钥 (npub)</label>
                      <div
                        className="input bg-dark-800 text-xs font-mono break-all py-3 cursor-pointer hover:bg-dark-700"
                        onClick={() => copyToClipboard(generatedKeys.npub, '公钥')}
                      >
                        {generatedKeys.npub}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-dark-400 mb-1">
                        私钥 (nsec) - 点击复制！
                      </label>
                      <div
                        className="input bg-dark-800 text-xs font-mono break-all text-red-400 py-3 cursor-pointer hover:bg-dark-700"
                        onClick={() => copyToClipboard(generatedKeys.nsec, '私钥')}
                      >
                        {generatedKeys.nsec}
                      </div>
                    </div>
                  </div>
                  <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-3">
                    <p className="text-yellow-400 text-sm">
                      ⚠️ 请立即点击上方私钥复制并安全保存！私钥是恢复账户的唯一方式。
                    </p>
                  </div>
                  <button onClick={handleCreateAccount} className="btn btn-primary w-full py-3">
                    我已保存，继续
                  </button>
                </>
              )}
            </>
          )}

          {tab === 'import' && (
            <>
              <p className="text-dark-400 text-sm">
                输入您的 Nostr 私钥（nsec 或 hex 格式）
              </p>
              <input
                type="password"
                value={privateKey}
                onChange={(e) => {
                  setPrivateKey(e.target.value)
                  setError('')
                }}
                placeholder="nsec1... 或 64位十六进制"
                className="input"
              />
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button onClick={handleLogin} className="btn btn-primary w-full py-3">
                导入并登录
              </button>
              <p className="text-dark-500 text-xs text-center">
                私钥仅存储在本地，不会上传到任何服务器
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
