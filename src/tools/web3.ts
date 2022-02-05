import { clusterApiUrl, PublicKey, Connection } from "@solana/web3.js";
import { programs } from "@metaplex/js";
import {
  CancelListingTransaction,
  ListingTransaction,
  MintTransaction,
  NftHistory,
  NftMetadata,
  SaleTransaction,
  TransactionType,
  TransactionVariant,
  TransferTransaction,
} from "./types";
import BN from "bignumber.js";

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
 * Establish Solana connection. Currently the app only connects to the
 * mainnet-beta cluster.
 */
const connection = new Connection(clusterApiUrl("mainnet-beta"));

/**
 * Fetch NFT token metadata. This function derives the on-chain metadata using
 * the Metaplex SDK and then fetches the full metadata record stored on
 * Arweave.
 */
export const fetchNftMetadata = async (
  address: string,
): Promise<NftMetadata> => {
  const pk = new PublicKey(address);
  const pda = await programs.metadata.Metadata.getPDA(pk);
  const result = await programs.metadata.Metadata.load(connection, pda);
  const metadataUri = result.data.data.uri;
  const response = await fetch(metadataUri);
  const metadata: NftMetadata = await response.json();
  return metadata;
};

/**
 * Call the fetchNftMetadata function which will throw for invalid addresses.
 *
 * NOTE: This fetchNftMetadata is now called twice. The responses could be
 * cached locally to avoid repeating making requests to the RPC node if that
 * was a concern, however these requests appear to be handled quickly and
 * easily without issue.
 */
const validateMintAddress = async (address: string) => {
  await fetchNftMetadata(address);
};

// This is the mainnet authority which is used by Magic Eden for listing
// NFTs. The address is used to identify Magic Eden marketplace related
// transactions.
const MAGIC_EDEN_LISTING_ACCOUNT =
  "GUfCR9mK6azb9vcpsxgXyj7XRPAKJd4KMHTTVvtncGgp";

// It's not entirely clear what addresses these are, but they appear to also
// be associated with Sale transactions. There could be more which needed to
// be added to this list.
const MULTI_SIG_ADDRESSES = new Set([
  "4pUQS4Jo2dsfWzt3VgHXy3H6RYnEDd11oWPiaM2rdAPw",
  "3D49QorJyNaL4rcpiynbuS3pRH4Y7EXEM6v6ZGaqfFGK",
  "F4ghBzHFNgJxV4wEQDchU5i7n4XWWMBSaq7CuswGiVsr",
]);

// This appears to be a new address involved in Sale transactions.
const DELEGATE_ADDRESS = "1BWutmTvYPwDtmw9abTkS4Ssr8no61spGAvW1X6NDix";

/**
 * Fetch NFT activity history for a given mint address.
 *
 * This function goes through a few steps:
 *
 * 1. Fetch transaction history for given mint address
 * 2. Find mint and transfer transactions and record associated token accounts
 * 3. Fetch and search transaction history of each associated token account
 * 4. Identify Magic Eden transactions in token account history
 * 5. Sort the results by blockTime and return them
 *
 * A few comments:
 *
 * - This function makes a lot of RPC API calls and can get rate limited
 *   by RPC nodes. It's also slow to query data in this way. A better solution
 *   would probably be to maintain a separate indexed database of marketplace
 *   transactions which is accessible through a its own API, similar to how
 *   Magic Eden fetches NFT history (e.g.
 *   https://api-mainnet.magiceden.io/rpc/getGlobalActivitiesByQuery?q=...).
 *   This is of course not decentralized but it can help to mitigate the above
 *   mentioned concerns.
 *
 * - The logic is really guessing to identify Magic Eden transactions. Ideally,
 *   if one knew the structure of the Magic Eden programs and instructions
 *   data model one could identify and decode these transactions more reliably.
 */
export const fetchActivityHistoryForMintAddress = async (
  address: string,
): Promise<NftHistory> => {
  // This will throw if the address is invalid
  await validateMintAddress(address);

  // First process the transaction history for the mint address
  const result = await scanMintAddressHistory(address);
  const { mintAddressHistory, tokenAccounts } = result;

  // Next process the history for associated token accounts
  const tokenAccountsHistory = await scanTokenAccountList(tokenAccounts);

  // Combine both of the above for the full activity history
  const txHistory = mintAddressHistory.concat(tokenAccountsHistory);

  // Sort the history by blockTime
  const history = txHistory.sort(sortTxsByBlockTime);

  return history;
};

