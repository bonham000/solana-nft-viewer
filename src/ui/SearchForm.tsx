import React, { useEffect } from "react";
import styled from "styled-components";
import { useNavigate, useLocation } from "react-router-dom";
import { FaSearch, FaTimesCircle } from "react-icons/fa";
import { validateAddressAsPublicKey } from "../tools/utils";
import toast from "react-hot-toast";
import { COLORS as C } from "../tools/colors";

/** ===========================================================================
 * Search Form Component
 * ============================================================================
 */

const SearchForm: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [address, setAddress] = React.useState("");
  const searchInput = React.useRef<HTMLInputElement>(null);

  // Try to pull address from url if pages loads on /nft/:address route
  useEffect(() => {
    const { pathname } = location;
    if (pathname.includes("/nft/")) {
      const urlAddress = pathname.replace("/nft/", "");
      if (validateAddressAsPublicKey(urlAddress)) {
        // If the address is valid select it
        setAddress(urlAddress);
      } else {
        // Otherwise redirect to / and notify the user with a toast
        toast.error("Invalid address provided in url.");
        navigate("/");
      }
    }
  }, [location, navigate]);

  // Reset entered address on navigation back to base route
  useEffect(() => {
    if (location.pathname === "/") {
      setAddress("");
    }
  }, [location]);

  // Handle search address on form submit (Enter key pressed)
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (validateAddressAsPublicKey(address)) {
      // Blur input on submit
      if (searchInput.current) {
        searchInput.current.blur();
      }

      navigate(`/nft/${address}`);
    } else {
      toast.error("Please check the address format.");
    }
  };

  // Clear address and re-focus search input
  const clearSearchInput = () => {
    if (searchInput.current) {
      searchInput.current.focus();
    }

    setAddress("");
  };

  return (
    <Form onSubmit={handleSubmit}>
      <SearchIcon />
      <SearchInput
        autoFocus
        type="text"
        value={address}
        ref={searchInput}
        spellCheck={false}
        placeholder="Input an NFT's mint account"
        onChange={(e) => setAddress(e.target.value)}
      />
      <ClearIcon
        onClick={clearSearchInput}
        style={{ visibility: address === "" ? "hidden" : "visible" }}
      />
    </Form>
  );
};

/** ===========================================================================
 * Styles
 * ============================================================================
 */

const Form = styled.form`
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 14px;
  height: 128px;
`;

const SearchInput = styled.input`
  width: 500px;
  height: 45px;
  border-radius: 48px;
  border: 1px solid ${C.whiteLight};
  outline: none;
  padding-left: 42px;
  padding-right: 42px;

  @media (max-width: 500px) {
    width: 65vw;
    font-size: 12px;
  }
`;

const SearchIcon = styled(FaSearch)`
  position: relative;
  right: -32px;
  color: ${C.gray};
`;

const ClearIcon = styled(FaTimesCircle)`
  position: relative;
  left: -32px;
  color: ${C.gray};

  :hover {
    cursor: pointer;
    color: ${C.darkMedium};
  }
`;

/** ===========================================================================
 * Export
 * ============================================================================
 */

export default SearchForm;
