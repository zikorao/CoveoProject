'use client';

import {useSearchBox} from '../lib/engine';

export function SearchBox() {
  const {state, methods} = useSearchBox();

  return (
    <div className="search-field">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="search"
        placeholder="Search Pokemon by name..."
        aria-label="Search Pokemon"
        value={state.value}
        onChange={(e) => methods?.updateText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && methods?.submit()}
      />
      {state.value ? (
        <button
          type="button"
          className="clear-btn"
          aria-label="Clear search"
          onClick={() => methods?.clear()}
        >
          x
        </button>
      ) : null}
    </div>
  );
}
