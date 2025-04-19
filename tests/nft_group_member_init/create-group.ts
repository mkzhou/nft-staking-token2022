import {
    sendAndConfirmTransaction,
    Connection,
    Keypair,
    SystemProgram,
    Transaction,
    TransactionSignature,
  } from "@solana/web3.js";
  
  import {
    ExtensionType,
    createInitializeMintInstruction,
    getMintLen,
    TOKEN_2022_PROGRAM_ID,
    createInitializeGroupInstruction,
    createInitializeGroupPointerInstruction,
    TYPE_SIZE,
    LENGTH_SIZE,
    createInitializeMetadataPointerInstruction,
    TOKEN_GROUP_SIZE,
  } from "@solana/spl-token";
  import {
    TokenMetadata,
    createInitializeInstruction,
    pack,
  } from "@solana/spl-token-metadata";
  
  export async function createTokenGroup(
    connection: Connection,
    payer: Keypair,
    mintKeypair: Keypair,
    decimals: number,
    maxMembers: number,
    metadata: TokenMetadata
  ): Promise<TransactionSignature> {
    const extensions: ExtensionType[] = [
      ExtensionType.GroupPointer,
      ExtensionType.MetadataPointer,
    ];
  
    const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length + 500;
    const mintLength = getMintLen(extensions);
    const totalLen = mintLength + metadataLen + TOKEN_GROUP_SIZE;
  
    const mintLamports =
      await connection.getMinimumBalanceForRentExemption(totalLen);
  
    const mintTransaction = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: mintLength,
        lamports: mintLamports,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeGroupPointerInstruction(
        mintKeypair.publicKey,
        payer.publicKey,
        mintKeypair.publicKey,
        TOKEN_2022_PROGRAM_ID
      ),
      createInitializeMetadataPointerInstruction(
        mintKeypair.publicKey,
        payer.publicKey,
        mintKeypair.publicKey,
        TOKEN_2022_PROGRAM_ID
      ),
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        decimals,
        payer.publicKey,
        payer.publicKey,
        TOKEN_2022_PROGRAM_ID
      ),
      createInitializeGroupInstruction({
        group: mintKeypair.publicKey,
        maxSize: BigInt(maxMembers),
        mint: mintKeypair.publicKey,
        mintAuthority: payer.publicKey,
        programId: TOKEN_2022_PROGRAM_ID,
        updateAuthority: payer.publicKey,
      }),
      createInitializeInstruction({
        metadata: mintKeypair.publicKey,
        mint: mintKeypair.publicKey,
        mintAuthority: payer.publicKey,
        name: metadata.name,
        programId: TOKEN_2022_PROGRAM_ID,
        symbol: metadata.symbol,
        updateAuthority: payer.publicKey,
        uri: metadata.uri,
      })
    );
    console.log("start to send group transaction ");
    const signature = await sendAndConfirmTransaction(
      connection,
      mintTransaction,
      [payer, mintKeypair]
    );
  
    return signature;
  }