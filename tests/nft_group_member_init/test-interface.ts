import { PublicKey } from "@solana/web3.js";

export interface NftMintPair {
    memberMint: string;
    ata: string;
}

export interface GroupMemberData {
    groupMint: string;
    nftMintPairList: NftMintPair[];
}


export interface TestKeyList {
    groupMemberDataList: GroupMemberData[];
    tokenProgramReward: NftMintPair[];
    token2022ProgramReward: NftMintPair[];
}

