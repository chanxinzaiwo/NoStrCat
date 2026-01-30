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
    <div className="max-w-2xl mx-auto">
      {/* 页面标题 */}
      <header className="sticky top-0 bg-dark-950/80 backdrop-blur-sm border-b border-dark-800 px-4 py-3 z-10 safe-area-pt">
        <div className="flex items-center justify-between">
          {/* 移动端显示 Logo */}
          <div className="md:hidden">
            <h1 className="text-lg font-bold text-primary-400">NoStrCat</h1>
          </div>
          <h1 className="hidden md:block text-xl font-bold">首页</h1>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowRelays(!showRelays)}
              className="p-2 text-dark-400 hover:text-primary-400 rounded-lg hover:bg-dark-800"
              title="中继器"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
              </svg>
            </button>
            {isLoggedIn && (
              <button
                onClick={() => {
                  logout()
                  localStorage.removeItem('nostrcat_private_key')
                }}
                className="p-2 text-dark-400 hover:text-red-400 rounded-lg hover:bg-dark-800"
                title="登出"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
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
          <div className="card bg-dark-900 text-center py-6 md:py-8">
            <svg className="w-12 h-12 mx-auto mb-3 text-dark-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            <p className="text-dark-400 mb-4 text-sm md:text-base">登录后即可发布内容</p>
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
