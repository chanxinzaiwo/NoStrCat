'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/', label: '首页', icon: 'home' },
  { href: '/chat', label: '消息', icon: 'chat' },
  { href: '/wallet', label: '钱包', icon: 'wallet' },
  { href: '/profile', label: '我的', icon: 'profile' },
]

const NavIcon = ({ type, className }: { type: string; className?: string }) => {
  const icons: Record<string, JSX.Element> = {
    home: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    chat: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    wallet: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
    profile: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  }
  return icons[type] || null
}

export function Sidebar() {
  const pathname = usePathname()

  const isInstalled = false
  const isConnected = false
  const address: string | null = null
  const balance: { total: number; unconfirmed: number } | null = null

  const shortAddress = address ? (address as string).slice(0, 6) + '...' + (address as string).slice(-4) : null

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
    <>
      {/* 桌面端侧边栏 */}
      <aside className="hidden md:flex fixed left-0 top-0 h-screen w-64 bg-dark-900 border-r border-dark-800 p-4 flex-col">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-primary-400">NoStrCat</h1>
          <p className="text-dark-500 text-sm">Decentralized Social</p>
        </div>

        <nav className="space-y-2 flex-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={pathname === item.href
                ? "flex items-center space-x-3 px-4 py-3 rounded-lg bg-primary-600 text-white"
                : "flex items-center space-x-3 px-4 py-3 rounded-lg text-dark-300 hover:bg-dark-800"
              }
            >
              <NavIcon type={item.icon} className="w-6 h-6" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="space-y-3">
          {isConnected && balance !== null && (
            <div className="bg-dark-800 rounded-lg p-3">
              <p className="text-dark-400 text-xs">Balance</p>
              <p className="text-white font-mono text-lg">{formatSats((balance as { total: number; unconfirmed: number }).total)}</p>
              {(balance as { total: number; unconfirmed: number }).unconfirmed > 0 && (
                <p className="text-yellow-500 text-xs">+{formatSats((balance as { total: number; unconfirmed: number }).unconfirmed)} pending</p>
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

      {/* 移动端底部导航栏 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-dark-900 border-t border-dark-800 z-50 safe-area-pb">
        <div className="flex items-center justify-around h-16">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 h-full ${
                pathname === item.href
                  ? 'text-primary-400'
                  : 'text-dark-400 active:text-dark-200'
              }`}
            >
              <NavIcon type={item.icon} className="w-6 h-6" />
              <span className="text-xs mt-1">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  )
}
