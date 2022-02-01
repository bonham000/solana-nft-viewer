import React from "react";
import styled from "styled-components";
import {
  useNavigate,
  useLocation,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import NftDetails from "./pages/NftDetails";
import { Link } from "react-router-dom";
import { FaSearch, FaTimesCircle } from "react-icons/fa";
import { validateAddressAsPublicKey } from "./tools/utils";
import toast, { Toaster } from "react-hot-toast";

/** ===========================================================================
 * App Component
 * ----------------------------------------------------------------------------
 * This is the main app component. It renders the header, NFT mint address
 * search input bar, and the app routes. Currently, there's only one route
 * which displays the details for a given NFT mint address.
 * ============================================================================
 */

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [address, setAddress] = React.useState("");

  // Reset entered address on navigation back to base route
  React.useEffect(() => {
    const { pathname } = location;
    if (pathname.includes("/txs/")) {
      const urlAddress = pathname.replace("/txs/", "");
      if (validateAddressAsPublicKey(urlAddress)) {
        // If the address is valid select it
        setAddress(urlAddress);
      } else {
        // Otherwise redirect to / and notify the user with a toast
        toast.error("Invalid address provided in url");
        navigate("/");
      }
    }
  }, [location, navigate]);

  // Reset entered address on navigation back to base route
  React.useEffect(() => {
    if (location.pathname === "/") {
      setAddress("");
    }
  }, [location]);

  // Handle search address on form submit (Enter key pressed)
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (validateAddressAsPublicKey(address)) {
      navigate(`/txs/${address}`);
    } else {
      toast.error("Please check the address format.");
    }
  };

  return (
    <>
      <Header>
        <Link to="/" style={{ textDecoration: "none" }}>
          <HeaderTitle>nifty information</HeaderTitle>
        </Link>
      </Header>
      <Body>
        <Form onSubmit={handleSubmit}>
          <SearchIcon />
          <Input
            value={address}
            placeholder="Input an NFT's mint account"
            onChange={(e) => setAddress(e.target.value)}
          />
          <ClearIcon onClick={() => setAddress("")} />
        </Form>
        <Routes>
          <Route path="/" element={null} />
          <Route path="/txs/:address" element={<NftDetails />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Body>
      <Toaster />
    </>
  );
}

/** ===========================================================================
 * Styled Components
 * ============================================================================
 */

const Header = styled.div`
  height: 55px;
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
  font-weight: 500;
  margin: 0;
  text-decoration: none !important;
`;

const Body = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
`;

const Form = styled.form`
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Input = styled.input`
  margin-top: 48px;
  margin-bottom: 48px;
  width: 450px;
  height: 45px;
  border-radius: 48px;
  border: 1px solid rgb(215, 215, 215);
  outline: none;
  padding-left: 42px;
  padding-right: 42px;

  @media (max-width: 500px) {
    width: 65vw;
  }
`;

const SearchIcon = styled(FaSearch)`
  position: relative;
  right: -32px;
  color: rgb(150, 150, 150);
`;

const ClearIcon = styled(FaTimesCircle)`
  position: relative;
  left: -32px;
  color: rgb(150, 150, 150);

  :hover {
    cursor: pointer;
    color: rgb(75, 75, 75);
  }
`;

/** ===========================================================================
 * Export
 * ============================================================================
 */

export default App;
