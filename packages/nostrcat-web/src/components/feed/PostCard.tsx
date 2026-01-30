'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import Link from 'next/link'
import { ZapModal } from '../wallet/ZapModal'

interface PostStats {
  replies: number
  reposts: number
  likes: number
  zaps: number
}

interface Author {
  name?: string
  picture?: string | null
  nip05?: string | null
}

interface Post {
  id: string
  pubkey: string
  content: string
  created_at: number
  author: Author
  stats: PostStats
  isVerified?: boolean
  isAnchored?: boolean
}

interface PostCardProps {
  post: Post
}

export function PostCard({ post }: PostCardProps) {
  const [liked, setLiked] = useState(false)
  const [reposted, setReposted] = useState(false)
  const [showZapModal, setShowZapModal] = useState(false)
  const [stats, setStats] = useState(post.stats)

  const timeAgo = formatDistanceToNow(new Date(post.created_at * 1000), {
    addSuffix: true,
    locale: zhCN,
  })

  const handleLike = () => {
    setLiked(!liked)
    setStats(prev => ({
      ...prev,
      likes: liked ? prev.likes - 1 : prev.likes + 1,
    }))
  }

  const handleRepost = () => {
    setReposted(!reposted)
    setStats(prev => ({
      ...prev,
      reposts: reposted ? prev.reposts - 1 : prev.reposts + 1,
    }))
  }

  const formatZaps = (sats: number) => {
    if (sats >= 1000000) {
      return (sats / 1000000).toFixed(1) + 'M'
    }
    if (sats >= 1000) {
      return (sats / 1000).toFixed(1) + 'K'
    }
    return sats.toString()
  }

  return (
    <article className="border-b border-dark-800 p-4 hover:bg-dark-900/50 active:bg-dark-900 transition-colors">
      <div className="flex space-x-3">
        {/* 头像 */}
        <Link href={`/profile/${post.pubkey}`} className="flex-shrink-0">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-primary-500/20 flex items-center justify-center">
            {post.author.picture ? (
              <img
                src={post.author.picture}
                alt=""
                className="w-10 h-10 md:w-12 md:h-12 rounded-full object-cover"
              />
            ) : (
              <span className="text-primary-400 text-base md:text-lg">
                {post.author.name?.[0] || '?'}
              </span>
            )}
          </div>
        </Link>

        {/* 内容 */}
        <div className="flex-1 min-w-0">
          {/* 作者信息 */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1">
            <Link
              href={`/profile/${post.pubkey}`}
              className="font-bold hover:underline truncate max-w-[150px] md:max-w-none text-sm md:text-base"
            >
              {post.author.name || '匿名用户'}
            </Link>

            {/* 验证标记 */}
            {post.isVerified && (
              <span className="text-primary-400 flex-shrink-0" title="已验证">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </span>
            )}

            {/* 链上锚定标记 */}
            {post.isAnchored && (
              <span className="text-yellow-400 flex-shrink-0" title="已锚定到链上">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                </svg>
              </span>
            )}

            <span className="text-dark-500 hidden md:inline">·</span>
            <span className="text-dark-500 text-xs md:text-sm">{timeAgo}</span>
          </div>

          {/* NIP-05 - 移动端隐藏 */}
          {post.author.nip05 && (
            <p className="text-dark-500 text-xs mb-1 truncate hidden md:block">
              @{post.author.nip05}
            </p>
          )}

          {/* 帖子内容 */}
          <div className="text-dark-100 whitespace-pre-wrap break-words mb-3 text-sm md:text-base leading-relaxed">
            {post.content}
          </div>

          {/* 互动按钮 */}
          <div className="flex items-center justify-between">
            {/* 回复 */}
            <button className="flex items-center space-x-1 md:space-x-2 text-dark-500 hover:text-primary-400 active:text-primary-500 transition-colors group touch-target">
              <span className="p-1.5 md:p-2 rounded-full group-hover:bg-primary-500/10">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </span>
              <span className="text-xs md:text-sm">{stats.replies}</span>
            </button>

            {/* 转发 */}
            <button
              onClick={handleRepost}
              className={`flex items-center space-x-1 md:space-x-2 transition-colors group touch-target ${
                reposted ? 'text-green-400' : 'text-dark-500 hover:text-green-400 active:text-green-500'
              }`}
            >
              <span className="p-1.5 md:p-2 rounded-full group-hover:bg-green-500/10">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </span>
              <span className="text-xs md:text-sm">{stats.reposts}</span>
            </button>

            {/* 点赞 */}
            <button
              onClick={handleLike}
              className={`flex items-center space-x-1 md:space-x-2 transition-colors group touch-target ${
                liked ? 'text-red-400' : 'text-dark-500 hover:text-red-400 active:text-red-500'
              }`}
            >
              <span className="p-1.5 md:p-2 rounded-full group-hover:bg-red-500/10">
                <svg
                  className="w-5 h-5"
                  fill={liked ? 'currentColor' : 'none'}
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </span>
              <span className="text-xs md:text-sm">{stats.likes}</span>
            </button>

            {/* Zap 打赏 */}
            <button
              onClick={() => setShowZapModal(true)}
              className="flex items-center space-x-1 md:space-x-2 text-dark-500 hover:text-yellow-400 active:text-yellow-500 transition-colors group touch-target"
            >
              <span className="p-1.5 md:p-2 rounded-full group-hover:bg-yellow-500/10">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </span>
              <span className="text-xs md:text-sm">{formatZaps(stats.zaps)}</span>
            </button>

            {/* 分享 - 移动端隐藏文字 */}
            <button className="flex items-center text-dark-500 hover:text-primary-400 active:text-primary-500 transition-colors group touch-target">
              <span className="p-1.5 md:p-2 rounded-full group-hover:bg-primary-500/10">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Zap 弹窗 */}
      {showZapModal && (
        <ZapModal
          recipientPubkey={post.pubkey}
          eventId={post.id}
          recipientName={post.author.name}
          onClose={() => setShowZapModal(false)}
          onSuccess={(amount) => {
            setStats(prev => ({ ...prev, zaps: prev.zaps + amount }))
          }}
        />
      )}
    </article>
  )
}
