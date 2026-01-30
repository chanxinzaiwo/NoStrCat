import {
  bsv,
  TestWallet,
  DefaultProvider,
  PrivKey,
} from 'scrypt-ts'

// 生成随机私钥
export function randomPrivateKey(): bsv.PrivateKey {
  return bsv.PrivateKey.fromRandom('testnet')
}

// 获取默认签名器
export function getDefaultSigner(privateKeys: bsv.PrivateKey[]): TestWallet {
  const provider = new DefaultProvider({ network: bsv.Networks.testnet })

  const wallet = new TestWallet(
    privateKeys,
    provider
  )

  return wallet
}

// 生成测试地址
export function getTestAddress(privateKey: bsv.PrivateKey): string {
  return bsv.Address.fromPrivateKey(privateKey, bsv.Networks.testnet).toString()
}

// 创建测试用的 UTXO
export interface TestUTXO {
  txId: string
  outputIndex: number
  satoshis: number
  script: string
}

export function createTestUTXO(satoshis: number): TestUTXO {
  return {
    txId: randomTxId(),
    outputIndex: 0,
    satoshis,
    script: '',
  }
}

// 生成随机交易 ID
export function randomTxId(): string {
  const chars = '0123456789abcdef'
  let result = ''
  for (let i = 0; i < 64; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// 等待指定时间
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// 获取当前时间戳（秒）
export function getCurrentTimestamp(): bigint {
  return BigInt(Math.floor(Date.now() / 1000))
}

// 获取未来时间戳
export function getFutureTimestamp(secondsFromNow: number): bigint {
  return getCurrentTimestamp() + BigInt(secondsFromNow)
}

// 获取过去时间戳
export function getPastTimestamp(secondsAgo: number): bigint {
  return getCurrentTimestamp() - BigInt(secondsAgo)
}
