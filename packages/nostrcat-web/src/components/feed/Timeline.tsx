'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { PostCard } from './PostCard'
import { useEventStore } from '@/stores/eventStore'
import { useUserStore } from '@/stores/userStore'
import { fetchEvents, fetchProfiles, NostrEvent, NostrProfile } from '@/lib/nostr'

type FeedMode = 'mine' | 'global' | 'following'

interface Post {
  id: string
  pubkey: string
  content: string
  created_at: number
  author: {
    name?: string
    picture?: string | null
    nip05?: string | null
  }
  stats: {
    replies: number
    reposts: number
    likes: number
    zaps: number
  }
  isVerified?: boolean
  isAnchored?: boolean
}

export function Timeline() {
  const [feedMode, setFeedMode] = useState<FeedMode>('global')
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [remoteEvents, setRemoteEvents] = useState<NostrEvent[]>([])
  const [oldestTimestamp, setOldestTimestamp] = useState<number | null>(null)
  const [profileCache, setProfileCache] = useState<Record<string, NostrProfile>>({})
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const { events, timelineIds, profiles } = useEventStore()
  const { profile: userProfile, relays, isLoggedIn, publicKey } = useUserStore()

  // 从中继器获取帖子
  const loadPosts = useCallback(async (until?: number) => {
    try {
      const filter: { kinds: number[]; limit: number; until?: number; authors?: string[] } = {
        kinds: [1],
        limit: 30,
      }

      // 根据模式设置过滤器
      if (feedMode === 'mine' && publicKey) {
        filter.authors = [publicKey]
      }
      // TODO: 'following' 模式需要获取关注列表

      if (until) {
        filter.until = until
      }

      console.log(`Fetching ${feedMode} posts from relays:`, relays)
      const fetchedEvents = await fetchEvents(relays, filter)
      console.log('Fetched events:', fetchedEvents.length)

      // 获取用户资料
      if (fetchedEvents.length > 0) {
        const pubkeys = [...new Set(fetchedEvents.map(e => e.pubkey))]
        const unknownPubkeys = pubkeys.filter(pk => !profileCache[pk])
        if (unknownPubkeys.length > 0) {
          try {
            const fetchedProfiles = await fetchProfiles(relays, unknownPubkeys)
            setProfileCache(prev => ({ ...prev, ...fetchedProfiles }))
          } catch (err) {
            console.error('Failed to fetch profiles:', err)
          }
        }
      }

      return fetchedEvents
    } catch (err) {
      console.error('Failed to fetch events:', err)
      throw err
    }
  }, [relays, feedMode, publicKey, profileCache])

  // 初始加载 & 模式/登录变化时刷新
  useEffect(() => {
    let mounted = true

    const initialLoad = async () => {
      setIsLoading(true)
      setError(null)
      setRemoteEvents([])
      setOldestTimestamp(null)

      try {
        const fetchedEvents = await loadPosts()
        if (mounted) {
          setRemoteEvents(fetchedEvents)
          if (fetchedEvents.length > 0) {
            const oldest = Math.min(...fetchedEvents.map(e => e.created_at))
            setOldestTimestamp(oldest)
          }
        }
      } catch (err) {
        if (mounted) {
          setError('加载帖子失败，请检查网络连接')
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    initialLoad()

    return () => {
      mounted = false
    }
  }, [feedMode, isLoggedIn, publicKey, relays])

  // 无限滚动
  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect()
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore && !isLoading && oldestTimestamp) {
          handleLoadMore()
        }
      },
      { threshold: 0.1 }
    )

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current)
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [isLoadingMore, isLoading, oldestTimestamp])

  // 将事件转换为帖子格式
  const posts = useMemo(() => {
    const postMap = new Map<string, Post>()

    // 添加本地事件（用户自己发布的）
    if (feedMode === 'mine' || feedMode === 'global') {
      timelineIds.forEach(id => {
        const event = events.get(id)
        if (event && event.kind === 1) {
          // 在 mine 模式下只显示自己的
          if (feedMode === 'mine' && event.pubkey !== publicKey) return

          const cachedProfile = profileCache[event.pubkey] || profiles[event.pubkey]
          postMap.set(event.id, {
            id: event.id,
            pubkey: event.pubkey,
            content: event.content,
            created_at: event.created_at,
            author: {
              name: cachedProfile?.name || userProfile?.name || '我',
              picture: cachedProfile?.picture || userProfile?.picture || null,
              nip05: cachedProfile?.nip05 || null,
            },
            stats: { replies: 0, reposts: 0, likes: 0, zaps: 0 },
            isVerified: !!cachedProfile?.nip05,
            isAnchored: true,
          })
        }
      })
    }

    // 添加从中继器获取的事件
    remoteEvents.forEach(event => {
      if (!postMap.has(event.id)) {
        const cachedProfile = profileCache[event.pubkey] || profiles[event.pubkey]
        postMap.set(event.id, {
          id: event.id,
          pubkey: event.pubkey,
          content: event.content,
          created_at: event.created_at,
          author: {
            name: cachedProfile?.name || `${event.pubkey.slice(0, 8)}...`,
            picture: cachedProfile?.picture || null,
            nip05: cachedProfile?.nip05 || null,
          },
          stats: { replies: 0, reposts: 0, likes: 0, zaps: 0 },
          isVerified: !!cachedProfile?.nip05,
          isAnchored: false,
        })
      }
    })

    const allPosts = Array.from(postMap.values())
    return allPosts.sort((a, b) => b.created_at - a.created_at)
  }, [events, timelineIds, profiles, userProfile, remoteEvents, profileCache, feedMode, publicKey])

  // 加载更多
  const handleLoadMore = async () => {
    if (!oldestTimestamp || isLoadingMore) return

    setIsLoadingMore(true)
    try {
      const olderEvents = await loadPosts(oldestTimestamp - 1)
      if (olderEvents.length > 0) {
        setRemoteEvents(prev => {
          const existingIds = new Set(prev.map(e => e.id))
          const newEvents = olderEvents.filter(e => !existingIds.has(e.id))
          return [...prev, ...newEvents]
        })
        const oldest = Math.min(...olderEvents.map(e => e.created_at))
        setOldestTimestamp(oldest)
      }
    } catch (err) {
      console.error('Failed to load more:', err)
    } finally {
      setIsLoadingMore(false)
    }
  }

  // 刷新
  const handleRefresh = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const fetchedEvents = await loadPosts()
      setRemoteEvents(fetchedEvents)
      if (fetchedEvents.length > 0) {
        const oldest = Math.min(...fetchedEvents.map(e => e.created_at))
        setOldestTimestamp(oldest)
      }
    } catch (err) {
      setError('刷新失败，请重试')
    } finally {
      setIsLoading(false)
    }
  }

  // 模式切换标签
  const FeedTabs = () => (
    <div className="flex border-b border-dark-800 sticky top-0 bg-dark-950 z-10">
      {isLoggedIn && (
        <button
          onClick={() => setFeedMode('mine')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            feedMode === 'mine'
              ? 'text-primary-400 border-b-2 border-primary-400'
              : 'text-dark-400 hover:text-dark-200'
          }`}
        >
          我的
        </button>
      )}
      <button
        onClick={() => setFeedMode('global')}
        className={`flex-1 py-3 text-sm font-medium transition-colors ${
          feedMode === 'global'
            ? 'text-primary-400 border-b-2 border-primary-400'
            : 'text-dark-400 hover:text-dark-200'
        }`}
      >
        全网
      </button>
      {isLoggedIn && (
        <button
          onClick={() => setFeedMode('following')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            feedMode === 'following'
              ? 'text-primary-400 border-b-2 border-primary-400'
              : 'text-dark-400 hover:text-dark-200'
          }`}
        >
          关注
        </button>
      )}
    </div>
  )

  // 加载中状态
  if (isLoading && posts.length === 0) {
    return (
      <div>
        <FeedTabs />
        <div className="p-8 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-400 mb-4"></div>
          <p className="text-dark-400">正在从中继器加载帖子...</p>
        </div>
      </div>
    )
  }

  // 错误状态
  if (error && posts.length === 0) {
    return (
      <div>
        <FeedTabs />
        <div className="p-8 text-center">
          <svg className="w-12 h-12 mx-auto mb-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-red-400 mb-4">{error}</p>
          <button onClick={handleRefresh} className="btn btn-primary">
            重试
          </button>
        </div>
      </div>
    )
  }

  // 空状态
  if (posts.length === 0) {
    return (
      <div>
        <FeedTabs />
        <div className="p-8 text-center">
          <svg className="w-12 h-12 mx-auto mb-4 text-dark-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <p className="text-dark-400 mb-4">
            {feedMode === 'mine' ? '你还没有发布任何帖子' :
             feedMode === 'following' ? '关注一些用户来查看他们的帖子' :
             '暂无帖子'}
          </p>
          <button onClick={handleRefresh} className="btn btn-secondary">
            刷新
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <FeedTabs />

      {/* 刷新提示 */}
      {!isLoading && (
        <div className="p-2 border-b border-dark-800">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="w-full py-2 text-sm text-primary-400 hover:bg-dark-800 rounded-lg transition-colors"
          >
            {isLoading ? '刷新中...' : `已加载 ${posts.length} 条帖子 · 点击刷新`}
          </button>
        </div>
      )}

      {/* 帖子列表 */}
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}

      {/* 无限滚动触发器 */}
      <div ref={loadMoreRef} className="p-4 text-center">
        {isLoadingMore ? (
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary-400"></div>
        ) : (
          <span className="text-dark-500 text-sm">滚动加载更多</span>
        )}
      </div>
    </div>
  )
}
