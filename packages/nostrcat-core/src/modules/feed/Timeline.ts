/**
 * 时间线模块
 *
 * 管理推文流、关注列表、内容过滤
 * 支持多种时间线类型和实时更新
 */

import { NostrEvent, EventKind, createEvent, getEventHash } from '../../events/types'
import { signEvent, KeyPair } from '../../crypto/keys'
import { NostrConnection } from '../../client/NostrConnection'
import { OPCATConnection } from '../../client/OPCATConnection'

/**
 * 推文数据
 */
export interface Post {
  id: string
  authorId: string
  authorName?: string
  authorPicture?: string
  authorNip05?: string
  content: string
  createdAt: number
  replyTo?: string
  repostOf?: string
  mentions: string[]
  hashtags: string[]
  images: string[]
  likes: number
  reposts: number
  replies: number
  zaps: number
  zapAmount: bigint
  isLiked: boolean
  isReposted: boolean
  isZapped: boolean
  // 链上验证状态
  isAnchored: boolean
  anchorTxId?: string
  rawEvent?: NostrEvent
}

/**
 * 时间线类型
 */
export type TimelineType =
  | 'home'       // 关注列表
  | 'global'     // 全局
  | 'profile'    // 个人主页
  | 'hashtag'    // 话题
  | 'thread'     // 讨论串
  | 'mentions'   // 提及

/**
 * 时间线配置
 */
export interface TimelineConfig {
  type: TimelineType
  pubkey?: string       // profile 类型需要
  hashtag?: string      // hashtag 类型需要
  eventId?: string      // thread 类型需要
  limit?: number
  since?: number
  until?: number
}

/**
 * 用户资料缓存
 */
interface ProfileCache {
  name?: string
  picture?: string
  nip05?: string
  about?: string
  fetchedAt: number
}

/**
 * 时间线管理类
 */
export class Timeline {
  private connection: NostrConnection
  private opcatConnection?: OPCATConnection
  private keyPair: KeyPair
  private following: Set<string> = new Set()
  private posts: Map<string, Post> = new Map()
  private profileCache: Map<string, ProfileCache> = new Map()
  private subscriptionId: string | null = null
  private onPostCallback?: (post: Post) => void
  private currentConfig: TimelineConfig | null = null

  // 交互状态
  private likedPosts: Set<string> = new Set()
  private repostedPosts: Set<string> = new Set()
  private zappedPosts: Set<string> = new Set()

  constructor(
    connection: NostrConnection,
    keyPair: KeyPair,
    opcatConnection?: OPCATConnection
  ) {
    this.connection = connection
    this.keyPair = keyPair
    this.opcatConnection = opcatConnection
  }

  /**
   * 加载关注列表
   */
  async loadFollowing(): Promise<string[]> {
    const events = await this.connection.fetch({
      kinds: [EventKind.Contacts],
      authors: [this.keyPair.publicKey],
      limit: 1,
    })

    if (events.length > 0) {
      const contactEvent = events[0]
      this.following.clear()

      for (const tag of contactEvent.tags) {
        if (tag[0] === 'p') {
          this.following.add(tag[1])
        }
      }
    }

    return Array.from(this.following)
  }

  /**
   * 关注用户
   */
  async follow(pubkey: string): Promise<void> {
    this.following.add(pubkey)
    await this.publishContactList()
  }

  /**
   * 取消关注
   */
  async unfollow(pubkey: string): Promise<void> {
    this.following.delete(pubkey)
    await this.publishContactList()
  }

  /**
   * 发布联系人列表
   */
  private async publishContactList(): Promise<void> {
    const tags = Array.from(this.following).map(pk => ['p', pk])

    const unsignedEvent = {
      ...createEvent(EventKind.Contacts, '', tags),
      pubkey: this.keyPair.publicKey,
    }

    const id = getEventHash(unsignedEvent)
    const sig = await signEvent(id, this.keyPair.privateKey)

    const event: NostrEvent = {
      ...unsignedEvent,
      id,
      sig,
    }

    await this.connection.publish(event)
  }

  /**
   * 订阅时间线
   */
  subscribe(config: TimelineConfig, onPost: (post: Post) => void): void {
    this.currentConfig = config
    this.onPostCallback = onPost

    // 取消之前的订阅
    if (this.subscriptionId) {
      this.connection.unsubscribe(this.subscriptionId)
    }

    const filter = this.buildFilter(config)

    this.subscriptionId = this.connection.subscribe(
      filter as any,
      async (event) => {
        const post = await this.eventToPost(event)
        if (post) {
          this.posts.set(post.id, post)
          if (this.onPostCallback) {
            this.onPostCallback(post)
          }
        }
      }
    )
  }

