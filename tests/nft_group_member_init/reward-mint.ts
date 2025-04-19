import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction, TransactionSignature } from "@solana/web3.js";
import { 
    createAssociatedTokenAccountInstruction, 
    createInitializeMintInstruction, 
    createMintToInstruction, 
    getAssociatedTokenAddressSync, 
    getMintLen, 
    TOKEN_2022_PROGRAM_ID, 
    TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import { createTokenMember } from "./create-member";
import { getExplorerLink, makeKeypairs } from "@solana-developers/helpers";
import dotenv from "dotenv";
import fs from 'fs';
import * as yaml from 'js-yaml';
import { TestKeyList, GroupMemberData, NftMintPair } from "./test-interface";

dotenv.config();

interface RewardMintInfo {
    mintKeypair: Keypair;
    tokenProgram: PublicKey;
}

async function createRewardMint(  
    connection: Connection,
    payer: Keypair,
    mintKeypair: Keypair,
    tokenProgram: PublicKey,
): Promise<TransactionSignature> {

    const decimals = 6;
    const mintSize = getMintLen([]);
    const lamports = await connection.getMinimumBalanceForRentExemption(mintSize);
    const transaction = new Transaction().add(
        SystemProgram.createAccount({
            fromPubkey: payer.publicKey,
            newAccountPubkey: mintKeypair.publicKey,
            space: mintSize,
            lamports: lamports,
            programId: tokenProgram,
        }),
        createInitializeMintInstruction(
            mintKeypair.publicKey,
            decimals,
            payer.publicKey,
            payer.publicKey,
            tokenProgram,
        )
    )

    const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [payer, mintKeypair]
    )
    console.log(`Reward mint created: ${mintKeypair.publicKey.toBase58()}`);

    return signature;
}


export async function rewardMint() {
    const endpoint = "http://127.0.0.1:8899";
    const wsEndpoint = "ws://127.0.0.1:8900";
    const connection = new Connection(endpoint, {wsEndpoint: wsEndpoint, commitment: 'confirmed'});

    const [tokenMintKeypair, token2022MintKeypair] = makeKeypairs(2);

    // const KEYPAIR_FILE_FILE = 'my-keypair.json';
    // const receiverkeypairPath = `${process.env.HOME}/${KEYPAIR_FILE_FILE}`;
    const paykeypairPath = `${process.env.HOME}/.config/solana/id.json`;
    const payer = Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(fs.readFileSync(paykeypairPath, 'utf8')))
    );
    // const receiver = Keypair.fromSecretKey(
    //     new Uint8Array(JSON.parse(fs.readFileSync(receiverkeypairPath, 'utf8')))
    // );

    console.log("Payer: ", payer.publicKey.toBase58());


    const testKeyList = yaml.load(fs.readFileSync('test-key-list.yaml', 'utf8')) as TestKeyList;

    
    const rewardMintInfoList: RewardMintInfo[] = [
        {
            mintKeypair: tokenMintKeypair,
            tokenProgram: TOKEN_PROGRAM_ID,
        },
        {
            mintKeypair: token2022MintKeypair,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
        }
    ];

    for (const rewardMintInfo of rewardMintInfoList) {
        const {mintKeypair, tokenProgram} = rewardMintInfo;
        await createRewardMint(
            connection,
            payer,
            mintKeypair,
            tokenProgram
        );  

        const ataAccount = getAssociatedTokenAddressSync(
            mintKeypair.publicKey,
            payer.publicKey,
            false,
            tokenProgram,
          );


        const createAtaInstruction = createAssociatedTokenAccountInstruction(
            payer.publicKey,
            ataAccount,
            payer.publicKey,
            mintKeypair.publicKey,
            tokenProgram,
        )

        const mintToInstruction = createMintToInstruction(
            mintKeypair.publicKey,
            ataAccount,
            payer.publicKey,
            10000000000000,
            [],
            tokenProgram,
        )

        const transaction = new Transaction().add(createAtaInstruction, mintToInstruction);
        const signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [payer]
        );
        console.log(`\n reward_mint: ${mintKeypair.publicKey.toBase58()} bound to ${ataAccount.toBase58()}`);
        console.log(`${mintKeypair.publicKey.toBase58()} Mint to transaction sent: ${getExplorerLink("tx", signature, "localnet")}\n`);
        const tokenProgramRewardList: NftMintPair[] = [];
        tokenProgramRewardList.push({
            memberMint: mintKeypair.publicKey.toBase58(),
            ata: ataAccount.toBase58(),
        });
        if(tokenProgram === TOKEN_PROGRAM_ID) {
            testKeyList.tokenProgramReward = tokenProgramRewardList;
        } else {
            testKeyList.token2022ProgramReward = tokenProgramRewardList;
        }

        fs.writeFileSync('test-key-list.yaml', yaml.dump(testKeyList));
    }
    
}

