import {
    sendAndConfirmTransaction,
    Connection,
    Keypair,
    SystemProgram,
    Transaction,
    TransactionSignature,
    PublicKey,
  } from "@solana/web3.js";
  
  import {
    ExtensionType,
    createInitializeMintInstruction,
    getMintLen,
    TOKEN_2022_PROGRAM_ID,
    TYPE_SIZE,
    LENGTH_SIZE,
    createInitializeMetadataPointerInstruction,
    TOKEN_GROUP_SIZE,
    createInitializeGroupMemberPointerInstruction,
    createInitializeMemberInstruction,
  } from "@solana/spl-token";
  import {
    TokenMetadata,
    createInitializeInstruction,
    pack,
  } from "@solana/spl-token-metadata";
  
  export async function createTokenMember(
    connection: Connection,
    payer: Keypair,
    mintKeypair: Keypair,
    decimals: number,
    metadata: TokenMetadata,
    groupAddress: PublicKey
  ): Promise<TransactionSignature> {
    const extensions: ExtensionType[] = [
      ExtensionType.GroupMemberPointer,
      ExtensionType.MetadataPointer,
    ];
  
    const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
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
      createInitializeGroupMemberPointerInstruction(
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
      createInitializeMemberInstruction({
        group: groupAddress,
        groupUpdateAuthority: payer.publicKey,
        member: mintKeypair.publicKey,
        memberMint: mintKeypair.publicKey,
        memberMintAuthority: payer.publicKey,
        programId: TOKEN_2022_PROGRAM_ID,
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
  
    const signature = await sendAndConfirmTransaction(
      connection,
      mintTransaction,
      [payer, mintKeypair]
    );
  
    return signature;
  }