'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/', label: 'Home', icon: 'H' },
  { href: '/chat', label: 'Chat', icon: 'C' },
  { href: '/wallet', label: 'Wallet', icon: 'W' },
  { href: '/profile', label: 'Profile', icon: 'P' },
]

export function Sidebar() {
  const pathname = usePathname()

  // 钱包功能暂时禁用，专注于 Nostr 功能
  const isInstalled = false
  const isConnected = false
  const address: string | null = null
  const balance: { total: number; unconfirmed: number } | null = null

  const shortAddress = address ? address.slice(0, 6) + '...' + address.slice(-4) : null

  const formatSats = (sats: number) => {
    if (sats >= 100000000) {
      return (sats / 100000000).toFixed(4) + ' BTC'
    }
    if (sats >= 1000) {
      return (sats / 1000).toFixed(1) + 'K sats'
    }
    return sats + ' sats'
  }

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-dark-900 border-r border-dark-800 p-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-primary-400">NoStrCat</h1>
        <p className="text-dark-500 text-sm">Decentralized Social</p>
      </div>

      <nav className="space-y-2">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={pathname === item.href ? "flex items-center space-x-3 px-4 py-3 rounded-lg bg-primary-600 text-white" : "flex items-center space-x-3 px-4 py-3 rounded-lg text-dark-300 hover:bg-dark-800"}
          >
            <span className="text-xl">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="absolute bottom-4 left-4 right-4 space-y-3">
        {isConnected && balance && (
          <div className="bg-dark-800 rounded-lg p-3">
            <p className="text-dark-400 text-xs">Balance</p>
            <p className="text-white font-mono text-lg">{formatSats(balance.total)}</p>
            {balance.unconfirmed > 0 && (
              <p className="text-yellow-500 text-xs">+{formatSats(balance.unconfirmed)} pending</p>
            )}
          </div>
        )}

        <div className="bg-dark-800 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <p className="text-dark-400 text-xs">OP_CAT Wallet</p>
            {isConnected ? (
              <span className="w-2 h-2 bg-green-400 rounded-full" />
            ) : isInstalled ? (
              <span className="w-2 h-2 bg-yellow-400 rounded-full" />
            ) : (
              <span className="w-2 h-2 bg-red-400 rounded-full" />
            )}
          </div>
          {isConnected ? (
            <p className="text-green-400 text-sm font-mono">{shortAddress}</p>
          ) : isInstalled ? (
            <Link href="/wallet" className="text-yellow-400 text-sm hover:underline">
              Click to connect
            </Link>
          ) : (
            <a 
              href="https://github.com/OPCAT-Labs/wallet-extension/releases" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-red-400 text-sm hover:underline"
            >
              Install wallet
            </a>
          )}
        </div>
      </div>
    </aside>
  )
}