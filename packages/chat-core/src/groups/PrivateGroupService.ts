/**
 * 私有群聊服务
 * 基于 NIP-17 (Gift Wrap) 实现，每条消息单独加密发送给每个成员
 * 支持 < 100 人的小群
 */

import {
  NostrEvent,
  EVENT_KIND,
  wrapDirectMessage,
  unwrapDirectMessage
} from '../crypto/nip59'
import { secp256k1 } from '@noble/curves/secp256k1'
import { bytesToHex, hexToBytes } from '../crypto/nip44'
import { sha256 } from '@noble/hashes/sha256'
import { randomBytes } from '@noble/hashes/utils'

// 群组类型
export interface PrivateGroup {
  id: string                  // 群组 ID
  name: string                // 群名
  picture?: string            // 群头像
  about?: string              // 群简介
  creator: string             // 创建者公钥
  admins: string[]            // 管理员公钥列表
  members: string[]           // 成员公钥列表
  createdAt: number
  updatedAt: number
}

// 群消息
export interface GroupMessage {
  id: string
  groupId: string
  content: string
  sender: string
  createdAt: number
  replyTo?: string
  mentions?: string[]         // @提及的成员
}

// 群事件类型 (自定义 kind)
export const GROUP_EVENT_KIND = {
  GROUP_CREATE: 10100,        // 群创建/元数据
  GROUP_MEMBERS: 10101,       // 成员列表
  GROUP_MESSAGE: 14,          // 群消息 (复用 NIP-17)
  GROUP_INVITE: 10102,        // 群邀请
  GROUP_LEAVE: 10103,         // 退出群
}

// 中继连接接口
export interface RelayConnection {
  publish(event: NostrEvent): Promise<boolean>
  subscribe(
    filters: object[],
    onEvent: (event: NostrEvent) => void,
    onEose?: () => void
  ): () => void
}

// 服务配置
export interface PrivateGroupServiceConfig {
  privateKey: string
  relays: RelayConnection[]
  onGroupMessage?: (groupId: string, message: GroupMessage) => void
  onGroupUpdate?: (group: PrivateGroup) => void
}

/**
 * 私有群聊服务
 */
export class PrivateGroupService {
  private privateKey: Uint8Array
  private publicKey: string
  private relays: RelayConnection[]
  private groups: Map<string, PrivateGroup> = new Map()
  private messageCallbacks: Set<(groupId: string, message: GroupMessage) => void> = new Set()
  private groupUpdateCallbacks: Set<(group: PrivateGroup) => void> = new Set()

  constructor(config: PrivateGroupServiceConfig) {
    this.privateKey = hexToBytes(config.privateKey)
    this.publicKey = bytesToHex(
      secp256k1.getPublicKey(this.privateKey, true).slice(1)
    )
    this.relays = config.relays

    if (config.onGroupMessage) {
      this.messageCallbacks.add(config.onGroupMessage)
    }
    if (config.onGroupUpdate) {
      this.groupUpdateCallbacks.add(config.onGroupUpdate)
    }
  }

  /**
   * 生成群组 ID
   */
  private generateGroupId(): string {
    const random = randomBytes(16)
    return bytesToHex(random)
  }

  /**
   * 创建私有群
   */
  async createGroup(params: {
    name: string
    members: string[]        // 初始成员 (不含创建者)
    picture?: string
    about?: string
  }): Promise<PrivateGroup> {
    const now = Math.floor(Date.now() / 1000)
    const groupId = this.generateGroupId()

    const group: PrivateGroup = {
      id: groupId,
      name: params.name,
      picture: params.picture,
      about: params.about,
      creator: this.publicKey,
      admins: [this.publicKey],
      members: [this.publicKey, ...params.members],
      createdAt: now,
      updatedAt: now
    }

    // 保存到本地
    this.groups.set(groupId, group)

    // 发送群邀请给所有成员
    await this.broadcastGroupInvite(group)

    return group
  }

  /**
   * 广播群邀请
   */
  private async broadcastGroupInvite(group: PrivateGroup): Promise<void> {
    const groupMetadata = {
      id: group.id,
      name: group.name,
      picture: group.picture,
      about: group.about,
      creator: group.creator,
      admins: group.admins,
      members: group.members,
      createdAt: group.createdAt
    }

    // 为每个成员创建邀请事件
    const sendPromises = group.members
      .filter(m => m !== this.publicKey)
      .map(async (member) => {
        const inviteEvent: NostrEvent = {
          kind: GROUP_EVENT_KIND.GROUP_INVITE,
          pubkey: this.publicKey,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ['g', group.id],
            ['p', member]
          ],
          content: JSON.stringify(groupMetadata)
        }

        // Gift Wrap 封装
        const wrapped = wrapDirectMessage(inviteEvent, this.privateKey, member)

        // 发送到中继
        return Promise.all(this.relays.map(r => r.publish(wrapped)))
      })

