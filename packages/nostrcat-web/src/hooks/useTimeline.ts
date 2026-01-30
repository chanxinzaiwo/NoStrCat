'use client'

/**
 * 时间线 Hook
 *
 * 管理推文流、发布、互动
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Post, TimelineConfig, TimelineType } from '@nostrcat/core'
import { useNostrCat } from './useNostrCat'

/**
 * 时间线 Hook 返回值
 */
interface UseTimelineReturn {
  posts: Post[]
  isLoading: boolean
  hasMore: boolean
  error: Error | null
  refresh: () => Promise<void>
  loadMore: () => Promise<void>
  post: (content: string, options?: PostOptions) => Promise<Post | null>
  like: (postId: string) => Promise<void>
  unlike: (postId: string) => Promise<void>
  repost: (postId: string) => Promise<void>
  follow: (pubkey: string) => Promise<void>
  unfollow: (pubkey: string) => Promise<void>
  isFollowing: (pubkey: string) => boolean
}

interface PostOptions {
  replyTo?: string
  mentions?: string[]
  hashtags?: string[]
}

/**
 * 时间线 Hook
 */
export function useTimeline(
  type: TimelineType = 'global',
  options: Partial<TimelineConfig> = {}
): UseTimelineReturn {
  const { client, isLoggedIn } = useNostrCat()
  const [posts, setPosts] = useState<Post[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [following, setFollowing] = useState<Set<string>>(new Set())
  const oldestTimestamp = useRef<number | undefined>(undefined)

  // 加载关注列表
  useEffect(() => {
    if (!client || !isLoggedIn) return

    const loadFollowing = async () => {
      try {
        const timeline = client.timeline
        const followList = await timeline.loadFollowing()
        setFollowing(new Set(followList))
      } catch (err) {
        console.error('Failed to load following:', err)
      }
    }

    loadFollowing()
  }, [client, isLoggedIn])

  // 加载时间线
  const loadTimeline = useCallback(async (refresh = false) => {
    if (!client || !isLoggedIn) return

    setIsLoading(true)
    setError(null)

    try {
      const timeline = client.timeline
      const config: TimelineConfig = {
        type,
        limit: 50,
        ...options,
        until: refresh ? undefined : oldestTimestamp.current,
      }

      const newPosts = await timeline.fetch(config)

      if (newPosts.length > 0) {
        oldestTimestamp.current = newPosts[newPosts.length - 1].createdAt
      }

      if (refresh) {
        setPosts(newPosts)
      } else {
        setPosts(prev => {
          const existingIds = new Set(prev.map(p => p.id))
          const uniqueNew = newPosts.filter(p => !existingIds.has(p.id))
          return [...prev, ...uniqueNew]
        })
      }

      setHasMore(newPosts.length >= 50)
    } catch (err) {
      setError(err as Error)
    } finally {
      setIsLoading(false)
    }
  }, [client, isLoggedIn, type, options])

  // 初始加载
  useEffect(() => {
    loadTimeline(true)
  }, [type, options.pubkey, options.hashtag, options.eventId])

  // 订阅新推文
  useEffect(() => {
    if (!client || !isLoggedIn) return

    const timeline = client.timeline
    const config: TimelineConfig = {
      type,
      ...options,
    }

    timeline.subscribe(config, (newPost) => {
      setPosts(prev => {
        if (prev.some(p => p.id === newPost.id)) return prev
        return [newPost, ...prev]
      })
    })

    return () => {
      timeline.unsubscribe()
    }
  }, [client, isLoggedIn, type, options])

  // 刷新
  const refresh = useCallback(async () => {
    oldestTimestamp.current = undefined
    await loadTimeline(true)
  }, [loadTimeline])

  // 加载更多
  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return
    await loadTimeline(false)
  }, [isLoading, hasMore, loadTimeline])

  // 发布推文
  const post = useCallback(async (content: string, postOptions?: PostOptions): Promise<Post | null> => {
    if (!client || !isLoggedIn) return null

    try {
      const timeline = client.timeline
      const newPost = await timeline.post(content, postOptions)

      setPosts(prev => [newPost, ...prev])
      return newPost
    } catch (err) {
      setError(err as Error)
      return null
    }
  }, [client, isLoggedIn])

  // 点赞
  const like = useCallback(async (postId: string) => {
    if (!client || !isLoggedIn) return

    try {
      const timeline = client.timeline
      await timeline.like(postId)

      setPosts(prev => prev.map(p =>
        p.id === postId
          ? { ...p, likes: p.likes + 1, isLiked: true }
          : p
      ))
    } catch (err) {
      setError(err as Error)
    }
  }, [client, isLoggedIn])

  // 取消点赞
  const unlike = useCallback(async (postId: string) => {
    if (!client || !isLoggedIn) return

    try {
      const timeline = client.timeline
      await timeline.unlike(postId)

      setPosts(prev => prev.map(p =>
        p.id === postId
          ? { ...p, likes: Math.max(0, p.likes - 1), isLiked: false }
          : p
      ))
    } catch (err) {
      setError(err as Error)
    }
  }, [client, isLoggedIn])

  // 转发
  const repost = useCallback(async (postId: string) => {
    if (!client || !isLoggedIn) return

    try {
      const timeline = client.timeline
      await timeline.repost(postId)

      setPosts(prev => prev.map(p =>
        p.id === postId
          ? { ...p, reposts: p.reposts + 1, isReposted: true }
          : p
      ))
    } catch (err) {
      setError(err as Error)
    }
  }, [client, isLoggedIn])

  // 关注
  const follow = useCallback(async (pubkey: string) => {
    if (!client || !isLoggedIn) return

    try {
      const timeline = client.timeline
      await timeline.follow(pubkey)
      setFollowing(prev => new Set([...prev, pubkey]))
    } catch (err) {
      setError(err as Error)
    }
  }, [client, isLoggedIn])

  // 取消关注
  const unfollow = useCallback(async (pubkey: string) => {
    if (!client || !isLoggedIn) return

    try {
      const timeline = client.timeline
      await timeline.unfollow(pubkey)
      setFollowing(prev => {
        const next = new Set(prev)
        next.delete(pubkey)
        return next
      })
    } catch (err) {
      setError(err as Error)
    }
  }, [client, isLoggedIn])

  // 检查是否关注
  const isFollowing = useCallback((pubkey: string) => {
    return following.has(pubkey)
  }, [following])

  return {
    posts,
    isLoading,
    hasMore,
    error,
    refresh,
    loadMore,
    post,
    like,
    unlike,
    repost,
    follow,
    unfollow,
    isFollowing,
  }
}

