import { createNFTS } from "./create-nft-collection";
import { mintNFT } from "./mint-nft";
import { rewardMint } from "./reward-mint";

async function main() {
    await createNFTS();
    await mintNFT();
    await rewardMint();
}

main();