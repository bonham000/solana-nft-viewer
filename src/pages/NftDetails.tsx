import React, { useState } from "react";
import styled from "styled-components";
import { useLocation } from "react-router-dom";
import { Shimmer } from "react-shimmer";
import {
  NftMetadata,
  TransactionType,
  TransactionVariants,
} from "../tools/types";
import {
  fetchSolPrice,
  fetchTokenMetadata,
  fetchMagicEdenActivityHistory,
} from "../tools/web3";
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
type TokenHistoryState = Result<TransactionVariants[], Error>;

const NftDetails: React.FC = () => {
  // Derive current address from URL location state
  const location = useLocation();
  const address = location.pathname.replace("/txs/", "");

  // Setup state
  const [priceState, setPriceState] = useState<PriceState>(ResultLoading());
  const [nftMetadataState, setNftMetadataState] = useState<NftMetadataState>(
    ResultLoading(),
  );
  const [tokenHistoryState, setTokenHistoryState] = useState<TokenHistoryState>(
    ResultLoading(),
  );

  // Reset state when the address changes
  React.useEffect(() => {
    setNftMetadataState(ResultLoading());
    setTokenHistoryState(ResultLoading());
  }, [address]);

  // Handle fetching NFT activity history
  React.useEffect(() => {
    const fetchHistory = async () => {
      try {
        const result = await fetchMagicEdenActivityHistory(address);
        setTokenHistoryState(Ok(result));
      } catch (err) {
        setTokenHistoryState(Err(err as Error));
      }
    };

    fetchHistory();
  }, [address]);

  // Handle fetching NFT metadata
  React.useEffect(() => {
    const fetchHistory = async () => {
      try {
        const result = await fetchTokenMetadata(address);
        setNftMetadataState(Ok(result));
      } catch (err) {
        setNftMetadataState(Err(err as Error));
      }
    };

    fetchHistory();
  }, [address]);

  // Handling fetching current SOL USD price. Refresh every 10 seconds.
  useInterval(() => {
    const fetchPriceData = async () => {
      try {
        const result = await fetchSolPrice();
        setPriceState(Ok(result));
      } catch (err) {
        setPriceState(Err(err as Error));
      }
    };

    fetchPriceData();
  }, 10000);

  return (
    <TxContainer>
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
            <div style={{ height: 137 }} />
          </ImageContainer>
        ),
        err: () => (
          <ImageContainer>
            <ErrorText>Failed to load NFT Metadata</ErrorText>
          </ImageContainer>
        ),
      })}
      <TxTitle>ACTIVITY</TxTitle>
      {matchResult(tokenHistoryState, {
        ok: (history) =>
          history.map((tx) => (
            <Tx key={tx.signatures[0]}>
              <TxLeft>
                <TxHeading>{renderTransactionTitle(tx)}</TxHeading>
                <RenderDateTime time={tx.tx.blockTime} />
              </TxLeft>
              <PriceDataComponent tx={tx} priceState={priceState} />
            </Tx>
          )),
        loading: () => <LoadingText>Loading history...</LoadingText>,
        err: () => <ErrorText>Failed to load NFT activity history</ErrorText>,
      })}
    </TxContainer>
  );
};

/** ===========================================================================
 * Styled Components and Helpers
 * ============================================================================
 */

const TxContainer = styled.div`
  width: 500px;
  padding-bottom: 45px;

  @media (max-width: 500px) {
    width: 85vw;
  }
`;

const ImageContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  height: 330px;

  .image-shimmer {
    border-radius: 16px;
  }
`;

const NFT = styled.img`
  width: 235px;
  height: 235px;
  border-radius: 16px;
`;

const ImageShimmer = () => {
  return <Shimmer height={235} width={235} className="image-shimmer" />;
};

const NftName = styled.h5`
  font-size: 26px;
  margin-top: 26px;
  margin-bottom: 22px;
  font-weight: 500;
`;

const LoadingText = styled.p`
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
const RenderDateTime = (props: { time: number | null | undefined }) => {
  if (typeof props.time === "number") {
    return <TxSubHeading>{formatDate(props.time * 1000)}</TxSubHeading>;
  } else {
    return <TxSubHeading>Unknown block time</TxSubHeading>;
  }
};

/**
 * Handle rendering price data for an NFT activity record.
 */
const PriceDataComponent = (props: {
  tx: TransactionVariants;
  priceState: PriceState;
}) => {
  const { tx, priceState } = props;
  const { type } = tx;

  // Only the Sale transaction includes a price, currently.
  if (type !== TransactionType.Sale) {
    return <TxRight />;
  }

  const lamports = tx.lamports;
  const sol = lamportsToSOL(lamports);

  return (
    <TxRight>
      <TxHeading>{formatNumber(sol)} ◎</TxHeading>
      {matchResult(priceState, {
        ok: (solPrice) => (
          <TxSubHeading>{formatFiatPrice(sol, solPrice)}</TxSubHeading>
        ),
        loading: () => <TxSubHeading>Loading SOL price...</TxSubHeading>,
        err: () => <TxSubHeading>Failed to load SOL price</TxSubHeading>,
      })}
    </TxRight>
  );
};

/**
 * Handle rendering the transaction summary title for a given transaction.
 */
const renderTransactionTitle = (tx: TransactionVariants) => {
  const { type } = tx;
  switch (type) {
    case TransactionType.Mint:
      return (
        <span>
          Minted by <RenderAddress address={tx.minter} />
        </span>
      );
    case TransactionType.Transfer:
      return (
        <span>
          Transferred to <RenderAddress address={tx.destination} />
        </span>
      );
    case TransactionType.Listing:
      return (
        <span>
          Listed by <RenderAddress address={tx.seller} />
        </span>
      );
    case TransactionType.CancelListing:
      return (
        <span>
          Listing cancelled by <RenderAddress address={tx.seller} />
        </span>
      );
    case TransactionType.Sale:
      return (
        <span>
          Bought by <RenderAddress address={tx.buyer} />
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
const RenderAddress = (props: { address: string }) => {
  const { address } = props;
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
