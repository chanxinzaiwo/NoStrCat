'use client'

/**
 * 聊天 Hook
 *
 * 管理私聊和群聊功能
 */

import { useState, useEffect, useCallback } from 'react'
import {
  DirectMessage,
  Conversation,
  GroupMessage,
  Group,
  GroupMember,
} from '@nostrcat/core'
import { useNostrCat } from './useNostrCat'

/**
 * 私聊 Hook
 */
export function usePrivateChat() {
  const { client, isLoggedIn } = useNostrCat()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)

  // 加载会话列表
  useEffect(() => {
    if (!client || !isLoggedIn) return

    const chat = client.privateChat

    const loadConversations = () => {
      const convos = chat.getConversations()
      setConversations(convos)
      setUnreadCount(chat.getUnreadCount())
    }

    loadConversations()

    // 订阅新消息
    chat.subscribe((message: DirectMessage) => {
      loadConversations()
    })

    return () => {
      chat.unsubscribe()
    }
  }, [client, isLoggedIn])

  // 发送消息
  const sendMessage = useCallback(async (
    recipientPubkey: string,
    content: string,
    secure = false
  ) => {
    if (!client || !isLoggedIn) return null

    try {
      const chat = client.privateChat
      if (secure) {
        await chat.sendSecureMessage(recipientPubkey, content)
      } else {
        await chat.sendMessage(recipientPubkey, content)
      }

      // 更新会话列表
      setConversations(chat.getConversations())
      return true
    } catch (err) {
      setError(err as Error)
      return null
    }
  }, [client, isLoggedIn])

  // 获取会话消息
  const getMessages = useCallback((participantId: string): DirectMessage[] => {
    if (!client || !isLoggedIn) return []
    return client.privateChat.getMessages(participantId)
  }, [client, isLoggedIn])

  // 标记已读
  const markAsRead = useCallback((participantId: string) => {
    if (!client || !isLoggedIn) return

    client.privateChat.markAsRead(participantId)
    setConversations(client.privateChat.getConversations())
    setUnreadCount(client.privateChat.getUnreadCount())
  }, [client, isLoggedIn])

  // 获取历史消息
  const fetchHistory = useCallback(async (participantId: string, limit = 50) => {
    if (!client || !isLoggedIn) return []

    setIsLoading(true)
    try {
      const messages = await client.privateChat.fetchHistory(participantId, limit)
      return messages
    } catch (err) {
      setError(err as Error)
      return []
    } finally {
      setIsLoading(false)
    }
  }, [client, isLoggedIn])

  return {
    conversations,
    isLoading,
    error,
    unreadCount,
    sendMessage,
    getMessages,
    markAsRead,
    fetchHistory,
  }
}

/**
 * 单个会话 Hook
 */
export function useConversation(participantId: string) {
  const { client, isLoggedIn } = useNostrCat()
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // 加载消息
  useEffect(() => {
    if (!client || !isLoggedIn || !participantId) return

    const chat = client.privateChat

    const loadMessages = async () => {
      setIsLoading(true)
      try {
        // 先加载本地消息
        let localMessages = chat.getMessages(participantId)
        setMessages(localMessages)

        // 获取历史消息
        const history = await chat.fetchHistory(participantId)
        setMessages(history)

        // 标记已读
        chat.markAsRead(participantId)
      } catch (err) {
        setError(err as Error)
      } finally {
        setIsLoading(false)
      }
    }

    loadMessages()

    // 订阅新消息
    chat.subscribe((message: DirectMessage) => {
      if (message.senderId === participantId || message.recipientId === participantId) {
        setMessages(chat.getMessages(participantId))
      }
    })

    return () => {
      chat.unsubscribe()
    }
  }, [client, isLoggedIn, participantId])

  // 发送消息
  const send = useCallback(async (content: string, secure = false) => {
    if (!client || !isLoggedIn) return false

    try {
      const chat = client.privateChat
      if (secure) {
        await chat.sendSecureMessage(participantId, content)
      } else {
        await chat.sendMessage(participantId, content)
      }
      setMessages(chat.getMessages(participantId))
      return true
    } catch (err) {
      setError(err as Error)
      return false
    }
  }, [client, isLoggedIn, participantId])

  return {
    messages,
    isLoading,
    error,
    send,
  }
}