/**
 * Fetch transaction history for the NFT mint address. This identifies
 * mint and transfer transactions and also associated token accounts for
 * the NFT mint.
 */
const scanMintAddressHistory = async (address: string) => {
  // First get all the transactions for the given mint address
  const pk = new PublicKey(address);
  const signatures = await connection.getSignaturesForAddress(pk);
  const txs = await connection.getParsedConfirmedTransactions(
    signatures.map((x) => x.signature),
  );

  // Record of all identified transactions
  const mintAddressHistory: NftHistory = [];

  // Use a Set to avoid duplicate marking accounts (might not happen
  // but this will prevent it anyway).
  const tokenAccounts: Set<string> = new Set([]);

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
            let mint = inx.parsed.info.mint;
            let minter = inx.parsed.info.mintAuthority;
            let multisigMinter = inx.parsed.info.multisigMintAuthority;

            // Ensure the mint address matches the provided address
            if (mint === address) {
              // If there is no regular authority it probably a multisig address:
              if (!minter && multisigMinter) {
                minter = multisigMinter;
              }

              const mintTransaction: MintTransaction = {
                tx,
                minter,
                type: TransactionType.Mint,
                signatures: tx.transaction.signatures,
              };

              // Record mint transaction
              mintAddressHistory.push(mintTransaction);

              // Capture mintTo target account
              tokenAccounts.add(inx.parsed.info.account);
            }
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

              // Find the owner of the destination token account. This
              // is a bit tricky, we can look for the associated account
              // create transaction or try to look up the account info.
              let newOwnerAddress = null;

              // First try to find the new owner address by searching for the
              // create instruction in the transfer instructions.
              const createIx = instructions.find((x) => {
                return "parsed" in x && x.parsed.type === "create";
              });

              if (createIx) {
                if ("parsed" in createIx) {
                  newOwnerAddress = createIx.parsed.info.wallet;
                }
              }

              // If no new owner address was found above try to lookup the
              // account info using the destination account and find the owner
              // address. No account data will exist, I think, if the account
              // was later closed. The results match what is displayed on
              // the solscan block explorer for these transactions.
              if (newOwnerAddress === null) {
                const account = await connection.getParsedAccountInfo(
                  new PublicKey(destination),
                );

                if (account.value) {
                  if ("parsed" in account.value.data) {
                    newOwnerAddress = account.value.data.parsed.info.owner;
                  }
                }
              }

              const transferTransaction: TransferTransaction = {
                tx,
                source,
                newOwnerAddress,
                type: TransactionType.Transfer,
                destinationTokenAccount: destination,
                signatures: tx.transaction.signatures,
              };

              // Record transfer transaction
              mintAddressHistory.push(transferTransaction);

              // Capture destination token account
              tokenAccounts.add(destination);
            }
          }
        }
      }
    }
  }

  // For some transactions, it seems, the mint and some create associated
  // token account transactions can only be found in the inner instructions
  // data.
  for (const tx of txs) {
    const innerInstructions = tx?.meta?.innerInstructions;
    if (innerInstructions) {
      for (const innerInstruction of innerInstructions) {
        for (const inx of innerInstruction.instructions) {
          if ("parsed" in inx) {
            const { type } = inx.parsed;

            // Mint transaction
            if (type === "mintTo") {
              const mint = inx.parsed.info.mint;

              // Ensure the mint address matches the provided address
              if (mint === address) {
                const minter = inx.parsed.info.mintAuthority;
                const mintTransaction: MintTransaction = {
                  tx,
                  minter,
                  type: TransactionType.Mint,
                  signatures: tx.transaction.signatures,
                };

                // Record mint transaction
                mintAddressHistory.push(mintTransaction);

                // Capture mintTo target account
                tokenAccounts.add(inx.parsed.info.account);
              }
            }

            // Create associated token account transactions
            if (type === "create") {
              const mint = inx.parsed.info.mint;
              if (mint === address) {
                const account = inx.parsed.info.account;
                tokenAccounts.add(account);
              }
            }
          }
        }
      }
    }
  }

  return {
    tokenAccounts,
    mintAddressHistory,
  };
};

