'use client'

import { useState } from 'react'
import { useUserStore } from '@/stores/userStore'

interface Transaction {
  id: string
  type: 'send' | 'receive' | 'zap_sent' | 'zap_received'
  amount: number
  counterparty: string
  counterpartyName?: string
  memo?: string
  eventId?: string
  timestamp: number
  status: 'confirmed' | 'pending'
  txid?: string
}

// 模拟交易记录
const mockTransactions: Transaction[] = [
  {
    id: '1',
    type: 'zap_received',
    amount: 1000,
    counterparty: 'abc123',
    counterpartyName: '张三',
    memo: '写得太好了！',
    eventId: 'event1',
    timestamp: Date.now() - 3600000,
    status: 'confirmed',
    txid: 'tx123abc',
  },
  {
    id: '2',
    type: 'zap_sent',
    amount: 500,
    counterparty: 'def456',
    counterpartyName: '李四',
    memo: '感谢分享',
    eventId: 'event2',
    timestamp: Date.now() - 7200000,
    status: 'confirmed',
    txid: 'tx456def',
  },
  {
    id: '3',
    type: 'receive',
    amount: 10000,
    counterparty: 'ghi789',
    timestamp: Date.now() - 86400000,
    status: 'confirmed',
    txid: 'tx789ghi',
  },
]

export default function WalletPage() {
  const { isLoggedIn, publicKey } = useUserStore()
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'contracts'>('overview')
  const [showSendModal, setShowSendModal] = useState(false)
  const [showReceiveModal, setShowReceiveModal] = useState(false)

  // 钱包功能暂时禁用
  const isInstalled = false
  const isConnected = false
  const address = publicKey || ''

  // 使用模拟数据
  const walletData = {
    balance: 0,
    pendingBalance: 0,
    totalReceived: 250000,
    totalSent: 125000,
    totalZapsReceived: 50000,
    totalZapsSent: 15000,
  }

  // 未连接钱包时显示连接界面
  if (!isConnected) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="card text-center py-16">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-primary-500/20 flex items-center justify-center">
            <span className="text-4xl">W</span>
          </div>
          <h2 className="text-2xl font-bold mb-2">OP_CAT 钱包</h2>
          <p className="text-dark-400 mb-6">
            钱包功能即将上线
          </p>
          <p className="text-dark-500 text-sm mt-4">
            <a
              href="https://github.com/OPCAT-Labs/wallet-extension/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-400 hover:underline"
            >
              了解 OP_CAT 钱包
            </a>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* 余额卡片 */}
      <div className="card bg-gradient-to-br from-primary-600 to-primary-800 text-white mb-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-primary-200 text-sm">可用余额</p>
            <h1 className="text-4xl font-bold mt-1">
              {walletData.balance.toLocaleString()}
              <span className="text-lg ml-2">sats</span>
            </h1>
            <p className="text-primary-200 text-sm mt-1">
              ≈ ${(walletData.balance * 0.00043).toFixed(2)} USD
            </p>
          </div>
          <div className="text-right">
            <p className="text-primary-200 text-sm">OP_CAT Layer</p>
            <p className="text-xs font-mono mt-1">
              {address?.slice(0, 8)}...{address?.slice(-4)}
            </p>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex space-x-3">
          <button
            onClick={() => setShowSendModal(true)}
            className="flex-1 btn bg-white/20 hover:bg-white/30 text-white"
          >
            <svg className="w-5 h-5 mr-2 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            发送
          </button>
          <button
            onClick={() => setShowReceiveModal(true)}
            className="flex-1 btn bg-white/20 hover:bg-white/30 text-white"
          >
            <svg className="w-5 h-5 mr-2 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            接收
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card">
          <p className="text-dark-400 text-sm">总收入</p>
          <p className="text-xl font-bold text-green-400 mt-1">
            +{(walletData.totalReceived / 1000).toFixed(1)}K
          </p>
        </div>
        <div className="card">
          <p className="text-dark-400 text-sm">总支出</p>
          <p className="text-xl font-bold text-red-400 mt-1">
            -{(walletData.totalSent / 1000).toFixed(1)}K
          </p>
        </div>
        <div className="card">
          <p className="text-dark-400 text-sm">收到打赏</p>
          <p className="text-xl font-bold text-yellow-400 mt-1">
            ⚡{(walletData.totalZapsReceived / 1000).toFixed(1)}K
          </p>
        </div>
        <div className="card">
          <p className="text-dark-400 text-sm">发出打赏</p>
          <p className="text-xl font-bold text-yellow-400 mt-1">
            ⚡{(walletData.totalZapsSent / 1000).toFixed(1)}K
          </p>
        </div>
      </div>

      {/* 标签切换 */}
      <div className="flex border-b border-dark-800 mb-4">
        {[
          { key: 'overview', label: '概览' },
          { key: 'transactions', label: '交易记录' },
          { key: 'contracts', label: '智能合约' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'text-primary-400 border-b-2 border-primary-400'
                : 'text-dark-400 hover:text-dark-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold">最近交易</h2>
          {mockTransactions.slice(0, 3).map((tx) => (
            <TransactionItem key={tx.id} transaction={tx} />
          ))}
        </div>
      )}

      {activeTab === 'transactions' && (
        <div className="space-y-2">
          {mockTransactions.map((tx) => (
            <TransactionItem key={tx.id} transaction={tx} />
          ))}
        </div>
      )}

      {activeTab === 'contracts' && (
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-bold mb-2">身份合约</h3>
            <p className="text-dark-400 text-sm mb-3">
              管理您的链上身份和声誉
            </p>
            <div className="flex items-center justify-between">
              <span className="text-green-400 text-sm">● 已部署</span>
              <button className="btn btn-secondary text-sm">查看详情</button>
            </div>
          </div>

          <div className="card">
            <h3 className="font-bold mb-2">防垃圾合约</h3>
            <p className="text-dark-400 text-sm mb-3">
              质押 sats 获取发帖配额
            </p>
            <div className="flex items-center justify-between">
              <span className="text-dark-400 text-sm">○ 未部署</span>
              <button className="btn btn-primary text-sm">部署合约</button>
            </div>
          </div>
        </div>
      )}

      {/* 发送弹窗 */}
      {showSendModal && (
        <SendModal onClose={() => setShowSendModal(false)} />
      )}

      {/* 接收弹窗 */}
      {showReceiveModal && (
        <ReceiveModal
          address={address || ''}
          onClose={() => setShowReceiveModal(false)}
        />
      )}
    </div>
  )
}

