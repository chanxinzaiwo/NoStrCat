'use client'

import { useState } from 'react'
import { useUserStore } from '@/stores/userStore'

export function RelayStatus() {
  const { relays, addRelay, removeRelay } = useUserStore()
  const [newRelay, setNewRelay] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const handleAddRelay = () => {
    if (newRelay.trim() && newRelay.startsWith('wss://')) {
      addRelay(newRelay.trim())
      setNewRelay('')
      setShowAdd(false)
    }
  }

  return (
    <div className="card bg-dark-900">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold">Nostr 中继器</h3>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-primary-400 text-sm hover:underline"
        >
          {showAdd ? '取消' : '+ 添加'}
        </button>
      </div>

      {showAdd && (
        <div className="flex space-x-2 mb-4">
          <input
            type="text"
            value={newRelay}
            onChange={(e) => setNewRelay(e.target.value)}
            placeholder="wss://relay.example.com"
            className="input flex-1 text-sm"
          />
          <button
            onClick={handleAddRelay}
            className="btn btn-primary text-sm"
          >
            添加
          </button>
        </div>
      )}

      <div className="space-y-2">
        {relays.map((relay) => (
          <div
            key={relay}
            className="flex items-center justify-between p-2 bg-dark-800 rounded-lg"
          >
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-green-400 rounded-full" />
              <span className="text-sm font-mono truncate max-w-[200px]">
                {relay.replace('wss://', '')}
              </span>
            </div>
            <button
              onClick={() => removeRelay(relay)}
              className="text-dark-400 hover:text-red-400 text-sm"
            >
              移除
            </button>
          </div>
        ))}
      </div>

      {relays.length === 0 && (
        <p className="text-dark-500 text-sm text-center py-4">
          没有配置中继器
        </p>
      )}
    </div>
  )
}
