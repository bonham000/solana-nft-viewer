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
} from "./web3-types";
import BN from "bignumber.js";

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
  return new BN(price.solana.usd);
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

  console.log(
    `Found ${signatures.length} signatures for address ${pk.toBase58()}`,
  );

  let txs = await connection.getParsedConfirmedTransactions(
    signatures.map((x) => x.signature),
  );

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
            console.log(tx);
            const minter = inx.parsed.info.mintAuthority;
            const mintTransaction: MintTransaction = {
              tx,
              minter,
              type: TransactionType.Mint,
              signatures: tx.transaction.signatures,
            };
            activity.push(mintTransaction);
            tokenAccounts.push(new PublicKey(inx.parsed.info.account));
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
              tokenAccounts.push(new PublicKey(destination));
            }
          }
        }
      }
    }
  }

  console.log("Token accounts: ", tokenAccounts);

  for (const account of tokenAccounts) {
    const signatures = await connection.getSignaturesForAddress(account);
    const magicEdenTransactions = [];
    const txs = await connection.getParsedConfirmedTransactions(
      signatures.map((x) => x.signature),
    );

    for (const tx of txs) {
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
            let isSaleTransaction = false;
            let buyer = "";
            let lamportsTransferred = 0;

            for (const inx of innerInstruction.instructions) {
              if ("parsed" in inx) {
                if (inx.parsed.type === "transfer") {
                  lamportsTransferred += inx.parsed.info.lamports;
                }

                if (inx.parsed.type === "setAuthority") {
                  const { authority, newAuthority } = inx.parsed.info;
                  if (newAuthority === MAGIC_EDEN_LISTING_ACCOUNT) {
                    const listingTransaction: ListingTransaction = {
                      tx,
                      type: TransactionType.Listing,
                      seller: authority,
                      signatures: tx.transaction.signatures,
                    };
                    activity.push(listingTransaction);
                  } else if (authority === MAGIC_EDEN_LISTING_ACCOUNT) {
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
                      isSaleTransaction = true;
                      buyer = newAuthority;
                    }
                  }
                }
              }
            }

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
