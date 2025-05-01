# nft-staking-token2022

## 1.針對的 NFT 是基于 solana-token2022 的代幣擴展，NFT 集合使用 groupmember 擴展創建

## 2.收益計算的數學模型是類似以太坊的 AAVE 和 COMPOUND 的利率計算模型，採用全局利率指數和獨立收益指數的方式

## 3.支持動態修改質押收益率

### 測試：

1.在項目目錄下運行以下命令初始化測試賬戶：

```
npx esrun tests/nft_group_member_init/index.ts
```

2.使用 solana-test-validator 或直接運行 anchor test,或配置 netdev
