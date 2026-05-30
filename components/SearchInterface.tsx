'use client';

import {useTypeFacet, useGenerationFacet} from '../lib/engine';
import {SearchBox} from './SearchBox';
import {ResultList} from './ResultList';
import {Facet} from './Facet';
import {QuerySummary} from './QuerySummary';
import {Pager} from './Pager';

export function SearchInterface() {
  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="logo-dot" />
          <span>
            Poke<span className="accent">Mart</span>
          </span>
        </div>
        <SearchBox />
      </header>

      <div className="layout">
        <aside className="sidebar">
          <p className="sidebar-title">Filters</p>
          <Facet title="Type" controller={useTypeFacet()} colorize />
          <Facet
            title="Generation"
            controller={useGenerationFacet()}
            formatValue={(v) => `Generation ${v}`}
          />
        </aside>

        <main className="content">
          <div className="toolbar">
            <h1>Pokemon Catalog</h1>
            <QuerySummary />
          </div>
          <ResultList />
          <Pager />
        </main>
      </div>
    </>
  );
}
