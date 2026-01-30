/**
 * NoStrCat 智能合约导出
 *
 * 所有合约的统一入口
 */

// 核心合约
export { ZapContract } from './core/ZapContract'
export { SplitZapContract } from './core/SplitZapContract'
export { BatchZapContract } from './core/BatchZapContract'

export {
  IdentityContract,
  ProfileMetadata,
} from './core/IdentityContract'

export { ContentAnchorContract } from './core/ContentAnchorContract'
export { BatchAnchorContract } from './core/BatchAnchorContract'
export { TimestampedAnchorContract } from './core/TimestampedAnchorContract'

export { ReplyChainAnchorContract } from './core/ReplyChainAnchorContract'

export { AntiSpamContract } from './core/AntiSpamContract'
export { ReputationBasedAntiSpamContract } from './core/ReputationBasedAntiSpamContract'

// 社交合约
export {
  GroupContract,
  GroupMetadata,
} from './social/GroupContract'

export { PaidGroupContract } from './social/PaidGroupContract'

export {
  SubscriptionContract,
  SubscriptionTier,
} from './social/SubscriptionContract'

export { MultiTierSubscriptionContract } from './social/MultiTierSubscriptionContract'
export { PaidContentContract } from './social/PaidContentContract'
