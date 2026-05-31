'use client';

import {useEffect, useState} from 'react';
import {useRouter} from 'next/navigation';
import {useSearchBox, SOURCE_FILTER} from '../lib/engine';

const ORG = process.env.NEXT_PUBLIC_COVEO_ORG_ID;
const TOKEN = process.env.NEXT_PUBLIC_COVEO_ACCESS_TOKEN;

// Instant-results fallback: complements the ML Query Suggestions model so the
// type-ahead stays comprehensive while the QS model accumulates more data.
const INSTANT_RESULTS_ENABLED = true;

interface InstantResult {
  uniqueId: string;
  title: string;
  clickUri: string;
  raw: {picture?: string};
}

function toSlug(clickUri: string): string {
  return (
    clickUri.split('?')[0].split('#')[0].replace(/\/$/, '').split('/').pop() ?? ''
  );
}

// Build a prefix query so partial input matches ("char" -> "char*"). Strip
// characters that would break Coveo query syntax to keep the request valid.
function toPrefixQuery(value: string): string {
  return value
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `${token}*`)
    .join(' ');
}

export function SearchBox() {
  const {state, methods} = useSearchBox();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<InstantResult[]>([]);

  // Debounced instant search: runs a live wildcard query as the user types.
  // This works immediately without a trained ML Query Suggestions model.
  useEffect(() => {
    const value = state.value.trim();
    if (!INSTANT_RESULTS_ENABLED || !value || !ORG || !TOKEN) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://${ORG}.org.coveo.com/rest/search/v2?organizationId=${ORG}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              q: toPrefixQuery(value),
              enableQuerySyntax: true,
              wildcards: true,
              cq: SOURCE_FILTER,
              fieldsToInclude: ['picture'],
              numberOfResults: 6,
            }),
            signal: controller.signal,
          }
        );
        if (!res.ok) return;
        const data = await res.json();
        setResults((data.results as InstantResult[]) ?? []);
      } catch {
        // Ignore aborted / network errors; the next keystroke retries.
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [state.value]);

  const suggestions = state.suggestions ?? [];
  const hasInstant = INSTANT_RESULTS_ENABLED && results.length > 0;
  // Preload behavior: suggestions show on focus even before the user types
  // (empty query returns the QS model's most popular suggestions).
  const showDropdown = open && (suggestions.length > 0 || hasInstant);

  const goTo = (clickUri: string) => {
    router.push(`/pokemon/${toSlug(clickUri)}`);
    setOpen(false);
  };

  const runSuggestion = (value: string) => {
    methods?.selectSuggestion(value);
    setOpen(false);
  };

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
        autoComplete="off"
        value={state.value}
        onChange={(e) => {
          methods?.updateText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          methods?.showSuggestions();
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            methods?.submit();
            setOpen(false);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
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
      {showDropdown ? (
        <div className="suggestions" role="listbox">
          {suggestions.length > 0 ? (
            <div className="sugg-section">
              <p className="sugg-label">Suggestions</p>
              <ul>
                {suggestions.map((suggestion) => (
                  <li key={suggestion.rawValue} role="option" aria-selected="false">
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        runSuggestion(suggestion.rawValue);
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
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
                      <span>{suggestion.rawValue}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {INSTANT_RESULTS_ENABLED && results.length > 0 ? (
            <div className="sugg-section">
              <p className="sugg-label">Pokemon</p>
              <ul>
                {results.map((result) => {
                  const picture = result.raw.picture;
                  return (
                    <li key={result.uniqueId} role="option" aria-selected="false">
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          goTo(result.clickUri);
                        }}
                      >
                        {picture ? (
                          <img
                            className="suggestion-thumb"
                            src={picture}
                            alt=""
                            width={32}
                            height={32}
                            loading="lazy"
                          />
                        ) : (
                          <span className="suggestion-thumb" />
                        )}
                        <span>{result.title}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