    await Promise.all(sendPromises)
  }

  /**
   * 发送群消息
   * 为每个成员单独加密发送
   */
  async sendGroupMessage(
    groupId: string,
    content: string,
    options?: {
      replyTo?: string
      mentions?: string[]
    }
  ): Promise<GroupMessage> {
    const group = this.groups.get(groupId)
    if (!group) {
      throw new Error(`Group not found: ${groupId}`)
    }

    // 检查是否是成员
    if (!group.members.includes(this.publicKey)) {
      throw new Error('You are not a member of this group')
    }

    const now = Math.floor(Date.now() / 1000)
    const messageId = bytesToHex(randomBytes(32))

    // 创建群消息事件
    const messageEvent: NostrEvent = {
      kind: GROUP_EVENT_KIND.GROUP_MESSAGE,
      pubkey: this.publicKey,
      created_at: now,
      tags: [
        ['g', groupId],
        ...(options?.replyTo ? [['e', options.replyTo, '', 'reply']] : []),
        ...(options?.mentions?.map(m => ['p', m, '', 'mention']) || [])
      ],
      content: content
    }

    // 为每个成员（除自己）单独 Gift Wrap 发送
    const sendPromises = group.members
      .filter(m => m !== this.publicKey)
      .map(async (member) => {
        const wrapped = wrapDirectMessage(messageEvent, this.privateKey, member)
        return Promise.all(this.relays.map(r => r.publish(wrapped)))
      })

    await Promise.all(sendPromises)

    const message: GroupMessage = {
      id: messageId,
      groupId,
      content,
      sender: this.publicKey,
      createdAt: now,
      replyTo: options?.replyTo,
      mentions: options?.mentions
    }

    return message
  }

  /**
   * 邀请新成员
   */
  async inviteMember(groupId: string, newMember: string): Promise<void> {
    const group = this.groups.get(groupId)
    if (!group) {
      throw new Error(`Group not found: ${groupId}`)
    }

    // 检查权限
    if (!group.admins.includes(this.publicKey)) {
      throw new Error('Only admins can invite members')
    }

    // 检查是否已是成员
    if (group.members.includes(newMember)) {
      throw new Error('User is already a member')
    }

    // 添加成员
    group.members.push(newMember)
    group.updatedAt = Math.floor(Date.now() / 1000)

    // 发送邀请给新成员
    const inviteEvent: NostrEvent = {
      kind: GROUP_EVENT_KIND.GROUP_INVITE,
      pubkey: this.publicKey,
      created_at: group.updatedAt,
      tags: [
        ['g', group.id],
        ['p', newMember]
      ],
      content: JSON.stringify({
        id: group.id,
        name: group.name,
        picture: group.picture,
        about: group.about,
        creator: group.creator,
        admins: group.admins,
        members: group.members,
        createdAt: group.createdAt
      })
    }

    const wrapped = wrapDirectMessage(inviteEvent, this.privateKey, newMember)
    await Promise.all(this.relays.map(r => r.publish(wrapped)))

    // 通知现有成员
    await this.broadcastMemberChange(group, 'add', newMember)
  }

  /**
   * 移除成员
   */
  async removeMember(groupId: string, member: string): Promise<void> {
    const group = this.groups.get(groupId)
    if (!group) {
      throw new Error(`Group not found: ${groupId}`)
    }

    // 检查权限
    if (!group.admins.includes(this.publicKey)) {
      throw new Error('Only admins can remove members')
    }

    // 不能移除创建者
    if (member === group.creator) {
      throw new Error('Cannot remove group creator')
    }

    // 移除成员
    group.members = group.members.filter(m => m !== member)
    group.admins = group.admins.filter(a => a !== member)
    group.updatedAt = Math.floor(Date.now() / 1000)

    // 通知所有成员
    await this.broadcastMemberChange(group, 'remove', member)
  }

  /**
   * 广播成员变更
   */
  private async broadcastMemberChange(
    group: PrivateGroup,
    action: 'add' | 'remove',
    targetMember: string
  ): Promise<void> {
    const updateEvent: NostrEvent = {
      kind: GROUP_EVENT_KIND.GROUP_MEMBERS,
      pubkey: this.publicKey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['g', group.id],
        ['action', action],
        ['p', targetMember]
      ],
      content: JSON.stringify({
        members: group.members,
        admins: group.admins
      })
    }

    // 发送给所有成员
    const sendPromises = group.members
      .filter(m => m !== this.publicKey)
      .map(async (member) => {
        const wrapped = wrapDirectMessage(updateEvent, this.privateKey, member)
        return Promise.all(this.relays.map(r => r.publish(wrapped)))
      })

    await Promise.all(sendPromises)
  }

  /**
   * 退出群组
   */
  async leaveGroup(groupId: string): Promise<void> {
    const group = this.groups.get(groupId)
    if (!group) {
      throw new Error(`Group not found: ${groupId}`)
    }

    // 创建者不能退出
    if (group.creator === this.publicKey) {
      throw new Error('Group creator cannot leave. Transfer ownership or delete the group.')
    }

    // 通知其他成员
    const leaveEvent: NostrEvent = {
      kind: GROUP_EVENT_KIND.GROUP_LEAVE,
      pubkey: this.publicKey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['g', groupId]],
      content: ''
    }

    const otherMembers = group.members.filter(m => m !== this.publicKey)
    const sendPromises = otherMembers.map(async (member) => {
      const wrapped = wrapDirectMessage(leaveEvent, this.privateKey, member)
      return Promise.all(this.relays.map(r => r.publish(wrapped)))
    })

    await Promise.all(sendPromises)

    // 从本地移除
    this.groups.delete(groupId)
  }

  /**
   * 订阅群消息
   */
  subscribeGroupMessages(groupId?: string): () => void {
    const unsubs: (() => void)[] = []

    const filter = {
      kinds: [EVENT_KIND.GIFT_WRAP],
      '#p': [this.publicKey],
      since: Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60
    }

    for (const relay of this.relays) {
      const unsub = relay.subscribe(
        [filter],
        (event) => this.handleIncomingEvent(event, groupId)
      )
      unsubs.push(unsub)
    }

    return () => unsubs.forEach(u => u())
  }

  /**
   * 处理收到的事件
   */
  private handleIncomingEvent(event: NostrEvent, filterGroupId?: string): void {
    try {
      const { dm, sender } = unwrapDirectMessage(event, this.privateKey)

      // 检查群组标签
      const gTag = dm.tags.find(t => t[0] === 'g')
      if (!gTag) return

      const groupId = gTag[1]

      // 过滤特定群
      if (filterGroupId && groupId !== filterGroupId) return

      switch (dm.kind) {
        case GROUP_EVENT_KIND.GROUP_MESSAGE:
          this.handleGroupMessage(groupId, dm, sender)
          break

        case GROUP_EVENT_KIND.GROUP_INVITE:
          this.handleGroupInvite(dm, sender)
          break

        case GROUP_EVENT_KIND.GROUP_MEMBERS:
          this.handleMemberUpdate(groupId, dm)
          break

        case GROUP_EVENT_KIND.GROUP_LEAVE:
          this.handleMemberLeave(groupId, sender)
          break
      }
    } catch (error) {
      // 忽略解密失败
    }
  }

  /**
   * 处理群消息
   */
  private handleGroupMessage(groupId: string, event: NostrEvent, sender: string): void {
    const message: GroupMessage = {
      id: event.id || bytesToHex(randomBytes(16)),
      groupId,
      content: event.content,
      sender,
      createdAt: event.created_at,
      replyTo: event.tags.find(t => t[0] === 'e' && t[3] === 'reply')?.[1],
      mentions: event.tags.filter(t => t[0] === 'p' && t[3] === 'mention').map(t => t[1])
    }

    this.notifyGroupMessage(groupId, message)
  }

  /**
   * 处理群邀请
   */
  private handleGroupInvite(event: NostrEvent, sender: string): void {
    try {
      const groupData = JSON.parse(event.content)
      const group: PrivateGroup = {
        ...groupData,
        updatedAt: event.created_at
      }

      this.groups.set(group.id, group)
      this.notifyGroupUpdate(group)
    } catch (e) {
      console.error('Failed to parse group invite:', e)
    }
  }

  /**
   * 处理成员更新
   */
  private handleMemberUpdate(groupId: string, event: NostrEvent): void {
    const group = this.groups.get(groupId)
    if (!group) return

    try {
      const data = JSON.parse(event.content)
      group.members = data.members
      group.admins = data.admins
      group.updatedAt = event.created_at

      this.notifyGroupUpdate(group)
    } catch (e) {
      console.error('Failed to parse member update:', e)
    }
  }

  /**
   * 处理成员退出
   */
  private handleMemberLeave(groupId: string, member: string): void {
    const group = this.groups.get(groupId)
    if (!group) return

    group.members = group.members.filter(m => m !== member)
    group.admins = group.admins.filter(a => a !== member)
    group.updatedAt = Math.floor(Date.now() / 1000)

    this.notifyGroupUpdate(group)
  }

  /**
   * 获取群组列表
   */
  getGroups(): PrivateGroup[] {
    return Array.from(this.groups.values())
  }

  /**
   * 获取单个群组
   */
  getGroup(groupId: string): PrivateGroup | undefined {
    return this.groups.get(groupId)
  }

  /**
   * 添加消息回调
   */
  onGroupMessage(callback: (groupId: string, message: GroupMessage) => void): () => void {
    this.messageCallbacks.add(callback)
    return () => this.messageCallbacks.delete(callback)
  }

  /**
   * 添加群更新回调
   */
  onGroupUpdate(callback: (group: PrivateGroup) => void): () => void {
    this.groupUpdateCallbacks.add(callback)
    return () => this.groupUpdateCallbacks.delete(callback)
  }

  private notifyGroupMessage(groupId: string, message: GroupMessage): void {
    this.messageCallbacks.forEach(cb => {
      try {
        cb(groupId, message)
      } catch (e) {
        console.error('Group message callback error:', e)
      }
    })
  }

  private notifyGroupUpdate(group: PrivateGroup): void {
    this.groupUpdateCallbacks.forEach(cb => {
      try {
        cb(group)
      } catch (e) {
        console.error('Group update callback error:', e)
      }
    })
  }
}

export default PrivateGroupService