function TransactionItem({ transaction }: { transaction: Transaction }) {
  const isIncoming = transaction.type === 'receive' || transaction.type === 'zap_received'

  const getIcon = () => {
    switch (transaction.type) {
      case 'zap_sent':
      case 'zap_received':
        return '⚡'
      default:
        return isIncoming ? '↓' : '↑'
    }
  }

  const getTypeLabel = () => {
    switch (transaction.type) {
      case 'zap_sent':
        return '发出打赏'
      case 'zap_received':
        return '收到打赏'
      case 'send':
        return '发送'
      case 'receive':
        return '接收'
    }
  }

  return (
    <div className="card flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
          isIncoming ? 'bg-green-500/20' : 'bg-red-500/20'
        }`}>
          <span className="text-lg">{getIcon()}</span>
        </div>
        <div>
          <p className="font-medium">
            {getTypeLabel()}
            {transaction.counterpartyName && ` - ${transaction.counterpartyName}`}
          </p>
          {transaction.memo && (
            <p className="text-dark-400 text-sm">{transaction.memo}</p>
          )}
          <p className="text-dark-500 text-xs">
            {new Date(transaction.timestamp).toLocaleString()}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className={`font-bold ${isIncoming ? 'text-green-400' : 'text-red-400'}`}>
          {isIncoming ? '+' : '-'}{transaction.amount.toLocaleString()} sats
        </p>
        <p className={`text-xs ${
          transaction.status === 'confirmed' ? 'text-green-400' : 'text-yellow-400'
        }`}>
          {transaction.status === 'confirmed' ? '已确认' : '待确认'}
        </p>
      </div>
    </div>
  )
}

function SendModal({ onClose }: { onClose: () => void }) {
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card w-full max-w-md mx-4 bg-dark-900">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">发送</h2>
          <button onClick={onClose} className="text-dark-400 hover:text-dark-200">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-dark-400 mb-2">接收地址</label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="npub... 或 地址"
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm text-dark-400 mb-2">金额 (sats)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="input"
            />
          </div>
          <button className="btn btn-primary w-full">
            发送
          </button>
        </div>
      </div>
    </div>
  )
}

function ReceiveModal({ address, onClose }: { address: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card w-full max-w-md mx-4 bg-dark-900">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">接收</h2>
          <button onClick={onClose} className="text-dark-400 hover:text-dark-200">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="text-center">
          {/* QR Code 占位 */}
          <div className="w-48 h-48 mx-auto bg-white rounded-lg flex items-center justify-center mb-4">
            <span className="text-dark-900 text-sm">QR Code</span>
          </div>

          <p className="text-dark-400 text-sm mb-2">您的地址</p>
          <p className="font-mono text-sm bg-dark-800 p-3 rounded-lg break-all">
            {address}
          </p>

          <button
            onClick={() => navigator.clipboard.writeText(address)}
            className="btn btn-secondary w-full mt-4"
          >
            复制地址
          </button>
        </div>
      </div>
    </div>
  )
}
