import fetch from "jest-fetch-mock";
import {
  fetchActivityHistoryForMintAddress,
  fetchNftMetadata,
  fetchSolPrice,
} from "../tools/web3";

// Extend Jest timeout - RPC request may take a while
jest.setTimeout(15_000);

/**
 * For some reason the @metaplex/js library fails to return some of the
 * NFT metadata when running in the NodeJS/Jest environment. Use this fixed
 * response data to mock responses instead.
 */
const metadata = {
  name: "MBB #2047",
  symbol: "MBB",
  description:
    "Monkey Baby Business is a collection of 3,000 generative monkey baby NFTs inspired by Solana Monkey Business and the MonkeDAO. Created by a Monke, for Monkes, with 100% of all proceeds and royalties donated to the MonkeDAO.",
  seller_fee_basis_points: 500,
  image:
    "https://www.arweave.net/luuNTv5eE5oN8uh-F6U5f4aXOF9WUGfyLrsyF6ivSHM?ext=png",
  collection: { name: "MBB", family: "MBB" },
  properties: {
    files: [
      {
        uri: "https://www.arweave.net/luuNTv5eE5oN8uh-F6U5f4aXOF9WUGfyLrsyF6ivSHM?ext=png",
        type: "image/png",
      },
    ],
    category: "image",
    creators: [
      {
        address: "CATPa1APxUC7L3KaWkR2Aiy5LYBThRiNQM1MFrTDC9ZC",
        share: 100,
      },
    ],
  },
  attributes: [
    { trait_type: "Background", value: "Pink" },
    { trait_type: "Skin", value: "Purple" },
    { trait_type: "Clothes", value: "Red Shirt" },
    { trait_type: "Headwear", value: "Ninja Bandanna" },
  ],
};

describe("web3 tests", () => {
  test("fetchSolPrice", async () => {
    const price = 215.28;
    const response = {
      solana: {
        usd: price,
      },
    };
    fetchMock.mockOnce(JSON.stringify(response));
    const result = await fetchSolPrice();
    expect(result.toString()).toBe(String(price));
  });

  test("fetchNftMetadata", async () => {
    fetch.mockOnce(JSON.stringify(metadata));
    const address = "GPgf9QFoJ3XagLBLWLG9j2Ehtw5ycoXn8hYZuJL4GWQn";
    const result = await fetchNftMetadata(address);
    expect(result).toEqual(metadata);
  });

  /**
   * Basic test for the fetchActivityHistoryForMintAddress function to provide
   * a sanity check that expected behavior doesn't break.
   */
  test("fetchActivityHistoryForMintAddress", async () => {
    fetch.mockOnce(JSON.stringify(metadata));

    const address = "GPgf9QFoJ3XagLBLWLG9j2Ehtw5ycoXn8hYZuJL4GWQn";
    const txs = await fetchActivityHistoryForMintAddress(address);

    // Slice final 7 transactions (ignore any possibly newer transactions)
    const txSlice = txs.slice(txs.length - 7);

    // Remove verbose original data
    const types = txSlice.map(({ tx, signatures, ...rest }) => rest);

    // Check derived history matches snapshot expectation
    expect(types).toMatchInlineSnapshot(`
      Array [
        Object {
          "seller": "5GUd38kYXm8FN6zkcH4ynBnmQsLZrModzraT9bM3dAYq",
          "type": "Listing",
        },
        Object {
          "seller": "5GUd38kYXm8FN6zkcH4ynBnmQsLZrModzraT9bM3dAYq",
          "type": "CancelListing",
        },
        Object {
          "seller": "5GUd38kYXm8FN6zkcH4ynBnmQsLZrModzraT9bM3dAYq",
          "type": "Listing",
        },
        Object {
          "buyer": "5GUd38kYXm8FN6zkcH4ynBnmQsLZrModzraT9bM3dAYq",
          "lamports": "11000000000",
          "type": "Sale",
        },
        Object {
          "seller": "GCJxBzQY26nz1TXdrNVESHEvQLdTMWGttr71Fq3LgGvW",
          "type": "Listing",
        },
        Object {
          "destinationTokenAccount": "GLiWFWvCQZ7SG6NVHoKq9Yqf2UQfMLcSJzCmU6yEGgFD",
          "newOwnerAddress": "GCJxBzQY26nz1TXdrNVESHEvQLdTMWGttr71Fq3LgGvW",
          "source": "3qkgX9qgfP7p2nybgJBFHjyvfysEgzmnURKeXNNtddig",
          "type": "Transfer",
        },
        Object {
          "minter": "CATPa1APxUC7L3KaWkR2Aiy5LYBThRiNQM1MFrTDC9ZC",
          "type": "Mint",
        },
      ]
    `);
  });
});
