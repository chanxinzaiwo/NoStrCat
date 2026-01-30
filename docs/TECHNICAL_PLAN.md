# NoStrCat 技术方案与开发计划

> 基于 Primal + 0xchat-core 混合架构，集成 OP_CAT Layer

## 一、项目概述

NoStrCat 是一个基于 Nostr 协议的去中心化社交+聊天平台，提供 Web、iOS 和 Android 三端应用。

### 核心特性

| 功能 | 来源 | 技术 |
|------|------|------|
| 社交信息流 | Primal | Feed、Profile、搜索 |
| 私聊 | 0xchat-core | NIP-17 + NIP-44 + NIP-59 |
| 群聊 | 0xchat-core | NIP-17 私有群 + NIP-29 中继群 |
| 公开频道 | 0xchat-core | NIP-28 |
| 钱包打赏 | 自研 | OP_CAT Layer + CAT20 |
| 永久存储 | 自研 | OP_CAT Layer 链上存证 |

---

## 二、系统架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              NoStrCat 客户端                                 │
│                                                                             │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────────┐   │
│  │     Web App       │  │     iOS App       │  │    Android App        │   │
│  │    (SolidJS)      │  │     (Swift)       │  │     (Kotlin)          │   │
│  │                   │  │                   │  │                       │   │
│  │ ┌───────────────┐ │  │ ┌───────────────┐ │  │ ┌───────────────────┐ │   │
│  │ │ 社交模块      │ │  │ │ 社交模块      │ │  │ │ 社交模块          │ │   │
│  │ │ (Primal)      │ │  │ │ (Primal)      │ │  │ │ (Primal)          │ │   │
│  │ ├───────────────┤ │  │ ├───────────────┤ │  │ ├───────────────────┤ │   │
│  │ │ 聊天模块      │ │  │ │ 聊天模块      │ │  │ │ 聊天模块          │ │   │
│  │ │ (0xchat)      │ │  │ │ (0xchat)      │ │  │ │ (0xchat)          │ │   │
│  │ ├───────────────┤ │  │ ├───────────────┤ │  │ ├───────────────────┤ │   │
│  │ │ 钱包模块      │ │  │ │ 钱包模块      │ │  │ │ 钱包模块          │ │   │
│  │ │ (OP_CAT)      │ │  │ │ (OP_CAT)      │ │  │ │ (OP_CAT)          │ │   │
│  │ └───────────────┘ │  │ └───────────────┘ │  │ └───────────────────┘ │   │
│  └─────────┬─────────┘  └─────────┬─────────┘  └───────────┬───────────┘   │
└────────────┼──────────────────────┼────────────────────────┼───────────────┘
             │                      │                        │
             └──────────────────────┼────────────────────────┘
                                    │
                         ┌──────────┴──────────┐
                         │    API Gateway      │
                         │    (WebSocket)      │
                         └──────────┬──────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
          ▼                         ▼                         ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────────┐
