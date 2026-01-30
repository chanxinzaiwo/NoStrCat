'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useUserStore } from '@/stores/userStore'
import {
  DirectMessageService,
  PrivateGroupService,
  type DirectMessage,
  type PrivateGroup,
  type GroupMessage,
  type RelayConnection
} from '@nostrcat/chat-core'

// ============ 类型定义 ============

interface ConversationItem {
  id: string
  type: 'dm' | 'group'
  pubkey: string
  name: string
  picture?: string
  lastMessage: string
  timestamp: number
  unread: number
}

interface ChatMessage {
  id: string
  sender: 'me' | 'other'
  senderPubkey: string
  content: string
  timestamp: number
  status?: 'sending' | 'sent' | 'delivered' | 'read'
}

// ============ WebSocket 中继实现 ============

class WebSocketRelay implements RelayConnection {
  private ws: WebSocket | null = null
  private url: string
  private subscriptions: Map<string, {
    filters: object[]
    onEvent: (event: any) => void
    onEose?: () => void
  }> = new Map()
  private subIdCounter = 0
  private connected = false

  constructor(url: string) {
    this.url = url
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          console.log(`Connected to ${this.url}`)
          this.connected = true
          this.subscriptions.forEach((sub, subId) => {
            this.sendSubscribe(subId, sub.filters)
          })
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            this.handleMessage(data)
          } catch (e) {
            // ignore
          }
        }

        this.ws.onclose = () => {
          this.connected = false
        }

        this.ws.onerror = () => {
          reject(new Error(`Failed to connect to ${this.url}`))
        }

        // 超时
        setTimeout(() => {
          if (!this.connected) {
            reject(new Error('Connection timeout'))
          }
        }, 5000)
      } catch (error) {
        reject(error)
      }
    })
  }

  private handleMessage(data: any[]): void {
    const [type, ...args] = data

    if (type === 'EVENT') {
      const [subId, event] = args
      const sub = this.subscriptions.get(subId)
      if (sub) sub.onEvent(event)
    } else if (type === 'EOSE') {
      const [subId] = args
      const sub = this.subscriptions.get(subId)
      if (sub?.onEose) sub.onEose()
    }
  }

  private sendSubscribe(subId: string, filters: object[]): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(['REQ', subId, ...filters]))
    }
  }

  async publish(event: any): Promise<boolean> {
    if (this.ws?.readyState !== WebSocket.OPEN) return false
    this.ws.send(JSON.stringify(['EVENT', event]))
    return true
  }

  subscribe(
    filters: object[],
    onEvent: (event: any) => void,
    onEose?: () => void
  ): () => void {
    const subId = `sub_${++this.subIdCounter}`
    this.subscriptions.set(subId, { filters, onEvent, onEose })

    if (this.connected) {
      this.sendSubscribe(subId, filters)
    }

    return () => {
      this.subscriptions.delete(subId)
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(['CLOSE', subId]))
      }
    }
  }
}

// 默认中继
const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band'
]

// ============ 主组件 ============