  /**
   * 取消订阅
   */
  unsubscribe(): void {
    if (this.subscriptionId) {
      this.connection.unsubscribe(this.subscriptionId)
      this.subscriptionId = null
    }
  }

  /**
   * 构建过滤器
   */
  private buildFilter(config: TimelineConfig): Record<string, unknown> {
    const base: Record<string, unknown> = {
      kinds: [EventKind.TextNote, EventKind.Repost],
      limit: config.limit || 50,
    }

    if (config.since) base.since = config.since
    if (config.until) base.until = config.until

    switch (config.type) {
      case 'home':
        if (this.following.size > 0) {
          base.authors = Array.from(this.following)
        }
        break

      case 'profile':
        if (config.pubkey) {
          base.authors = [config.pubkey]
        }
        break

      case 'hashtag':
        if (config.hashtag) {
          base['#t'] = [config.hashtag.toLowerCase()]
        }
        break

      case 'thread':
        if (config.eventId) {
          base['#e'] = [config.eventId]
        }
        break

      case 'mentions':
        base['#p'] = [this.keyPair.publicKey]
        break

      case 'global':
      default:
        // 全局时间线，不过滤作者
        break
    }

    return base
  }

  /**
   * 获取时间线推文
   */
  async fetch(config: TimelineConfig): Promise<Post[]> {
    const filter = this.buildFilter(config)
    const events = await this.connection.fetch(filter as any)

    const posts: Post[] = []
    for (const event of events) {
      const post = await this.eventToPost(event)
      if (post) {
        this.posts.set(post.id, post)
        posts.push(post)
      }
    }

    return posts.sort((a, b) => b.createdAt - a.createdAt)
  }

