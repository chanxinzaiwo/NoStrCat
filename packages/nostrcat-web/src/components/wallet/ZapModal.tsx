'use client'

import { useState } from 'react'
import { useUserStore } from '@/stores/userStore'

interface ZapModalProps {
  recipientPubkey: string
  eventId?: string
  recipientName?: string
  onClose: () => void
  onSuccess?: (amount: number) => void
}

const PRESET_AMOUNTS = [21, 100, 500, 1000, 5000, 10000]

export function ZapModal({
  recipientPubkey,
  eventId,
  recipientName,
  onClose,
  onSuccess,
}: ZapModalProps) {
  const [amount, setAmount] = useState(100)
  const [customAmount, setCustomAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')
  const { isLoggedIn } = useUserStore()

  const handleAmountSelect = (value: number) => {
    setAmount(value)
    setCustomAmount('')
  }

  const handleCustomAmountChange = (value: string) => {
    const num = parseInt(value, 10)
    if (!isNaN(num) && num > 0) {
      setAmount(num)
    }
    setCustomAmount(value)
  }

  const handleSendZap = async () => {
    if (!isLoggedIn) {
      setError('请先登录')
      return
    }

    if (amount < 21) {
      setError('最小打赏金额为 21 sats')
      return
    }

    setIsProcessing(true)
    setError('')

    try {
      // TODO: 调用 OP_CAT Layer 发送打赏
      console.log('Sending zap:', {
        recipient: recipientPubkey,
        amount,
        eventId,
        memo,
      })

      // 模拟交易
      await new Promise(resolve => setTimeout(resolve, 2000))

      onSuccess?.(amount)
      onClose()
    } catch (e) {
      setError('发送失败，请重试')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card w-full max-w-md mx-4 bg-dark-900">
        {/* 标题 */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold flex items-center">
            <span className="text-yellow-400 mr-2">⚡</span>
            发送打赏
          </h2>
          <button
            onClick={onClose}
            className="text-dark-400 hover:text-dark-200"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 收款人 */}
        <div className="mb-4">
          <p className="text-dark-400 text-sm mb-1">打赏给</p>
          <p className="font-medium">
            {recipientName || `${recipientPubkey.slice(0, 8)}...${recipientPubkey.slice(-4)}`}
          </p>
        </div>

        {/* 预设金额 */}
        <div className="mb-4">
          <p className="text-dark-400 text-sm mb-2">选择金额 (sats)</p>
          <div className="grid grid-cols-3 gap-2">
            {PRESET_AMOUNTS.map((value) => (
              <button
                key={value}
                onClick={() => handleAmountSelect(value)}
                className={`py-2 px-4 rounded-lg font-medium transition-colors ${
                  amount === value && !customAmount
                    ? 'bg-yellow-500 text-dark-900'
                    : 'bg-dark-800 text-dark-200 hover:bg-dark-700'
                }`}
              >
                {value >= 1000 ? `${value / 1000}K` : value}
              </button>
            ))}
          </div>
        </div>

        {/* 自定义金额 */}
        <div className="mb-4">
          <p className="text-dark-400 text-sm mb-2">自定义金额</p>
          <div className="relative">
            <input
              type="number"
              value={customAmount}
              onChange={(e) => handleCustomAmountChange(e.target.value)}
              placeholder="输入自定义金额"
              min={21}
              className="input pr-16"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-dark-400">
              sats
            </span>
          </div>
        </div>

        {/* 留言 */}
        <div className="mb-6">
          <p className="text-dark-400 text-sm mb-2">留言（可选）</p>
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="写点什么..."
            maxLength={140}
            className="input"
          />
        </div>

        {/* 金额显示 */}
        <div className="bg-dark-800 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-dark-400">打赏金额</span>
            <span className="text-2xl font-bold text-yellow-400">
              {amount.toLocaleString()} sats
            </span>
          </div>
          <div className="flex items-center justify-between mt-2 text-sm">
            <span className="text-dark-500">约</span>
            <span className="text-dark-400">
              ${(amount * 0.00043).toFixed(2)} USD
            </span>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 mb-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex space-x-3">
          <button
            onClick={onClose}
            className="btn btn-secondary flex-1"
            disabled={isProcessing}
          >
            取消
          </button>
          <button
            onClick={handleSendZap}
            disabled={isProcessing || amount < 21}
            className="btn bg-yellow-500 hover:bg-yellow-600 text-dark-900 flex-1 disabled:opacity-50"
          >
            {isProcessing ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                处理中
              </span>
            ) : (
              `⚡ 发送 ${amount} sats`
            )}
          </button>
        </div>

        {/* 说明 */}
        <p className="text-dark-500 text-xs text-center mt-4">
          通过 OP_CAT Layer 链上交易发送，无需闪电网络
        </p>
      </div>
    </div>
  )
}
