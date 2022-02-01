import React, { useState } from "react";
import styled from "styled-components";
import { useLocation } from "react-router-dom";
import { Shimmer } from "react-shimmer";
import {
  NftMetadata,
  TransactionType,
  TransactionVariants,
} from "../tools/web3-types";
import {
  fetchSolPrice,
  fetchTokenMetadata,
  fetchTransactionHistory,
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
import toast from "react-hot-toast";
import {
  ResultLoading,
  Result,
  Ok,
  Err,
  matchResult,
} from "../tools/result-type";

type TokenHistoryState = Result<TransactionVariants[], Error>;
type PriceState = Result<BN, Error>;
type NftMetadataState = Result<NftMetadata, Error>;

const Transactions: React.FC = () => {
  const [priceState, setPriceState] = useState<PriceState>(ResultLoading());
  const [nftMetadataState, setNftMetadataState] = useState<NftMetadataState>(
    ResultLoading(),
  );
  const [tokenHistoryState, setTokenHistoryState] = useState<TokenHistoryState>(
    ResultLoading(),
  );

  // Derive current address from URL location state
  const location = useLocation();
  const address = location.pathname.replace("/txs/", "");

  // Fetch/update SOL price on a 10 second interval
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

  // Reset state when the address changes
  React.useEffect(() => {
    setNftMetadataState(ResultLoading());
    setTokenHistoryState(ResultLoading());
  }, [address]);

  React.useEffect(() => {
    const fetchHistory = async () => {
      try {
        const result = await fetchTransactionHistory(address);
        setTokenHistoryState(Ok(result));
      } catch (err) {
        setTokenHistoryState(Err(err as Error));
      }
    };

    fetchHistory();
  }, [address]);

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
        ok: (history) => {
          return (
            <>
              {history.map((tx) => {
                const time = tx.tx.blockTime;
                return (
                  <Tx key={tx.signatures[0]}>
                    <TxLeft>
                      <TxHeading>{renderTransactionTitle(tx)}</TxHeading>
                      {time ? (
                        <TxSubHeading>{formatDate(time * 1000)}</TxSubHeading>
                      ) : (
                        <TxSubHeading>Unknown block</TxSubHeading>
                      )}
                    </TxLeft>
                    <PriceData tx={tx} priceState={priceState} />
                  </Tx>
                );
              })}
            </>
          );
        },
        loading: () => <LoadingText>Loading...</LoadingText>,
        err: () => <ErrorText>Failed to load NFT Metadata</ErrorText>,
      })}
    </TxContainer>
  );
};

/**
 * Handle rendering price data for an NFT activity record.
 */
const PriceData = (props: {
  tx: TransactionVariants;
  priceState: PriceState;
}) => {
  const { tx, priceState } = props;
  const { type } = tx;

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
        loading: () => <TxSubHeading>Loading prices...</TxSubHeading>,
        err: () => <TxSubHeading>Error loading prices</TxSubHeading>,
      })}
    </TxRight>
  );
};

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
  width: 250px;
  height: 250px;
  border-radius: 16px;
`;

const ImageShimmer = () => {
  return <Shimmer height={250} width={250} className="image-shimmer" />;
};

const NftName = styled.h5`
  font-size: 26px;
  margin-top: 26px;
  margin-bottom: 22px;
  font-weight: 500;
`;

const LoadingText = styled.p`
  font-size: 14px;
  color: rgb(145, 145, 145);
`;

const ErrorText = styled.p`
  font-size: 14px;
  color: rgb(145, 145, 145);
`;

const TxTitle = styled.h2`
  font-size: 14px;
  color: rgb(145, 145, 145);
`;

const Tx = styled.div`
  width: 100%;
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(175, 175, 175, 0.5);

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
  color: rgb(150, 150, 150);
`;

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

export default Transactions;
