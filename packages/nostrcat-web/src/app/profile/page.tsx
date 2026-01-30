'use client'

import { useState } from 'react'
import { useUserStore } from '@/stores/userStore'
import { PostCard } from '@/components/feed/PostCard'

export default function ProfilePage() {
  const { isLoggedIn, publicKey, profile } = useUserStore()
  const [activeTab, setActiveTab] = useState<'posts' | 'replies' | 'likes' | 'zaps'>('posts')

  // 模拟用户统计数据
  const stats = {
    posts: 42,
    following: 128,
    followers: 1024,
    zapsReceived: 50000,
    reputation: 1500,
  }

  // 模拟帖子数据
  const mockPosts = [
    {
      id: '1',
      pubkey: publicKey || '',
      content: '这是我的第一条帖子！',
      created_at: Date.now() / 1000 - 86400,
      author: {
        name: profile?.name || '我',
        picture: profile?.picture,
        nip05: null,
      },
      stats: { replies: 5, reposts: 2, likes: 15, zaps: 100 },
      isVerified: true,
      isAnchored: false,
    },
  ]

  if (!isLoggedIn) {
    return (
      <div className="max-w-2xl mx-auto py-4">
        <div className="card text-center py-16">
          <p className="text-dark-400 mb-4">请先登录查看个人资料</p>
          <a href="/" className="btn btn-primary">
            返回首页
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* 封面图片 */}
      <div className="h-48 bg-gradient-to-r from-primary-500 to-primary-700 relative">
        {/* 编辑按钮 */}
        <button className="absolute top-4 right-4 btn btn-secondary text-sm">
          编辑资料
        </button>
      </div>

      {/* 用户信息 */}
      <div className="px-4 pb-4 border-b border-dark-800">
        {/* 头像 */}
        <div className="relative -mt-16 mb-4">
          <div className="w-32 h-32 rounded-full bg-dark-900 border-4 border-dark-950 flex items-center justify-center">
            {profile?.picture ? (
              <img
                src={profile.picture}
                alt=""
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <span className="text-primary-400 text-4xl">
                {profile?.name?.[0] || '?'}
              </span>
            )}
          </div>

          {/* 验证徽章 */}
          <div className="absolute bottom-0 right-0 bg-primary-500 rounded-full p-1">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
        </div>

        {/* 名称和公钥 */}
        <h1 className="text-2xl font-bold mb-1">
          {profile?.name || '未设置昵称'}
        </h1>
        <p className="text-dark-400 text-sm font-mono mb-3">
          {publicKey?.slice(0, 16)}...{publicKey?.slice(-8)}
        </p>

        {/* 简介 */}
        <p className="text-dark-200 mb-4">
          {profile?.about || '这个人很懒，什么都没写...'}
        </p>

        {/* 统计数据 */}
        <div className="flex items-center space-x-6 text-sm">
          <div>
            <span className="font-bold">{stats.posts}</span>
            <span className="text-dark-400 ml-1">帖子</span>
          </div>
          <div>
            <span className="font-bold">{stats.following}</span>
            <span className="text-dark-400 ml-1">关注</span>
          </div>
          <div>
            <span className="font-bold">{stats.followers}</span>
            <span className="text-dark-400 ml-1">粉丝</span>
          </div>
          <div className="flex items-center">
            <span className="text-yellow-400 mr-1">⚡</span>
            <span className="font-bold">{(stats.zapsReceived / 1000).toFixed(1)}K</span>
            <span className="text-dark-400 ml-1">sats</span>
          </div>
          <div className="flex items-center">
            <span className="text-primary-400 mr-1">★</span>
            <span className="font-bold">{stats.reputation}</span>
            <span className="text-dark-400 ml-1">声誉</span>
          </div>
        </div>
      </div>

      {/* 标签切换 */}
      <div className="flex border-b border-dark-800">
        {[
          { key: 'posts', label: '帖子' },
          { key: 'replies', label: '回复' },
          { key: 'likes', label: '喜欢' },
          { key: 'zaps', label: '打赏' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`flex-1 py-4 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'text-primary-400 border-b-2 border-primary-400'
                : 'text-dark-400 hover:text-dark-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 内容列表 */}
      <div>
        {activeTab === 'posts' && (
          <>
            {mockPosts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
            {mockPosts.length === 0 && (
              <div className="text-center py-8 text-dark-400">
                还没有发布任何帖子
              </div>
            )}
          </>
        )}

        {activeTab === 'replies' && (
          <div className="text-center py-8 text-dark-400">
            还没有回复
          </div>
        )}

        {activeTab === 'likes' && (
          <div className="text-center py-8 text-dark-400">
            还没有喜欢的帖子
          </div>
        )}

        {activeTab === 'zaps' && (
          <div className="text-center py-8 text-dark-400">
            还没有打赏记录
          </div>
        )}
      </div>
    </div>
  )
}
