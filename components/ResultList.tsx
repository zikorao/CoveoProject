'use client';

import {useResultList} from '../lib/engine';

function toTypes(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (raw) return [String(raw)];
  return [];
}

function toGeneration(raw: unknown): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value ? String(value) : null;
}

export function ResultList() {
  const {state} = useResultList();

  if (!state.results.length) {
    return (
      <div className="empty-state">
        <strong>No Pokemon found</strong>
        Try a different search or clear your filters.
      </div>
    );
  }

  return (
    <ul className="product-grid">
      {state.results.map((result) => {
        const picture = result.raw.picture as string | undefined;
        const types = toTypes(result.raw.type);
        const generation = toGeneration(result.raw.generation);

        return (
          <li key={result.uniqueId}>
            <a className="product-card" href={result.clickUri}>
              <div className="product-media">
                {generation ? (
                  <span className="gen-badge">Gen {generation}</span>
                ) : null}
                {picture ? (
                  <img src={picture} alt={result.title} loading="lazy" />
                ) : null}
              </div>
              <div className="product-body">
                <span className="product-name">{result.title}</span>
                {types.length ? (
                  <div className="type-chips">
                    {types.map((t) => (
                      <span key={t} className={`type-chip type-${t.toLowerCase()}`}>
                        {t}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