export default function ChatPage() {
  const { isLoggedIn, privateKey, publicKey } = useUserStore()
  const [selectedConversation, setSelectedConversation] = useState<ConversationItem | null>(null)
  const [activeTab, setActiveTab] = useState<'private' | 'group'>('private')
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [initialized, setInitialized] = useState(false)

  // 服务引用
  const dmServiceRef = useRef<DirectMessageService | null>(null)
  const groupServiceRef = useRef<PrivateGroupService | null>(null)
  const relaysRef = useRef<WebSocketRelay[]>([])

  // 初始化聊天服务
  useEffect(() => {
    if (!isLoggedIn || !privateKey) return

    const init = async () => {
      try {
        // 创建中继连接
        const relays = DEFAULT_RELAYS.map(url => new WebSocketRelay(url))
        await Promise.all(relays.map(r => r.connect().catch(() => null)))
        relaysRef.current = relays

        // 创建私聊服务
        dmServiceRef.current = new DirectMessageService({
          privateKey,
          relays,
          onMessage: (message) => {
            console.log('收到私聊消息:', message.content)
            // 更新会话列表
            updateConversation(message)
          }
        })

        // 创建群聊服务
        groupServiceRef.current = new PrivateGroupService({
          privateKey,
          relays,
          onGroupMessage: (groupId, message) => {
            console.log('收到群消息:', groupId, message.content)
          },
          onGroupUpdate: (group) => {
            console.log('群组更新:', group.name)
            addGroupToConversations(group)
          }
        })

        // 订阅消息
        dmServiceRef.current.subscribeMessages()
        groupServiceRef.current.subscribeGroupMessages()

        setInitialized(true)
      } catch (error) {
        console.error('初始化聊天服务失败:', error)
      }
    }

    init()

    return () => {
      dmServiceRef.current?.destroy()
    }
  }, [isLoggedIn, privateKey])

  // 更新会话列表
  const updateConversation = useCallback((message: DirectMessage) => {
    setConversations(prev => {
      const existing = prev.find(c => c.id === message.conversationId)
      if (existing) {
        return prev.map(c =>
          c.id === message.conversationId
            ? { ...c, lastMessage: message.content, timestamp: message.createdAt * 1000, unread: c.unread + 1 }
            : c
        )
      } else {
        return [{
          id: message.conversationId,
          type: 'dm',
          pubkey: message.sender,
          name: message.sender.slice(0, 8) + '...',
          lastMessage: message.content,
          timestamp: message.createdAt * 1000,
          unread: 1
        }, ...prev]
      }
    })
  }, [])

  // 添加群组到会话
  const addGroupToConversations = useCallback((group: PrivateGroup) => {
    setConversations(prev => {
      const existing = prev.find(c => c.id === group.id)
      if (existing) return prev
      return [{
        id: group.id,
        type: 'group',
        pubkey: group.id,
        name: group.name,
        picture: group.picture,
        lastMessage: '群组已创建',
        timestamp: group.createdAt * 1000,
        unread: 0
      }, ...prev]
    })
  }, [])

  // 未登录提示
  if (!isLoggedIn) {
    return (
      <div className="h-[calc(100vh-5rem)] md:h-screen flex items-center justify-center p-4">
        <div className="card bg-dark-900 text-center py-12 px-6 w-full max-w-sm">
          <svg className="w-16 h-16 mx-auto mb-4 text-dark-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p className="text-dark-400 mb-4">请先登录使用消息功能</p>
          <a href="/" className="btn btn-primary">返回首页</a>
        </div>
      </div>
    )
  }

  const filteredConversations = conversations.filter(c =>
    activeTab === 'group' ? c.type === 'group' : c.type === 'dm'
  )

  const showChatRoom = selectedConversation !== null

  return (
    <div className="h-[calc(100vh-5rem)] md:h-screen flex">
      {/* 会话列表 */}
      <div className={`${showChatRoom ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-dark-800 flex-col`}>
        {/* 头部 */}
        <div className="p-4 border-b border-dark-800 safe-area-pt">
          <h1 className="text-xl font-bold mb-4">消息</h1>

          {/* 标签切换 */}
          <div className="flex bg-dark-800 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('private')}
              className={`flex-1 py-2.5 text-sm rounded-md transition-colors ${
                activeTab === 'private' ? 'bg-primary-500 text-white' : 'text-dark-400 hover:text-dark-200'
              }`}
            >
              私聊
            </button>
            <button
              onClick={() => setActiveTab('group')}
              className={`flex-1 py-2.5 text-sm rounded-md transition-colors ${
                activeTab === 'group' ? 'bg-primary-500 text-white' : 'text-dark-400 hover:text-dark-200'
              }`}
            >
              群聊
            </button>
          </div>
        </div>

        {/* 状态指示 */}
        {!initialized && (
          <div className="p-4 text-center text-dark-400 text-sm">
            正在连接中继服务器...
          </div>
        )}

        {/* 搜索框 */}
        <div className="p-4">
          <input type="text" placeholder="搜索会话..." className="input text-sm" />
        </div>

        {/* 会话列表 */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setSelectedConversation(conv)}
              className={`w-full p-4 flex items-center space-x-3 hover:bg-dark-800 active:bg-dark-700 transition-colors ${
                selectedConversation?.id === conv.id ? 'bg-dark-800' : ''
              }`}
            >
              {/* 头像 */}
              <div className="w-12 h-12 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0">
                {conv.type === 'group' ? (
                  <svg className="w-6 h-6 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                ) : (
                  <span className="text-primary-400 text-lg">{conv.name[0]}</span>
                )}
              </div>

              {/* 会话信息 */}
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center justify-between">
                  <span className="font-medium truncate">{conv.name}</span>
                  <span className="text-xs text-dark-500">{formatTime(conv.timestamp)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-dark-400 truncate">{conv.lastMessage}</span>
                  {conv.unread > 0 && (
                    <span className="bg-primary-500 text-white text-xs px-2 py-0.5 rounded-full ml-2">
                      {conv.unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}

          {filteredConversations.length === 0 && initialized && (
            <div className="text-center py-8 text-dark-400">
              暂无会话，开始一个新对话吧
            </div>
          )}
        </div>

        {/* 新建会话按钮 */}
        <div className="p-4 border-t border-dark-800">
          <NewChatButton
            type={activeTab}
            dmService={dmServiceRef.current}
            groupService={groupServiceRef.current}
            onConversationCreated={(conv) => {
              setConversations(prev => [conv, ...prev])
              setSelectedConversation(conv)
            }}
          />
        </div>
      </div>

      {/* 聊天区域 */}
      <div className={`${showChatRoom ? 'flex' : 'hidden md:flex'} flex-1 flex-col`}>
        {selectedConversation ? (
          <ChatRoom
            conversation={selectedConversation}
            dmService={dmServiceRef.current}
            groupService={groupServiceRef.current}
            currentUserPubkey={publicKey || ''}
            onBack={() => setSelectedConversation(null)}
            onClearUnread={() => {
              setConversations(prev =>
                prev.map(c => c.id === selectedConversation.id ? { ...c, unread: 0 } : c)
              )
            }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-dark-400">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-dark-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p>选择一个会话开始聊天</p>
              <p className="text-sm mt-2 text-dark-500">消息使用 NIP-17 端到端加密</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============ 聊天室组件 ============

function ChatRoom({
  conversation,
  dmService,
  groupService,
  currentUserPubkey,
  onBack,
  onClearUnread
}: {
  conversation: ConversationItem
  dmService: DirectMessageService | null
  groupService: PrivateGroupService | null
  currentUserPubkey: string
  onBack: () => void
  onClearUnread: () => void
}) {
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 加载历史消息
  useEffect(() => {
    const loadHistory = async () => {
      if (conversation.type === 'dm' && dmService) {
        setLoading(true)
        try {
          const history = await dmService.getMessageHistory(conversation.pubkey, { limit: 50 })
          setMessages(history.map(m => ({
            id: m.id,
            sender: m.sender === currentUserPubkey ? 'me' : 'other',
            senderPubkey: m.sender,
            content: m.content,
            timestamp: m.createdAt * 1000,
            status: m.status
          })))
        } catch (e) {
          console.error('加载历史消息失败:', e)
        } finally {
          setLoading(false)
        }
      }
      onClearUnread()
    }

    loadHistory()
  }, [conversation.id, conversation.type, conversation.pubkey, dmService, currentUserPubkey, onClearUnread])

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 发送消息
  const handleSend = async () => {
    if (!message.trim() || sending) return

    setSending(true)
    try {
      if (conversation.type === 'dm' && dmService) {
        const sent = await dmService.sendMessage(conversation.pubkey, message.trim())
        setMessages(prev => [...prev, {
          id: sent.id,
          sender: 'me',
          senderPubkey: currentUserPubkey,
          content: sent.content,
          timestamp: sent.createdAt * 1000,
          status: sent.status
        }])
      } else if (conversation.type === 'group' && groupService) {
        const sent = await groupService.sendGroupMessage(conversation.id, message.trim())
        setMessages(prev => [...prev, {
          id: sent.id,
          sender: 'me',
          senderPubkey: currentUserPubkey,
          content: sent.content,
          timestamp: sent.createdAt * 1000
        }])
      }
      setMessage('')
    } catch (e) {
      console.error('发送消息失败:', e)
      alert('发送失败，请重试')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* 聊天头部 */}
      <div className="p-4 border-b border-dark-800 flex items-center justify-between safe-area-pt">
        <div className="flex items-center space-x-3">
          <button onClick={onBack} className="md:hidden p-2 -ml-2 text-dark-400 hover:text-dark-200 rounded-lg">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center">
            <span className="text-primary-400">{conversation.name[0]}</span>
          </div>
          <div>
            <h2 className="font-medium">{conversation.name}</h2>
            <p className="text-xs text-dark-400">
              {conversation.type === 'dm' ? 'NIP-17 加密' : `${conversation.type === 'group' ? '私有群聊' : ''}`}
            </p>
          </div>
        </div>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && (
          <div className="text-center text-dark-400 py-4">加载中...</div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] md:max-w-[70%] px-4 py-2 rounded-2xl ${
              msg.sender === 'me'
                ? 'bg-primary-500 text-white rounded-br-md'
                : 'bg-dark-800 text-dark-100 rounded-bl-md'
            }`}>
              <p className="break-words">{msg.content}</p>
              <p className={`text-xs mt-1 flex items-center justify-end gap-1 ${
                msg.sender === 'me' ? 'text-primary-200' : 'text-dark-500'
              }`}>
                {formatTime(msg.timestamp)}
                {msg.sender === 'me' && msg.status && (
                  <span className="ml-1">
                    {msg.status === 'sending' && '⏳'}
                    {msg.status === 'sent' && '✓'}
                    {msg.status === 'delivered' && '✓✓'}
                  </span>
                )}
              </p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="p-4 border-t border-dark-800 safe-area-pb">
        <div className="flex items-center space-x-3">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="输入消息..."
            className="input flex-1"
            disabled={sending}
          />
          <button
            onClick={handleSend}
            disabled={!message.trim() || sending}
            className="btn btn-primary px-6"
          >
            {sending ? '发送中...' : '发送'}
          </button>
        </div>
      </div>
    </>
  )
}

// ============ 新建会话按钮 ============

function NewChatButton({
  type,
  dmService,
  groupService,
  onConversationCreated
}: {
  type: 'private' | 'group'
  dmService: DirectMessageService | null
  groupService: PrivateGroupService | null
  onConversationCreated: (conv: ConversationItem) => void
}) {
  const [showModal, setShowModal] = useState(false)
  const [pubkey, setPubkey] = useState('')
  const [groupName, setGroupName] = useState('')
  const [groupMembers, setGroupMembers] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    setLoading(true)
    try {
      if (type === 'private' && dmService && pubkey.trim()) {
        const convId = dmService.getConversationId(pubkey.trim())
        onConversationCreated({
          id: convId,
          type: 'dm',
          pubkey: pubkey.trim(),
          name: pubkey.trim().slice(0, 8) + '...',
          lastMessage: '开始聊天',
          timestamp: Date.now(),
          unread: 0
        })
      } else if (type === 'group' && groupService && groupName.trim()) {
        const members = groupMembers.split('\n').map(m => m.trim()).filter(m => m)
        const group = await groupService.createGroup({
          name: groupName.trim(),
          members
        })
        onConversationCreated({
          id: group.id,
          type: 'group',
          pubkey: group.id,
          name: group.name,
          lastMessage: '群组已创建',
          timestamp: Date.now(),
          unread: 0
        })
      }
      setShowModal(false)
      setPubkey('')
      setGroupName('')
      setGroupMembers('')
    } catch (e) {
      console.error('创建失败:', e)
      alert('创建失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button onClick={() => setShowModal(true)} className="btn btn-primary w-full py-3">
        {type === 'group' ? '创建群组' : '发起私聊'}
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card bg-dark-900 w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-4">
              {type === 'group' ? '创建群组' : '发起私聊'}
            </h3>

            {type === 'private' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-dark-400 mb-2">对方公钥 (npub 或 hex)</label>
                  <input
                    type="text"
                    value={pubkey}
                    onChange={(e) => setPubkey(e.target.value)}
                    placeholder="输入对方的公钥"
                    className="input w-full"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-dark-400 mb-2">群名称</label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="输入群名称"
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm text-dark-400 mb-2">成员公钥 (每行一个)</label>
                  <textarea
                    value={groupMembers}
                    onChange={(e) => setGroupMembers(e.target.value)}
                    placeholder="输入成员公钥，每行一个"
                    className="input w-full h-24 resize-none"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="btn btn-secondary flex-1">
                取消
              </button>
              <button onClick={handleCreate} disabled={loading} className="btn btn-primary flex-1">
                {loading ? '创建中...' : '确定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ============ 工具函数 ============

function formatTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return new Date(timestamp).toLocaleDateString()
}