  /**
   * 发布推文
   */
  async post(content: string, options?: {
    replyTo?: string
    mentions?: string[]
    hashtags?: string[]
  }): Promise<Post> {
    const tags: string[][] = []

    // 回复
    if (options?.replyTo) {
      tags.push(['e', options.replyTo, '', 'reply'])
    }

    // 提及
    if (options?.mentions) {
      for (const pk of options.mentions) {
        tags.push(['p', pk])
      }
    }

    // 话题标签
    if (options?.hashtags) {
      for (const tag of options.hashtags) {
        tags.push(['t', tag.toLowerCase()])
      }
    }

    // 自动提取内容中的话题标签
    const hashtagMatches = content.match(/#\w+/g)
    if (hashtagMatches) {
      for (const match of hashtagMatches) {
        const tag = match.slice(1).toLowerCase()
        if (!tags.find(t => t[0] === 't' && t[1] === tag)) {
          tags.push(['t', tag])
        }
      }
    }

    const unsignedEvent = {
      ...createEvent(EventKind.TextNote, content, tags),
      pubkey: this.keyPair.publicKey,
    }

    const id = getEventHash(unsignedEvent)
    const sig = await signEvent(id, this.keyPair.privateKey)

    const event: NostrEvent = {
      ...unsignedEvent,
      id,
      sig,
    }

    await this.connection.publish(event)

    const post = await this.eventToPost(event)
    if (post) {
      this.posts.set(post.id, post)
    }

    return post!
  }

  /**
   * 转发推文
   */
  async repost(postId: string): Promise<void> {
    const originalPost = this.posts.get(postId)
    if (!originalPost) return

    const tags: string[][] = [
      ['e', postId, '', 'mention'],
      ['p', originalPost.authorId],
    ]

    const unsignedEvent = {
      ...createEvent(EventKind.Repost, JSON.stringify(originalPost.rawEvent), tags),
      pubkey: this.keyPair.publicKey,
    }

    const id = getEventHash(unsignedEvent)
    const sig = await signEvent(id, this.keyPair.privateKey)

    const event: NostrEvent = {
      ...unsignedEvent,
      id,
      sig,
    }

    await this.connection.publish(event)
    this.repostedPosts.add(postId)

    // 更新本地状态
    if (originalPost) {
      originalPost.reposts++
      originalPost.isReposted = true
    }
  }

  /**
   * 点赞推文
   */
  async like(postId: string): Promise<void> {
    const originalPost = this.posts.get(postId)
    if (!originalPost) return

    const tags: string[][] = [
      ['e', postId],
      ['p', originalPost.authorId],
    ]

    const unsignedEvent = {
      ...createEvent(EventKind.Reaction, '+', tags),
      pubkey: this.keyPair.publicKey,
    }

    const id = getEventHash(unsignedEvent)
    const sig = await signEvent(id, this.keyPair.privateKey)

    const event: NostrEvent = {
      ...unsignedEvent,
      id,
      sig,
    }

    await this.connection.publish(event)
    this.likedPosts.add(postId)

    // 更新本地状态
    if (originalPost) {
      originalPost.likes++
      originalPost.isLiked = true
    }
  }

  /**
   * 取消点赞
   */
  async unlike(postId: string): Promise<void> {
    // NIP-25: 发送 deletion 事件
    // 简化实现：只更新本地状态
    this.likedPosts.delete(postId)

    const post = this.posts.get(postId)
    if (post) {
      post.likes = Math.max(0, post.likes - 1)
      post.isLiked = false
    }
  }

  /**
   * 将事件转换为推文对象
   */
  private async eventToPost(event: NostrEvent): Promise<Post | null> {
    if (event.kind !== EventKind.TextNote && event.kind !== EventKind.Repost) {
      return null
    }

    // 获取作者资料
    const profile = await this.getProfile(event.pubkey)

    // 解析标签
    const mentions: string[] = []
    const hashtags: string[] = []
    let replyTo: string | undefined
    let repostOf: string | undefined

    for (const tag of event.tags) {
      if (tag[0] === 'p') {
        mentions.push(tag[1])
      } else if (tag[0] === 't') {
        hashtags.push(tag[1])
      } else if (tag[0] === 'e') {
        if (tag[3] === 'reply') {
          replyTo = tag[1]
        } else if (tag[3] === 'mention' && event.kind === EventKind.Repost) {
          repostOf = tag[1]
        }
      }
    }

    // 提取图片 URL
    const images: string[] = []
    const urlRegex = /(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp))/gi
    const matches = event.content.match(urlRegex)
    if (matches) {
      images.push(...matches)
    }

    // 检查链上锚定状态
    let isAnchored = false
    let anchorTxId: string | undefined

    // 查找链上引用标签
    const opcatTag = event.tags.find(t => t[0] === 'opcat')
    if (opcatTag) {
      isAnchored = true
      anchorTxId = opcatTag[1]
    }

    return {
      id: event.id,
      authorId: event.pubkey,
      authorName: profile?.name,
      authorPicture: profile?.picture,
      authorNip05: profile?.nip05,
      content: event.content,
      createdAt: event.created_at,
      replyTo,
      repostOf,
      mentions,
      hashtags,
      images,
      likes: 0,
      reposts: 0,
      replies: 0,
      zaps: 0,
      zapAmount: 0n,
      isLiked: this.likedPosts.has(event.id),
      isReposted: this.repostedPosts.has(event.id),
      isZapped: this.zappedPosts.has(event.id),
      isAnchored,
      anchorTxId,
      rawEvent: event,
    }
  }

  /**
   * 获取用户资料
   */
  private async getProfile(pubkey: string): Promise<ProfileCache | undefined> {
    // 检查缓存
    const cached = this.profileCache.get(pubkey)
    if (cached && Date.now() - cached.fetchedAt < 5 * 60 * 1000) {
      return cached
    }

    // 从网络获取
    const events = await this.connection.fetch({
      kinds: [EventKind.Metadata],
      authors: [pubkey],
      limit: 1,
    })

    if (events.length === 0) return undefined

    try {
      const metadata = JSON.parse(events[0].content)
      const profile: ProfileCache = {
        name: metadata.name || metadata.display_name,
        picture: metadata.picture,
        nip05: metadata.nip05,
        about: metadata.about,
        fetchedAt: Date.now(),
      }

      this.profileCache.set(pubkey, profile)
      return profile
    } catch {
      return undefined
    }
  }

