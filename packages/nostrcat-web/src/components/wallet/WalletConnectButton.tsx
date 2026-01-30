'use client'

interface WalletConnectButtonProps {
  className?: string
}

export function WalletConnectButton({ className = '' }: WalletConnectButtonProps) {
  // 钱包功能暂时禁用
  const isInstalled = false
  const isConnected = false
  const isConnecting = false

  const handleClick = () => {
    window.open('https://github.com/OPCAT-Labs/wallet-extension/releases', '_blank')
  }

  return (
    <button
      onClick={handleClick}
      disabled={isConnecting}
      className={"px-4 py-2 rounded-lg text-white font-medium transition-colors disabled:opacity-50 bg-orange-600 hover:bg-orange-700 " + className}
    >
      了解 OP_CAT 钱包
    </button>
  )
}
