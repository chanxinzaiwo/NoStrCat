# NoStrCat

## 项目简介

基础智能合约项目

**项目类型**: 基础项目
**核心功能**: 智能合约, sCrypt

## 知识库引用

> **重要**: 本项目基于 OP_CAT Layer 知识库开发
>
> 知识库路径: `C:\ClaudeProjects\OP_CAT Layer`

### 开发前必读

在编写代码前，请先阅读以下文档：

#### 1. 基础概念
- `C:\ClaudeProjects\OP_CAT Layer\docs\01-overview.md` - OP_CAT Layer 概览
- `C:\ClaudeProjects\OP_CAT Layer\docs\02-architecture.md` - 技术架构

#### 2. 智能合约开发
- `C:\ClaudeProjects\OP_CAT Layer\docs\07-scrypt-guide.md` - sCrypt 语法指南
- `C:\ClaudeProjects\OP_CAT Layer\docs\08-scrypt-examples.md` - 合约示例代码

#### 3. 专项文档



- `C:\ClaudeProjects\OP_CAT Layer\docs\09-scrypt-blog-articles.md` - 技术文章精选

### 示例合约参考

```
C:\ClaudeProjects\OP_CAT Layer\examples\contracts\
├── helloWorld.ts      # 入门示例
├── counter.ts         # 有状态合约
├── p2pkh.ts           # P2PKH 支付
├── auction.ts         # 拍卖合约
├── crowdfund.ts       # 众筹合约
├── atomicSwap.ts      # 原子交换
├── multiSig.ts        # 多重签名
├── lottery.ts         # 彩票合约
├── voting.ts          # 投票合约
└── rockPaperScissors.ts  # 游戏合约
```

## 技术栈

- **区块链**: OP_CAT Layer
- **智能合约**: sCrypt (TypeScript)
- **代币标准**: CAT20 / CAT721

## 开发规范

1. 所有合约继承自 `SmartContract`
2. 使用 `@prop()` 声明属性，`@prop(true)` 声明可变状态
3. 使用 `@method()` 声明公共方法
4. 状态变更需验证 `this.ctx.hashOutputs`
5. 参考知识库示例代码风格

## 项目结构

```
NoStrCat/
├── CLAUDE.md           # Claude 配置（本文件）
├── src/
│   └── contracts/      # 智能合约
├── tests/              # 测试文件
├── artifacts/          # 编译输出
└── package.json
```

## 常用命令

```bash
# 安装依赖
npm install

# 编译合约
npx scrypt-cli compile

# 运行测试
npm test

# 部署合约
npx tsx deploy.ts
```

## 开发任务

- [ ] 设计合约架构
- [ ] 实现核心合约
- [ ] 编写测试用例
- [ ] 部署到测试网
- [ ] 集成前端

---

*本项目使用 OP_CAT Layer 知识库初始化*
