'use client'

import { useState, useEffect, useMemo } from 'react'
import { PostCard } from './PostCard'
import { useEventStore } from '@/stores/eventStore'
import { useUserStore } from '@/stores/userStore'

// 模拟数据
const mockPosts = [
  {
    id: 'mock-1',
    pubkey: 'abc123def456',
    content: '欢迎来到 NoStrCat！这是一个去中心化的社交平台，结合了 Nostr 协议和 OP_CAT Layer 区块链技术。🐱',
    created_at: Date.now() / 1000 - 3600,
    author: {
      name: 'NoStrCat Official',
      picture: null,
      nip05: 'official@nostrcat.com',
    },
    stats: {
      replies: 12,
      reposts: 8,
      likes: 42,
      zaps: 2100,
    },
    isVerified: true,
    isAnchored: true,
  },
  {
    id: 'mock-2',
    pubkey: 'xyz789abc',
    content: '刚刚用 OP_CAT Layer 发送了第一笔打赏，比闪电网络简单多了！\n\n不需要管理通道，直接链上交易。',
    created_at: Date.now() / 1000 - 7200,
    author: {
      name: '比特币爱好者',
      picture: null,
      nip05: null,
    },
    stats: {
      replies: 5,
      reposts: 3,
      likes: 18,
      zaps: 500,
    },
    isVerified: false,
    isAnchored: false,
  },
  {
    id: 'mock-3',
    pubkey: 'qwe456rty',
    content: 'NoStrCat 的智能合约设计很有意思：\n\n1. ZapContract - 链上打赏\n2. IdentityContract - 身份验证\n3. GroupContract - 群组管理\n\n完全开源，代码质量很高！',
    created_at: Date.now() / 1000 - 14400,
    author: {
      name: '开发者小王',
      picture: null,
      nip05: 'dev@example.com',
    },
    stats: {
      replies: 8,
      reposts: 15,
      likes: 67,
      zaps: 3500,
    },
    isVerified: true,
    isAnchored: true,
  },
]

export function Timeline() {
  const [isLoading, setIsLoading] = useState(false)
  const { events, timelineIds, profiles } = useEventStore()
  const { profile: userProfile } = useUserStore()

  // 将 eventStore 中的事件转换为帖子格式，并与模拟数据合并
  const posts = useMemo(() => {
    // 从 eventStore 获取用户发布的帖子
    const userPosts = timelineIds
      .map(id => events.get(id))
      .filter((event): event is NonNullable<typeof event> =>
        event !== undefined && event.kind === 1
      )
      .map(event => {
        const cachedProfile = profiles[event.pubkey]
        return {
          id: event.id,
          pubkey: event.pubkey,
          content: event.content,
          created_at: event.created_at,
          author: {
            name: cachedProfile?.name || userProfile?.name || '我',
            picture: cachedProfile?.picture || userProfile?.picture || null,
            nip05: cachedProfile?.nip05 || null,
          },
          stats: {
            replies: 0,
            reposts: 0,
            likes: 0,
            zaps: 0,
          },
          isVerified: false,
          isAnchored: event.sig?.startsWith('local_') ? false : true,
        }
      })

    // 合并用户帖子和模拟数据，按时间排序
    const allPosts = [...userPosts, ...mockPosts]
    return allPosts.sort((a, b) => b.created_at - a.created_at)
  }, [events, timelineIds, profiles, userProfile])

  useEffect(() => {
    // TODO: 从 Nostr 网络获取实际数据
  }, [])

  const handleLoadMore = async () => {
    setIsLoading(true)
    // 模拟加载
    await new Promise(resolve => setTimeout(resolve, 1000))
    setIsLoading(false)
  }

  return (
    <div>
      {/* 帖子列表 */}
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}

      {/* 加载更多 */}
      <div className="p-4 text-center">
        <button
          onClick={handleLoadMore}
          disabled={isLoading}
          className="btn btn-secondary"
        >
          {isLoading ? '加载中...' : '加载更多'}
        </button>
      </div>
    </div>
  )
}
