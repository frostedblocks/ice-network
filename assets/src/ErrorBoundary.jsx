import React from "react";

/** Keeps a white/dark UI instead of a blank crash screen */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("UI error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            background:
              "radial-gradient(ellipse 80% 50% at 20% -10%, rgba(125, 211, 252, 0.12), transparent 50%), #07070b",
            color: "#e2e8f0",
            padding: "2rem",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h2 style={{ color: "#f8fafc" }}>Something went wrong</h2>
          <p style={{ color: "#f87171", wordBreak: "break-word" }}>
            {this.state.error?.message || String(this.state.error)}
          </p>
          <button
            type="button"
            className="ice-btn-primary"
            onClick={() => window.location.reload()}
            style={{ marginTop: "1rem" }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
