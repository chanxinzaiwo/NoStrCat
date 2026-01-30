/**
 * 群聊模块
 *
 * 支持多人加密群组聊天
 * 使用 NIP-17 风格的加密（每个成员单独加密）
 */

import { NostrEvent, EventKind, createEvent, getEventHash } from '../../events/types'
import { encryptDM, decryptDM } from '../../crypto/encryption'
import { signEvent, KeyPair } from '../../crypto/keys'
import { NostrConnection } from '../../client/NostrConnection'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '../../utils/encoding'

/**
 * 群组成员
 */
export interface GroupMember {
  pubkey: string
  name?: string
  picture?: string
  role: 'owner' | 'admin' | 'member'
  joinedAt: number
}

/**
 * 群组消息
 */
export interface GroupMessage {
  id: string
  groupId: string
  senderId: string
  senderName?: string
  content: string
  createdAt: number
  rawEvent?: NostrEvent
}

/**
 * 群组信息
 */
export interface Group {
  id: string
  name: string
  description?: string
  picture?: string
  owner: string
  members: GroupMember[]
  createdAt: number
  updatedAt: number
  isPublic: boolean
  // 链上合约 ID（如果有）
  contractUtxo?: string
}

/**
 * 群聊管理类
 */
export class GroupChat {
  private connection: NostrConnection
  private keyPair: KeyPair
  private groups: Map<string, Group> = new Map()
  private messages: Map<string, GroupMessage[]> = new Map()
  private subscriptions: Map<string, string> = new Map()
  private onMessageCallback?: (groupId: string, message: GroupMessage) => void

  constructor(connection: NostrConnection, keyPair: KeyPair) {
    this.connection = connection
    this.keyPair = keyPair
  }

