import React from "react";
import styled from "styled-components";
import ReactDOM from "react-dom";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";

/**
 * Render the app in an error boundary.
 */
class ErrorBoundary extends React.Component {
  state = {
    hasError: false,
  };

  componentDidCatch(error: any) {
    console.error(error);
    this.setState({ hasError: true });
  }

  render(): React.ReactNode {
    return this.state.hasError ? (
      <ErrorFallback>
        <p>Oops, something bad happened... 😰</p>
      </ErrorFallback>
    ) : (
      this.props.children
    );
  }
}

const ErrorFallback = styled.div`
  position: fixed;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
`;

ReactDOM.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
  document.getElementById("root"),
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
