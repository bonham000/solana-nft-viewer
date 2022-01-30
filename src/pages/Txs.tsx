import React from "react";
import { useLocation } from "react-router-dom";

const Transactions: React.FC = () => {
  const location = useLocation();
  const address = location.pathname.replace("/txs/", "");
  return (
    <div>
      <p>
        Transactions for <code>{address}</code>
      </p>
    </div>
  );
};

export default Transactions;
