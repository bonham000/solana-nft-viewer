import fetch from "jest-fetch-mock";
import { NftHistory } from "../tools/types";
// import {
//   fetchActivityHistoryForMintAddress,
//   fetchNftMetadata,
//   fetchSolPrice,
// } from "../tools/web3-original";
import {
  fetchActivityHistoryForMintAddress,
  fetchNftMetadata,
  fetchSolPrice,
} from "../tools/web3-refactored";

// Extend Jest timeout - RPC request may take a while
jest.setTimeout(90_000);

// Delay some time
const delay = async (time = 5000) => {
  await new Promise((_: any) => setTimeout(_, time));
};

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
    // Format transactions history for test snapshot
    const formatTxsForTestResult = (txs: NftHistory, offset: number) => {
      return txs
        .slice(txs.length - offset)
        .map(({ tx, signatures, ...rest }) => rest);
    };

    // Helper function to fetch txs history and format response data
    const getTxs = async (address: string, offset: number) => {
      fetch.mockOnce(JSON.stringify(metadata));
      const txs = await fetchActivityHistoryForMintAddress(address);
      return formatTxsForTestResult(txs, offset);
    };

    {
      const address = "GPgf9QFoJ3XagLBLWLG9j2Ehtw5ycoXn8hYZuJL4GWQn";
      const data = await getTxs(address, 7);
      expect(data).toMatchInlineSnapshot(`
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
    }

    {
      await delay();
      const address = "8RZBkBNZGsbwc1DuYUxcqtmvhoPtKhFKFLAKSJqFDtJA";
      const data = await getTxs(address, 13);
      expect(data).toMatchInlineSnapshot(`
        Array [
          Object {
            "seller": "FvSce4MGwueaUFTb9NxUnqz5mabUdbeMfrCJxRvA1Y3L",
            "type": "Listing",
          },
          Object {
            "seller": "FvSce4MGwueaUFTb9NxUnqz5mabUdbeMfrCJxRvA1Y3L",
            "type": "CancelListing",
          },
          Object {
            "seller": "FvSce4MGwueaUFTb9NxUnqz5mabUdbeMfrCJxRvA1Y3L",
            "type": "Listing",
          },
          Object {
            "seller": "FvSce4MGwueaUFTb9NxUnqz5mabUdbeMfrCJxRvA1Y3L",
            "type": "CancelListing",
          },
          Object {
            "seller": "FvSce4MGwueaUFTb9NxUnqz5mabUdbeMfrCJxRvA1Y3L",
            "type": "Listing",
          },
          Object {
            "seller": "FvSce4MGwueaUFTb9NxUnqz5mabUdbeMfrCJxRvA1Y3L",
            "type": "CancelListing",
          },
          Object {
            "seller": "FvSce4MGwueaUFTb9NxUnqz5mabUdbeMfrCJxRvA1Y3L",
            "type": "Listing",
          },
          Object {
            "buyer": "FvSce4MGwueaUFTb9NxUnqz5mabUdbeMfrCJxRvA1Y3L",
            "lamports": "12500000000",
            "type": "Sale",
          },
          Object {
            "seller": "8NfuNb2Sjqu21XP8QMpf7oJ1pGWmCePieLR7Ev3hwpyk",
            "type": "Listing",
          },
          Object {
            "buyer": "8NfuNb2Sjqu21XP8QMpf7oJ1pGWmCePieLR7Ev3hwpyk",
            "lamports": "32500000000",
            "type": "Sale",
          },
          Object {
            "seller": "X43PbJ7ToG5F8G9sZeNDT7NQnBqPgiWPGPGT3JRFoku",
            "type": "Listing",
          },
          Object {
            "destinationTokenAccount": "5dGyttpZELQUKgecjGYyee3pKBsSx2u4qEoiyVdMQ8t2",
            "newOwnerAddress": "X43PbJ7ToG5F8G9sZeNDT7NQnBqPgiWPGPGT3JRFoku",
            "source": "CwvtvtBQuvaZh45REh2AvregWsFpWr1mS2CxZEYniNEX",
            "type": "Transfer",
          },
          Object {
            "minter": "8qeBAeWwodhu9EwvHohRLTSUiUgEVXEAcvEH2RNx6kt1",
            "type": "Mint",
          },
        ]
      `);
    }

    {
      await delay();
      const address = "9nP4dazZMcZVFh99Prnf4pXYcRSjhe3VQYVQBxFjGF7D";
      const data = await getTxs(address, 6);
      expect(data).toMatchInlineSnapshot(`
        Array [
          Object {
            "seller": "CXrqupyNCFb1sgSUzVP5jpazPjVeuRwogP3X2AHjKav1",
            "type": "Listing",
          },
          Object {
            "buyer": "CXrqupyNCFb1sgSUzVP5jpazPjVeuRwogP3X2AHjKav1",
            "lamports": "50000000000",
            "type": "Sale",
          },
          Object {
            "buyer": "C4qj2p7BhvFv6e5DbLcE7v1XsX7u7cjnHY6WaCEZ8cum",
            "lamports": "82000000000",
            "type": "Sale",
          },
          Object {
            "buyer": "GLbzG6GMYimrJg2EJX7GKGgHzjwKpkMk7YFq7JNCyQQx",
            "lamports": "76640000000",
            "type": "Sale",
          },
          Object {
            "buyer": "51abCyffua4zRMNzWuAxyowEM9WqPSjKmuSzSZ9fPncr",
            "lamports": "17148199999",
            "type": "Sale",
          },
          Object {
            "minter": "DC2mkgwhy56w3viNtHDjJQmc7SGu2QX785bS4aexojwX",
            "type": "Mint",
          },
        ]
      `);
    }

    {
      await delay();
      const address = "A2MaKhSfuSUm3gqwn7wrBCyp7XmM6bggRg3PtmrgypfL";
      const data = await getTxs(address, 6);
      expect(data).toMatchInlineSnapshot(`
        Array [
          Object {
            "seller": "9J5MuJBA1B9zeFe99ZbZkPtkP683dgAoX5BqfQV2m1B7",
            "type": "Listing",
          },
          Object {
            "seller": "9J5MuJBA1B9zeFe99ZbZkPtkP683dgAoX5BqfQV2m1B7",
            "type": "CancelListing",
          },
          Object {
            "seller": "9J5MuJBA1B9zeFe99ZbZkPtkP683dgAoX5BqfQV2m1B7",
            "type": "Listing",
          },
          Object {
            "buyer": "9J5MuJBA1B9zeFe99ZbZkPtkP683dgAoX5BqfQV2m1B7",
            "lamports": "4200000000",
            "type": "Sale",
          },
          Object {
            "seller": "HqC33C36c4mEpmfTyCjguWG2JeMQYbU4LzsjnMzZzJtx",
            "type": "Listing",
          },
          Object {
            "minter": "HqC33C36c4mEpmfTyCjguWG2JeMQYbU4LzsjnMzZzJtx",
            "type": "Mint",
          },
        ]
      `);
    }

    {
      await delay();
      const address = "BJ18kJVLXhMDJVcnoSYT9rFBZdqPuzNdQFbu3Sarux88";
      const data = await getTxs(address, 6);
      expect(data).toMatchInlineSnapshot(`
        Array [
          Object {
            "seller": "BoD7A9AoCZbbk5BTZBG6Szxmim3c3poZPQa6sxNFCERk",
            "type": "Listing",
          },
          Object {
            "buyer": "BoD7A9AoCZbbk5BTZBG6Szxmim3c3poZPQa6sxNFCERk",
            "lamports": "660000000",
            "type": "Sale",
          },
          Object {
            "seller": "i5RWK8qMd12i5KfcuAG13UK15jod4L3sBRBKUKYGaSr",
            "type": "Listing",
          },
          Object {
            "buyer": "i5RWK8qMd12i5KfcuAG13UK15jod4L3sBRBKUKYGaSr",
            "lamports": "400000000",
            "type": "Sale",
          },
          Object {
            "seller": "CjQisj3WyH61TH31xmFdi76isBfpYEZAyH8q8VZ8q2F6",
            "type": "Listing",
          },
          Object {
            "minter": "CjQisj3WyH61TH31xmFdi76isBfpYEZAyH8q8VZ8q2F6",
            "type": "Mint",
          },
        ]
      `);
    }
  });
});
