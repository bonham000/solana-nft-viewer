import format from "date-fns/format";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import BN from "bignumber.js";

/**
 * Format a date.
 */
export const formatDate = (date: number) => {
  const day = format(new Date(date), "MMM dd, yyyy");

  // NOTE: For some reason 'a' am/pm option is not respected as lowercase
  const time = format(new Date(date), "hh:mma").toLowerCase();

  return `${day} at ${time}`;
};

/**
 * Format a fiat price.
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
export const lamportsToSOL = (lamports: number) => {
  const amount = new BN(lamports);
  const SOL = amount.div(new BN(LAMPORTS_PER_SOL));
  return SOL;
};

/**
 * Check if a string address is a valid Solana public key.
 */
export const validateAddressAsPublicKey = (address: string) => {
  try {
    new PublicKey(address);
    return true;
  } catch (err) {
    return false;
  }
};
