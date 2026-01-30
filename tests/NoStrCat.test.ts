import { expect } from 'chai'
import { NoStrCat } from '../src/contracts/NoStrCat'
import { toByteString } from 'scrypt-ts'

describe('NoStrCat', () => {
  before(async () => {
    await NoStrCat.loadArtifact()
  })

  it('should deploy successfully', async () => {
    const owner = toByteString('owner', true)
    const contract = new NoStrCat(owner, 0n)

    // 添加你的测试逻辑
    expect(contract).to.not.be.undefined
  })

  it('should update value', async () => {
    const owner = toByteString('owner', true)
    const contract = new NoStrCat(owner, 100n)

    // 测试更新方法
    const result = contract.verify(() => contract.update(200n))
    expect(result.success).to.be.true
  })
})