  /**
   * 加载推文的互动数据
   */
  async loadInteractions(postId: string): Promise<{
    likes: number
    reposts: number
    replies: number
    zaps: number
    zapAmount: bigint
  }> {
    const post = this.posts.get(postId)
    if (!post) {
      return { likes: 0, reposts: 0, replies: 0, zaps: 0, zapAmount: 0n }
    }

    // 并行获取各类互动
    const [reactions, reposts, replies, zaps] = await Promise.all([
      this.connection.fetch({
        kinds: [EventKind.Reaction],
        '#e': [postId],
        limit: 1000,
      }),
      this.connection.fetch({
        kinds: [EventKind.Repost],
        '#e': [postId],
        limit: 1000,
      }),
      this.connection.fetch({
        kinds: [EventKind.TextNote],
        '#e': [postId],
        limit: 1000,
      }),
      this.connection.fetch({
        kinds: [9735], // Zap receipt
        '#e': [postId],
        limit: 1000,
      }),
    ])

    // 计算点赞数（只计算 + 反应）
    const likesCount = reactions.filter(e => e.content === '+' || e.content === '').length

    // 计算打赏金额
    let zapAmount = 0n
    for (const zap of zaps) {
      const amountTag = zap.tags.find(t => t[0] === 'amount')
      if (amountTag) {
        zapAmount += BigInt(amountTag[1])
      }
    }

    // 更新本地状态
    post.likes = likesCount
    post.reposts = reposts.length
    post.replies = replies.length
    post.zaps = zaps.length
    post.zapAmount = zapAmount

    // 检查当前用户是否互动过
    post.isLiked = reactions.some(e => e.pubkey === this.keyPair.publicKey)
    post.isReposted = reposts.some(e => e.pubkey === this.keyPair.publicKey)

    return {
      likes: likesCount,
      reposts: reposts.length,
      replies: replies.length,
      zaps: zaps.length,
      zapAmount,
    }
  }

  /**
   * 获取推文详情
   */
  async getPost(postId: string): Promise<Post | null> {
    // 先检查缓存
    const cached = this.posts.get(postId)
    if (cached) {
      await this.loadInteractions(postId)
      return cached
    }

    // 从网络获取
    const events = await this.connection.fetch({
      ids: [postId],
      limit: 1,
    })

    if (events.length === 0) return null

    const post = await this.eventToPost(events[0])
    if (post) {
      this.posts.set(post.id, post)
      await this.loadInteractions(postId)
    }

    return post
  }

  /**
   * 获取讨论串
   */
  async getThread(postId: string): Promise<Post[]> {
    // 获取根推文
    const root = await this.getPost(postId)
    if (!root) return []

    // 获取所有回复
    const replyEvents = await this.connection.fetch({
      kinds: [EventKind.TextNote],
      '#e': [postId],
      limit: 500,
    })

    const thread: Post[] = [root]

    for (const event of replyEvents) {
      const post = await this.eventToPost(event)
      if (post) {
        this.posts.set(post.id, post)
        thread.push(post)
      }
    }

    return thread.sort((a, b) => a.createdAt - b.createdAt)
  }

  /**
   * 搜索推文
   */
  async search(query: string, limit = 50): Promise<Post[]> {
    // NIP-50: 搜索
    const events = await this.connection.fetch({
      kinds: [EventKind.TextNote],
      search: query,
      limit,
    } as any)

    const posts: Post[] = []
    for (const event of events) {
      const post = await this.eventToPost(event)
      if (post) {
        this.posts.set(post.id, post)
        posts.push(post)
      }
    }

    return posts.sort((a, b) => b.createdAt - a.createdAt)
  }

  /**
   * 获取热门话题
   */
  async getTrendingHashtags(limit = 10): Promise<Array<{ tag: string; count: number }>> {
    // 获取最近的推文
    const events = await this.connection.fetch({
      kinds: [EventKind.TextNote],
      since: Math.floor(Date.now() / 1000) - 24 * 3600, // 最近24小时
      limit: 1000,
    })

    // 统计话题标签
    const tagCounts = new Map<string, number>()

    for (const event of events) {
      for (const tag of event.tags) {
        if (tag[0] === 't') {
          const hashtag = tag[1].toLowerCase()
          tagCounts.set(hashtag, (tagCounts.get(hashtag) || 0) + 1)
        }
      }
    }

    // 排序并返回
    return Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
  }

  /**
   * 记录 Zap（由 ZapManager 调用）
   */
  recordZap(postId: string): void {
    this.zappedPosts.add(postId)
    const post = this.posts.get(postId)
    if (post) {
      post.isZapped = true
      post.zaps++
    }
  }

  /**
   * 获取关注列表
   */
  getFollowing(): string[] {
    return Array.from(this.following)
  }

  /**
   * 检查是否关注
   */
  isFollowing(pubkey: string): boolean {
    return this.following.has(pubkey)
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.posts.clear()
    this.profileCache.clear()
  }
}
