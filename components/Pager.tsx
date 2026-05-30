'use client';

import {usePager} from '../lib/engine';

export function Pager() {
  const {state, methods} = usePager();

  if (state.maxPage <= 1) {
    return null;
  }

  return (
    <nav className="pager" aria-label="Pagination">
      <button
        type="button"
        onClick={() => methods?.previousPage()}
        disabled={!state.hasPreviousPage}
        aria-label="Previous page"
      >
        Prev
      </button>
      {state.currentPages.map((page) => (
        <button
          type="button"
          key={page}
          className={page === state.currentPage ? 'active' : ''}
          aria-current={page === state.currentPage ? 'page' : undefined}
          onClick={() => methods?.selectPage(page)}
        >
          {page}
        </button>
      ))}
      <button
        type="button"
        onClick={() => methods?.nextPage()}
        disabled={!state.hasNextPage}
        aria-label="Next page"
      >
        Next
      </button>
    </nav>
  );
}
