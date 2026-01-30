'use client'

import { useState } from 'react'
import { useUserStore } from '@/stores/userStore'
import { PostComposer } from '@/components/feed/PostComposer'
import { Timeline } from '@/components/feed/Timeline'
import { LoginModal } from '@/components/common/LoginModal'
import { RelayStatus } from '@/components/common/RelayStatus'

export default function HomePage() {
  const { isLoggedIn, publicKey, logout } = useUserStore()
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [showRelays, setShowRelays] = useState(false)

  return (
    <div className="max-w-2xl mx-auto py-4">
      {/* 页面标题 */}
      <header className="sticky top-0 bg-dark-950/80 backdrop-blur-sm border-b border-dark-800 p-4 z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">首页</h1>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setShowRelays(!showRelays)}
              className="text-sm text-primary-400 hover:underline"
            >
              中继器
            </button>
            {isLoggedIn && (
              <button
                onClick={() => {
                  logout()
                  localStorage.removeItem('nostrcat_private_key')
                }}
                className="text-sm text-dark-400 hover:text-red-400"
              >
                登出
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 中继器列表 */}
      {showRelays && (
        <div className="p-4 border-b border-dark-800">
          <RelayStatus />
        </div>
      )}

      {/* 发帖区域 */}
      {isLoggedIn ? (
        <PostComposer />
      ) : (
        <div className="p-4 border-b border-dark-800">
          <div className="card bg-dark-900 text-center py-8">
            <p className="text-dark-400 mb-4">登录后即可发布内容</p>
            <button
              onClick={() => setShowLoginModal(true)}
              className="btn btn-primary"
            >
              登录 / 注册
            </button>
          </div>
        </div>
      )}

      {/* 时间线 */}
      <Timeline />

      {/* 登录弹窗 */}
      {showLoginModal && (
        <LoginModal onClose={() => setShowLoginModal(false)} />
      )}
    </div>
  )
}
