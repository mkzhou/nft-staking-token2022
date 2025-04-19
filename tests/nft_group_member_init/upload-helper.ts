import { clusterApiUrl, Connection, Keypair } from "@solana/web3.js";
import Irys from "@irys/sdk";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

export interface LabNFTMetadata {
  mint: Keypair;
  imagePath: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDescription: string;
  tokenExternalUrl: string;
  tokenAdditionalMetadata: Record<string, string>;
  tokenUri?: string;
}

function formatIrysUrl(id: string) {
  return `https://gateway.irys.xyz/${id}`;
}

const getIrysArweave = async (secretKey: Uint8Array) => {
  const irys = new Irys({
    network: "devnet",
    token: "solana",
    key: secretKey,
    config: {
      providerUrl: clusterApiUrl("devnet"),
    },
  });
  return irys;
};

export async function uploadOffChainMetadata(
  payer: Keypair,
  metadata: LabNFTMetadata
) {
  const {
    imagePath,
    tokenName,
    tokenSymbol,
    tokenDescription,
    tokenExternalUrl,
    tokenAdditionalMetadata,
  } = metadata;

  const irys = await getIrysArweave(payer.secretKey);

  // Convert balance to standard
  const imageUploadReceipt = await irys.uploadFile(imagePath);

  const formattedMetadata = {
    name: tokenName,
    symbol: tokenSymbol,
    description: tokenDescription,
    external_url: tokenExternalUrl,
    image: formatIrysUrl(imageUploadReceipt.id),
    attributes: Object.entries(tokenAdditionalMetadata || []).map(
      ([trait_type, value]) => ({ trait_type, value })
    ),
  };

  const metadataToUpload = JSON.stringify(formattedMetadata, null, 4);
  const metadataUploadReceipt = await irys.upload(metadataToUpload);

  return formatIrysUrl(metadataUploadReceipt.id);
}