/**
 * 群聊 Hook
 */
export function useGroupChat() {
  const { client, isLoggedIn } = useNostrCat()
  const [groups, setGroups] = useState<Group[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // 加载群组列表
  useEffect(() => {
    if (!client || !isLoggedIn) return

    const groupChat = client.groupChat
    setGroups(groupChat.getGroups())
  }, [client, isLoggedIn])

  // 创建群组
  const createGroup = useCallback(async (
    name: string,
    description: string,
    members: string[],
    isPublic = false
  ): Promise<Group | null> => {
    if (!client || !isLoggedIn) return null

    setIsLoading(true)
    try {
      const groupChat = client.groupChat
      const group = await groupChat.createGroup(name, description, members, isPublic)
      setGroups(groupChat.getGroups())
      return group
    } catch (err) {
      setError(err as Error)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [client, isLoggedIn])

  // 加入群组
  const joinGroup = useCallback(async (groupId: string): Promise<Group | null> => {
    if (!client || !isLoggedIn) return null

    setIsLoading(true)
    try {
      const groupChat = client.groupChat
      const group = await groupChat.loadGroup(groupId)
      if (group) {
        setGroups(groupChat.getGroups())
      }
      return group
    } catch (err) {
      setError(err as Error)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [client, isLoggedIn])

  // 离开群组
  const leaveGroup = useCallback(async (groupId: string) => {
    if (!client || !isLoggedIn) return

    try {
      const groupChat = client.groupChat
      await groupChat.leaveGroup(groupId)
      setGroups(groupChat.getGroups())
    } catch (err) {
      setError(err as Error)
    }
  }, [client, isLoggedIn])

  // 邀请成员
  const inviteMember = useCallback(async (groupId: string, memberPubkey: string) => {
    if (!client || !isLoggedIn) return

    try {
      const groupChat = client.groupChat
      await groupChat.inviteMember(groupId, memberPubkey)
      setGroups(groupChat.getGroups())
    } catch (err) {
      setError(err as Error)
    }
  }, [client, isLoggedIn])

  // 移除成员
  const removeMember = useCallback(async (groupId: string, memberPubkey: string) => {
    if (!client || !isLoggedIn) return

    try {
      const groupChat = client.groupChat
      await groupChat.removeMember(groupId, memberPubkey)
      setGroups(groupChat.getGroups())
    } catch (err) {
      setError(err as Error)
    }
  }, [client, isLoggedIn])

  return {
    groups,
    isLoading,
    error,
    createGroup,
    joinGroup,
    leaveGroup,
    inviteMember,
    removeMember,
  }
}

/**
 * 单个群组 Hook
 */
export function useGroup(groupId: string) {
  const { client, isLoggedIn } = useNostrCat()
  const [group, setGroup] = useState<Group | null>(null)
  const [messages, setMessages] = useState<GroupMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // 加载群组
  useEffect(() => {
    if (!client || !isLoggedIn || !groupId) return

    const loadGroup = async () => {
      setIsLoading(true)
      try {
        const groupChat = client.groupChat
        let g = groupChat.getGroup(groupId)

        if (!g) {
          g = await groupChat.loadGroup(groupId) || undefined
        }

        if (g) {
          setGroup(g)
          setMessages(groupChat.getMessages(groupId))
        }
      } catch (err) {
        setError(err as Error)
      } finally {
        setIsLoading(false)
      }
    }

    loadGroup()

    // 订阅消息
    const groupChat = client.groupChat
    groupChat.subscribeToGroup(groupId, (message) => {
      setMessages(groupChat.getMessages(groupId))
    })

    return () => {
      groupChat.unsubscribeFromGroup(groupId)
    }
  }, [client, isLoggedIn, groupId])

  // 发送消息
  const send = useCallback(async (content: string) => {
    if (!client || !isLoggedIn) return false

    try {
      const groupChat = client.groupChat
      await groupChat.sendMessage(groupId, content)
      setMessages(groupChat.getMessages(groupId))
      return true
    } catch (err) {
      setError(err as Error)
      return false
    }
  }, [client, isLoggedIn, groupId])

  return {
    group,
    messages,
    isLoading,
    error,
    send,
  }
}
