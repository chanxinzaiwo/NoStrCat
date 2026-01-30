'use client'

import { useState } from 'react'
import { useUserStore } from '@/stores/userStore'

interface LoginModalProps {
  onClose: () => void
}

type TabType = 'login' | 'create' | 'import'

export function LoginModal({ onClose }: LoginModalProps) {
  const [tab, setTab] = useState<TabType>('create') // 默认显示创建账户
  const [privateKey, setPrivateKey] = useState('')
  const [error, setError] = useState('')
  const [generatedKeys, setGeneratedKeys] = useState<{
    privateKey: string
    publicKey: string
  } | null>(null)

  const login = useUserStore((state) => state.login)

  // 登录函数
  const doLogin = async (key: string) => {
    try {
      await login(key)
      // 同时保存到 localStorage 供 NostrCat 使用
      localStorage.setItem('nostrcat_private_key', key)
    } catch (e) {
      console.error('Login error:', e)
      setError('登录失败')
    }
  }

  // 生成随机密钥对（使用 secp256k1）
  const generateKeyPair = async () => {
    try {
      const randomBytes = new Uint8Array(32)
      crypto.getRandomValues(randomBytes)
      const privKey = Array.from(randomBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')

      // 使用 secp256k1 派生公钥
      const secp = await import('@noble/secp256k1')
      const privKeyBytes = Uint8Array.from(
        privKey.match(/.{2}/g)!.map(byte => parseInt(byte, 16))
      )
      const pubKeyBytes = secp.getPublicKey(privKeyBytes, true) // compressed
      // 去掉前缀字节（02 或 03），只保留 x 坐标
      const pubKey = Array.from(pubKeyBytes.slice(1))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')

      setGeneratedKeys({ privateKey: privKey, publicKey: pubKey })
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

    // 验证私钥格式（64 位十六进制或 nsec 格式）
    if (!/^[0-9a-f]{64}$/i.test(privateKey) && !privateKey.startsWith('nsec')) {
      setError('私钥格式无效')
      return
    }

    try {
      await doLogin(privateKey)
      onClose()
    } catch (e) {
      setError('登录失败')
    }
  }

  const handleCreateAccount = async () => {
    if (!generatedKeys) {
      await generateKeyPair()
      return
    }

    await doLogin(generatedKeys.privateKey)
    onClose()
  }

  const handleImportKey = () => {
    handleLogin()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card w-full max-w-md mx-4 bg-dark-900">
        {/* 标题 */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">欢迎使用 NoStrCat</h2>
          <button
            onClick={onClose}
            className="text-dark-400 hover:text-dark-200"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 标签切换 */}
        <div className="flex border-b border-dark-700 mb-6">
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
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'text-primary-400 border-b-2 border-primary-400'
                  : 'text-dark-400 hover:text-dark-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 内容 */}
        <div className="space-y-4">
          {tab === 'login' && (
            <>
              <p className="text-dark-400 text-sm">
                使用浏览器扩展（如 Alby、nos2x）登录，无需输入私钥。
              </p>
              <button
                onClick={() => {
                  // 检查 NIP-07 扩展
                  if (typeof window !== 'undefined' && (window as unknown as { nostr?: unknown }).nostr) {
                    // 使用扩展登录
                    alert('检测到 Nostr 扩展，正在登录...')
                  } else {
                    setError('未检测到 Nostr 浏览器扩展')
                  }
                }}
                className="btn btn-primary w-full"
              >
                使用扩展登录
              </button>
              <p className="text-dark-500 text-xs text-center">
                推荐使用 Alby 或 nos2x 扩展
              </p>
            </>
          )}

          {tab === 'create' && (
            <>
              {error && (
                <p className="text-red-400 text-sm">{error}</p>
              )}
              {!generatedKeys ? (
                <>
                  <p className="text-dark-400 text-sm">
                    创建新的 Nostr 账户。请务必保存好您的私钥！
                  </p>
                  <button
                    onClick={generateKeyPair}
                    className="btn btn-primary w-full"
                  >
                    生成新密钥对
                  </button>
                </>
              ) : (
                <>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-dark-400 mb-1">
                        公钥 (npub)
                      </label>
                      <div className="input bg-dark-800 text-xs font-mono break-all">
                        {generatedKeys.publicKey}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-dark-400 mb-1">
                        私钥 (nsec) - 请安全保存！
                      </label>
                      <div className="input bg-dark-800 text-xs font-mono break-all text-red-400">
                        {generatedKeys.privateKey}
                      </div>
                    </div>
                  </div>
                  <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-3">
                    <p className="text-yellow-400 text-sm">
                      ⚠️ 请立即复制并安全保存您的私钥！私钥是恢复账户的唯一方式。
                    </p>
                  </div>
                  <button
                    onClick={handleCreateAccount}
                    className="btn btn-primary w-full"
                  >
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
                placeholder="nsec... 或 hex 私钥"
                className="input"
              />
              {error && (
                <p className="text-red-400 text-sm">{error}</p>
              )}
              <button
                onClick={handleImportKey}
                className="btn btn-primary w-full"
              >
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
