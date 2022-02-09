import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { useParams } from "react-router-dom";
import { Shimmer } from "react-shimmer";
import {
  NftHistory,
  NftMetadata,
  TransactionType,
  TransactionVariant,
} from "../tools/types";
// import {
//   fetchSolPrice,
//   fetchNftMetadata,
//   fetchActivityHistoryForMintAddress,
// } from "../tools/web3-original";
import {
  fetchSolPrice,
  fetchNftMetadata,
  fetchActivityHistoryForMintAddress,
} from "../tools/web3-refactored";
import {
  formatDate,
  formatFiatPrice,
  copyToClipboard,
  formatNumber,
  lamportsToSOL,
  abbreviateAddress,
  assertUnreachable,
} from "../tools/utils";
import { useInterval } from "usehooks-ts";
import BN from "bignumber.js";
import { COLORS as C } from "../tools/colors";
import toast from "react-hot-toast";
import { ResultLoading, Result, Ok, Err, matchResult } from "../tools/result";

/** ===========================================================================
 * NftDetails Component
 * ----------------------------------------------------------------------------
 * This is the main component which renders the image, name and activity
 * history for a given NFT. This component handles fetching and displaying
 * all of these details.
 * ============================================================================
 */

type PriceState = Result<BN, Error>;
type NftMetadataState = Result<NftMetadata, Error>;
type NftHistoryState = Result<NftHistory, Error>;

const NftDetails: React.FC = () => {
  // Derive current address from URL params
  const params = useParams();
  // Address should exist since router matched and rendered this page
  const address = params.address as string;

  // Setup state
  const [priceState, setPriceState] = useState<PriceState>(ResultLoading());
  const [nftMetadataState, setNftMetadataState] = useState<NftMetadataState>(
    ResultLoading(),
  );
  const [nftHistoryState, setNftHistoryState] = useState<NftHistoryState>(
    ResultLoading(),
  );

  // Reset state when the address changes
  useEffect(() => {
    setNftMetadataState(ResultLoading());
    setNftHistoryState(ResultLoading());
  }, [address]);

  // Handle fetching NFT metadata
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const result = await fetchNftMetadata(address);
        setNftMetadataState(Ok(result));
      } catch (err) {
        setNftMetadataState(Err(err as Error));
      }
    };

    fetchMetadata();
  }, [address]);

  // Handle fetching NFT activity history
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const result = await fetchActivityHistoryForMintAddress(address);
        setNftHistoryState(Ok(result));
      } catch (err) {
        setNftHistoryState(Err(err as Error));
      }
    };

    fetchHistory();
  }, [address]);

  // Handle fetching SOL USD price
  const fetchPriceData = async () => {
    try {
      const result = await fetchSolPrice();
      setPriceState(Ok(result));
    } catch (err) {
      setPriceState(Err(err as Error));
    }
  };

  // Fetch SOL price on initial render
  useEffect(() => {
    fetchPriceData();
  }, []);

  // Refetch SOL price every 10 seconds
  useInterval(fetchPriceData, 10_000);

  return (
    <NftDetailsContainer>
      {matchResult(nftMetadataState, {
        ok: (nftMetadata) => (
          <ImageContainer>
            <NFT src={nftMetadata.image} alt={`${nftMetadata.name} NFT`} />
            <NftName>{nftMetadata.name}</NftName>
          </ImageContainer>
        ),
        loading: () => (
          <ImageContainer>
            <ImageShimmer />
            <ImageLoadingSpacer />
          </ImageContainer>
        ),
        err: () => (
          <ImageContainer>
            <ErrorText>Failed to load NFT Metadata.</ErrorText>
            <ErrorText>
              Are you sure this is a Solana NFT mint address?
            </ErrorText>
          </ImageContainer>
        ),
      })}
      <TxTitle>ACTIVITY</TxTitle>
      {matchResult(nftHistoryState, {
        ok: (nftHistory) => {
          if (nftHistory.length === 0) {
            return <EmptyHistoryText>No history found.</EmptyHistoryText>;
          }

          return nftHistory.map((tx) => (
            <Tx key={tx.signatures.join("")}>
              <TxLeft>
                <TxHeading>{renderTransactionTitle(tx)}</TxHeading>
                <DateTimeComponent blockTime={tx.tx.blockTime} />
              </TxLeft>
              <PriceDataComponent tx={tx} priceState={priceState} />
            </Tx>
          ));
        },
        loading: () => (
          <LoadingText>
            Loading activity history
            <ThreeDotsAnimation />
          </LoadingText>
        ),
        err: (e) => {
          // Heuristic to determine if requests were rate limited
          const isRateLimited = e.message.includes("429 Too Many Requests");
          return (
            <ErrorText style={{ marginTop: 42 }}>
              Failed to load NFT activity history.{" "}
              {isRateLimited && "The requests were rate limited."}
            </ErrorText>
          );
        },
      })}
    </NftDetailsContainer>
  );
};

/** ===========================================================================
 * Styles
 * ============================================================================
 */

const NftDetailsContainer = styled.div`
  width: 500px;
  padding-bottom: 45px;

  @media (max-width: 550px) {
    width: 85vw;
  }
`;

const ImageContainer = styled.div`
  height: 330px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
`;

const NFT = styled.img`
  width: 235px;
  height: 235px;
  border-radius: 16px;
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.25), 0 10px 10px rgba(0, 0, 0, 0.22);
`;