  /**
   * 创建群组
   * @param name 群组名称
   * @param description 群组描述
   * @param members 初始成员公钥列表
   * @param isPublic 是否公开
   */
  async createGroup(
    name: string,
    description: string,
    members: string[],
    isPublic = false
  ): Promise<Group> {
    // 生成群组 ID
    const groupIdData = `${this.keyPair.publicKey}:${name}:${Date.now()}`
    const groupId = bytesToHex(sha256(new TextEncoder().encode(groupIdData)))

    // 创建群组元数据
    const metadata = {
      name,
      description,
      picture: '',
      owner: this.keyPair.publicKey,
      isPublic,
      members: [this.keyPair.publicKey, ...members],
      createdAt: Math.floor(Date.now() / 1000),
    }

    // 创建群组元数据事件 (Kind 40: Channel Creation)
    const unsignedEvent = {
      ...createEvent(40, JSON.stringify(metadata), [
        ['d', groupId],
      ]),
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

    // 创建本地群组对象
    const group: Group = {
      id: groupId,
      name,
      description,
      owner: this.keyPair.publicKey,
      members: [
        {
          pubkey: this.keyPair.publicKey,
          role: 'owner',
          joinedAt: Date.now(),
        },
        ...members.map(pk => ({
          pubkey: pk,
          role: 'member' as const,
          joinedAt: Date.now(),
        })),
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPublic,
    }

    this.groups.set(groupId, group)

    return group
  }

  /**
   * 发送群组消息
   * 对于私密群组，消息需要单独加密发送给每个成员
   */
  async sendMessage(groupId: string, content: string): Promise<string> {
    const group = this.groups.get(groupId)
    if (!group) {
      throw new Error('Group not found')
    }

    if (group.isPublic) {
      // 公开群组使用 Kind 42 (Channel Message)
      return this.sendPublicGroupMessage(groupId, content)
    } else {
      // 私密群组需要给每个成员单独加密
      return this.sendPrivateGroupMessage(group, content)
    }
  }

  /**
   * 发送公开群组消息
   */
  private async sendPublicGroupMessage(groupId: string, content: string): Promise<string> {
    const unsignedEvent = {
      ...createEvent(42, content, [
        ['e', groupId, '', 'root'],
      ]),
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

    // 保存消息
    const message: GroupMessage = {
      id: event.id,
      groupId,
      senderId: this.keyPair.publicKey,
      content,
      createdAt: event.created_at,
      rawEvent: event,
    }

    this.addMessageToGroup(groupId, message)

    return event.id
  }

  /**
   * 发送私密群组消息
   * 需要给每个成员单独加密发送
   */
  private async sendPrivateGroupMessage(group: Group, content: string): Promise<string> {
    const messageId = bytesToHex(sha256(new TextEncoder().encode(
      `${this.keyPair.publicKey}:${group.id}:${content}:${Date.now()}`
    )))

    // 给每个成员发送加密消息
    const promises = group.members.map(async (member) => {
      if (member.pubkey === this.keyPair.publicKey) return // 跳过自己

      const encryptedContent = await encryptDM(
        JSON.stringify({
          groupId: group.id,
          messageId,
          content,
        }),
        this.keyPair.privateKey,
        member.pubkey
      )

      const unsignedEvent = {
        ...createEvent(EventKind.EncryptedDM, encryptedContent, [
          ['p', member.pubkey],
          ['g', group.id], // 群组标识
        ]),
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
    })

    await Promise.all(promises)

    // 保存消息
    const message: GroupMessage = {
      id: messageId,
      groupId: group.id,
      senderId: this.keyPair.publicKey,
      content,
      createdAt: Math.floor(Date.now() / 1000),
    }

    this.addMessageToGroup(group.id, message)

    return messageId
  }

  /**
   * 订阅群组消息
   */
  subscribeToGroup(groupId: string, onMessage: (message: GroupMessage) => void): void {
    const group = this.groups.get(groupId)
    if (!group) return

    this.onMessageCallback = (gId, msg) => {
      if (gId === groupId) {
        onMessage(msg)
      }
    }

    if (group.isPublic) {
      // 订阅公开群组消息
      const subId = this.connection.subscribe(
        {
          kinds: [42], // Channel Message
          '#e': [groupId],
        },
        (event) => {
          this.handlePublicGroupMessage(groupId, event)
        }
      )
      this.subscriptions.set(groupId, subId)
    } else {
      // 订阅私密群组消息（通过 DM）
      const subId = this.connection.subscribe(
        {
          kinds: [EventKind.EncryptedDM],
          '#p': [this.keyPair.publicKey],
          '#g': [groupId],
        },
        async (event) => {
          await this.handlePrivateGroupMessage(groupId, event)
        }
      )
      this.subscriptions.set(groupId, subId)
    }
  }

  /**
   * 取消订阅群组
   */
  unsubscribeFromGroup(groupId: string): void {
    const subId = this.subscriptions.get(groupId)
    if (subId) {
      this.connection.unsubscribe(subId)
      this.subscriptions.delete(groupId)
    }
  }

  /**
   * 处理公开群组消息
   */
  private handlePublicGroupMessage(groupId: string, event: NostrEvent): void {
    const message: GroupMessage = {
      id: event.id,
      groupId,
      senderId: event.pubkey,
      content: event.content,
      createdAt: event.created_at,
      rawEvent: event,
    }

    this.addMessageToGroup(groupId, message)

    if (this.onMessageCallback) {
      this.onMessageCallback(groupId, message)
    }
  }

  /**
   * 处理私密群组消息
   */
  private async handlePrivateGroupMessage(groupId: string, event: NostrEvent): Promise<void> {
    try {
      const decryptedContent = await decryptDM(
        event.content,
        this.keyPair.privateKey,
        event.pubkey
      )

      const data = JSON.parse(decryptedContent)

      if (data.groupId !== groupId) return

      const message: GroupMessage = {
        id: data.messageId,
        groupId,
        senderId: event.pubkey,
        content: data.content,
        createdAt: event.created_at,
        rawEvent: event,
      }

      this.addMessageToGroup(groupId, message)

      if (this.onMessageCallback) {
        this.onMessageCallback(groupId, message)
      }
    } catch (error) {
      console.error('Failed to decrypt group message:', error)
    }
  }

  /**
   * 添加消息到群组
   */
  private addMessageToGroup(groupId: string, message: GroupMessage): void {
    let groupMessages = this.messages.get(groupId)
    if (!groupMessages) {
      groupMessages = []
      this.messages.set(groupId, groupMessages)
    }

    // 避免重复
    if (!groupMessages.find(m => m.id === message.id)) {
      groupMessages.push(message)
      groupMessages.sort((a, b) => a.createdAt - b.createdAt)
    }

    // 更新群组时间
    const group = this.groups.get(groupId)
    if (group) {
      group.updatedAt = message.createdAt * 1000
    }
  }

  /**
   * 获取群组消息
   */
  getMessages(groupId: string): GroupMessage[] {
    return this.messages.get(groupId) || []
  }

  /**
   * 获取所有群组
   */
  getGroups(): Group[] {
    return Array.from(this.groups.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /**
   * 获取群组信息
   */
  getGroup(groupId: string): Group | undefined {
    return this.groups.get(groupId)
  }

  /**
   * 邀请成员
   */
  async inviteMember(groupId: string, memberPubkey: string): Promise<void> {
    const group = this.groups.get(groupId)
    if (!group) {
      throw new Error('Group not found')
    }

    if (group.owner !== this.keyPair.publicKey) {
      throw new Error('Only owner can invite members')
    }

    // 添加成员
    group.members.push({
      pubkey: memberPubkey,
      role: 'member',
      joinedAt: Date.now(),
    })

    // 发送邀请事件
    // TODO: 实现邀请机制
  }

  /**
   * 移除成员
   */
  async removeMember(groupId: string, memberPubkey: string): Promise<void> {
    const group = this.groups.get(groupId)
    if (!group) {
      throw new Error('Group not found')
    }

    if (group.owner !== this.keyPair.publicKey) {
      throw new Error('Only owner can remove members')
    }

    group.members = group.members.filter(m => m.pubkey !== memberPubkey)
  }

  /**
   * 离开群组
   */
  async leaveGroup(groupId: string): Promise<void> {
    const group = this.groups.get(groupId)
    if (!group) return

    this.unsubscribeFromGroup(groupId)
    this.groups.delete(groupId)
    this.messages.delete(groupId)
  }

  /**
   * 加载群组（从本地或网络）
   */
  async loadGroup(groupId: string): Promise<Group | null> {
    // 从网络获取群组元数据
    const events = await this.connection.fetch({
      kinds: [40], // Channel Creation
      '#d': [groupId],
      limit: 1,
    })

    if (events.length === 0) {
      return null
    }

    const event = events[0]
    const metadata = JSON.parse(event.content)

    const group: Group = {
      id: groupId,
      name: metadata.name,
      description: metadata.description,
      picture: metadata.picture,
      owner: metadata.owner,
      members: metadata.members.map((pk: string) => ({
        pubkey: pk,
        role: pk === metadata.owner ? 'owner' : 'member',
        joinedAt: event.created_at * 1000,
      })),
      createdAt: event.created_at * 1000,
      updatedAt: event.created_at * 1000,
      isPublic: metadata.isPublic,
    }

    this.groups.set(groupId, group)

    return group
  }
}
