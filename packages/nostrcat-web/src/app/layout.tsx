import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import '@/styles/globals.css'
import { Providers } from './providers'
import { Sidebar } from '@/components/common/Sidebar'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'NoStrCat - 去中心化社交',
  description: '结合 Nostr 协议与 OP_CAT Layer 的去中心化社交平台',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh" className="dark">
      <head>
        {/* 禁止 MetaMask 等 Web3 钱包自动连接 */}
        <Script id="prevent-web3-autoconnect" strategy="beforeInteractive">
          {`
            // 阻止 MetaMask 自动连接
            if (typeof window !== 'undefined') {
              // 捕获并忽略来自 Web3 钱包扩展的错误
              window.addEventListener('error', function(event) {
                if (event.filename && event.filename.includes('chrome-extension://')) {
                  event.preventDefault();
                  event.stopPropagation();
                  return true;
                }
              }, true);

              // 捕获未处理的 Promise 拒绝
              window.addEventListener('unhandledrejection', function(event) {
                if (event.reason && event.reason.message &&
                    (event.reason.message.includes('MetaMask') ||
                     event.reason.message.includes('ethereum'))) {
                  event.preventDefault();
                  event.stopPropagation();
                  return true;
                }
              }, true);
            }
          `}
        </Script>
      </head>
      <body className={inter.className}>
        <Providers>
          <div className="min-h-screen bg-dark-950 text-dark-100">
            <div className="flex">
              <Sidebar />
              <main className="flex-1 ml-64">
                {children}
              </main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  )
}
