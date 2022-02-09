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
  Marketplace,
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

/**
 * Given a Solana address fetch all the confirmed transactions.
 */
const fetchAllTransactionsForAddress = async (address: string) => {
  const pk = new PublicKey(address);
  const signatures = await connection.getSignaturesForAddress(pk);
  const signatureList = signatures.map((x) => x.signature);
  const txs = await connection.getParsedConfirmedTransactions(signatureList);
  return txs;
};

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
  const fullHistory = txHistory.sort(sortTxsByBlockTime);

  return fullHistory;
};

/**
 * Iterate over the tx.transaction.message.instructions and execute a provided
 * handler function for each parsed instruction, passing in the transaction
 * and current parsed instruction.
 */
const forEachTransactionMessageInstruction = async (
  txs: (ParsedConfirmedTransaction | null)[],
  txHandlerFn: (ctx: BaseTransactionContext) => Promise<void>,
) => {
  for (const tx of txs) {
    const instructions = tx?.transaction.message.instructions;
    if (instructions) {
      for (const ix of instructions) {
        if ("parsed" in ix) {
          await txHandlerFn({ tx, ix });
        }
      }
    }
  }
};

/**
 * Iterate over the tx.meta.innerInstruction and execute the provider
 * handler function for each parsed instruction.
 */
const forEachTransactionInnerInstruction = async (
  txs: (ParsedConfirmedTransaction | null)[],
  txHandlerFn: (ctx: MarketplaceMatcherContext) => Promise<void>,
) => {
  for (const tx of txs) {
    const innerInstructions = tx?.meta?.innerInstructions;
    if (innerInstructions) {
      for (const innerInstruction of innerInstructions) {
        for (const ix of innerInstruction.instructions) {
          if ("parsed" in ix) {
            await txHandlerFn({ tx, ix, innerInstruction });
          }
        }
      }
    }
  }
};

/**
 * Fetch transaction history for the NFT mint address. This identifies
 * mint and transfer transactions and also associated token accounts for
 * the NFT mint.
 */
const scanMintAddressHistory = async (address: string) => {
  let tokenAccounts: string[] = [];
  let mintAddressHistory: NftHistory = [];

  // Handler to parse relevant mint address transactions
  const parseInstruction = async (txContext: BaseTransactionContext) => {
    const ctx: TransactionMatcherContext = {
      ...txContext,
      address,
      history: [],
      tokenAccounts: [],
    };

    // Logic to match mint address transactions. Additional matcher functions
    // may be defined to match additional transactions/token accounts here.
    const result = await pipe(
      matchMintTransaction,
      andThen(matchCreateTransaction),
      andThen(matchTransferTransaction),
      // Add additional functions to match other transactions here
    )(ctx);

    mintAddressHistory.push(...result.history);
    tokenAccounts.push(...result.tokenAccounts);
  };

  // Get all the transactions for the given mint address
  const txs = await fetchAllTransactionsForAddress(address);

  // Pass the transactions through parsing logic which inspects both
  // message instructions and transaction inner instructions to identify
  // target transactions and associated token accounts
  await forEachTransactionInnerInstruction(txs, parseInstruction);
  await forEachTransactionMessageInstruction(txs, parseInstruction);

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

  // Handler function to parse marketplace transactions
  const parseInnerInstruction = async (ctx: MarketplaceMatcherContext) => {
    // This is the main flow which identifies a particular marketplace
    // transaction given the parsed transaction data. Additional matcher
    // functions can be defined to match and identify any other transaction
    // types and then added in here. Note that this pipeline will return
    // the first transaction which is matched.
    const matchedTx = await pipe(
      matchSaleTransaction(ctx),
      andThen(matchListingTransaction(ctx)),
      andThen(matchCancelListingTransaction(ctx)),
      // Add additional functions to match other transactions here
    )(None());

    // Match result and add to list if it exists
    matchOption(matchedTx, {
      some: (x) => {
        // Avoid adding the same tx twice
        const signature = x.signatures.join("");
        if (!checkedTransactions.has(signature)) {
          checkedTransactions.add(signature);
          txHistory.push(x);
        }
      },
      none: () => null,
    });
  };

  // For each identified token account for the given mint address, search
  // its transaction history and identify transactions related to Magic Eden
  // using Magic Eden accounts. Record these transactions in the activity
  // history.
  for (const tokenAccountAddress of tokenAccountsList) {
    const txs = await fetchAllTransactionsForAddress(tokenAccountAddress);
    await forEachTransactionInnerInstruction(txs, parseInnerInstruction);
  }

  return txHistory;
};

interface BaseTransactionContext {
  tx: ParsedConfirmedTransaction;
  ix: ParsedInstruction;
}