const ImageLoadingContainer = styled.div`
  width: 235px;
  height: 235px;

  .image-shimmer {
    border-radius: 16px;
  }
`;

const ImageShimmer = () => {
  return (
    <ImageLoadingContainer>
      <Shimmer height={235} width={235} className="image-shimmer" />
    </ImageLoadingContainer>
  );
};

const ImageLoadingSpacer = styled.div`
  height: 137px;
`;

/**
 * Render ... with an interval animation to suggest loading behavior.
 */
const ThreeDotsAnimation: React.FC = () => {
  const [dots, setDots] = useState("");

  useInterval(() => {
    const next = dots.length === 3 ? "" : dots.concat(".");
    setDots(next);
  }, 333);

  return <span>{dots}</span>;
};

const NftName = styled.h5`
  font-size: 26px;
  margin-top: 26px;
  margin-bottom: 22px;
  font-weight: 500;
`;

const EmptyHistoryText = styled.p`
  margin-top: 42px;
  font-size: 14px;
  color: ${C.grayLight};
`;

const LoadingText = styled.p`
  margin-top: 42px;
  font-size: 14px;
  color: ${C.grayLight};
`;

const ErrorText = styled.p`
  font-size: 14px;
  color: ${C.grayLight};
`;

const TxTitle = styled.h2`
  font-size: 14px;
  color: ${C.grayLight};
`;

const Tx = styled.div`
  width: 100%;
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid ${C.whiteLight};

  :last-child {
    border: none;
  }
`;

const TxLeft = styled.div``;

const TxRight = styled.div`
  text-align: right;
`;

const TxText = styled.p`
  margin-top: 6px;
  margin-bottom: 6px;
`;

const TxHeading = styled(TxText)`
  margin-top: 6px;
  margin-bottom: 6px;
  font-size: 16px;
  font-weight: 400;
`;

const TxHeadingPrice = styled(TxHeading)`
  font-size: 20px;
  font-weight: 500;
`;

const TxSubHeading = styled(TxText)`
  margin-top: 6px;
  margin-bottom: 6px;
  font-size: 14px;
  color: ${C.gray};
`;

/**
 * Render date time for a given transaction blockTime.
 */
const DateTimeComponent = (props: { blockTime: number | null | undefined }) => {
  if (typeof props.blockTime === "number") {
    const milliseconds = props.blockTime * 1000;
    return <TxSubHeading>{formatDate(milliseconds)}</TxSubHeading>;
  } else {
    return <TxSubHeading>Unknown block time</TxSubHeading>;
  }
};

/**
 * Handle rendering price data for an NFT activity record.
 */
const PriceDataComponent = (props: {
  tx: TransactionVariant;
  priceState: PriceState;
}) => {
  const { tx, priceState } = props;
  const { type } = tx;

  // Only the Sale transaction includes a price, currently.
  if (type !== TransactionType.Sale) {
    return <TxRight />;
  }

  // Calculate SOL from lamports
  const lamports = tx.lamports;
  const sol = lamportsToSOL(lamports);

  return (
    <TxRight>
      <TxHeadingPrice>{formatNumber(sol)} ◎</TxHeadingPrice>
      {matchResult(priceState, {
        ok: (solUsdPrice) => (
          <TxSubHeading>{formatFiatPrice(sol, solUsdPrice)}</TxSubHeading>
        ),
        loading: () => <TxSubHeading>Loading SOL price...</TxSubHeading>,
        err: () => <TxSubHeading>Failed to load SOL price.</TxSubHeading>,
      })}
    </TxRight>
  );
};

/**
 * Handle rendering the transaction summary title for a given transaction.
 */
const renderTransactionTitle = (tx: TransactionVariant) => {
  const { type } = tx;
  switch (type) {
    case TransactionType.Mint:
      return (
        <span>
          Minted by <AddressComponent address={tx.minter} />
        </span>
      );
    case TransactionType.Transfer:
      return (
        <span>
          Transferred to <AddressComponent address={tx.newOwnerAddress} />
        </span>
      );
    case TransactionType.Listing:
      return (
        <span>
          Listed by <AddressComponent address={tx.seller} />
        </span>
      );
    case TransactionType.CancelListing:
      return (
        <span>
          Listing cancelled by <AddressComponent address={tx.seller} />
        </span>
      );
    case TransactionType.Sale:
      return (
        <span>
          Bought by <AddressComponent address={tx.buyer} />
        </span>
      );
    default:
      return assertUnreachable(type);
  }
};

/**
 * Render an address. This handles abbreviating the address and wrapping
 * it in a click handler which copies the address to the clipboard.
 */
const AddressComponent = (props: { address: string }) => {
  const { address } = props;

  // Sometimes addresses will fail to be derived, especially for some
  // transferChecked transactions. Handle that here because otherwise the
  // following code would throw an error.
  if (!address) {
    return <span>[no address found...]</span>;
  }

  return (
    <ClickableAddress
      onClick={() => {
        copyToClipboard(address);
        toast.success(`Address copied to clipboard.`);
      }}
    >
      {abbreviateAddress(address)}
    </ClickableAddress>
  );
};

const ClickableAddress = styled.span`
  :hover {
    cursor: pointer;
  }
`;

/** ===========================================================================
 * Export
 * ============================================================================
 */

export default NftDetails;
