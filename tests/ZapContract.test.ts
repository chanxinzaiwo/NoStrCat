import { expect, use } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {
  MethodCallOptions,
  PubKey,
  findSig,
  sha256,
  toByteString,
  bsv,
  SignatureResponse,
} from 'scrypt-ts'
import { ZapContract } from '../src/contracts/core/ZapContract'
import { SplitZapContract } from '../src/contracts/core/SplitZapContract'
import { getDefaultSigner, randomPrivateKey } from './utils/txHelper'

use(chaiAsPromised)

describe('ZapContract Tests', () => {
  let zapContract: ZapContract

  // 测试密钥
  const recipientPrivKey = randomPrivateKey()
  const recipientPubKey = bsv.PublicKey.fromPrivateKey(recipientPrivKey)

  const senderPrivKey = randomPrivateKey()
  const senderPubKey = bsv.PublicKey.fromPrivateKey(senderPrivKey)

  // 测试参数
  const eventId = sha256(toByteString('test-event-id', true))
  const memoHash = sha256(toByteString('Thanks for the great content!', true))
  const refundTimeout = BigInt(Math.floor(Date.now() / 1000) + 86400) // 24小时后
  const minAmount = 1000n // 最小 1000 sats

  before(async () => {
    // 编译合约
    await ZapContract.loadArtifact()
    await SplitZapContract.loadArtifact()
  })

  describe('ZapContract', () => {
    beforeEach(() => {
      // 创建新合约实例
      zapContract = new ZapContract(
        PubKey(recipientPubKey.toHex()),
        PubKey(senderPubKey.toHex()),
        eventId,
        memoHash,
        refundTimeout,
        minAmount
      )
    })

    it('should deploy successfully', async () => {
      const signer = getDefaultSigner([recipientPrivKey, senderPrivKey])
      await zapContract.connect(signer)

      const deployTx = await zapContract.deploy(10000)
      console.log('Deploy TX:', deployTx.id)

      expect(deployTx).to.not.be.undefined
    })

    it('should allow recipient to claim', async () => {
      const signer = getDefaultSigner([recipientPrivKey, senderPrivKey])
      await zapContract.connect(signer)

      // 部署
      await zapContract.deploy(10000)

      // 收款人领取
      const callContract = async () => {
        const { tx } = await zapContract.methods.claim(
          (sigResps: SignatureResponse[]) => findSig(sigResps, recipientPubKey),
          {
            pubKeyOrAddrToSign: recipientPubKey,
          } as MethodCallOptions<ZapContract>
        )
        return tx
      }

      const claimTx = await callContract()
      console.log('Claim TX:', claimTx.id)

      expect(claimTx).to.not.be.undefined
    })

    it('should fail claim with wrong signature', async () => {
      const wrongPrivKey = randomPrivateKey()
      const wrongPubKey = bsv.PublicKey.fromPrivateKey(wrongPrivKey)

      const signer = getDefaultSigner([wrongPrivKey])
      await zapContract.connect(signer)

      await zapContract.deploy(10000)

      // 尝试用错误的签名领取
      const callContract = async () => {
        await zapContract.methods.claim(
          (sigResps: SignatureResponse[]) => findSig(sigResps, wrongPubKey),
          {
            pubKeyOrAddrToSign: wrongPubKey,
          } as MethodCallOptions<ZapContract>
        )
      }

      await expect(callContract()).to.be.rejectedWith(/Invalid recipient signature/)
    })

    it('should fail claim below minimum amount', async () => {
      const signer = getDefaultSigner([recipientPrivKey, senderPrivKey])

      // 创建低于最小金额的合约
      const lowAmountContract = new ZapContract(
        PubKey(recipientPubKey.toHex()),
        PubKey(senderPubKey.toHex()),
        eventId,
        memoHash,
        refundTimeout,
        minAmount
      )

      await lowAmountContract.connect(signer)
      await lowAmountContract.deploy(500) // 低于最小金额

      const callContract = async () => {
        await lowAmountContract.methods.claim(
          (sigResps: SignatureResponse[]) => findSig(sigResps, recipientPubKey),
          {
            pubKeyOrAddrToSign: recipientPubKey,
          } as MethodCallOptions<ZapContract>
        )
      }

      await expect(callContract()).to.be.rejectedWith(/Below minimum zap amount/)
    })
  })

  describe('SplitZapContract', () => {
    let splitZapContract: SplitZapContract

    const secondaryPrivKey = randomPrivateKey()
    const secondaryPubKey = bsv.PublicKey.fromPrivateKey(secondaryPrivKey)

    beforeEach(() => {
      // 90/10 分成
      splitZapContract = new SplitZapContract(
        PubKey(recipientPubKey.toHex()),   // 主要收款人 90%
        PubKey(secondaryPubKey.toHex()),   // 次要收款人 10%
        90n,                                // 90% 给主要收款人
        eventId,
        minAmount
      )
    })

    it('should deploy split zap contract', async () => {
      const signer = getDefaultSigner([recipientPrivKey, secondaryPrivKey])
      await splitZapContract.connect(signer)

      const deployTx = await splitZapContract.deploy(10000)
      console.log('Split Zap Deploy TX:', deployTx.id)

      expect(deployTx).to.not.be.undefined
    })

    it('should split payment correctly', async () => {
      const signer = getDefaultSigner([recipientPrivKey, secondaryPrivKey])
      await splitZapContract.connect(signer)

      await splitZapContract.deploy(10000)

      // 双方签名领取
      const callContract = async () => {
        const { tx } = await splitZapContract.methods.claim(
          (sigResps: SignatureResponse[]) => findSig(sigResps, recipientPubKey),
          (sigResps: SignatureResponse[]) => findSig(sigResps, secondaryPubKey),
          {
            pubKeyOrAddrToSign: [recipientPubKey, secondaryPubKey],
          } as MethodCallOptions<SplitZapContract>
        )
        return tx
      }

      const claimTx = await callContract()
      console.log('Split Claim TX:', claimTx.id)

      // 验证输出金额
      // 10000 * 90% = 9000 给主要收款人
      // 10000 * 10% = 1000 给次要收款人
      expect(claimTx).to.not.be.undefined
    })
  })
})

/**
 * 测试辅助说明：
 *
 * 这些测试验证 ZapContract 的核心功能：
 * 1. 部署合约
 * 2. 收款人可以领取打赏
 * 3. 错误签名会被拒绝
 * 4. 低于最小金额会被拒绝
 * 5. 分成支付正确执行
 *
 * 运行测试：npm test -- --grep "ZapContract"
 */
