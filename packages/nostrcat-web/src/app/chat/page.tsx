'use client'

import { useState } from 'react'
import { useUserStore } from '@/stores/userStore'

interface Conversation {
  id: string
  pubkey: string
  name: string
  picture?: string
  lastMessage: string
  timestamp: number
  unread: number
  isGroup: boolean
}

// 模拟会话列表
const mockConversations: Conversation[] = [
  {
    id: '1',
    pubkey: 'abc123',
    name: '比特币社区',
    lastMessage: '欢迎新成员加入！',
    timestamp: Date.now() - 1800000,
    unread: 5,
    isGroup: true,
  },
  {
    id: '2',
    pubkey: 'def456',
    name: '张三',
    lastMessage: '你好，有时间聊聊吗？',
    timestamp: Date.now() - 3600000,
    unread: 2,
    isGroup: false,
  },
  {
    id: '3',
    pubkey: 'ghi789',
    name: '开发者群',
    lastMessage: '新版本发布了！',
    timestamp: Date.now() - 86400000,
    unread: 0,
    isGroup: true,
  },
]

export default function ChatPage() {
  const { isLoggedIn } = useUserStore()
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'private' | 'group'>('private')

  if (!isLoggedIn) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="card text-center py-16">
          <p className="text-dark-400 mb-4">请先登录使用消息功能</p>
          <a href="/" className="btn btn-primary">
            返回首页
          </a>
        </div>
      </div>
    )
  }

  const filteredConversations = mockConversations.filter(c =>
    activeTab === 'group' ? c.isGroup : !c.isGroup
  )

  return (
    <div className="h-screen flex">
      {/* 会话列表 */}
      <div className="w-80 border-r border-dark-800 flex flex-col">
        {/* 头部 */}
        <div className="p-4 border-b border-dark-800">
          <h1 className="text-xl font-bold mb-4">消息</h1>

          {/* 标签切换 */}
          <div className="flex bg-dark-800 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('private')}
              className={`flex-1 py-2 text-sm rounded-md transition-colors ${
                activeTab === 'private'
                  ? 'bg-primary-500 text-white'
                  : 'text-dark-400 hover:text-dark-200'
              }`}
            >
              私聊
            </button>
            <button
              onClick={() => setActiveTab('group')}
              className={`flex-1 py-2 text-sm rounded-md transition-colors ${
                activeTab === 'group'
                  ? 'bg-primary-500 text-white'
                  : 'text-dark-400 hover:text-dark-200'
              }`}
            >
              群聊
            </button>
          </div>
        </div>

        {/* 搜索框 */}
        <div className="p-4">
          <input
            type="text"
            placeholder="搜索会话..."
            className="input text-sm"
          />
        </div>

        {/* 会话列表 */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setSelectedConversation(conv.id)}
              className={`w-full p-4 flex items-center space-x-3 hover:bg-dark-800 transition-colors ${
                selectedConversation === conv.id ? 'bg-dark-800' : ''
              }`}
            >
              {/* 头像 */}
              <div className="w-12 h-12 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0">
                {conv.isGroup ? (
                  <svg className="w-6 h-6 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                ) : (
                  <span className="text-primary-400 text-lg">
                    {conv.name[0]}
                  </span>
                )}
              </div>

              {/* 会话信息 */}
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center justify-between">
                  <span className="font-medium truncate">{conv.name}</span>
                  <span className="text-xs text-dark-500">
                    {formatTime(conv.timestamp)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-dark-400 truncate">
                    {conv.lastMessage}
                  </span>
                  {conv.unread > 0 && (
                    <span className="bg-primary-500 text-white text-xs px-2 py-0.5 rounded-full">
                      {conv.unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}

          {filteredConversations.length === 0 && (
            <div className="text-center py-8 text-dark-400">
              暂无会话
            </div>
          )}
        </div>

        {/* 新建会话按钮 */}
        <div className="p-4 border-t border-dark-800">
          <button className="btn btn-primary w-full">
            {activeTab === 'group' ? '创建群组' : '发起私聊'}
          </button>
        </div>
      </div>

      {/* 聊天区域 */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <ChatRoom conversationId={selectedConversation} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-dark-400">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-dark-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p>选择一个会话开始聊天</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ChatRoom({ conversationId }: { conversationId: string }) {
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([
    { id: '1', sender: 'other', content: '你好！', timestamp: Date.now() - 60000 },
    { id: '2', sender: 'me', content: '你好，很高兴认识你！', timestamp: Date.now() - 30000 },
    { id: '3', sender: 'other', content: '最近在研究什么？', timestamp: Date.now() },
  ])

  const handleSend = () => {
    if (!message.trim()) return

    setMessages([
      ...messages,
      { id: Date.now().toString(), sender: 'me', content: message, timestamp: Date.now() },
    ])
    setMessage('')
  }

  return (
    <>
      {/* 聊天头部 */}
      <div className="p-4 border-b border-dark-800 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center">
            <span className="text-primary-400">?</span>
          </div>
          <div>
            <h2 className="font-medium">会话 {conversationId}</h2>
            <p className="text-xs text-dark-400">在线</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button className="p-2 text-dark-400 hover:text-dark-200 rounded-lg hover:bg-dark-800">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[70%] px-4 py-2 rounded-2xl ${
                msg.sender === 'me'
                  ? 'bg-primary-500 text-white rounded-br-md'
                  : 'bg-dark-800 text-dark-100 rounded-bl-md'
              }`}
            >
              <p>{msg.content}</p>
              <p className={`text-xs mt-1 ${
                msg.sender === 'me' ? 'text-primary-200' : 'text-dark-500'
              }`}>
                {formatTime(msg.timestamp)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* 输入区域 */}
      <div className="p-4 border-t border-dark-800">
        <div className="flex items-center space-x-3">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="输入消息..."
            className="input flex-1"
          />
          <button
            onClick={handleSend}
            disabled={!message.trim()}
            className="btn btn-primary"
          >
            发送
          </button>
        </div>
        <p className="text-xs text-dark-500 mt-2">
          消息使用 NIP-17 端到端加密
        </p>
      </div>
    </>
  )
}

function formatTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return new Date(timestamp).toLocaleDateString()
}
