import React from "react";
import styled from "styled-components";
import { useNavigate, useLocation, Routes, Route } from "react-router-dom";
import Transactions from "./pages/Txs";
import { Link } from "react-router-dom";

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [address, setAddress] = React.useState("");

  // Reset entered address on navigation back to base route
  React.useEffect(() => {
    if (location.pathname === "/") {
      setAddress("");
    }
  }, [location]);

  // Handle search address on form submit (Enter key pressed)
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    navigate(`/txs/${address}`);
  };

  return (
    <div>
      <Header>
        <Link to="/" style={{ textDecoration: "none" }}>
          <HeaderTitle>nifty information</HeaderTitle>
        </Link>
      </Header>
      <Body>
        <form onSubmit={handleSubmit}>
          <Input
            value={address}
            placeholder="Input an NFT's mint account"
            onChange={(e) => setAddress(e.target.value)}
          />
        </form>
        <Routes>
          <Route path="/" element={null} />
          <Route path="/txs/:address" element={<Transactions />} />
        </Routes>
      </Body>
    </div>
  );
}

const Header = styled.div`
  height: 50px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;

  background: rgb(80, 80, 239);
  background: -moz-linear-gradient(
    90deg,
    rgba(80, 80, 239, 1) 20%,
    rgba(128, 94, 250, 1) 78%
  );
  background: -webkit-linear-gradient(
    90deg,
    rgba(80, 80, 239, 1) 20%,
    rgba(128, 94, 250, 1) 78%
  );
  background: linear-gradient(
    90deg,
    rgba(80, 80, 239, 1) 20%,
    rgba(128, 94, 250, 1) 78%
  );
`;

const HeaderTitle = styled.h1`
  color: white;
  font-size: 16px;
  font-weight: 400;
  margin: 0;
  text-decoration: none !important;
`;

const Body = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
`;

const Input = styled.input`
  margin-top: 48px;
  margin-bottom: 48px;
  width: 450px;
  height: 45px;
  border-radius: 48px;
  border: 1px solid rgb(215, 215, 215);
  outline: none;
  padding-left: 32px;
  padding-right: 32px;

  @media (max-width: 500px) {
    width: 80vw;
  }
`;

export default App;
