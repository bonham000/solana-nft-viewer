import React from "react";
import styled from "styled-components";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import NftDetails from "./ui/NftDetails";
import SearchForm from "./ui/SearchForm";
import { Link } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { COLORS as C } from "./tools/colors";

/** ===========================================================================
 * App Component
 * ----------------------------------------------------------------------------
 * This is the main app component. It renders the header, NFT mint address
 * search input bar, and the app routes. Currently, there's only one route
 * which displays the details for a given NFT mint address.
 * ============================================================================
 */

function App() {
  return (
    <Router>
      <Toaster />
      <Header>
        <Link to="/">
          <HeaderTitle>nifty information</HeaderTitle>
        </Link>
      </Header>
      <Body>
        <SearchForm />
        <Routes>
          <Route path="/" element={null} />
          <Route path="/nft/:address" element={<NftDetails />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Body>
    </Router>
  );
}

/** ===========================================================================
 * Styles
 * ============================================================================
 */

const Header = styled.div`
  height: 55px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;

  background: ${C.purpleGradientBase};
  background: -moz-linear-gradient(
    90deg,
    ${C.purpleGradientLeft} 20%,
    ${C.purpleGradientRight} 78%
  );
  background: -webkit-linear-gradient(
    90deg,
    ${C.purpleGradientLeft} 20%,
    ${C.purpleGradientRight} 78%
  );
  background: linear-gradient(
    90deg,
    ${C.purpleGradientLeft} 20%,
    ${C.purpleGradientRight} 78%
  );

  a {
    text-decoration: none;
  }
`;

const HeaderTitle = styled.h1`
  margin: 0;
  color: white;
  font-size: 16px;
  font-weight: 500;
  text-decoration: none !important;
`;

const Body = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
`;

/** ===========================================================================
 * Export
 * ============================================================================
 */

export default App;
