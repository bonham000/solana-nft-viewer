import format from "date-fns/format";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import BN from "bignumber.js";

/**
 * Assert a condition cannot occur. Used for writing exhaustive switch
 * blocks guarantee every value is handled.
 */
export const assertUnreachable = (x: never): never => {
  throw new Error(
    `assertUnreachable received a value which should not exist: ${JSON.stringify(
      x,
    )}`,
  );
};

/**
 * Format a date, e.g. 1640925203000 -> Dec 30, 2021 at 10:33pm
 */
export const formatDate = (date: number) => {
  const day = format(new Date(date), "MMM dd, yyyy");

  // NOTE: For some reason 'a' am/pm option is not respected as lowercase
  const time = format(new Date(date), "h:mma").toLowerCase();

  return `${day} at ${time}`;
};

/**
 * Format a fiat price: e.g. $227.27 USD
 */
export const formatFiatPrice = (sol: BN, price: BN) => {
  const usd = sol.times(price);
  const formattedPrice = formatNumber(usd);
  const result = `$${formattedPrice} USD`;
  return result;
};

/**
 * Standard formatting for a number. Expects bignumber.js input.
 */
export const formatNumber = (x: BN) => {
  return x.toFormat(2, {
    groupSize: 3,
    groupSeparator: ",",
    decimalSeparator: ".",
  });
};

/**
 * Convert lamports to SOL.
 */
export const lamportsToSOL = (lamports: BN) => {
  const SOL = lamports.div(new BN(LAMPORTS_PER_SOL));
  return SOL;
};

/**
 * Check if a string address is a valid Solana public key.
 */
export const isAddressValidPublicKey = (address: string) => {
  try {
    new PublicKey(address);
    return true;
  } catch (err) {
    return false;
  }
};

/**
 * Abbreviate a public key address for display purposes, e.g.
 * 7L15qmrXLQaSqPqq3e68cUNyqiyuvXEoRdmYmZpt3zcw -> 7L15...3zcw
 */
export const abbreviateAddress = (address: string) => {
  const size = 4;
  const start = address.slice(0, size);
  const end = address.slice(address.length - size);
  return `${start}...${end}`;
};

/**
 * Copy some text to the clipboard.
 */
export const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
};
