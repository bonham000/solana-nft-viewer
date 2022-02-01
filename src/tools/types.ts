import { ParsedConfirmedTransaction } from "@solana/web3.js";

interface Attribute {
  trait_type: string;
  value: string;
}

interface Creator {
  address: string;
  share: number;
}

interface NftFile {
  uri: string;
  type: string;
}

export interface NftMetadata {
  symbol: string;
  name: string;
  image: string;
  description: string;
  seller_fee_basis_points: number;
  attributes: Attribute[];
  collection: {
    name: string;
    family: string;
  };
  properties: {
    category: string;
    creators: Creator[];
  };
  files: NftFile[];
}

export enum TransactionType {
  Mint = "Mint",
  Transfer = "Transfer",
  Listing = "Listing",
  CancelListing = "CancelListing",
  Sale = "Sale",
}

interface TransactionBase {
  tx: ParsedConfirmedTransaction;
  signatures: string[];
}

export interface MintTransaction extends TransactionBase {
  type: TransactionType.Mint;
  minter: string;
}

export interface TransferTransaction extends TransactionBase {
  type: TransactionType.Transfer;
  source: string;
  destination: string;
}

export interface ListingTransaction extends TransactionBase {
  type: TransactionType.Listing;
  seller: string;
}

export interface CancelListingTransaction extends TransactionBase {
  type: TransactionType.CancelListing;
  seller: string;
}

export interface SaleTransaction extends TransactionBase {
  type: TransactionType.Sale;
  seller: string;
  buyer: string;
  lamports: number;
}

export type TransactionVariants =
  | MintTransaction
  | TransferTransaction
  | ListingTransaction
  | CancelListingTransaction
  | SaleTransaction;