/**
 * Fetch and process transaction history for associated token accounts to
 * identify marketplace related transactions (e.g. listing, listing
 * cancelled, purchase).
 */
const scanTokenAccountList = async (
  tokenAccounts: Set<string>,
): Promise<NftHistory> => {
  // Record of all identified transactions
  const txHistory: NftHistory = [];

  const tokenAccountsList = Array.from(tokenAccounts);
  const checkedTransactions = new Set();

  // For each identified token account for the given mint address, search
  // its transaction history and identify transactions related to Magic Eden
  // using Magic Eden program IDs. Record these transactions in the activity
  // history.
  for (const tokenAccount of tokenAccountsList) {
    const pk = new PublicKey(tokenAccount);
    const signatures = await connection.getSignaturesForAddress(pk);
    const txs = await connection.getParsedConfirmedTransactions(
      signatures.map((x) => x.signature),
    );

    for (const tx of txs) {
      const signature = tx?.transaction.signatures.join("");

      // Avoid evaluating the same transaction twice
      if (checkedTransactions.has(signature)) {
        continue;
      }

      checkedTransactions.add(signature);

      const innerInstructions = tx?.meta?.innerInstructions;
      if (innerInstructions) {
        for (const innerInstruction of innerInstructions) {
          if (innerInstruction) {
            let buyer = "";
            let isSaleTransaction = false;
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
                  const authority = inx.parsed.info.authority;
                  const multisig = inx.parsed.info.multisigAuthority;
                  if (
                    authority === DELEGATE_ADDRESS ||
                    MULTI_SIG_ADDRESSES.has(multisig)
                  ) {
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

                // Another type of listing transaction. This one appears to be
                // newer.
                if (inx.parsed.type === "approve") {
                  const delegate = inx.parsed.info.delegate;
                  if (delegate === DELEGATE_ADDRESS) {
                    const listingTransaction: ListingTransaction = {
                      tx,
                      seller: inx.parsed.info.owner,
                      type: TransactionType.Listing,
                      signatures: tx.transaction.signatures,
                    };

                    // Record cancel listing transaction
                    txHistory.push(listingTransaction);
                  }
                }

                if (inx.parsed.type === "revoke") {
                  const cancelListingTransaction: CancelListingTransaction = {
                    tx,
                    seller: inx.parsed.info.owner,
                    type: TransactionType.CancelListing,
                    signatures: tx.transaction.signatures,
                  };

                  // Record cancel listing transaction
                  txHistory.push(cancelListingTransaction);
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
                      seller: authority,
                      type: TransactionType.Listing,
                      signatures: tx.transaction.signatures,
                    };

                    // Record listing transaction
                    txHistory.push(listingTransaction);
                  } else if (authority === MAGIC_EDEN_LISTING_ACCOUNT) {
                    // If the current authority is the Magic Eden listing
                    // account it is a cancel listing transaction if there is
                    // only one instruction. Otherwise it is a sale.
                    if (innerInstruction.instructions.length === 1) {
                      const cancelListingTransaction: CancelListingTransaction =
                        {
                          tx,
                          seller: newAuthority,
                          type: TransactionType.CancelListing,
                          signatures: tx.transaction.signatures,
                        };

                      // Record cancel listing transaction
                      txHistory.push(cancelListingTransaction);
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
                buyer,
                type: TransactionType.Sale,
                lamports: lamportsTransferred,
                signatures: tx.transaction.signatures,
              };

              // Record sale transaction
              txHistory.push(saleTransaction);
            }
          }
        }
      }
    }
  }

  return txHistory;
};

/**
 * Sort transactions by blockTime.
 */
const sortTxsByBlockTime = (a: TransactionVariant, b: TransactionVariant) => {
  const aTime = a.tx.blockTime;
  const bTime = b.tx.blockTime;
  if (aTime && bTime) {
    return bTime - aTime;
  } else {
    return 1;
  }
};
