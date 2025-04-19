import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import { 
    createAssociatedTokenAccountInstruction, 
    createMintToInstruction, 
    getAssociatedTokenAddressSync, 
    TOKEN_2022_PROGRAM_ID 
} from "@solana/spl-token";
import { createTokenMember } from "./create-member";
import { getExplorerLink } from "@solana-developers/helpers";
import dotenv from "dotenv";
import fs from 'fs';
import * as yaml from 'js-yaml';
import { TestKeyList, GroupMemberData, NftMintPair } from "./test-interface";

dotenv.config();

export async function mintNFT() {
    const endpoint = "http://127.0.0.1:8899";
    const wsEndpoint = "ws://127.0.0.1:8900";
    const connection = new Connection(endpoint, {wsEndpoint: wsEndpoint, commitment: 'confirmed'});

    const testKeyList = yaml.load(fs.readFileSync('test-key-list.yaml', 'utf8')) as TestKeyList;
    const group1_member_mints_pair_list: NftMintPair[] = [];
    for (const nftMintPair of testKeyList.groupMemberDataList[0].nftMintPairList) {
        group1_member_mints_pair_list.push(nftMintPair);
    }

    const group2_member_mints_pair_list: NftMintPair[] = [];
    for (const nftMintPair of testKeyList.groupMemberDataList[1].nftMintPairList) {
        group2_member_mints_pair_list.push(nftMintPair);
    }

    const nft_mint_pair_list = [...group1_member_mints_pair_list, ...group2_member_mints_pair_list];

    const KEYPAIR_FILE_FILE = 'my-keypair.json';
    const receiverkeypairPath = `${process.env.HOME}/${KEYPAIR_FILE_FILE}`;
    const paykeypairPath = `${process.env.HOME}/.config/solana/id.json`;
    const payer = Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(fs.readFileSync(paykeypairPath, 'utf8')))
    );
    const receiver = Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(fs.readFileSync(receiverkeypairPath, 'utf8')))
    );

    console.log("Payer: ", payer.publicKey.toBase58());
    console.log("Receiver: ", receiver.publicKey.toBase58());

    for (const nft_mint_pair of nft_mint_pair_list) {

        const ataAccount = getAssociatedTokenAddressSync(
            new PublicKey(nft_mint_pair.memberMint),
            receiver.publicKey,
            false,
            TOKEN_2022_PROGRAM_ID,
          );


        const createAtaInstruction = createAssociatedTokenAccountInstruction(
            receiver.publicKey,
            ataAccount,
            receiver.publicKey,
            new PublicKey(nft_mint_pair.memberMint),
            TOKEN_2022_PROGRAM_ID,
        )

        const mintToInstruction = createMintToInstruction(
            new PublicKey(nft_mint_pair.memberMint),
            ataAccount,
            payer.publicKey,
            1,
            [],
            TOKEN_2022_PROGRAM_ID,
        )

        const transaction = new Transaction().add(createAtaInstruction, mintToInstruction);
        const signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [payer, receiver]
        );
        
        console.log(`nft_mint: ${new PublicKey(nft_mint_pair.memberMint).toBase58()} bound to ${ataAccount.toBase58()}`);
        console.log(`${new PublicKey(nft_mint_pair.memberMint).toBase58()} Mint to transaction sent: ${getExplorerLink("tx", signature, "localnet")}`);

        nft_mint_pair.ata = ataAccount.toBase58();
    }

    testKeyList.groupMemberDataList[0].nftMintPairList = group1_member_mints_pair_list;
    testKeyList.groupMemberDataList[1].nftMintPairList = group2_member_mints_pair_list;
    fs.writeFileSync('test-key-list.yaml', yaml.dump(testKeyList));
}

