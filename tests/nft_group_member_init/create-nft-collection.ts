import {
    getExplorerLink,
    initializeKeypair,
    makeKeypairs,
  } from "@solana-developers/helpers";
  import { Connection, Keypair } from "@solana/web3.js";
  import dotenv from "dotenv";
  import { TokenMetadata } from "@solana/spl-token-metadata";
  import { LabNFTMetadata, uploadOffChainMetadata } from "./upload-helper";
  import { createTokenGroup } from "./create-group";
  import {
    getGroupMemberPointerState,
    getGroupPointerState,
    getMetadataPointerState,
    getMint,
    getTokenGroupMemberState,
    getTokenMetadata,
    TOKEN_2022_PROGRAM_ID,
  } from "@solana/spl-token";
  import { createTokenMember } from "./create-member";
  import { TestKeyList, GroupMemberData, NftMintPair } from "./test-interface";
  import fs from 'fs';
  import * as yaml from 'js-yaml';
  import path from 'path';
  import { promises } from "dns";
  dotenv.config();
  
  async function createNFTCollection():Promise<GroupMemberData> {
    const endpoint = "http://127.0.0.1:8899";
    const wsEndpoint = "ws://127.0.0.1:8900";
    const connection = new Connection(endpoint, {wsEndpoint: wsEndpoint, commitment: 'confirmed'});
  
//   const payer = await initializeKeypair(connection);

const KEYPAIR_FILE_FILE = 'my-keypair.json';

const keypairPath = `${process.env.HOME}/.config/solana/id.json`;
const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
const payer = Keypair.fromSecretKey(new Uint8Array(keypairData));
console.log("Payer: ", payer.publicKey.toBase58());
  
  const decimals = 0;
  const maxMembers = 3;
  
  const [groupMintKeypair, cat0Mint, cat1Mint, cat2Mint] = makeKeypairs(4);
  
  // CREATE GROUP METADATA
  const groupMetadata: LabNFTMetadata = {
    mint: groupMintKeypair,
    imagePath: "tests/nft_group_member_init/assets/collection.jpg",
    tokenName: "cool-cats-collection",
    tokenDescription: "Collection of Cool Cat NFTs",
    tokenSymbol: "MEOW",
    tokenExternalUrl: "https://solana.com/",
    tokenAdditionalMetadata: {},
    tokenUri: "",
  };
  
  // UPLOAD OFF-CHAIN METADATA
  groupMetadata.tokenUri = await uploadOffChainMetadata(payer, groupMetadata);

  console.log("Group Metadata URI: ", groupMetadata.tokenUri);
  
  // FORMAT GROUP TOKEN METADATA
  const collectionTokenMetadata: TokenMetadata = {
    name: groupMetadata.tokenName,
    mint: groupMintKeypair.publicKey,
    symbol: groupMetadata.tokenSymbol,
    uri: groupMetadata.tokenUri,
    updateAuthority: payer.publicKey,
    additionalMetadata: Object.entries(
      groupMetadata.tokenAdditionalMetadata || []
    ).map(([trait_type, value]) => [trait_type, value]),
  };
  
  // CREATE GROUP
  const signature = await createTokenGroup(
    connection,
    payer,
    groupMintKeypair,
    decimals,
    maxMembers,
    collectionTokenMetadata
  );
  
  console.log(
    `Created collection mint with metadata:\n${getExplorerLink("tx", signature, "localnet")}\n`
  );
  
  // FETCH THE GROUP
  const groupMint = await getMint(
    connection,
    groupMintKeypair.publicKey,
    "confirmed",
    TOKEN_2022_PROGRAM_ID
  );
  const fetchedGroupMetadata = await getTokenMetadata(
    connection,
    groupMintKeypair.publicKey
  );
  const metadataPointerState = getMetadataPointerState(groupMint);
  const groupData = getGroupPointerState(groupMint);
  
  console.log("\n---------- GROUP DATA -------------\n");
  console.log("Group Mint: ", groupMint.address.toBase58());
  console.log(
    "Metadata Pointer Account: ",
    metadataPointerState?.metadataAddress?.toBase58()
  );
  console.log("Group Pointer Account: ", groupData?.groupAddress?.toBase58());
  console.log("\n--- METADATA ---\n");
  console.log("Name: ", fetchedGroupMetadata?.name);
  console.log("Symbol: ", fetchedGroupMetadata?.symbol);
  console.log("Uri: ", fetchedGroupMetadata?.uri);
  console.log("\n------------------------------------\n");
  
  // DEFINE MEMBER METADATA
  const membersMetadata: LabNFTMetadata[] = [
    {
      mint: cat0Mint,
      imagePath: "tests/nft_group_member_init/assets/cat_0.jpeg",
      tokenName: "Cat 1",
      tokenDescription: "Adorable cat",
      tokenSymbol: "MEOW",
      tokenExternalUrl: "https://solana.com/",
      tokenAdditionalMetadata: {},
      tokenUri: "",
    },
    {
      mint: cat1Mint,
      imagePath: "tests/nft_group_member_init/assets/cat_1.jpeg",
      tokenName: "Cat 2",
      tokenDescription: "Sassy cat",
      tokenSymbol: "MEOW",
      tokenExternalUrl: "https://solana.com/",
      tokenAdditionalMetadata: {},
      tokenUri: "",
    },
    {
      mint: cat2Mint,
      imagePath: "tests/nft_group_member_init/assets/cat_2.jpeg",
      tokenName: "Cat 3",
      tokenDescription: "Silly cat",
      tokenSymbol: "MEOW",
      tokenExternalUrl: "https://solana.com/",
      tokenAdditionalMetadata: {},
      tokenUri: "",
    },
  ];
  
  // UPLOAD MEMBER METADATA
  for (const member of membersMetadata) {
    member.tokenUri = await uploadOffChainMetadata(payer, member);
  }
  
  // FORMAT MEMBER TOKEN METADATA
  const memberTokenMetadata: { mintKeypair: Keypair; metadata: TokenMetadata }[] =
    membersMetadata.map((member) => ({
      mintKeypair: member.mint,
      metadata: {
        name: member.tokenName,
        mint: member.mint.publicKey,
        symbol: member.tokenSymbol,
        uri: member.tokenUri,
        updateAuthority: payer.publicKey,
        additionalMetadata: Object.entries(
          member.tokenAdditionalMetadata || []
        ).map(([trait_type, value]) => [trait_type, value]),
      } as TokenMetadata,
    }));
  
  // CREATE MEMBER MINTS
  for (const memberMetadata of memberTokenMetadata) {
    const signature = await createTokenMember(
      connection,
      payer,
      memberMetadata.mintKeypair,
      decimals,
      memberMetadata.metadata,
      groupMintKeypair.publicKey
    );
  
    console.log(
      `Created ${memberMetadata.metadata.name} NFT:\n${getExplorerLink("tx", signature, "localnet")}\n`
    );
  }
  

  const nftMintPairList: NftMintPair[] = [];

  // FETCH THE MEMBERS
  for (const member of membersMetadata) {
    const memberMint = await getMint(
      connection,
      member.mint.publicKey,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    const memberMetadata = await getTokenMetadata(
      connection,
      member.mint.publicKey
    );
    const metadataPointerState = getMetadataPointerState(memberMint);
    const memberPointerData = getGroupMemberPointerState(memberMint);
    const memberData = getTokenGroupMemberState(memberMint);
  
    console.log("\n---------- MEMBER DATA -------------\n");
    console.log("Member Mint: ", memberMint.address.toBase58());
    console.log(
      "Metadata Pointer Account: ",
      metadataPointerState?.metadataAddress?.toBase58()
    );
    console.log("Group Account: ", memberData?.group?.toBase58());
    console.log(
      "Member Pointer Account: ",
      memberPointerData?.memberAddress?.toBase58()
    );
    console.log("Member Number: ", memberData?.memberNumber);
    console.log("\n--- METADATA ---\n");
    console.log("Name: ", memberMetadata?.name);
    console.log("Symbol: ", memberMetadata?.symbol);
    console.log("Uri: ", memberMetadata?.uri);
    console.log("\n------------------------------------\n");

    nftMintPairList.push({
      memberMint: member.mint.publicKey.toBase58(),
      ata: "",
    });
  }

  return {
    groupMint: groupMint.address.toBase58(),
    nftMintPairList: nftMintPairList,
  };


}


export async function createNFTS() {


  const groupMemberDataList: GroupMemberData[] = [];
  groupMemberDataList.push(await createNFTCollection());
  groupMemberDataList.push(await createNFTCollection());

  const testKeyList: TestKeyList = {  
    groupMemberDataList: groupMemberDataList,
    tokenProgramReward: [],
    token2022ProgramReward: [],
  };

  fs.writeFileSync("test-key-list.yaml", yaml.dump(testKeyList));

}


