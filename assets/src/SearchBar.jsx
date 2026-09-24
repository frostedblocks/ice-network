import React, { useState } from "react";

export default function SearchBar({ onSearch, onClear }) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      onSearch(trimmed);
    }
  };

  const handleClear = () => {
    setQuery("");
    if (onClear) onClear();
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "flex",
        gap: "0.5rem",
        marginBottom: "1.25rem",
      }}
    >
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search posts…"
        style={{
          flex: 1,
          padding: "0.55rem 0.75rem",
          fontSize: "0.95rem",
        }}
      />
      <button type="submit" className="ice-btn">
        Search
      </button>
      {query && (
        <button type="button" onClick={handleClear} className="ice-btn">
          Clear
        </button>
      )}
    </form>
  );
}
