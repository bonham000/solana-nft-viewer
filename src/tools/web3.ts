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

// It's not entirely clear what addresses these are, but they appear to also
// be associated with Sale transactions. They could be more which needed to
// be added to this list.
const MULTI_SIG_ADDRESSES = new Set([
  "4pUQS4Jo2dsfWzt3VgHXy3H6RYnEDd11oWPiaM2rdAPw",
  "3D49QorJyNaL4rcpiynbuS3pRH4Y7EXEM6v6ZGaqfFGK",
]);

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
  const data: SolPriceResponse = await response.json();
  const solPrice = new BN(data.solana.usd);
  return solPrice;
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
 * Fetch NFT activity history for a given mint address.
 *
 * This function goes through a few steps:
 *
 * 1. Fetch transaction history for given address
 * 2. Find mint and transfer transactions, record token accounts using these
 * 3. Search transaction history of each token account
 * 4. Identify Magic Eden transactions using Magic Eden program ID
 * 5. Sort and return the results
 *
 * A few comments:
 *
 * - This function makes a lot of API calls and can easily get rate limited
 *   by RPC nodes.
 * - The logic is really guessing to identify Magic Eden transactions. Ideally,
 *   if one knew the structure of the Magic Eden programs one could identify
 *   and deserialize these transactions more reliably.
 */
export const fetchActivityHistory = async (address: string) => {
  // First get all the transactions for the given mint address
  const pk = new PublicKey(address);
  const signatures = await connection.getSignaturesForAddress(pk);
  const txs = await connection.getParsedConfirmedTransactions(
    signatures.map((x) => x.signature),
  );

  const activity: TransactionVariants[] = [];

  // Use a Set to avoid duplicate marking accounts (might not happen
  // but this will prevent it anyway).
  const tokenAccounts: Set<string> = new Set([]);

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

            // Record mint transaction
            activity.push(mintTransaction);

            // Capture mintTo target account
            tokenAccounts.add(inx.parsed.info.account);
          }

          // Create associated token account transactions
          if (type === "create") {
            const mint = inx.parsed.info.mint;
            if (mint === address) {
              const account = inx.parsed.info.account;
              tokenAccounts.add(account);
            }
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

              // Record transfer transaction
              activity.push(transferTransaction);

              // Capture destination token account
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
                // Record/increment transferred lamports. This is used to
                // determine the buy price for Sale transactions, in which
                // the total price represents all the transferred lamports.
                // There are multiple separate transfers because of artist
                // royalties.
                if (inx.parsed.type === "transfer") {
                  const amount = inx.parsed.info.lamports;
                  if (typeof amount === "number") {
                    lamportsTransferred = lamportsTransferred.plus(amount);

                    // Preemptively assign buyer in the event this is a special
                    // type of Sale transaction (matched below with multisig
                    // address).
                    buyer = inx.parsed.info.source;
                  }
                }

                // Identify transfers which involve this special multisig
                // authority. These also represent sale transactions.
                if (inx.parsed.type === "transfer") {
                  const multisig = inx.parsed.info.multisigAuthority;
                  if (MULTI_SIG_ADDRESSES.has(multisig)) {
                    // This is getting a bit hacky but in this variation of
                    // sale transactions there is a closeAccount instruction,
                    // a transfer instruction (this one), and other transfer
                    // instructions which transfer SOL. That is in contrast
                    // to the same type of instruction for closing a listing,
                    // which doesn't include the SOL transfers.
                    if (innerInstruction.instructions.length > 2) {
                      isSaleTransaction = true;
                    }
                  }
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

                    // Record listing transaction
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

                      // Record cancel listing transaction
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

              // Record sale transaction
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
