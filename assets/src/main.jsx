import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./ErrorBoundary";
import ClockSkewBanner from "./ClockSkewBanner";
import "./theme.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
      <ClockSkewBanner />
    </ErrorBoundary>
  </React.StrictMode>
);
