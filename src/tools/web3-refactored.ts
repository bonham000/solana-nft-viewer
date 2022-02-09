import {
  clusterApiUrl,
  PublicKey,
  Connection,
  ParsedConfirmedTransaction,
  ParsedInstruction,
  ParsedInnerInstruction,
} from "@solana/web3.js";
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
import pipe from "ramda/src/pipe";
import andThen from "ramda/src/andThen";
import { matchOption, None, Option, Some } from "./result";

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
 * the Metaplex SDK and then fetches the full metadata record from Arweave.
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

// This is the mainnet account which is used by Magic Eden for listing
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
 * Fetch NFT activity history for a given mint address. The logic here is
 * very imperative.
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

  // Sort the combined history by blockTime
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

  let mintAddressHistory: NftHistory = [];
  let tokenAccounts: string[] = [];

  // Iterate through all the transactions and identify transfers and the
  // original mint transactions. Record associated accounts, which will be
  // checked next.
  for (const tx of txs) {
    const instructions = tx?.transaction.message.instructions;
    if (instructions) {
      for (const ix of instructions) {
        if ("parsed" in ix) {
          const args = {
            tx,
            ix,
            address,
            history: [],
            tokenAccounts: [],
          };

          const result = await pipe(
            matchMintTransaction,
            andThen(matchCreateTransaction),
            andThen(matchTransferTransaction),
            // Add other matching logic here...
          )(args);

          mintAddressHistory = mintAddressHistory.concat(result.history);
          tokenAccounts = tokenAccounts.concat(result.tokenAccounts);
        }
      }
    }
  }

  // For some transactions, it seems, the mint and some create associated
  // token account transactions can only be found in the inner instructions
  // data. Search that here.
  for (const tx of txs) {
    const innerInstructions = tx?.meta?.innerInstructions;
    if (innerInstructions) {
      for (const innerInstruction of innerInstructions) {
        for (const ix of innerInstruction.instructions) {
          if ("parsed" in ix) {
            const args = {
              tx,
              ix,
              address,
              history: [],
              tokenAccounts: [],
            };

            const result = await pipe(
              matchMintTransaction,
              andThen(matchCreateTransaction),
              andThen(matchTransferTransaction),
              // Add other matching logic here...
            )(args);

            mintAddressHistory = mintAddressHistory.concat(result.history);
            tokenAccounts = tokenAccounts.concat(result.tokenAccounts);
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
 * identify Magic Eden marketplace related transactions (e.g. listing, listing
 * cancelled, purchase).
 */
const scanTokenAccountList = async (
  tokenAccounts: string[],
): Promise<NftHistory> => {
  // Record of all identified transactions
  const txHistory: NftHistory = [];
  const checkedTransactions = new Set();
  const tokenAccountsList = Array.from(new Set(tokenAccounts));

  // For each identified token account for the given mint address, search
  // its transaction history and identify transactions related to Magic Eden
  // using Magic Eden accounts. Record these transactions in the activity
  // history.
  for (const tokenAccount of tokenAccountsList) {
    const pk = new PublicKey(tokenAccount);
    const signatures = await connection.getSignaturesForAddress(pk);
    const txs = await connection.getParsedConfirmedTransactions(
      signatures.map((x) => x.signature),
    );

    for (const tx of txs) {
      const signature = tx?.transaction.signatures.join("");

      // Avoid checking the same transaction twice
      if (checkedTransactions.has(signature)) {
        continue;
      }

      checkedTransactions.add(signature);

      const innerInstructions = tx?.meta?.innerInstructions;
      if (innerInstructions) {
        for (const innerInstruction of innerInstructions) {
          if (innerInstruction) {
            for (const ix of innerInstruction.instructions) {
              if ("parsed" in ix) {
                const context: MarketplaceMatcherArgs = {
                  ix,
                  tx,
                  innerInstruction,
                };

                // Pipeline to process transaction
                const matchedTx = await pipe(
                  matchSaleTransaction(context),
                  andThen(matchListingTransaction(context)),
                  andThen(matchCancelListingTransaction(context)),
                  // Add other matching logic here...
                )(None());

                // Match result and add to list if it exists
                matchOption(matchedTx, {
                  some: (x) => txHistory.push(x),
                  none: () => null,
                });
              }
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

interface MatcherArgs {
  address: string;
  tx: ParsedConfirmedTransaction;
  ix: ParsedInstruction;
  history: NftHistory;
  tokenAccounts: string[];
}

type TransactionMatcherFn = (args: MatcherArgs) => Promise<MatcherArgs>;

const matchTransferTransaction: TransactionMatcherFn = async (args) => {
  const { tx, ix, address, history, tokenAccounts } = args;
  const { type } = ix.parsed;
  // Transfer transactions
  if (type === "transferChecked") {
    const mint = ix.parsed.info.mint;
    if (mint === address) {
      const source: string = ix.parsed.info.source;
      const destination: string = ix.parsed.info.destination;

      // Find the owner of the destination token account. This
      // is a bit tricky, we can look for the associated account
      // create transaction or try to look up the account info.
      let newOwnerAddress = null;

      // First try to find the new owner address by searching for the
      // create instruction in the transfer instructions.
      const createIx = tx?.transaction.message.instructions.find((x) => {
        return "parsed" in x && x.parsed.type === "create";
      });

      if (createIx) {
        if ("parsed" in createIx) {
          newOwnerAddress = createIx.parsed.info.wallet;
        }
      }

      // If no new owner address was found above try to lookup the
      // account info using the destination account and find the owner
      // address. No account data will exist, it seems, if the account
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
      history.push(transferTransaction);

      // Capture destination token account
      tokenAccounts.push(destination);
    }
  }

  return args;
};

const matchCreateTransaction: TransactionMatcherFn = async (args) => {
  const { ix, address, tokenAccounts } = args;
  const { type } = ix.parsed;
  // Create associated token account transactions
  if (type === "create") {
    const mint = ix.parsed.info.mint;
    if (mint === address) {
      const account = ix.parsed.info.account;
      tokenAccounts.push(account);
    }
  }

  return args;
};

const matchMintTransaction: TransactionMatcherFn = async (args) => {
  const { tx, ix, address, history, tokenAccounts } = args;
  const { type } = ix.parsed;
  if (type === "mintTo") {
    let mint = ix.parsed.info.mint;
    let minter = ix.parsed.info.mintAuthority;
    let multisigMinter = ix.parsed.info.multisigMintAuthority;

    // Ensure the mint address matches the provided address
    if (mint === address) {
      // If there is no regular authority it is probably a multisig
      // address:
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
      history.push(mintTransaction);

      // Capture mintTo target account
      tokenAccounts.push(ix.parsed.info.account);
    }
  }

  return args;
};

interface MarketplaceMatcherArgs {
  tx: ParsedConfirmedTransaction;
  ix: ParsedInstruction;
  innerInstruction: ParsedInnerInstruction;
}

type MarketplaceMatcherFn = (
  args: MarketplaceMatcherArgs,
) => (
  result: Option<TransactionVariant>,
) => Promise<Option<TransactionVariant>>;

const matchListingTransaction: MarketplaceMatcherFn = (args) => {
  return async (opt) => {
    if (opt.some) {
      return opt;
    }

    const { ix, tx } = args;
    const { type } = ix.parsed;

    if (type === "approve") {
      const delegate = ix.parsed.info.delegate;
      if (delegate === DELEGATE_ADDRESS) {
        const listingTransaction: ListingTransaction = {
          tx,
          seller: ix.parsed.info.owner,
          type: TransactionType.Listing,
          signatures: tx.transaction.signatures,
        };

        return Some(listingTransaction);
      }
    } else if (type === "setAuthority") {
      const { authority, newAuthority } = ix.parsed.info;
      if (newAuthority === MAGIC_EDEN_LISTING_ACCOUNT) {
        // If the newAuthority is the Magic Eden listing account,
        // this is a listing transaction.
        const listingTransaction: ListingTransaction = {
          tx,
          seller: authority,
          type: TransactionType.Listing,
          signatures: tx.transaction.signatures,
        };

        return Some(listingTransaction);
      }
    }

    return None();
  };
};

const matchCancelListingTransaction: MarketplaceMatcherFn = (args) => {
  return async (opt) => {
    if (opt.some) {
      return opt;
    }

    const { ix, tx, innerInstruction } = args;
    const { type } = ix.parsed;

    if (type === "revoke") {
      const cancelListingTransaction: CancelListingTransaction = {
        tx,
        seller: ix.parsed.info.owner,
        type: TransactionType.CancelListing,
        signatures: tx.transaction.signatures,
      };

      return Some(cancelListingTransaction);
    } else if (type === "setAuthority") {
      const { authority, newAuthority } = ix.parsed.info;

      if (authority === MAGIC_EDEN_LISTING_ACCOUNT) {
        if (innerInstruction.instructions.length === 1) {
          const cancelListingTransaction: CancelListingTransaction = {
            tx,
            seller: newAuthority,
            type: TransactionType.CancelListing,
            signatures: tx.transaction.signatures,
          };

          // Record cancel listing transaction
          return Some(cancelListingTransaction);
        }
      }
    }

    return None();
  };
};

const matchSaleTransaction: MarketplaceMatcherFn = (args) => {
  return async (opt) => {
    if (opt.some) {
      return opt;
    }

    const { ix, tx, innerInstruction } = args;
    const { type } = ix.parsed;

    let buyer = "";
    let isSaleTransaction = false;
    let lamportsTransferred = new BN(0);

    // Identify transfers which involve this special multisig
    // authority. These also represent sale transactions.
    if (type === "transfer") {
      const authority = ix.parsed.info.authority;
      const multisig = ix.parsed.info.multisigAuthority;
      if (authority === DELEGATE_ADDRESS || MULTI_SIG_ADDRESSES.has(multisig)) {
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
    } else if (ix.parsed.type === "setAuthority") {
      const { authority } = ix.parsed.info;
      if (authority === MAGIC_EDEN_LISTING_ACCOUNT) {
        if (innerInstruction.instructions.length > 1) {
          isSaleTransaction = true;
        }
      }
    }

    if (isSaleTransaction) {
      for (const ix of innerInstruction.instructions) {
        if ("parsed" in ix) {
          // Record/increment transferred lamports. This is used to
          // determine the buy price for Sale transactions, in which
          // the total price represents all the transferred lamports.
          // There are multiple separate transfers because of artist
          // royalties.
          if (ix.parsed.type === "transfer") {
            const amount = ix.parsed.info.lamports;
            if (typeof amount === "number") {
              buyer = ix.parsed.info.source;
              lamportsTransferred = lamportsTransferred.plus(amount);
            }
          }
        }
      }

      const saleTransaction: SaleTransaction = {
        tx,
        buyer,
        type: TransactionType.Sale,
        lamports: lamportsTransferred,
        signatures: tx.transaction.signatures,
      };

      return Some(saleTransaction);
    }

    return None();
  };
};
