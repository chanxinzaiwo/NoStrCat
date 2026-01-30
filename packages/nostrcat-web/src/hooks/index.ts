/**
 * NoStrCat Web Hooks
 *
 * React hooks for integrating with nostrcat-core
 */

// 主客户端 Hook
export {
  NostrCatProvider,
  useNostrCat,
  useConnectionStatus,
} from './useNostrCat'

// 时间线 Hooks
export {
  useTimeline,
  useHashtagTimeline,
  useProfileTimeline,
  useThread,
  useTrendingHashtags,
} from './useTimeline'

// 聊天 Hooks
export {
  usePrivateChat,
  useConversation,
  useGroupChat,
  useGroup,
} from './useChat'

// 钱包 Hooks
export {
  useWallet,
  useFormattedBalance,
} from './useWallet'

// Zap/打赏 Hooks
export {
  useZap,
  useQuickZap,
  useEventZaps,
} from './useZap'

// 钱包扩展 Hooks
export {
  WalletExtensionProvider,
  useWalletExtension,
  useWalletConnect,
} from './useWalletExtension'
