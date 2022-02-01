import format from "date-fns/format";
import { PublicKey } from "@solana/web3.js";

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
export const formatFiatPrice = (price: number) => {
  const usd = (5 * price).toFixed(2);
  const result = `$${usd} USD`;
  return result;
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
