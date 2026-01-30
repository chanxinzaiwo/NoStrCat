import { expect, use } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import {
  MethodCallOptions,
  PubKey,
  Sha256,
  findSig,
  sha256,
  toByteString,
  bsv,
  SignatureResponse,
} from 'scrypt-ts'
import { IdentityContract } from '../src/contracts/core/IdentityContract'
import { getDefaultSigner, randomPrivateKey, getCurrentTimestamp } from './utils/txHelper'

use(chaiAsPromised)

describe('IdentityContract Tests', () => {
  let identityContract: IdentityContract

  // 测试密钥
  const userPrivKey = randomPrivateKey()
  const userPubKey = bsv.PublicKey.fromPrivateKey(userPrivKey)

  const recoveryPrivKey = randomPrivateKey()
  const recoveryPubKey = bsv.PublicKey.fromPrivateKey(recoveryPrivKey)

  // 测试参数
  const createdAt = getCurrentTimestamp()
  const profileMetadataHash = sha256(toByteString('{"name":"TestUser","about":"A test user"}', true))

  before(async () => {
    await IdentityContract.loadArtifact()
  })

  describe('Basic Operations', () => {
    beforeEach(() => {
      identityContract = new IdentityContract(
        PubKey(userPubKey.toHex()),
        PubKey(recoveryPubKey.toHex()),
        createdAt,
        profileMetadataHash
      )
    })

    it('should deploy identity contract', async () => {
      const signer = getDefaultSigner([userPrivKey, recoveryPrivKey])
      await identityContract.connect(signer)

      const deployTx = await identityContract.deploy(5000)
      console.log('Identity Deploy TX:', deployTx.id)

      expect(deployTx).to.not.be.undefined
    })

    it('should update profile metadata', async () => {
      const signer = getDefaultSigner([userPrivKey, recoveryPrivKey])
      await identityContract.connect(signer)

      await identityContract.deploy(5000)

      // 更新资料
      const newMetadataHash = sha256(toByteString('{"name":"UpdatedUser","about":"Updated profile"}', true))

      const callContract = async () => {
        const { tx, next } = await identityContract.methods.updateProfile(
          newMetadataHash as Sha256,
          (sigResps: SignatureResponse[]) => findSig(sigResps, userPubKey),
          {
            pubKeyOrAddrToSign: userPubKey,
            next: {
              instance: identityContract,
              balance: 5000,
            },
          } as MethodCallOptions<IdentityContract>
        )
        return { tx, next }
      }

      const { tx, next } = await callContract()
      console.log('Update Profile TX:', tx.id)

      expect(tx).to.not.be.undefined
      expect(next!.instance.profileMetadataHash).to.equal(newMetadataHash)
    })

    it('should record zap and increase reputation', async () => {
      const signer = getDefaultSigner([userPrivKey, recoveryPrivKey])
      await identityContract.connect(signer)

      await identityContract.deploy(5000)

      // 记录 10000 sats 的打赏
      const zapAmount = 10000n

      const callContract = async () => {
        const { tx, next } = await identityContract.methods.recordZap(
          zapAmount,
          (sigResps: SignatureResponse[]) => findSig(sigResps, userPubKey),
          {
            pubKeyOrAddrToSign: userPubKey,
            next: {
              instance: identityContract,
              balance: 5000,
            },
          } as MethodCallOptions<IdentityContract>
        )
        return { tx, next }
      }

      const { tx, next } = await callContract()
      console.log('Record Zap TX:', tx.id)

      expect(tx).to.not.be.undefined
      // 10000 sats 应该增加 10 点声誉 (10000 / 1000 = 10)
      expect(next!.instance.totalZapsReceived).to.equal(zapAmount)
      expect(next!.instance.reputationScore).to.equal(10n)
    })

    it('should increment reputation', async () => {
      const signer = getDefaultSigner([userPrivKey, recoveryPrivKey])
      await identityContract.connect(signer)

      await identityContract.deploy(5000)

      const callContract = async () => {
        const { tx, next } = await identityContract.methods.incrementReputation(
          100n,
          (sigResps: SignatureResponse[]) => findSig(sigResps, userPubKey),
          {
            pubKeyOrAddrToSign: userPubKey,
            next: {
              instance: identityContract,
              balance: 5000,
            },
          } as MethodCallOptions<IdentityContract>
        )
        return { tx, next }
      }

      const { tx, next } = await callContract()
      console.log('Increment Reputation TX:', tx.id)

      expect(next!.instance.reputationScore).to.equal(100n)
    })
  })

  describe('Account Management', () => {
    beforeEach(() => {
      identityContract = new IdentityContract(
        PubKey(userPubKey.toHex()),
        PubKey(recoveryPubKey.toHex()),
        createdAt,
        profileMetadataHash
      )
    })

    it('should suspend account', async () => {
      const signer = getDefaultSigner([userPrivKey, recoveryPrivKey])
      await identityContract.connect(signer)

      await identityContract.deploy(5000)

      const callContract = async () => {
        const { tx, next } = await identityContract.methods.suspendAccount(
          (sigResps: SignatureResponse[]) => findSig(sigResps, userPubKey),
          {
            pubKeyOrAddrToSign: userPubKey,
            next: {
              instance: identityContract,
              balance: 5000,
            },
          } as MethodCallOptions<IdentityContract>
        )
        return { tx, next }
      }

      const { tx, next } = await callContract()
      console.log('Suspend Account TX:', tx.id)

      expect(next!.instance.accountStatus).to.equal(1n) // 暂停状态
    })

    it('should reactivate suspended account with recovery key', async () => {
      const signer = getDefaultSigner([userPrivKey, recoveryPrivKey])
      await identityContract.connect(signer)

      await identityContract.deploy(5000)

      // 先暂停
      const { next: suspended } = await identityContract.methods.suspendAccount(
        (sigResps: SignatureResponse[]) => findSig(sigResps, userPubKey),
        {
          pubKeyOrAddrToSign: userPubKey,
          next: {
            instance: identityContract,
            balance: 5000,
          },
        } as MethodCallOptions<IdentityContract>
      )

      // 再恢复
      const { tx, next: reactivated } = await suspended!.instance.methods.reactivateAccount(
        (sigResps: SignatureResponse[]) => findSig(sigResps, recoveryPubKey),
        {
          pubKeyOrAddrToSign: recoveryPubKey,
          next: {
            instance: suspended!.instance,
            balance: 5000,
          },
        } as MethodCallOptions<IdentityContract>
      )

      console.log('Reactivate Account TX:', tx.id)

      expect(reactivated!.instance.accountStatus).to.equal(0n) // 活跃状态
    })

    it('should set verified status with recovery key', async () => {
      const signer = getDefaultSigner([userPrivKey, recoveryPrivKey])
      await identityContract.connect(signer)

      await identityContract.deploy(5000)

      const callContract = async () => {
        const { tx, next } = await identityContract.methods.setVerified(
          true,
          (sigResps: SignatureResponse[]) => findSig(sigResps, recoveryPubKey),
          {
            pubKeyOrAddrToSign: recoveryPubKey,
            next: {
              instance: identityContract,
              balance: 5000,
            },
          } as MethodCallOptions<IdentityContract>
        )
        return { tx, next }
      }

      const { tx, next } = await callContract()
      console.log('Set Verified TX:', tx.id)

      expect(next!.instance.isVerified).to.be.true
    })
  })

  describe('Security', () => {
    beforeEach(() => {
      identityContract = new IdentityContract(
        PubKey(userPubKey.toHex()),
        PubKey(recoveryPubKey.toHex()),
        createdAt,
        profileMetadataHash
      )
    })

    it('should reject update profile with wrong signature', async () => {
      const wrongPrivKey = randomPrivateKey()
      const wrongPubKey = bsv.PublicKey.fromPrivateKey(wrongPrivKey)

      const signer = getDefaultSigner([wrongPrivKey])
      await identityContract.connect(signer)

      await identityContract.deploy(5000)

      const newMetadataHash = sha256(toByteString('malicious update', true))

      const callContract = async () => {
        await identityContract.methods.updateProfile(
          newMetadataHash as Sha256,
          (sigResps: SignatureResponse[]) => findSig(sigResps, wrongPubKey),
          {
            pubKeyOrAddrToSign: wrongPubKey,
            next: {
              instance: identityContract,
              balance: 5000,
            },
          } as MethodCallOptions<IdentityContract>
        )
      }

      await expect(callContract()).to.be.rejectedWith(/Invalid signature/)
    })
  })
})

/**
 * 测试说明：
 *
 * 这些测试验证 IdentityContract 的功能：
 * 1. 部署身份合约
 * 2. 更新个人资料
 * 3. 记录打赏并增加声誉
 * 4. 直接增加声誉
 * 5. 暂停/恢复账户
 * 6. 设置验证状态
 * 7. 拒绝未授权的操作
 *
 * 运行测试：npm test -- --grep "IdentityContract"
 */
