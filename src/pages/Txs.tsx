import React from "react";
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
  fetchTransactionHistory,
} from "../tools/web3";
import {
  formatDate,
  formatFiatPrice,
  formatNumber,
  lamportsToSOL,
} from "../tools/utils";
import { useInterval } from "usehooks-ts";
import BN from "bignumber.js";

const Transactions: React.FC = () => {
  // Setup various state management for this component
  const [historyLoading, setHistoryLoading] = React.useState(true);
  const [metadataLoading, setMetadataLoading] = React.useState(true);
  const [priceLoading, setPriceLoading] = React.useState(true);
  const [solPrice, setSolPrice] = React.useState<BN | null>(null);
  const [nftMetadata, setNftMetadata] = React.useState<NftMetadata | null>(
    null,
  );
  const [history, setHistory] = React.useState<TransactionVariants[]>([]);

  // Derive current address from URL location state
  const location = useLocation();
  const address = location.pathname.replace("/txs/", "");

  // Fetch/update SOL price on a 10 second interval
  useInterval(() => {
    const fetchPriceData = async () => {
      const result = await fetchSolPrice();
      setPriceLoading(false);
      setSolPrice(result);
    };

    fetchPriceData();
  }, 10000);

  // Reset state when the address changes
  React.useEffect(() => {
    setHistory([]);
    setNftMetadata(null);
    setHistoryLoading(true);
    setMetadataLoading(true);
  }, [address]);

  React.useEffect(() => {
    const fetchHistory = async () => {
      const result = await fetchTransactionHistory(address);
      setHistoryLoading(false);
      setHistory(result);
      console.log(result);
    };

    fetchHistory();
  }, [address]);

  React.useEffect(() => {
    const fetchHistory = async () => {
      const result = await fetchTokenMetadata(address);
      setMetadataLoading(false);
      setNftMetadata(result);
    };

    fetchHistory();
  }, [address]);

  return (
    <TxContainer>
      {metadataLoading ? (
        <ImageContainer>
          <ImageShimmer />
          <div style={{ height: 137 }} />
        </ImageContainer>
      ) : (
        nftMetadata && (
          <ImageContainer>
            <NFT src={nftMetadata.image} alt={`${nftMetadata.name} NFT`} />
            <NftName>{nftMetadata.name}</NftName>
          </ImageContainer>
        )
      )}
      <TxTitle>ACTIVITY</TxTitle>
      {historyLoading && <LoadingText>Loading...</LoadingText>}
      {history.map((tx) => {
        const time = tx.tx.blockTime;
        return (
          <Tx key={tx.signatures[0]}>
            <TxLeft>
              <TxHeading>{tx.type}</TxHeading>
              {time ? (
                <TxSubHeading>{formatDate(time * 1000)}</TxSubHeading>
              ) : (
                <TxSubHeading>Unknown block</TxSubHeading>
              )}
            </TxLeft>
            <PriceData
              tx={tx}
              solPrice={solPrice}
              priceLoading={priceLoading}
            />
          </Tx>
        );
      })}
    </TxContainer>
  );
};

/**
 * Handle rendering price data for an NFT activity record.
 */
const PriceData = (props: {
  tx: TransactionVariants;
  solPrice: BN | null;
  priceLoading: boolean;
}) => {
  const { tx, solPrice, priceLoading } = props;
  const { type } = tx;

  if (type !== TransactionType.Sale) {
    return <TxRight />;
  }

  const lamports = tx.lamports;
  const sol = lamportsToSOL(lamports);

  return (
    <TxRight>
      <TxHeading>{formatNumber(sol)} ◎</TxHeading>
      {priceLoading ? (
        <TxSubHeading>Loading...</TxSubHeading>
      ) : solPrice === null ? (
        <TxSubHeading>Failed to fetch SOL price...</TxSubHeading>
      ) : (
        <TxSubHeading>{formatFiatPrice(sol, solPrice)}</TxSubHeading>
      )}
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

export default Transactions;