│  NoStrCat       │      │  Nostr Relays   │      │  OP_CAT Layer       │
│  Cache Server   │      │  (wss://)       │      │  Blockchain         │
│                 │      │                 │      │                     │
│ • 事件聚合      │      │ • 实时消息      │      │ • 永久存储          │
│ • 用户索引      │      │ • 事件广播      │      │ • 智能合约          │
│ • 搜索服务      │      │ • 订阅管理      │      │ • 代币交易          │
│ • 媒体缓存      │      │                 │      │                     │
└────────┬────────┘      └─────────────────┘      └──────────┬──────────┘
         │                                                    │
         └────────────────────┬───────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │    PostgreSQL     │
                    │    + Redis        │
                    │    + Elasticsearch│
                    └───────────────────┘
```

### 2.2 模块职责

```
┌─────────────────────────────────────────────────────────────────────┐
│                         功能模块划分                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    社交模块 (来自 Primal)                    │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │ • Feed 信息流 (全网/关注/我的)                               │   │
│  │ • Profile 用户资料 (NIP-01 kind:0)                          │   │
│  │ • 发布帖子 (NIP-01 kind:1)                                  │   │
│  │ • 点赞/转发 (kind:6, kind:7)                                │   │
│  │ • 关注/粉丝管理 (kind:3)                                    │   │
│  │ • 通知系统                                                  │   │
│  │ • 全文搜索                                                  │   │
│  │ • 媒体上传                                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                   聊天模块 (来自 0xchat-core)                │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │ • 私聊 DM (NIP-17 Gift-Wrapped)                             │   │
│  │ • 加密算法 (NIP-44 verified encryption)                     │   │
│  │ • 隐私封装 (NIP-59 Gift-Wrap)                               │   │
│  │ • 密钥交换 (NIP-101 前向保密)                               │   │
│  │ • 私有群聊 (< 100人，单独加密)                              │   │
│  │ • 中继群组 (NIP-29 开放/封闭群)                             │   │
│  │ • 公开频道 (NIP-28 kind:40-44)                              │   │
│  │ • 消息状态 (发送中/已送达/已读)                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                   钱包模块 (OP_CAT Layer)                    │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │ • 钱包创建/导入                                             │   │
│  │ • BTC 余额查询                                              │   │
│  │ • CAT20 代币管理                                            │   │
│  │ • CAT721 NFT 管理                                           │   │
│  │ • 打赏功能 (替代 Lightning Zap)                             │   │
│  │ • 交易历史                                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                   链上模块 (OP_CAT Layer)                    │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │ • 帖子上链存证                                              │   │
│  │ • 聊天消息上链 (可选)                                       │   │
│  │ • 群组合约管理                                              │   │
│  │ • 链上数据索引                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 三、技术栈

### 3.1 客户端技术栈

| 平台 | 框架 | 语言 | UI | 来源 |
|------|------|------|-----|------|
| Web | SolidJS 1.9 | TypeScript | TailwindCSS | Primal |
| iOS | SwiftUI | Swift 5.9 | Native | Primal |
| Android | Jetpack Compose | Kotlin 1.9 | Material3 | Primal |

### 3.2 后端技术栈

| 组件 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 缓存服务 | Julia + Rust | - | 高性能事件处理 |
| 数据库 | PostgreSQL | 16 | 主数据存储 |
| 缓存 | Redis | 7 | 会话缓存、消息队列 |
| 搜索 | Elasticsearch | 8 | 全文搜索 |
| 对象存储 | MinIO | - | 媒体文件 |
| 链索引 | electrs | - | OP_CAT 链索引 |

### 3.3 协议支持

| 协议 | 用途 | 模块 |
|------|------|------|
| NIP-01 | 基础事件 | 社交 |
| NIP-04 | 旧版DM (兼容) | 聊天 |
| NIP-17 | 新版私聊 | 聊天 |
| NIP-28 | 公开频道 | 聊天 |
| NIP-29 | 中继群组 | 聊天 |
| NIP-44 | 加密标准 | 聊天 |
| NIP-59 | Gift-Wrap | 聊天 |
| NIP-101 | 密钥交换 | 聊天 |
| CAT20 | 代币标准 | 钱包 |
| CAT721 | NFT标准 | 钱包 |

---

## 四、聊天模块详细设计

### 4.1 私聊 (Direct Message)

#### 加密流程 (NIP-17 + NIP-44 + NIP-59)

```
发送方                                              接收方
   │                                                   │
   │  1. 创建明文消息                                   │
   │     kind: 14 (NIP-17)                             │
   │     content: "Hello"                              │
   │                                                   │
   │  2. NIP-44 加密                                   │
   │     conversation_key = ECDH(sender_sk, recv_pk)   │
   │     encrypted = ChaCha20(content, conversation_key)│
   │                                                   │
   │  3. NIP-59 Gift-Wrap                              │
   │     seal = encrypt(dm_event, conversation_key)    │
   │     wrap = sign(seal, random_key)                 │
   │     wrap.pubkey = random_pubkey  (隐藏发送者)      │
   │                                                   │
   │  4. 发送到中继                                     │
   │  ──────────────────────────────────────────────>  │
   │                                                   │
   │                      5. 接收 Gift-Wrap            │
   │                         解密 seal                  │
   │                         解密 content               │
   │                         验证签名                   │
   │                                                   │
```

#### TypeScript 实现

```typescript
// lib/chat/nip44.ts
import { xchacha20poly1305 } from '@noble/ciphers/chacha'
import { secp256k1 } from '@noble/curves/secp256k1'
import { sha256 } from '@noble/hashes/sha256'
import { hkdf } from '@noble/hashes/hkdf'

export class NIP44 {
  // 计算会话密钥
  static getConversationKey(privateKey: string, publicKey: string): Uint8Array {
    const sharedPoint = secp256k1.getSharedSecret(privateKey, '02' + publicKey)
    const sharedX = sharedPoint.slice(1, 33)
    return hkdf(sha256, sharedX, 'nip44-v2', undefined, 32)
  }

  // 加密消息
  static encrypt(plaintext: string, conversationKey: Uint8Array): string {
    const nonce = crypto.getRandomValues(new Uint8Array(24))
    const encoder = new TextEncoder()
    const data = encoder.encode(plaintext)

    const cipher = xchacha20poly1305(conversationKey, nonce)
    const ciphertext = cipher.encrypt(data)

    // version (1) + nonce (24) + ciphertext
    const result = new Uint8Array(1 + 24 + ciphertext.length)
    result[0] = 2 // version 2
    result.set(nonce, 1)
    result.set(ciphertext, 25)

    return btoa(String.fromCharCode(...result))
  }

  // 解密消息
  static decrypt(payload: string, conversationKey: Uint8Array): string {
    const data = Uint8Array.from(atob(payload), c => c.charCodeAt(0))

    const version = data[0]
    if (version !== 2) throw new Error('Unsupported version')

    const nonce = data.slice(1, 25)
    const ciphertext = data.slice(25)

    const cipher = xchacha20poly1305(conversationKey, nonce)
    const plaintext = cipher.decrypt(ciphertext)

    return new TextDecoder().decode(plaintext)
  }
}
```

```typescript
// lib/chat/nip59.ts
import { NIP44 } from './nip44'
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools'

export class NIP59 {
  // 创建 Gift-Wrap 消息
  static async createGiftWrap(
    dmEvent: NostrEvent,
    senderPrivateKey: string,
    recipientPublicKey: string
  ): Promise<NostrEvent> {
    // 1. 计算会话密钥
    const conversationKey = NIP44.getConversationKey(
      senderPrivateKey,
      recipientPublicKey
    )

    // 2. 创建 Seal (kind: 13)
    const sealContent = NIP44.encrypt(JSON.stringify(dmEvent), conversationKey)
    const sealEvent: NostrEvent = {
      kind: 13,
      content: sealContent,
      tags: [],
      created_at: Math.floor(Date.now() / 1000),
      pubkey: getPublicKey(senderPrivateKey)
    }
    const signedSeal = finalizeEvent(sealEvent, senderPrivateKey)

    // 3. 创建 Gift-Wrap (kind: 1059)
    // 使用随机密钥签名，隐藏真实发送者
    const randomPrivateKey = generateSecretKey()
    const randomPublicKey = getPublicKey(randomPrivateKey)

    const wrapConversationKey = NIP44.getConversationKey(
      randomPrivateKey,
      recipientPublicKey
    )
    const wrapContent = NIP44.encrypt(JSON.stringify(signedSeal), wrapConversationKey)

    const wrapEvent: NostrEvent = {
      kind: 1059,
      content: wrapContent,
      tags: [['p', recipientPublicKey]],
      created_at: this.randomizeTimestamp(),
      pubkey: randomPublicKey
    }

    return finalizeEvent(wrapEvent, randomPrivateKey)
  }

  // 解开 Gift-Wrap
  static async unwrapGiftWrap(
    wrapEvent: NostrEvent,
    recipientPrivateKey: string
  ): Promise<NostrEvent> {
    // 1. 解密 Gift-Wrap -> Seal
    const wrapConversationKey = NIP44.getConversationKey(
      recipientPrivateKey,
      wrapEvent.pubkey
    )
    const sealJson = NIP44.decrypt(wrapEvent.content, wrapConversationKey)
    const sealEvent = JSON.parse(sealJson)

    // 2. 解密 Seal -> DM
    const sealConversationKey = NIP44.getConversationKey(
      recipientPrivateKey,
      sealEvent.pubkey
    )
    const dmJson = NIP44.decrypt(sealEvent.content, sealConversationKey)
    const dmEvent = JSON.parse(dmJson)

    return dmEvent
  }

  // 随机化时间戳 (增加隐私)
  private static randomizeTimestamp(): number {
    const now = Math.floor(Date.now() / 1000)
    const randomOffset = Math.floor(Math.random() * 172800) - 86400 // ±1天
    return now + randomOffset
  }
}
```

```typescript
// lib/chat/directMessage.ts
import { NIP44 } from './nip44'
import { NIP59 } from './nip59'

export interface DirectMessage {
  id: string
  content: string
  sender: string
  recipient: string
  createdAt: number
  status: 'sending' | 'sent' | 'delivered' | 'read'
}

export class DirectMessageService {
  private relays: string[]
  private privateKey: string
  private publicKey: string

  constructor(privateKey: string, relays: string[]) {
    this.privateKey = privateKey
    this.publicKey = getPublicKey(privateKey)
    this.relays = relays
  }

  // 发送私聊消息
  async sendDirectMessage(
    recipientPublicKey: string,
    content: string,
    replyTo?: string
  ): Promise<DirectMessage> {
    // 1. 创建 DM 事件 (kind: 14)
    const dmEvent: NostrEvent = {
      kind: 14,
      content: content,
      tags: [
        ['p', recipientPublicKey],
        ...(replyTo ? [['e', replyTo, '', 'reply']] : [])
      ],
      created_at: Math.floor(Date.now() / 1000),
      pubkey: this.publicKey
    }

    // 2. Gift-Wrap 封装
    const giftWrap = await NIP59.createGiftWrap(
      dmEvent,
      this.privateKey,
      recipientPublicKey
    )

    // 3. 发送到中继
    await this.publishToRelays(giftWrap)

    // 4. 可选: 上链存证
    if (this.shouldStoreOnChain(content)) {
      await this.storeOnOPCAT(dmEvent)
    }

    return {
      id: dmEvent.id,
      content,
      sender: this.publicKey,
      recipient: recipientPublicKey,
      createdAt: dmEvent.created_at,
      status: 'sent'
    }
  }

  // 订阅私聊消息
  subscribeDirectMessages(
    onMessage: (dm: DirectMessage) => void
  ): () => void {
    const filter = {
      kinds: [1059], // Gift-Wrap
      '#p': [this.publicKey],
      since: Math.floor(Date.now() / 1000) - 86400 * 7 // 最近7天
    }

    const subscription = this.subscribe(filter, async (event) => {
      try {
        const dmEvent = await NIP59.unwrapGiftWrap(event, this.privateKey)

        if (dmEvent.kind === 14) {
          onMessage({
            id: dmEvent.id,
            content: dmEvent.content,
            sender: dmEvent.pubkey,
            recipient: this.publicKey,
            createdAt: dmEvent.created_at,
            status: 'delivered'
          })
        }
      } catch (e) {
        console.error('Failed to unwrap message:', e)
      }
    })

    return () => subscription.close()
  }

  private shouldStoreOnChain(content: string): boolean {
    // 判断是否需要上链 (重要消息标记)
    return content.includes('#onchain') || content.includes('#存证')
  }

  private async storeOnOPCAT(event: NostrEvent): Promise<void> {
    // OP_CAT 链上存储逻辑
    // ...
  }
}
```

### 4.2 群聊 (Group Chat)

#### 私有群聊 (< 100人)

```typescript
// lib/chat/privateGroup.ts
import { NIP59 } from './nip59'

export interface PrivateGroup {
  id: string
  name: string
  picture?: string
  creator: string
  members: string[]
  admins: string[]
  createdAt: number
}

export interface GroupMessage {
  id: string
  groupId: string
  content: string
  sender: string
  createdAt: number
}

export class PrivateGroupService {
  private privateKey: string
  private publicKey: string

  // 创建私有群
  async createGroup(
    name: string,
    members: string[],
    picture?: string
  ): Promise<PrivateGroup> {
    const groupId = crypto.randomUUID()

    const group: PrivateGroup = {
      id: groupId,
      name,
      picture,
      creator: this.publicKey,
      members: [this.publicKey, ...members],
      admins: [this.publicKey],
      createdAt: Math.floor(Date.now() / 1000)
    }

    // 发送群创建事件给所有成员
    for (const member of group.members) {
      await this.sendGroupInvite(member, group)
    }

    return group
  }

  // 发送群消息 (每个成员单独加密)
  async sendGroupMessage(
    group: PrivateGroup,
    content: string
  ): Promise<GroupMessage> {
    const messageEvent: NostrEvent = {
      kind: 14,
      content,
      tags: [
        ['g', group.id], // 群组标识
        ...group.members.map(m => ['p', m])
      ],
      created_at: Math.floor(Date.now() / 1000),
      pubkey: this.publicKey
    }

    // 为每个成员单独 Gift-Wrap
    const sendPromises = group.members
      .filter(m => m !== this.publicKey)
      .map(async (member) => {
        const wrapped = await NIP59.createGiftWrap(
          messageEvent,
          this.privateKey,
          member
        )
        return this.publishToRelays(wrapped)
      })

    await Promise.all(sendPromises)

    return {
      id: messageEvent.id,
      groupId: group.id,
      content,
      sender: this.publicKey,
      createdAt: messageEvent.created_at
    }
  }

  // 邀请新成员
  async inviteMember(group: PrivateGroup, newMember: string): Promise<void> {
    if (!group.admins.includes(this.publicKey)) {
      throw new Error('Only admins can invite members')
    }

    group.members.push(newMember)
    await this.sendGroupInvite(newMember, group)

    // 通知现有成员
    await this.broadcastMemberChange(group, 'add', newMember)
  }

  // 移除成员
  async removeMember(group: PrivateGroup, member: string): Promise<void> {
    if (!group.admins.includes(this.publicKey)) {
      throw new Error('Only admins can remove members')
    }

    group.members = group.members.filter(m => m !== member)
    await this.broadcastMemberChange(group, 'remove', member)
  }
}
```

#### NIP-29 中继群组

```typescript
// lib/chat/relayGroup.ts

export interface RelayGroup {
  id: string                // 群组ID (由中继分配)
  relay: string             // 群组所在中继
  name: string
  picture?: string
  about?: string
  isPublic: boolean         // 公开群 vs 封闭群
  admins: string[]
  members?: string[]        // 封闭群才有成员列表
}

export class RelayGroupService {
  // 创建群组 (NIP-29)
  async createGroup(
    relay: string,
    name: string,
    isPublic: boolean
  ): Promise<RelayGroup> {
    // kind: 9007 - 群组创建请求
    const event: NostrEvent = {
      kind: 9007,
      content: '',
      tags: [
        ['name', name],
        ['public', isPublic ? 'true' : 'false']
      ],
      created_at: Math.floor(Date.now() / 1000),
      pubkey: this.publicKey
    }

    const response = await this.sendToRelay(relay, event)
    return this.parseGroupResponse(response)
  }

  // 发送群消息 (kind: 9)
  async sendMessage(group: RelayGroup, content: string): Promise<void> {
    const event: NostrEvent = {
      kind: 9,
      content,
      tags: [
        ['h', group.id] // 群组标识
      ],
      created_at: Math.floor(Date.now() / 1000),
      pubkey: this.publicKey
    }

    await this.sendToRelay(group.relay, event)
  }

  // 订阅群消息
  subscribeGroupMessages(
    group: RelayGroup,
    onMessage: (msg: GroupMessage) => void
  ): () => void {
    const filter = {
      kinds: [9],
      '#h': [group.id]
    }

    return this.subscribeToRelay(group.relay, filter, onMessage)
  }

  // 管理成员 (仅管理员)
  async addMember(group: RelayGroup, member: string): Promise<void> {
    // kind: 9000 - 添加成员
    const event: NostrEvent = {
      kind: 9000,
      content: '',
      tags: [
        ['h', group.id],
        ['p', member]
      ],
      created_at: Math.floor(Date.now() / 1000),
      pubkey: this.publicKey
    }

    await this.sendToRelay(group.relay, event)
  }

  async removeMember(group: RelayGroup, member: string): Promise<void> {
    // kind: 9001 - 移除成员
    const event: NostrEvent = {
      kind: 9001,
      content: '',
      tags: [
        ['h', group.id],
        ['p', member]
      ],
      created_at: Math.floor(Date.now() / 1000),
      pubkey: this.publicKey
    }

    await this.sendToRelay(group.relay, event)
  }
}
```

### 4.3 公开频道 (NIP-28)

```typescript
// lib/chat/channel.ts

export interface Channel {
  id: string              // 创建事件ID
  name: string
  about?: string
  picture?: string
  creator: string
  relays: string[]
}

export interface ChannelMessage {
  id: string
  channelId: string
  content: string
  sender: string
  createdAt: number
  replyTo?: string
}

export class ChannelService {
  // 创建频道 (kind: 40)
  async createChannel(
    name: string,
    about?: string,
    picture?: string
  ): Promise<Channel> {
    const metadata = {
      name,
      about,
      picture
    }

    const event: NostrEvent = {
      kind: 40,
      content: JSON.stringify(metadata),
      tags: [],
      created_at: Math.floor(Date.now() / 1000),
      pubkey: this.publicKey
    }

    const signedEvent = finalizeEvent(event, this.privateKey)
    await this.publishToRelays(signedEvent)

    return {
      id: signedEvent.id,
      name,
      about,
      picture,
      creator: this.publicKey,
      relays: this.relays
    }
  }

  // 发送频道消息 (kind: 42)
  async sendChannelMessage(
    channel: Channel,
    content: string,
    replyTo?: string
  ): Promise<ChannelMessage> {
    const event: NostrEvent = {
      kind: 42,
      content,
      tags: [
        ['e', channel.id, this.relays[0], 'root'],
        ...(replyTo ? [['e', replyTo, '', 'reply']] : [])
      ],
      created_at: Math.floor(Date.now() / 1000),
      pubkey: this.publicKey
    }

    const signedEvent = finalizeEvent(event, this.privateKey)
    await this.publishToRelays(signedEvent)

    // 公开频道消息上链
    await this.storeOnOPCAT(signedEvent)

    return {
      id: signedEvent.id,
      channelId: channel.id,
      content,
      sender: this.publicKey,
      createdAt: event.created_at,
      replyTo
    }
  }

  // 搜索频道
  async searchChannels(query: string): Promise<Channel[]> {
    const filter = {
      kinds: [40],
      search: query
    }

    const events = await this.queryRelays(filter)
    return events.map(this.parseChannelEvent)
  }

  // 订阅频道消息
  subscribeChannelMessages(
    channel: Channel,
    onMessage: (msg: ChannelMessage) => void
  ): () => void {
    const filter = {
      kinds: [42],
      '#e': [channel.id]
    }

    return this.subscribe(filter, (event) => {
      onMessage(this.parseMessageEvent(event, channel.id))
    })
  }
}
```

---

## 五、OP_CAT Layer 集成

### 5.1 消息存证合约

```typescript
// contracts/ChatMessage.ts
import {
  SmartContract,
  method,
  prop,
  assert,
  ByteString,
  PubKey,
  Sig,
  hash256
} from 'scrypt-ts'

export class ChatMessageContract extends SmartContract {
  @prop()
  messageHash: ByteString     // 消息内容哈希

  @prop()
  sender: PubKey              // 发送者公钥

  @prop()
  messageType: bigint         // 1=私聊, 2=群聊, 3=频道

  @prop()
  timestamp: bigint           // 时间戳

  @prop()
  nostrEventId: ByteString    // 关联的 Nostr 事件 ID

  constructor(
    messageHash: ByteString,
    sender: PubKey,
    messageType: bigint,
    timestamp: bigint,
    nostrEventId: ByteString
  ) {
    super(...arguments)
    this.messageHash = messageHash
    this.sender = sender
    this.messageType = messageType
    this.timestamp = timestamp
    this.nostrEventId = nostrEventId
  }

  @method()
  public verify(sig: Sig, message: ByteString) {
    // 验证消息哈希
    assert(hash256(message) === this.messageHash, 'Invalid message hash')
    // 验证签名
    assert(this.checkSig(sig, this.sender), 'Invalid signature')
  }
}
```

### 5.2 群组管理合约

```typescript
// contracts/GroupManagement.ts
import {
  SmartContract,
  method,
  prop,
  assert,
  ByteString,
  PubKey,
  Sig,
  FixedArray
} from 'scrypt-ts'

export class GroupContract extends SmartContract {
  static readonly MAX_MEMBERS = 100

  @prop()
  groupId: ByteString

  @prop()
  groupName: ByteString

  @prop()
  creator: PubKey

  @prop(true)
  adminCount: bigint

  @prop(true)
  memberCount: bigint

  // 使用 hash 存储成员列表 (链下维护完整列表)
  @prop(true)
  membersHash: ByteString

  constructor(
    groupId: ByteString,
    groupName: ByteString,
    creator: PubKey
  ) {
    super(...arguments)
    this.groupId = groupId
    this.groupName = groupName
    this.creator = creator
    this.adminCount = 1n
    this.memberCount = 1n
    this.membersHash = hash256(creator)
  }

  @method()
  public addMember(
    newMember: PubKey,
    currentMembersHash: ByteString,
    adminSig: Sig,
    adminPubKey: PubKey
  ) {
    // 验证当前成员列表哈希
    assert(this.membersHash === currentMembersHash, 'Invalid members hash')

    // 验证管理员签名
    assert(this.checkSig(adminSig, adminPubKey), 'Invalid admin signature')

    // 更新成员列表哈希
    this.membersHash = hash256(currentMembersHash + newMember)
    this.memberCount++

    // 验证输出
    assert(this.ctx.hashOutputs === hash256(this.buildStateOutput(this.ctx.utxo.value)))
  }

  @method()
  public removeMember(
    member: PubKey,
    newMembersHash: ByteString,
    adminSig: Sig,
    adminPubKey: PubKey
  ) {
    // 验证管理员签名
    assert(this.checkSig(adminSig, adminPubKey), 'Invalid admin signature')

    // 更新成员列表哈希 (链下计算新哈希)
    this.membersHash = newMembersHash
    this.memberCount--

    assert(this.ctx.hashOutputs === hash256(this.buildStateOutput(this.ctx.utxo.value)))
  }
}
```

### 5.3 打赏合约

```typescript
// contracts/Tip.ts
import {
  SmartContract,
  method,
  prop,
  assert,
  ByteString,
  PubKey,
  Sig
} from 'scrypt-ts'

export class TipContract extends SmartContract {
  @prop()
  sender: PubKey

  @prop()
  recipient: PubKey

  @prop()
  amount: bigint

  @prop()
  tokenId: ByteString         // CAT20 代币 ID

  @prop()
  targetEventId: ByteString   // 被打赏的 Nostr 事件

  @prop()
  message: ByteString         // 打赏留言

  constructor(
    sender: PubKey,
    recipient: PubKey,
    amount: bigint,
    tokenId: ByteString,
    targetEventId: ByteString,
    message: ByteString
  ) {
    super(...arguments)
    this.sender = sender
    this.recipient = recipient
    this.amount = amount
    this.tokenId = tokenId
    this.targetEventId = targetEventId
    this.message = message
  }

  @method()
  public claim(recipientSig: Sig) {
    // 验证接收者签名
    assert(this.checkSig(recipientSig, this.recipient), 'Invalid recipient signature')
  }
}
```

---

## 六、数据库设计

### 6.1 聊天相关表

```sql
-- 会话表 (私聊/群聊统一)
CREATE TABLE conversations (
    id VARCHAR(64) PRIMARY KEY,
    type VARCHAR(20) NOT NULL,          -- 'dm', 'private_group', 'relay_group', 'channel'
    name VARCHAR(100),
    picture TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    last_message_id VARCHAR(64),
    unread_count INTEGER DEFAULT 0
);

-- 会话成员表
CREATE TABLE conversation_members (
    conversation_id VARCHAR(64) NOT NULL,
    pubkey VARCHAR(64) NOT NULL,
    role VARCHAR(20) DEFAULT 'member',  -- 'creator', 'admin', 'member'
    joined_at BIGINT NOT NULL,
    PRIMARY KEY (conversation_id, pubkey)
);

-- 消息表
CREATE TABLE messages (
    id VARCHAR(64) PRIMARY KEY,
    conversation_id VARCHAR(64) NOT NULL,
    sender VARCHAR(64) NOT NULL,
    content TEXT,                        -- 加密内容或明文
    content_type VARCHAR(20) DEFAULT 'text',  -- 'text', 'image', 'video', 'file'
    reply_to VARCHAR(64),
    created_at BIGINT NOT NULL,

    -- 状态
    status VARCHAR(20) DEFAULT 'sent',   -- 'sending', 'sent', 'delivered', 'read'

    -- OP_CAT 链上存证
    opcat_txid VARCHAR(64),
    opcat_block INTEGER,

    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender);

-- 消息已读状态表
CREATE TABLE message_reads (
    message_id VARCHAR(64) NOT NULL,
    reader VARCHAR(64) NOT NULL,
    read_at BIGINT NOT NULL,
    PRIMARY KEY (message_id, reader)
);

-- 打赏记录表
CREATE TABLE tips (
    id VARCHAR(64) PRIMARY KEY,
    sender VARCHAR(64) NOT NULL,
    recipient VARCHAR(64) NOT NULL,
    amount BIGINT NOT NULL,
    token_id VARCHAR(64) NOT NULL,
    target_type VARCHAR(20) NOT NULL,   -- 'note', 'message', 'profile'
    target_id VARCHAR(64) NOT NULL,
    message TEXT,
    opcat_txid VARCHAR(64) NOT NULL,
    created_at BIGINT NOT NULL
);

CREATE INDEX idx_tips_recipient ON tips(recipient);
CREATE INDEX idx_tips_target ON tips(target_type, target_id);
```

---

## 七、开发计划

### 7.1 总体时间线

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        NoStrCat 开发计划 (28周)                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Phase 1: 基础架构 (4周)                                                │
│  ════════════════════                                                   │
│  Week 1-2: 项目初始化                                                   │
│    • Fork Primal 三端代码                                               │
│    • Fork 0xchat-core                                                   │
│    • 搭建 monorepo 结构                                                 │
│    • 配置 CI/CD                                                         │
│                                                                         │
│  Week 3-4: 后端服务                                                     │
│    • 部署缓存服务器                                                     │
│    • 配置 PostgreSQL + Redis                                            │
│    • 实现基础 WebSocket API                                             │
│                                                                         │
│  Phase 2: 聊天功能 (8周)                                                │
│  ════════════════════                                                   │
│  Week 5-6: 私聊基础                                                     │
│    • 移植 NIP-44 加密模块                                               │
│    • 移植 NIP-59 Gift-Wrap                                              │
│    • 实现私聊 API                                                       │
│                                                                         │
│  Week 7-8: 私聊 UI                                                      │
│    • 会话列表                                                           │
│    • 聊天界面                                                           │
│    • 消息状态                                                           │
│                                                                         │
│  Week 9-10: 群聊功能                                                    │
│    • 私有群聊实现                                                       │
│    • 群组管理 (创建/邀请/踢出)                                          │
│    • NIP-29 中继群组                                                    │
│                                                                         │
│  Week 11-12: 公开频道                                                   │
│    • NIP-28 频道实现                                                    │
│    • 频道搜索                                                           │
│    • 频道消息                                                           │
│                                                                         │
│  Phase 3: OP_CAT 集成 (6周)                                             │
│  ══════════════════════════                                             │
│  Week 13-14: 链上存储                                                   │
│    • 消息存证合约                                                       │
│    • 链上发布 SDK                                                       │
│    • 索引服务                                                           │
│                                                                         │
│  Week 15-16: 群组合约                                                   │
│    • 群组管理合约                                                       │
│    • 成员变更上链                                                       │
│                                                                         │
│  Week 17-18: 钱包与打赏                                                 │
│    • OP_CAT 钱包模块                                                    │
│    • CAT20 打赏功能                                                     │
│    • 交易历史                                                           │
│                                                                         │
│  Phase 4: 多端开发 (6周)                                                │
│  ════════════════════════                                               │
│  Week 19-21: iOS App                                                    │
│    • Swift 聊天模块                                                     │
│    • 钱包集成                                                           │
│    • UI 优化                                                            │
│                                                                         │
│  Week 22-24: Android App                                                │
│    • Kotlin 聊天模块                                                    │
│    • 钱包集成                                                           │
│    • UI 优化                                                            │
│                                                                         │
│  Phase 5: 测试与发布 (4周)                                              │
│  ══════════════════════════                                             │
│  Week 25-26: 测试                                                       │
│    • 功能测试                                                           │
│    • 安全审计                                                           │
│    • 性能优化                                                           │
│                                                                         │
│  Week 27-28: 发布                                                       │
│    • Beta 测试                                                          │
│    • 应用商店审核                                                       │
│    • 正式发布                                                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 里程碑

| 里程碑 | 时间 | 交付物 |
|--------|------|--------|
| M1: 项目启动 | Week 2 | 代码仓库、开发环境 |
| M2: 后端就绪 | Week 4 | 缓存服务、API |
| M3: 私聊完成 | Week 8 | Web 端私聊功能 |
| M4: 群聊完成 | Week 12 | 群聊、频道功能 |
| M5: 链上集成 | Week 18 | OP_CAT 全功能 |
| M6: 三端完成 | Week 24 | iOS、Android 应用 |
| M7: 正式发布 | Week 28 | 上线运营 |

---

## 八、项目结构

```
NoStrCat/
├── apps/
│   ├── web/                        # Web 应用 (SolidJS)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── feed/           # 社交模块 (Primal)
│   │   │   │   ├── chat/           # 聊天模块 (0xchat)
│   │   │   │   │   ├── DirectMessage/
│   │   │   │   │   ├── GroupChat/
│   │   │   │   │   ├── Channel/
│   │   │   │   │   └── MessageInput/
│   │   │   │   ├── wallet/         # 钱包模块 (OP_CAT)
│   │   │   │   └── common/
│   │   │   ├── lib/
│   │   │   │   ├── nostr/          # Nostr 协议
│   │   │   │   ├── chat/           # 聊天核心
│   │   │   │   │   ├── nip44.ts
│   │   │   │   │   ├── nip59.ts
│   │   │   │   │   ├── directMessage.ts
│   │   │   │   │   ├── privateGroup.ts
│   │   │   │   │   ├── relayGroup.ts
│   │   │   │   │   └── channel.ts
│   │   │   │   ├── opcat/          # OP_CAT 集成
│   │   │   │   └── wallet/         # 钱包
│   │   │   ├── stores/
│   │   │   └── pages/
│   │   └── package.json
│   │
│   ├── ios/                        # iOS 应用 (Swift)
│   │   ├── NoStrCat/
│   │   │   ├── Features/
│   │   │   │   ├── Feed/
│   │   │   │   ├── Chat/
│   │   │   │   └── Wallet/
│   │   │   ├── Core/
│   │   │   │   ├── Nostr/
│   │   │   │   ├── Crypto/
│   │   │   │   └── OPCAT/
│   │   │   └── UI/
│   │   └── NoStrCat.xcodeproj
│   │
│   └── android/                    # Android 应用 (Kotlin)
│       ├── app/
│       ├── core/
│       ├── feature-feed/
│       ├── feature-chat/
│       └── feature-wallet/
│
├── packages/
│   ├── nostr-sdk/                  # Nostr 协议 SDK
│   ├── chat-core/                  # 聊天核心 (从 0xchat 移植)
│   ├── opcat-sdk/                  # OP_CAT SDK
│   └── wallet-sdk/                 # 钱包 SDK
│
├── server/
│   ├── cache-server/               # 缓存服务 (Julia)
│   ├── media-server/               # 媒体服务
│   └── indexer/                    # 链上索引
│
├── contracts/
│   ├── ChatMessage.ts              # 消息存证
│   ├── GroupManagement.ts          # 群组管理
│   └── Tip.ts                      # 打赏
│
├── docs/
│   ├── TECHNICAL_PLAN.md           # 本文档
│   ├── API.md
│   └── DEPLOYMENT.md
│
└── README.md
```

---

## 九、立即开始

### 第一步: Fork 代码仓库

```bash
# 创建项目目录
mkdir -p NoStrCat/{apps,packages,server,contracts,docs}
cd NoStrCat

# Fork Primal
git clone https://github.com/PrimalHQ/primal-web-app.git apps/web
git clone https://github.com/PrimalHQ/primal-ios-app.git apps/ios
git clone https://github.com/PrimalHQ/primal-android-app.git apps/android

# Fork 0xchat-core (聊天核心)
git clone https://github.com/0xchat-app/0xchat-core.git packages/chat-core-reference

# Fork Primal Server
git clone https://github.com/PrimalHQ/primal-server.git server/cache-server
```

### 第二步: 移除 Lightning，添加 OP_CAT

```bash
# Web 应用中移除 Lightning 相关代码
# 搜索并替换 lightning, bolt11, lnurl 相关引用
```

### 第三步: 移植聊天模块

```bash
# 从 0xchat-core 提取 NIP-44, NIP-59 实现
# 用 TypeScript 重写到 packages/chat-core/
```

---

*文档版本: 2.0*
*最后更新: 2026-01-31*
*架构: Primal + 0xchat-core 混合方案*