/**
 * 话题时间线 Hook
 */
export function useHashtagTimeline(hashtag: string) {
  return useTimeline('hashtag', { hashtag })
}

/**
 * 用户时间线 Hook
 */
export function useProfileTimeline(pubkey: string) {
  return useTimeline('profile', { pubkey })
}

/**
 * 讨论串 Hook
 */
export function useThread(eventId: string) {
  const { client, isLoggedIn } = useNostrCat()
  const [posts, setPosts] = useState<Post[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!client || !isLoggedIn || !eventId) return

    const loadThread = async () => {
      setIsLoading(true)
      try {
        const timeline = client.timeline
        const thread = await timeline.getThread(eventId)
        setPosts(thread)
      } catch (err) {
        setError(err as Error)
      } finally {
        setIsLoading(false)
      }
    }

    loadThread()
  }, [client, isLoggedIn, eventId])

  return { posts, isLoading, error }
}

/**
 * 热门话题 Hook
 */
export function useTrendingHashtags(limit = 10) {
  const { client, isLoggedIn } = useNostrCat()
  const [hashtags, setHashtags] = useState<Array<{ tag: string; count: number }>>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!client || !isLoggedIn) return

    const loadTrending = async () => {
      setIsLoading(true)
      try {
        const timeline = client.timeline
        const trending = await timeline.getTrendingHashtags(limit)
        setHashtags(trending)
      } catch (err) {
        setError(err as Error)
      } finally {
        setIsLoading(false)
      }
    }

    loadTrending()
  }, [client, isLoggedIn, limit])

  return { hashtags, isLoading, error }
}
