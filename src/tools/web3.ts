import { clusterApiUrl, PublicKey, Connection } from "@solana/web3.js";
import { programs } from "@metaplex/js";
import {
  CancelListingTransaction,
  ListingTransaction,
  MintTransaction,
  NftMetadata,
  SaleTransaction,
  TransactionType,
  TransactionVariants,
  TransferTransaction,
} from "./types";
import BN from "bignumber.js";

const connection = new Connection(clusterApiUrl("mainnet-beta"));

// This is the mainnet authority which is used by Magic Eden for listing
// NFTs. The address is used to identify Magic Eden marketplace related
// transactions.
const MAGIC_EDEN_LISTING_ACCOUNT =
  "GUfCR9mK6azb9vcpsxgXyj7XRPAKJd4KMHTTVvtncGgp";

interface SolPriceResponse {
  solana: {
    usd: number;
  };
}

/**
 * Fetch current SOL price using the CoinGecko API.
 */
export const fetchSolPrice = async () => {
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=SOLANA&vs_currencies=USD";

  const response = await fetch(url);
  const price: SolPriceResponse = await response.json();
  return new BN(price.solana.usd);
};

/**
 * Fetch NFT token metadata. This function derives the on-chain metadata using
 * the Metaplex SDK and then fetches the full metadata record stored on
 * Arweave.
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
 *
 * This function goes through a few steps:
 *
 * 1. Fetch transaction history for given address
 * 2. Find mint and transfer transactions, record token accounts using these
 * 3. Search transaction history of each token account
 * 4. Identify Magic Eden transactions using Magic Eden program ID
 * 5. Sort and return the results
 *
 * A few points to comment on:
 *
 * - This function makes a lot of API calls and can easily get rate limited
 *   by RPC nodes.
 * - The logic is really guessing to identify Magic Eden transactions. Ideally,
 *   if one knew the structure of the Magic Eden programs one could identify
 *   and deserialize these transactions more reliably.
 */
export const fetchMagicEdenActivityHistory = async (address: string) => {
  // First get all the transactions for the given mint address
  const pk = new PublicKey(address);
  const signatures = await connection.getSignaturesForAddress(pk);
  const txs = await connection.getParsedConfirmedTransactions(
    signatures.map((x) => x.signature),
  );

  const activity: TransactionVariants[] = [];
  const tokenAccounts: Set<string> = new Set();

  console.log(`Found ${txs.length} transactions for address: ${address}`);

  // Iterate through all the transactions and identify transfers and the
  // original mint transactions. Record associated accounts, which will be
  // checked next.
  for (const tx of txs) {
    const instructions = tx?.transaction.message.instructions;
    if (instructions) {
      for (const inx of instructions) {
        if ("parsed" in inx) {
          const { type } = inx.parsed;

          // Mint transaction
          if (type === "mintTo") {
            const minter = inx.parsed.info.mintAuthority;
            const mintTransaction: MintTransaction = {
              tx,
              minter,
              type: TransactionType.Mint,
              signatures: tx.transaction.signatures,
            };
            activity.push(mintTransaction);
            tokenAccounts.add(inx.parsed.info.account);
          }

          // Transfer transactions
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
              tokenAccounts.add(destination);
            }
          }
        }
      }
    }
  }

  const tokenAccountsList = Array.from(tokenAccounts);

  // For each identified token account for the given mint address, search
  // its transaction history and identify transactions related to Magic Eden
  // using Magic Eden program IDs. Record these transactions in the activity
  // history.
  for (const account of tokenAccountsList) {
    const pk = new PublicKey(account);
    const signatures = await connection.getSignaturesForAddress(pk);
    const txs = await connection.getParsedConfirmedTransactions(
      signatures.map((x) => x.signature),
    );

    console.log(`Found ${txs.length} transactions for token account: ${pk}`);

    for (const tx of txs) {
      const innerInstructions = tx?.meta?.innerInstructions;
      if (innerInstructions) {
        for (const innerInstruction of innerInstructions) {
          if (innerInstruction) {
            let isSaleTransaction = false;
            let buyer = "";
            let lamportsTransferred = new BN(0);

            for (const inx of innerInstruction.instructions) {
              if ("parsed" in inx) {
                if (inx.parsed.type === "transfer") {
                  const amount = inx.parsed.info.lamports;
                  lamportsTransferred = lamportsTransferred.plus(amount);
                }

                if (inx.parsed.type === "setAuthority") {
                  const { authority, newAuthority } = inx.parsed.info;

                  if (newAuthority === MAGIC_EDEN_LISTING_ACCOUNT) {
                    // If the newAuthority is the Magic Eden listing account,
                    // this is a listing transaction.
                    // NOTE: It's unclear how to get the listing price for a
                    // listing transaction data. It seems this information
                    // may only be included in the Magic Eden encoded
                    // transaction data.
                    const listingTransaction: ListingTransaction = {
                      tx,
                      type: TransactionType.Listing,
                      seller: authority,
                      signatures: tx.transaction.signatures,
                    };
                    activity.push(listingTransaction);
                  } else if (authority === MAGIC_EDEN_LISTING_ACCOUNT) {
                    // If the current authority is the Magic Eden listing
                    // account it is a cancel listing transaction if there is
                    // only one instruction. Otherwise it is a sale.
                    if (innerInstruction.instructions.length === 1) {
                      const cancelListingTransaction: CancelListingTransaction =
                        {
                          tx,
                          type: TransactionType.CancelListing,
                          seller: newAuthority,
                          signatures: tx.transaction.signatures,
                        };
                      activity.push(cancelListingTransaction);
                    } else {
                      // Otherwise it is a sale
                      isSaleTransaction = true;
                      buyer = newAuthority;
                    }
                  }
                }
              }
            }

            // If it is a sale, all the transferred lamports in the transaction
            // represent the total sale price.
            if (isSaleTransaction) {
              const saleTransaction: SaleTransaction = {
                tx,
                type: TransactionType.Sale,
                lamports: lamportsTransferred,
                buyer,
                signatures: tx.transaction.signatures,
              };
              activity.push(saleTransaction);
            }
          }
        }
      }
    }
  }

  // Sort all discovered transactions by block time to get the correct order
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
