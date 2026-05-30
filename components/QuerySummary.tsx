'use client';

import {useQuerySummary} from '../lib/engine';

export function QuerySummary() {
  const {state} = useQuerySummary();

  if (!state.hasResults) {
    return <p className="result-summary">No results</p>;
  }

  return (
    <p className="result-summary">
      Showing <strong>{state.firstResult}</strong>-
      <strong>{state.lastResult}</strong> of <strong>{state.total}</strong>{' '}
      Pokemon
      {state.hasQuery ? (
        <>
          {' '}
          for <strong>&ldquo;{state.query}&rdquo;</strong>
        </>
      ) : null}
    </p>
  );
}