interface TransactionMatcherContext extends BaseTransactionContext {
  address: string;
  history: NftHistory;
  tokenAccounts: string[];
}

type TransactionMatcherFn = (
  ctx: TransactionMatcherContext,
) => Promise<TransactionMatcherContext>;

/**
 * Match a token transfer transaction.
 */
const matchTransferTransaction: TransactionMatcherFn = async (ctx) => {
  const { tx, ix, address, history, tokenAccounts } = ctx;
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

  return ctx;
};

/**
 * Match a create account transaction.
 */
const matchCreateTransaction: TransactionMatcherFn = async (ctx) => {
  const { ix, address, tokenAccounts } = ctx;
  const { type } = ix.parsed;
  // Create associated token account transactions
  if (type === "create") {
    const mint = ix.parsed.info.mint;
    if (mint === address) {
      const account = ix.parsed.info.account;
      tokenAccounts.push(account);
    }
  }

  return ctx;
};

/**
 * Match an NFT mint transaction.
 */
const matchMintTransaction: TransactionMatcherFn = async (ctx) => {
  const { tx, ix, address, history, tokenAccounts } = ctx;
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

  return ctx;
};

interface MarketplaceMatcherContext extends BaseTransactionContext {
  innerInstruction: ParsedInnerInstruction;
}

// The marketplace matcher function receives and returns an Option of a
// possibly matched transaction. The first function which matches a transaction
// returns a Some<TransactionVariant>. Then, subsequent functions will just
// return this same value. This assumes for a given transaction it can only
// be matched to a single specific target transaction.
type MarketplaceMatcherFn = (
  ctx: MarketplaceMatcherContext,
) => (
  matchedTx: Option<TransactionVariant>,
) => Promise<Option<TransactionVariant>>;

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
 * Match a Magic Eden listing transaction.
 */
const matchListingTransaction: MarketplaceMatcherFn = (ctx) => {
  return async (matchedTxOption) => {
    if (matchedTxOption.some) {
      return matchedTxOption;
    }

    const { ix, tx } = ctx;
    const { type } = ix.parsed;

    if (type === "approve") {
      const delegate = ix.parsed.info.delegate;
      if (delegate === DELEGATE_ADDRESS) {
        const listingTransaction: ListingTransaction = {
          tx,
          seller: ix.parsed.info.owner,
          type: TransactionType.Listing,
          signatures: tx.transaction.signatures,
          marketplace: Marketplace.MagicEden,
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
          marketplace: Marketplace.MagicEden,
        };

        return Some(listingTransaction);
      }
    }

    return None();
  };
};

/**
 * Match a Magic Eden cancel listing transaction.
 */
const matchCancelListingTransaction: MarketplaceMatcherFn = (ctx) => {
  return async (matchedTxOption) => {
    if (matchedTxOption.some) {
      return matchedTxOption;
    }

    const { ix, tx, innerInstruction } = ctx;
    const { type } = ix.parsed;

    if (type === "revoke") {
      const cancelListingTransaction: CancelListingTransaction = {
        tx,
        seller: ix.parsed.info.owner,
        type: TransactionType.CancelListing,
        signatures: tx.transaction.signatures,
        marketplace: Marketplace.MagicEden,
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
            marketplace: Marketplace.MagicEden,
          };

          // Record cancel listing transaction
          return Some(cancelListingTransaction);
        }
      }
    }

    return None();
  };
};

/**
 * Match a Magic Eden sale transaction.
 */
const matchSaleTransaction: MarketplaceMatcherFn = (ctx) => {
  return async (matchedTxOption) => {
    if (matchedTxOption.some) {
      return matchedTxOption;
    }

    const { ix, tx, innerInstruction } = ctx;
    const { type } = ix.parsed;

    let buyer = "";
    let isSaleTransaction = false;
    let lamportsTransferred = new BN(0);

    // This is the most common sale transaction
    if (ix.parsed.type === "setAuthority") {
      const { authority } = ix.parsed.info;
      if (authority === MAGIC_EDEN_LISTING_ACCOUNT) {
        if (innerInstruction.instructions.length > 1) {
          isSaleTransaction = true;
        }
      }
    } else if (type === "transfer") {
      // Identify transfers which involve this special multisig
      // authority. These also represent sale transactions.
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
    }

    // If it is a sale transaction record all transferred lamports. This is
    // used to determine the buy price for Sale transactions, in which the
    // total price represents all the transferred lamports. There are multiple
    // separate transfers because of artist royalties.
    if (isSaleTransaction) {
      for (const ix of innerInstruction.instructions) {
        if ("parsed" in ix) {
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
        marketplace: Marketplace.MagicEden,
      };

      return Some(saleTransaction);
    }

    return None();
  };
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
