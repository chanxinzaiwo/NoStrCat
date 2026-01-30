'use client'

import { useState } from 'react'
import { useUserStore } from '@/stores/userStore'
import { useEventStore } from '@/stores/eventStore'
import { publishEvent } from '@/lib/nostr'

export function PostComposer() {
  const [content, setContent] = useState('')
  const [isPosting, setIsPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [publishStatus, setPublishStatus] = useState<string | null>(null)
  const { profile, publicKey, privateKey, isLoggedIn, relays } = useUserStore()
  const { addEvent, timelineIds, setTimeline } = useEventStore()

  const handleSubmit = async () => {
    if (!content.trim()) return
    setError(null)
    setPublishStatus(null)

    // 检查登录状态
    if (!isLoggedIn || !publicKey || !privateKey) {
      setError('请先登录')
      return
    }

    setIsPosting(true)
    try {
      console.log('Publishing with:', { publicKey, relays })

      // 发布到 Nostr 中继器
      const { success, event, results } = await publishEvent(
        content.trim(),
        publicKey,
        privateKey,
        relays
      )

      console.log('Publish results:', { success, eventId: event.id, results })

      // 添加到本地事件存储
      addEvent({
        id: event.id,
        pubkey: event.pubkey,
        kind: event.kind,
        content: event.content,
        tags: event.tags,
        created_at: event.created_at,
        sig: event.sig,
      })

      // 添加到时间线顶部
      setTimeline([event.id, ...timelineIds])

      // 清空输入
      setContent('')

      // 显示发布结果
      const successCount = Object.values(results).filter(Boolean).length
      const totalCount = Object.keys(results).length

      // 即使没有中继器成功，也显示本地保存成功
      if (successCount > 0) {
        setPublishStatus(`已发布到 ${successCount}/${totalCount} 个中继器`)
      } else {
        setPublishStatus(`已本地保存（中继器连接失败: ${Object.keys(results).join(', ')}）`)
      }
    } catch (err) {
      console.error('Failed to post:', err)
      setError(err instanceof Error ? err.message : '发布失败: ' + String(err))
    } finally {
      setIsPosting(false)
    }
  }

  const characterCount = content.length
  const maxLength = 280
  const isOverLimit = characterCount > maxLength

  return (
    <div className="border-b border-dark-800 p-4">
      <div className="flex space-x-3">
        {/* 头像 */}
        <div className="w-12 h-12 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0">
          {profile?.picture ? (
            <img
              src={profile.picture}
              alt=""
              className="w-12 h-12 rounded-full object-cover"
            />
          ) : (
            <span className="text-primary-400 text-lg">
              {profile?.name?.[0] || '?'}
            </span>
          )}
        </div>

        {/* 输入区域 */}
        <div className="flex-1">
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value)
              setError(null)
            }}
            placeholder={isLoggedIn ? "有什么新鲜事？" : "请先登录后发布..."}
            className="w-full bg-transparent text-lg resize-none outline-none min-h-[100px] placeholder-dark-500"
            disabled={isPosting || !isLoggedIn}
          />

          {/* 错误提示 */}
          {error && (
            <div className="text-red-400 text-sm mb-2">
              {error}
            </div>
          )}

          {/* 发布状态 */}
          {publishStatus && (
            <div className="text-green-400 text-sm mb-2">
              {publishStatus}
            </div>
          )}


          {/* 工具栏 */}
          <div className="flex items-center justify-between pt-3 border-t border-dark-800">
            <div className="flex items-center space-x-2">
              {/* 图片按钮 */}
              <button
                className="p-2 text-primary-400 hover:bg-primary-500/10 rounded-full"
                title="添加图片"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>

              {/* 链接预览 */}
              <button
                className="p-2 text-primary-400 hover:bg-primary-500/10 rounded-full"
                title="添加链接"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </button>

              {/* 内容上链 */}
              <button
                className="p-2 text-yellow-400 hover:bg-yellow-500/10 rounded-full"
                title="锚定到链上"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </button>
            </div>

            <div className="flex items-center space-x-3">
              {/* 字数统计 */}
              <span className={`text-sm ${isOverLimit ? 'text-red-400' : 'text-dark-500'}`}>
                {characterCount}/{maxLength}
              </span>

              {/* 发布按钮 */}
              <button
                onClick={handleSubmit}
                disabled={!content.trim() || isPosting || isOverLimit || !isLoggedIn}
                className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPosting ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    发布中...
                  </span>
                ) : isLoggedIn ? (
                  '发布'
                ) : (
                  '请先登录'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
