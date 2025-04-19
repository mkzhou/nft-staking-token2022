import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { NftStaking } from "../target/types/nft_staking";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import fs from "fs";
import dotenv from "dotenv";
import { TOKEN_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import { Account, ASSOCIATED_TOKEN_PROGRAM_ID, getAccount, getAssociatedTokenAddressSync, getMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import assert from "assert";
import { TestKeyList, GroupMemberData, NftMintPair } from "./nft_group_member_init/test-interface";
import * as yaml from 'js-yaml';
import { expect } from "chai";
dotenv.config();

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe("nft-staking", () => {
  // Configure the client to use the local cluster.

  let provider: anchor.AnchorProvider;
  let wallet: anchor.Wallet;
  let program: Program<NftStaking>;
  let staker: Keypair;
  let payer: Keypair;
  let connection: Connection;
  let stakingCfg: PublicKey;
  let rewardVaultAuthority: PublicKey;
  let rewardVault: PublicKey;
  let nftVaultAuthority: PublicKey;
  const KEYPAIR_FILE_FILE = 'my-keypair.json';

  const testKeyList = yaml.load(fs.readFileSync('test-key-list.yaml', 'utf8')) as TestKeyList;

  // pda seeds
  const STAKING_CFG_SEED = "staking_cfg";
  const REWARD_VAULT_AUTHORITY_SEED = "reward_vault_authority";
  const NFT_VAULT_AUTHORITY_SEED = "nft_vault_authority";
  const CFG_UPDATE_RECORD_SEED = "cfg_update_record";
  const STAKED_RECORD_SEED = "staked_record";

  //reward pubkeys
  const REWARD_MINT = new PublicKey(testKeyList.tokenProgramReward[0].memberMint);
  const ADMIN_REWARD_TOKEN_ACCOUNT = new PublicKey(testKeyList.tokenProgramReward[0].ata);
  const REWARD_PROGRAM = TOKEN_PROGRAM_ID;

  //group mint
  const GROUP_MINT = new PublicKey(testKeyList.groupMemberDataList[0].groupMint);


  async function handle_stake(
    groupMint: PublicKey, 
    nftMint: PublicKey,
    rewardMint: PublicKey,
    nftTokenAccount: PublicKey,
    errorCode: string,
    errorMessage: string,
  ):Promise<PublicKey> {

    //define the nft_vault
    const nftVault = getAssociatedTokenAddressSync(
      nftMint,
      nftVaultAuthority,
      true,
      TOKEN_2022_PROGRAM_ID,
    );

    try {
      await program.methods.stake().accounts({
        staker: staker.publicKey,
        stakingCfg: stakingCfg,
        rewardMint: rewardMint,
        groupMint: groupMint,
        nftTokenAccount: nftTokenAccount,
        nftMint: nftMint,
        nftVault: nftVault,
        nftVaultAuthority: nftVaultAuthority,
        rewardTokenProgram: REWARD_PROGRAM,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).signers([staker]).rpc();
      console.log("stake success");
      return nftVault;
    } catch (error) {
            // 验证错误类型为 AnchorError
      expect(error).to.be.instanceOf(anchor.AnchorError);
      // 验证错误代码
      expect(error.error.errorCode.code).to.equal(errorCode);
      // 验证错误消息
      expect(error.error.errorMessage).to.equal(errorMessage);      
    }


  }

  async function handle_config_staking(
    cfgUpdateRecord: PublicKey,
    reward: BN|null,
    stakedEndTime: BN|null,
  ):Promise<void> {
    await program.methods.configStaking(
      reward,
      stakedEndTime,
    ).accounts({
      admin: payer.publicKey,
      stakingCfg: stakingCfg,
      cfgUpdateRecord: cfgUpdateRecord,
      rewardMint: REWARD_MINT,
      rewardVault: rewardVault,
      rewardVaultAuthority: rewardVaultAuthority,
      rewardTokenAccount: ADMIN_REWARD_TOKEN_ACCOUNT,
      rewardTokenProgram: REWARD_PROGRAM,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      
    }).rpc();
  }

  //init provider and program
  before(async () => {
    console.log("init provider and program starting...");
    const endpoint = "http://127.0.0.1:8899";
    const wsEndpoint = "ws://127.0.0.1:8900";
    connection = new Connection(endpoint, {wsEndpoint: wsEndpoint, commitment: 'confirmed'});

    wallet = anchor.Wallet.local();
    payer = wallet.payer
    provider = new anchor.AnchorProvider(connection, wallet, anchor.AnchorProvider.defaultOptions());
    anchor.setProvider(anchor.AnchorProvider.env());
    program = anchor.workspace.nftStaking as Program<NftStaking>;

    const keypairPath = `${process.env.HOME}/${KEYPAIR_FILE_FILE}`;
    const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
    staker = Keypair.fromSecretKey(new Uint8Array(keypairData));

    console.log("\n----------MAIN KEYPAIR----PING----------\n");
    console.log("staker: ", staker.publicKey.toBase58());
    console.log("payer: ", payer.publicKey.toBase58());
    console.log("\n----------MAIN KEYPAIR----PONG------\n");

    // define the staking_cfg
    stakingCfg = PublicKey.findProgramAddressSync(
      [
        Buffer.from(STAKING_CFG_SEED), 
        GROUP_MINT.toBuffer(),
        payer.publicKey.toBuffer()
      ],
      program.programId,
    )[0];

    console.log("stakingCfg: ", stakingCfg.toBase58());

      //define the reward_vault_authority
    rewardVaultAuthority = PublicKey.findProgramAddressSync(
    [Buffer.from(REWARD_VAULT_AUTHORITY_SEED)],
    program.programId,
  )[0];

  //define the reward_vault
    rewardVault = getAssociatedTokenAddressSync(
    REWARD_MINT,
    rewardVaultAuthority,
    true,
    REWARD_PROGRAM,
  );
  console.log("rewardVault: ", rewardVault.toBase58());

  //define the nft_vault_authority
    nftVaultAuthority = PublicKey.findProgramAddressSync(
    [Buffer.from(NFT_VAULT_AUTHORITY_SEED)],
    program.programId,
  )[0];

    
  });



  it("init staking!", async () => {
    console.log("init staking starting test...");
      // define the init param
      const reward = new BN(1);
      const stakedStartTime = new BN(Date.now()/1000);
      const stakedEndTime = stakedStartTime.add(new BN(60 * 60 * 24));
      const minimumPeriod = new BN(60 * 3 );
      const maxStakedAmount = new BN(3);


      //check if the stakingCfg already exists
      const cfgInfo = await connection.getAccountInfo(stakingCfg);

      if (cfgInfo) {
        console.log("stakingCfg already exists");
        const stakingCfgAccount = await program.account.stakingCfg.fetch(stakingCfg);
        console.log("stakingCfgAccount: ", JSON.stringify(stakingCfgAccount));
        return;
      } 

      //invoke the init_staking instruction
      await program.methods.initStaking(
        reward,
        stakedStartTime,
        stakedEndTime,
        minimumPeriod,
        maxStakedAmount,
      ).accounts({  
        payer: payer.publicKey,
        payerRewardTokenAccount: ADMIN_REWARD_TOKEN_ACCOUNT,
        rewardTokenMint: REWARD_MINT,
        rewardVault: rewardVault,
        rewardVaultAuthority: rewardVaultAuthority,
        nftVaultAuthority: nftVaultAuthority,
        groupMint: GROUP_MINT,
        rewardTokenProgram: REWARD_PROGRAM,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();

      console.log("init staking success");
      // verify the staking config
      const stakingCfgAccount = await program.account.stakingCfg.fetch(stakingCfg);
      console.log("stakingCfgAccount: ", JSON.stringify(stakingCfgAccount));


      expect(stakingCfgAccount.rewardTokenMint.toBase58()).to.equal(REWARD_MINT.toBase58());
      expect(stakingCfgAccount.stakedStartTime.toNumber()).to.equal(stakedStartTime.toNumber());
      expect(stakingCfgAccount.stakedEndTime.toNumber()).to.equal(stakedEndTime.toNumber());
      expect(stakingCfgAccount.minimumPeriod.toNumber()).to.equal(minimumPeriod.toNumber());
      expect(stakingCfgAccount.maxStakedAmount.toNumber()).to.equal(maxStakedAmount.toNumber());
      expect(stakingCfgAccount.admin.toBase58()).to.equal(payer.publicKey.toBase58());
      expect(stakingCfgAccount.groupMint.toBase58()).to.equal(GROUP_MINT.toBase58());

  });



  it("stake nft with the wrong group should fail", async () => {
    console.log("stake nft with the wrong group should fail starting test...");
    const wrongGroupMint = new PublicKey(testKeyList.groupMemberDataList[1].groupMint);
    const nftMint = new PublicKey(testKeyList.groupMemberDataList[0].nftMintPairList[0].memberMint);
    const nftTokenAccount = new PublicKey(testKeyList.groupMemberDataList[0].nftMintPairList[0].ata);

    await handle_stake(
      wrongGroupMint,
      nftMint,
      REWARD_MINT,
      nftTokenAccount,
      "InvalidGroupMint",
      "Invalid group mint",
    );

  });


  it("stake nft with the wrong mint should fail", async () => {
    console.log("stake nft with the wrong mint should fail starting test...");
    const nftMint = new PublicKey(testKeyList.groupMemberDataList[1].nftMintPairList[0].memberMint);
    const nftTokenAccount = new PublicKey(testKeyList.groupMemberDataList[1].nftMintPairList[0].ata);

    await handle_stake(
      GROUP_MINT,
      nftMint,
      REWARD_MINT,
      nftTokenAccount,
      "NftMintNotMatchGroupMint",
      "Nft mint not match group mint",
    );

  });

  it("stake nft all success", async () => {
    console.log("stake nft all success waiting 5 seconds...");
    await delay(5000);
    console.log("stake nft all success start...");
    const nftMint = new PublicKey(testKeyList.groupMemberDataList[0].nftMintPairList[0].memberMint);
    const nftTokenAccount = new PublicKey(testKeyList.groupMemberDataList[0].nftMintPairList[0].ata);

    const nftVault = await handle_stake(
      GROUP_MINT,
      nftMint,
      REWARD_MINT,
      nftTokenAccount,
      "InvalidGroupMint",
      "Invalid group mint",
    );

    console.log("nftVault: ", nftVault.toBase58());

    const staked_record = PublicKey.findProgramAddressSync(
      [Buffer.from(STAKED_RECORD_SEED), stakingCfg.toBuffer(), nftMint.toBuffer()],
      program.programId,
    )[0];
    const stakedRecord = await program.account.stakedRecord.fetch(staked_record);
    console.log("stakedRecord: ", JSON.stringify(stakedRecord));
    const stakingCfgAccount = await program.account.stakingCfg.fetch(stakingCfg);
    const staked_at = stakedRecord.stakedAt.toNumber();
    const latest_reward_time = stakingCfgAccount.latestRewardTime.toNumber();
    const latest_reward = stakingCfgAccount.latestReward.toNumber();
    const reward_based_on_staked_time = stakedRecord.rewardBasedOnStakedTime.toNumber();
    const calc_reward_based_on_staked_time = (staked_at - latest_reward_time)*latest_reward + stakingCfgAccount.accumulatedReward.toNumber();
    console.log("staked_at: ", staked_at);
    console.log("latest_reward_time: ", latest_reward_time);
    console.log("latest_reward: ", latest_reward);
    console.log("reward_based_on_staked_time: ", reward_based_on_staked_time);
    console.log("calc_reward_based_on_staked_time: ", calc_reward_based_on_staked_time);
    expect(calc_reward_based_on_staked_time).to.equal(reward_based_on_staked_time);
  });

  it("config staking first time", async () => {
    console.log("config staking first time waiting 15 seconds...");
    await delay(15000);
    console.log("config staking first time starting test...");
    let stakingCfgAccount = await program.account.stakingCfg.fetch(stakingCfg);
    const cfg_update_record = PublicKey.findProgramAddressSync(
      [Buffer.from(CFG_UPDATE_RECORD_SEED), stakingCfg.toBuffer(), Buffer.from((stakingCfgAccount.updatedTimes +1).toString())],
      program.programId,
    )[0];

    console.log("stakingCfgAccount updatedTimes: ", stakingCfgAccount.updatedTimes);
    
    const reward = new BN(2);
    await handle_config_staking(cfg_update_record,reward, null);

    //refresh the stakingCfgAccount
    stakingCfgAccount = await program.account.stakingCfg.fetch(stakingCfg);
    const currentAccumulatedReward = stakingCfgAccount.accumulatedReward;

    //get the cfgUpdateRecord
    const cfgUpdateRecord = await program.account.cfgUpdateRecord.fetch(cfg_update_record);
    console.log("cfgUpdateRecord: ", JSON.stringify(cfgUpdateRecord));

    const calculatedAccumulatedReward = stakingCfgAccount.latestRewardTime.sub(cfgUpdateRecord.updatedAt).mul(cfgUpdateRecord.reward);

    console.log("-------------------------config info-----------------------------");
    console.log("calculatedAccumulatedReward: ", calculatedAccumulatedReward.toNumber());
    console.log("currentAccumulatedReward: ", currentAccumulatedReward.toNumber());
    console.log("stakingCfgAccount latestRewardTime: ", stakingCfgAccount.latestRewardTime.toNumber());
    console.log("stakingCfgAccount latestReward: ", stakingCfgAccount.latestReward.toNumber());
    console.log("stakingCfgAccount stakedEndTime: ", stakingCfgAccount.stakedEndTime.toNumber());
    console.log("stakingCfgAccount updatedTimes: ", stakingCfgAccount.updatedTimes);
    console.log("stakingCfgAccount stakedAmount: ", stakingCfgAccount.stakedAmount.toNumber());
    console.log("------------------------------------------------------");

    expect(calculatedAccumulatedReward.toNumber()).to.equal(currentAccumulatedReward.toNumber());
    
  });


  it("config staking second time", async () => {
    console.log("config staking second time waiting 36 seconds...");
    await delay(36000);
    console.log("config staking second time starting test...");
    let stakingCfgAccount = await program.account.stakingCfg.fetch(stakingCfg);
    const currentAccumulatedReward = stakingCfgAccount.accumulatedReward;
    const cfg_update_record = PublicKey.findProgramAddressSync(
      [Buffer.from(CFG_UPDATE_RECORD_SEED), stakingCfg.toBuffer(), Buffer.from((stakingCfgAccount.updatedTimes +1).toString())],
      program.programId,
    )[0];

    console.log("stakingCfgAccount updatedTimes: ", stakingCfgAccount.updatedTimes);
    
    const reward = new BN(3);
    await handle_config_staking(cfg_update_record,reward, null);

    //refresh the stakingCfgAccount
    stakingCfgAccount = await program.account.stakingCfg.fetch(stakingCfg);
 

    //get the cfgUpdateRecord
    const cfgUpdateRecord = await program.account.cfgUpdateRecord.fetch(cfg_update_record);
    console.log("cfgUpdateRecord: ", JSON.stringify(cfgUpdateRecord));

    let calculatedAccumulatedReward = stakingCfgAccount.latestRewardTime.sub(cfgUpdateRecord.updatedAt).mul(cfgUpdateRecord.reward);
    calculatedAccumulatedReward = calculatedAccumulatedReward.add(currentAccumulatedReward);

    console.log("-------------------------config info-----------------------------");
    console.log("calculatedAccumulatedReward: ", calculatedAccumulatedReward.toNumber());
    console.log("currentAccumulatedReward: ", stakingCfgAccount.accumulatedReward.toNumber());
    console.log("stakingCfgAccount latestRewardTime: ", stakingCfgAccount.latestRewardTime.toNumber());
    console.log("stakingCfgAccount latestReward: ", stakingCfgAccount.latestReward.toNumber());
    console.log("stakingCfgAccount stakedEndTime: ", stakingCfgAccount.stakedEndTime.toNumber());
    console.log("stakingCfgAccount updatedTimes: ", stakingCfgAccount.updatedTimes);
    console.log("stakingCfgAccount stakedAmount: ", stakingCfgAccount.stakedAmount.toNumber());
    console.log("------------------------------------------------------");

    expect(calculatedAccumulatedReward.toNumber()).to.equal(stakingCfgAccount.accumulatedReward.toNumber());
    
  });

  it("config staking third time", async () => {
    console.log("config staking third time waiting 50 seconds...");
    await delay(50000);
    console.log("config staking third time starting test...");
    let stakingCfgAccount = await program.account.stakingCfg.fetch(stakingCfg);
    const currentAccumulatedReward = stakingCfgAccount.accumulatedReward;
    const cfg_update_record = PublicKey.findProgramAddressSync(
      [Buffer.from(CFG_UPDATE_RECORD_SEED), stakingCfg.toBuffer(), Buffer.from((stakingCfgAccount.updatedTimes +1).toString())],
      program.programId,
    )[0];

    console.log("stakingCfgAccount updatedTimes: ", stakingCfgAccount.updatedTimes);
    
    const reward = new BN(4);
    const stakedStartTime = new BN(Date.now()/1000);
    const stakedEndTime = stakedStartTime.add(new BN(60 * 60 * 24));
    await handle_config_staking(cfg_update_record,reward, stakedEndTime);

    //refresh the stakingCfgAccount
    stakingCfgAccount = await program.account.stakingCfg.fetch(stakingCfg);
 

    //get the cfgUpdateRecord
    const cfgUpdateRecord = await program.account.cfgUpdateRecord.fetch(cfg_update_record);
    console.log("cfgUpdateRecord: ", JSON.stringify(cfgUpdateRecord));

    let calculatedAccumulatedReward = stakingCfgAccount.latestRewardTime.sub(cfgUpdateRecord.updatedAt).mul(cfgUpdateRecord.reward);
    calculatedAccumulatedReward = calculatedAccumulatedReward.add(currentAccumulatedReward);

    console.log("-------------------------config info-----------------------------");
    console.log("stakedEndTime: ", stakedEndTime.toNumber());
    console.log("calculatedAccumulatedReward: ", calculatedAccumulatedReward.toNumber());
    console.log("currentAccumulatedReward: ", stakingCfgAccount.accumulatedReward.toNumber());
    console.log("stakingCfgAccount latestRewardTime: ", stakingCfgAccount.latestRewardTime.toNumber());
    console.log("stakingCfgAccount latestReward: ", stakingCfgAccount.latestReward.toNumber());
    console.log("stakingCfgAccount stakedEndTime: ", stakingCfgAccount.stakedEndTime.toNumber());
    console.log("stakingCfgAccount updatedTimes: ", stakingCfgAccount.updatedTimes);
    console.log("stakingCfgAccount stakedAmount: ", stakingCfgAccount.stakedAmount.toNumber());
    console.log("------------------------------------------------------");

    expect(calculatedAccumulatedReward.toNumber()).to.equal(stakingCfgAccount.accumulatedReward.toNumber());
    
  });

  it("withdraw reward", async () => {
    console.log("withdraw reward waiting 30 seconds...");
    await delay(30000);
    console.log("withdraw reward starting test...");
    const nftMint = new PublicKey(testKeyList.groupMemberDataList[0].nftMintPairList[0].memberMint);

    const staked_record = PublicKey.findProgramAddressSync(
      [Buffer.from(STAKED_RECORD_SEED), stakingCfg.toBuffer(), nftMint.toBuffer()],
      program.programId,
    )[0];
    console.log("staked_record: ", staked_record.toBase58());
    let stakedRecord = await program.account.stakedRecord.fetch(staked_record);
    let stakingCfgAccount = await program.account.stakingCfg.fetch(stakingCfg);
    let rewardTokenAccount: Account;
    let beforeWithdrawReward = 0;

    const rewardMint = await getMint(connection, REWARD_MINT);
    const rewardDecimals = rewardMint.decimals;

    const rewardAta = getAssociatedTokenAddressSync(REWARD_MINT, staker.publicKey, true, REWARD_PROGRAM);
    console.log("rewardAta: ", rewardAta.toBase58());
    const ataInfo = await connection.getAccountInfo(rewardAta);
    if(ataInfo) {
      rewardTokenAccount = await getAccount(connection, rewardAta);
      beforeWithdrawReward = Number(rewardTokenAccount.amount)/10**rewardDecimals;
      console.log("---before withdraw reward---: ", beforeWithdrawReward);
    }
    const beforerewardBasedOnStakedTime = stakedRecord.rewardBasedOnStakedTime.toNumber();
    console.log("---before withdraw totalRewardBasedOnStakedTime---: ", stakingCfgAccount.totalRewardBasedOnStakedTime.toNumber());
    console.log("---before withdraw rewardBasedOnStakedTime---: ", beforerewardBasedOnStakedTime);
    console.log("---before withdraw withdrawAt---: ", stakedRecord.withdrawAt.toNumber());
    console.log("---before withdraw stakedAt---: ", stakedRecord.stakedAt.toNumber());

    await program.methods.withdrawReward().accounts({
      staker: staker.publicKey,
      stakingCfg: stakingCfg,
      stakedRecord: staked_record,
      rewardMint: REWARD_MINT,
      rewardVault: rewardVault,
      rewardTokenAccount: rewardAta,
      rewardVaultAuthority: rewardVaultAuthority,
      rewardTokenProgram: REWARD_PROGRAM,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }).signers([staker]).rpc();

    //refresh the account data
    stakedRecord = await program.account.stakedRecord.fetch(staked_record);
    stakingCfgAccount = await program.account.stakingCfg.fetch(stakingCfg);
    rewardTokenAccount = await getAccount(connection, rewardAta);
    const afterWithdrawReward = Number(rewardTokenAccount.amount)/10**rewardDecimals;

    console.log("--------------------------------------------");
    console.log("---after withdraw reward---: ", afterWithdrawReward);
    console.log("---after withdraw totalRewardBasedOnStakedTime---: ", stakingCfgAccount.totalRewardBasedOnStakedTime.toNumber());
    console.log("---after withdraw rewardBasedOnStakedTime---: ", stakedRecord.rewardBasedOnStakedTime.toNumber());
    console.log("---after withdraw withdrawAt---: ", stakedRecord.withdrawAt.toNumber());
    console.log("---after withdraw stakedAt---: ", stakedRecord.stakedAt.toNumber());
    console.log("---latestRewardTime---: ", stakingCfgAccount.latestRewardTime.toNumber());

    const calcaAfterWithdrawReward = stakedRecord.withdrawAt
    .sub(stakingCfgAccount.latestRewardTime)
    .mul(stakingCfgAccount.latestReward)
    .add(stakingCfgAccount.accumulatedReward)
    .toNumber()-beforerewardBasedOnStakedTime;
    console.log("---after calcaAfterWithdrawReward---: ", calcaAfterWithdrawReward);
    expect(calcaAfterWithdrawReward).to.equal(afterWithdrawReward- beforeWithdrawReward);
  });

  it("unstake nft!", async () => {
    console.log("unstake nft waiting 26 seconds...");
    await delay(26000);
    console.log("unstake nft starting test...");
    const nftMint = new PublicKey(testKeyList.groupMemberDataList[0].nftMintPairList[0].memberMint);
    const nftTokenAccount = new PublicKey(testKeyList.groupMemberDataList[0].nftMintPairList[0].ata);
    const nftVault = getAssociatedTokenAddressSync(
      nftMint,
      nftVaultAuthority,
      true,
      TOKEN_2022_PROGRAM_ID,
    );
    console.log("nftVault: ", nftVault.toBase58());
    console.log("nftTokenAccount: ", nftTokenAccount.toBase58());
    const staked_record = PublicKey.findProgramAddressSync(
      [Buffer.from(STAKED_RECORD_SEED), stakingCfg.toBuffer(), nftMint.toBuffer()],
      program.programId,
    )[0];

    console.log("staked_record: ", staked_record.toBase58());
    let stakedRecord = await program.account.stakedRecord.fetch(staked_record);
    let stakingCfgAccount = await program.account.stakingCfg.fetch(stakingCfg);
    let rewardTokenAccount: Account;
    let beforeWithdrawReward = 0;

    const rewardMint = await getMint(connection, REWARD_MINT);
    const rewardDecimals = rewardMint.decimals;

    const rewardAta = getAssociatedTokenAddressSync(REWARD_MINT, staker.publicKey, true, REWARD_PROGRAM);
    console.log("rewardAta: ", rewardAta.toBase58());
    const ataInfo = await connection.getAccountInfo(rewardAta);
    if(ataInfo) {
      rewardTokenAccount = await getAccount(connection, rewardAta);
      beforeWithdrawReward = Number(rewardTokenAccount.amount)/10**rewardDecimals;
      console.log("---before withdraw reward---: ", beforeWithdrawReward);
    }
    const beforerewardBasedOnStakedTime = stakedRecord.rewardBasedOnStakedTime.toNumber();
    console.log("---before withdraw totalRewardBasedOnStakedTime---: ", stakingCfgAccount.totalRewardBasedOnStakedTime.toNumber());
    console.log("---before withdraw rewardBasedOnStakedTime---: ", beforerewardBasedOnStakedTime);
    console.log("---before withdraw withdrawAt---: ", stakedRecord.withdrawAt.toNumber());
    console.log("---before withdraw stakedAt---: ", stakedRecord.stakedAt.toNumber());
    console.log("---before withdraw stakedAmount---: ", stakingCfgAccount.stakedAmount.toNumber());

    await program.methods.unstake().accounts({
      staker: staker.publicKey,
      stakingCfg: stakingCfg,
      stakedRecord: staked_record,
      nftMint: nftMint,
      nftTokenAccount: nftTokenAccount,
      nftVault: nftVault,
      nftVaultAuthority: nftVaultAuthority,
      rewardMint: REWARD_MINT,
      rewardVault: rewardVault,
      rewardTokenAccount: rewardAta,
      rewardVaultAuthority: rewardVaultAuthority,
      rewardTokenProgram: REWARD_PROGRAM,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }).signers([staker]).rpc();

    //refresh the account data
    const stackRecordInfo = await connection.getAccountInfo(staked_record);
    if(!stackRecordInfo) {
      console.log("stakedRecord not found");
    }
    stakingCfgAccount = await program.account.stakingCfg.fetch(stakingCfg);
    rewardTokenAccount = await getAccount(connection, rewardAta);
    const afterWithdrawReward = Number(rewardTokenAccount.amount)/10**rewardDecimals;

    console.log("--------------------------------------------");
    console.log("---after withdraw reward---: ", afterWithdrawReward);
    console.log("---after withdraw totalRewardBasedOnStakedTime---: ", stakingCfgAccount.totalRewardBasedOnStakedTime.toNumber());
    console.log("---latestRewardTime---: ", stakingCfgAccount.latestRewardTime.toNumber());
    console.log("---accumulatedReward---: ", stakingCfgAccount.accumulatedReward.toNumber());
    console.log("---after withdraw stakedAmount---: ", stakingCfgAccount.stakedAmount.toNumber());

    
  });

  it.only("close staking", async () => {
    console.log("close staking waiting 26 seconds...");
    await delay(26000);
    console.log("close staking starting test...");
    
    //reward mint info
    const rewardMint = await getMint(connection, REWARD_MINT);
    const rewardDecimals = rewardMint.decimals;

    //admin reward token account info
    let adminRewardTokenAccount = await getAccount(connection, ADMIN_REWARD_TOKEN_ACCOUNT);
    const beforeCloseReward = Number(adminRewardTokenAccount.amount)/10**rewardDecimals;

    //reward vault info
    let rewardVaultAccount = await getAccount(connection, rewardVault);
    const beforeCloseRewardVault = Number(rewardVaultAccount.amount)/10**rewardDecimals;

    //staking cfg info
    let stakingCfgAccount = await program.account.stakingCfg.fetch(stakingCfg);
    const stakedEndTime = stakingCfgAccount.stakedEndTime.toNumber();

    console.log("---before close reward---: ", beforeCloseReward);
    console.log("---before close stakedEndTime---: ", stakedEndTime);
    console.log("---before close latestRewardTime---: ", stakingCfgAccount.latestRewardTime.toNumber());
    console.log("---before close accumulatedReward---: ", stakingCfgAccount.accumulatedReward.toNumber());
    console.log("---before close isActive---: ", stakingCfgAccount.isActive);
    console.log("---before close stakedAmount---: ", stakingCfgAccount.stakedAmount.toNumber());
    console.log("---before close rewardVaultAmount---: ", beforeCloseRewardVault);
    

    await program.methods.closeStaking().accounts({
      admin: payer.publicKey,
      stakingCfg: stakingCfg,
      rewardMint: REWARD_MINT,
      rewardVault: rewardVault,
      rewardTokenAccount: ADMIN_REWARD_TOKEN_ACCOUNT,
      rewardVaultAuthority: rewardVaultAuthority,
      rewardTokenProgram: REWARD_PROGRAM,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }).rpc();

    //refresh the account data
    stakingCfgAccount = await program.account.stakingCfg.fetch(stakingCfg);
    adminRewardTokenAccount = await getAccount(connection, ADMIN_REWARD_TOKEN_ACCOUNT);
    const afterCloseReward = Number(adminRewardTokenAccount.amount)/10**rewardDecimals;
    rewardVaultAccount = await getAccount(connection, rewardVault);
    const afterCloseRewardVault = Number(rewardVaultAccount.amount)/10**rewardDecimals;

    console.log("---after close reward---: ", afterCloseReward);
    console.log("---after close stakedEndTime---: ", stakingCfgAccount.stakedEndTime.toNumber());
    console.log("---after close latestRewardTime---: ", stakingCfgAccount.latestRewardTime.toNumber());
    console.log("---after close accumulatedReward---: ", stakingCfgAccount.accumulatedReward.toNumber());
    console.log("---after close isActive---: ", stakingCfgAccount.isActive);
    console.log("---after close stakedAmount---: ", stakingCfgAccount.stakedAmount.toNumber());
    console.log("---after close rewardVaultAmount---: ", afterCloseRewardVault);
  });

});
