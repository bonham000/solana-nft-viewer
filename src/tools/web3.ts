import { clusterApiUrl, PublicKey, Connection } from "@solana/web3.js";
import { programs } from "@metaplex/js";
import {
  ListingTransaction,
  MintTransaction,
  NftMetadata,
  SaleTransaction,
  TransactionType,
  TransactionVariants,
  TransferTransaction,
} from "./types";

// Avoid RPC rate limits....
const wait = async (time = 250) => {
  return new Promise((resolve) => setTimeout(resolve, time));
};

const connection = new Connection(clusterApiUrl("mainnet-beta"));

const MAGIC_EDEN_PROGRAM_ID = "MEisE1HzehtrDpAAT8PnLHjpSSkRYakotTuJRPjTpo8";

const MAGIC_EDEN_LISTING_ACCOUNT =
  "GUfCR9mK6azb9vcpsxgXyj7XRPAKJd4KMHTTVvtncGgp";

interface SolPriceResponse {
  solana: {
    usd: number;
  };
}

/**
 * Fetch current SOL price.
 */
export const fetchSolPrice = async () => {
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=SOLANA&vs_currencies=USD";

  const response = await fetch(url);
  const price: SolPriceResponse = await response.json();
  return price.solana.usd;
};

/**
 * Fetch NFT token metadata.
 */
export const fetchTokenMetadata = async (
  address: string,
): Promise<NftMetadata> => {
  const pda = await programs.metadata.Metadata.getPDA(new PublicKey(address));
  const result = await programs.metadata.Metadata.load(connection, pda);
  const metadataUri = result.data.data.uri;
  const response = await fetch(metadataUri);
  const metadata: NftMetadata = await response.json();
  return metadata;
};

/**
 * Fetch NFT activity history.
 */
export const fetchTransactionHistory = async (address: string) => {
  const pk = new PublicKey(address);
  const signatures = await connection.getSignaturesForAddress(pk);

  let txs = [];
  for (const signature of signatures) {
    // Help with RPC rate limit issues
    await wait(750);
    const tx = await connection.getParsedConfirmedTransaction(
      signature.signature,
    );
    txs.push(tx);
  }

  const activity: TransactionVariants[] = [];

  const tokenAccounts: PublicKey[] = [];

  for (const tx of txs) {
    const instructions = tx?.transaction.message.instructions;
    if (instructions) {
      for (const inx of instructions) {
        if ("parsed" in inx) {
          const { type } = inx.parsed;

          // Mint transaction
          if (type === "mintTo") {
            const mintTransaction: MintTransaction = {
              tx,
              minter: "???",
              type: TransactionType.Mint,
              signatures: tx.transaction.signatures,
            };
            activity.push(mintTransaction);
          }

          // Transfer transaction
          if (type === "transferChecked") {
            const mint = inx.parsed.info.mint;
            if (mint === address) {
              const source: string = inx.parsed.info.source;
              const destination: string = inx.parsed.info.destination;
              const transferTransaction: TransferTransaction = {
                tx,
                source,
                destination,
                type: TransactionType.Transfer,
                signatures: tx.transaction.signatures,
              };

              activity.push(transferTransaction);

              tokenAccounts.push(new PublicKey(destination));
            }
          }
        }
      }
    }
  }

  for (const owner of tokenAccounts) {
    const signatures = await connection.getSignaturesForAddress(owner);

    const magicEdenTransactions = [];
    const txs = [];

    for (const signature of signatures) {
      const tx = await connection.getParsedConfirmedTransaction(
        signature.signature,
      );
      txs.push(tx);

      const accounts = tx?.transaction.message.accountKeys;
      if (accounts) {
        for (const account of accounts) {
          if (account.pubkey.toBase58() === MAGIC_EDEN_PROGRAM_ID) {
            magicEdenTransactions.push(tx);
          }
        }
      }

      const innerInstructions = tx?.meta?.innerInstructions;
      if (innerInstructions) {
        for (const innerInstruction of innerInstructions) {
          if (innerInstruction) {
            for (const inx of innerInstruction.instructions) {
              if ("parsed" in inx) {
                // TODO: Find cancel listing transactions

                if (inx.parsed.type === "setAuthority") {
                  const { authority, newAuthority } = inx.parsed.info;
                  if (newAuthority === MAGIC_EDEN_LISTING_ACCOUNT) {
                    const listingTransaction: ListingTransaction = {
                      tx,
                      type: TransactionType.Listing,
                      lamportsPrice: NaN,
                      seller: authority,
                      signatures: tx.transaction.signatures,
                    };
                    activity.push(listingTransaction);
                  } else if (authority === MAGIC_EDEN_LISTING_ACCOUNT) {
                    const saleTransaction: SaleTransaction = {
                      tx,
                      type: TransactionType.Sale,
                      lamportsPrice: NaN,
                      seller: "???",
                      buyer: newAuthority,
                      signatures: tx.transaction.signatures,
                    };
                    activity.push(saleTransaction);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // Sort all discovered transactions by block time
  const history = activity.sort((a, b) => {
    const aTime = a.tx.blockTime;
    const bTime = b.tx.blockTime;
    if (aTime && bTime) {
      return bTime - aTime;
    } else {
      return 1;
    }
  });

  return history;
};
