# NoStrCat

去中心化社交平台，结合 Nostr 协议与 OP_CAT Layer 区块链技术。

## 项目概述

NoStrCat 旨在弥补 Nostr 协议的不足，使用 OP_CAT Layer 替代闪电网络实现支付功能，提供：

- **私聊**：端到端加密的一对一消息
- **群聊**：多人加密群组通信
- **推特/Feed**：公开帖子、关注、转发、点赞

## 项目结构

```
NoStrCat/
├── src/
│   └── contracts/           # 智能合约
│       ├── core/            # 核心合约
│       │   ├── ZapContract.ts           # 支付/打赏
│       │   ├── IdentityContract.ts      # 身份/声誉
│       │   ├── ContentAnchorContract.ts # 内容锚定
│       │   └── AntiSpamContract.ts      # 防垃圾
│       └── social/          # 社交合约
│           ├── GroupContract.ts         # 群组管理
│           └── SubscriptionContract.ts  # 订阅系统
├── packages/
│   └── nostrcat-core/       # 共享核心库
│       └── src/
│           ├── client/      # 客户端连接
│           ├── crypto/      # 加密功能
│           ├── events/      # 事件处理
│           └── utils/       # 工具函数
├── tests/                   # 测试文件
└── docs/                    # 文档
```

## 智能合约

### ZapContract - 链上打赏

替代 NIP-57 闪电网络 Zaps，实现原生链上微支付：

```typescript
// 创建打赏
const zap = new ZapContract(
  recipientPubKey,
  senderPubKey,
  eventId,      // 被打赏的 Nostr 事件
  memoHash,     // 留言
  refundTimeout,
  minAmount
)

// 收款人领取
await zap.methods.claim(signature)
```

### IdentityContract - 身份管理

链上身份验证和声誉系统：

```typescript
const identity = new IdentityContract(
  nostrPubKey,
  recoveryPubKey,
  createdAt,
  profileMetadataHash
)

// 更新资料
await identity.methods.updateProfile(newMetadataHash, sig)

// 记录打赏增加声誉
await identity.methods.recordZap(zapAmount, sig)
```

### GroupContract - 群组管理

去中心化群组的链上治理：

```typescript
const group = new GroupContract(
  ownerPubKey,
  groupId,
  metadataHash,
  admins,
  membershipFee,  // 入群费
  isPublic
)

// 加入群组
await group.methods.join(memberPubKey, sig)
```

## 快速开始

### 安装依赖

```bash
npm install
```

### 编译合约

```bash
npm run build:contracts
```

### 运行测试

```bash
npm test
```

### 使用核心库

```typescript
import { NostrCatClient } from '@nostrcat/core'

// 创建客户端
const client = new NostrCatClient({
  relays: [{ url: 'wss://relay.damus.io' }],
  opcatNetwork: 'testnet',
})

// 登录
client.login(privateKey)

// 发布帖子
await client.postNote('Hello NoStrCat!')

// 发送打赏
await client.sendZap(recipientPubkey, 1000n, eventId, 'Great post!')
```

## 技术架构

### 数据流

```
用户操作 → Nostr 中继（链下消息）
         → OP_CAT Layer（链上交易）

- 普通消息：通过 Nostr 中继传输
- 支付交易：通过 OP_CAT Layer 执行
- 重要内容：可选锚定到链上
```

### 与闪电网络对比

| 方面 | 闪电网络 | OP_CAT Layer |
|-----|---------|--------------|
| 设置复杂度 | 高（通道管理） | 低（标准钱包） |
| 支付限制 | 受通道容量限制 | 无实际限制 |
| 可编程性 | 有限（仅 HTLC） | 完整智能合约 |
| 链上验证 | 需关闭通道 | 原生支持 |

## 协议扩展

NoStrCat 定义了新的 Nostr 事件类型（NIP-CAT）：

- `Kind 30078`: OP_CAT 链上引用
- `Kind 30079`: 内容锚点
- `Kind 30080`: OP_CAT Zap 收据
- `Kind 30081`: 身份验证
- `Kind 30082`: 群组注册

## 开发路线图

### 第一阶段：基础架构
- [x] 智能合约开发
- [x] 核心库框架
- [ ] 基础 Web 应用

### 第二阶段：支付与验证
- [ ] 钱包集成
- [ ] 打赏功能
- [ ] 内容锚定

### 第三阶段：聊天功能
- [ ] 私信（NIP-17）
- [ ] 群组（MLS）

### 第四阶段：移动端
- [ ] React Native 应用
- [ ] 推送通知

## 知识库

本项目基于 OP_CAT Layer 知识库开发，详见 `CLAUDE.md`

## 许可证

MIT License
