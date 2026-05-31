# PokeMart - Coveo Search Solution Documentation

A commerce-style product search experience for Pokemon, built on **Next.js (App
Router)** and **Coveo Headless React (SSR)**. This document describes the full
solution: architecture, configuration, the data pipeline, features, the
challenges encountered and how they were solved, and the trade-offs made.

---

## 1. Overview

| | |
| --- | --- |
| **Goal** | A professional, commerce-grade search UI over a Coveo index of Pokemon. |
| **Core requirements** | Facet by **Type**, facet by **Generation**, show each Pokemon's **picture** in results. |
| **Extended work** | SSR, analytics context, clean data ingestion, type-ahead (ML Query Suggestions + instant results), Pokemon detail page, security hardening, RGA plan. |
| **Repository** | https://github.com/zikorao/CoveoProject |
| **Coveo org** | `mrzikora632mb41x` (default query pipeline) |

---

## 2. Architecture

```mermaid
flowchart TD
    subgraph Ingestion
        P[PokeAPI] -->|push_pokemon.py| PUSH[Coveo Push API]
        PUSH --> IDX[(Coveo Index<br/>push API solution source)]
    end

    subgraph Coveo
        IDX --> SAPI[Search API]
        IDX --> QS[ML Query Suggestions model]
        UA[Usage Analytics] --> QS
    end

    subgraph "Next.js App (App Router)"
        SC[page.tsx - Server Component<br/>fetchStaticState] --> SP[SearchProvider<br/>hydrateStaticState]
        SP --> UI[SearchInterface<br/>SearchBox / Facets / ResultList / Pager]
        DP[pokemon/[name]/page.tsx<br/>Server Component]
    end

    SC --> SAPI
    UI -->|search / facets / suggestions| SAPI
    UI -->|instant results wildcard| SAPI
    UI -->|query suggest| QS
    DP -->|single-doc REST| SAPI
    MW[middleware.ts<br/>visitor cookie] --> SC
    UI -->|search events| UA
```

**Request lifecycle (home page):**
1. `middleware.ts` assigns a stable `coveo_visitorId` cookie on first visit.
2. `app/page.tsx` (server component) builds a `NavigatorContext` from request
   headers and calls `fetchStaticState()` to run the initial search server-side.
3. `SearchProvider` (client) hydrates the static state with
   `hydrateStaticState()`, switching from `StaticStateProvider` to
   `HydratedStateProvider` once interactive.
4. Controller hooks (`useSearchBox`, `useResultList`, `useTypeFacet`, etc.)
   render and drive subsequent client-side searches.

---

## 3. Tech stack

- **Next.js 14** (App Router) + **React 18** + **TypeScript**
- **@coveo/headless-react 2.9.16** (the `/ssr` entrypoint)
- **Python 3** (standard library only) for ingestion + analytics simulation
- **PokeAPI** as the data source

---

## 4. Data pipeline (`scripts/push_pokemon.py`)

We push clean, structured documents instead of crawling HTML.

- Fetches species **by generation** (1-9) and **types** from PokeAPI.
- Builds one document per Pokemon (~1025 total) with:
  - `title` (display name), `type` (multi-value, e.g. `["Grass","Poison"]`),
    `generation` (1-9), `picture` (official artwork URL),
    `clickableUri`/`documentId` (`https://pokemondb.net/pokedex/<slug>`).
- Uploads via the Push API **file-container** flow: request container ->
  `PUT` payload to the container -> trigger **batch** ingestion.
- Reads credentials from env vars (`COVEO_ORG`, `COVEO_SOURCE`, `COVEO_PUSH_KEY`)
  so no key is stored in the repo. Idempotent / re-runnable.

---

## 5. Coveo configuration

**Source & fields**
- Source: **push API solution** (Push source), ~1025 documents.
- Fields used in the app: `@type` (facet, multi-value), `@generation` (facet),
  `@picture` (displayed in results).

**Engine (`lib/engine.ts`)**
- `organizationId` + `accessToken` read from `NEXT_PUBLIC_COVEO_*` env vars.
- `analytics: { enabled: true }`.
- `preprocessRequest` injects a **constant query** `cq = @source=="push API solution"`
  on every search so results/facets come only from the clean push source.
- Controllers: `searchBox` (8 suggestions), `resultList`
  (`fieldsToInclude: [picture, type, generation]`), `typeFacet` (18 values),
  `generationFacet` (9 values, alphanumeric), `querySummary`, `pager`.

**Machine Learning**
- **Query Suggestions (QS)** model associated with the `default` pipeline,
  trained on Usage Analytics search events.

---

## 6. Application components

| Component | Responsibility |
| --- | --- |
| `app/page.tsx` | Server component: navigator context + `fetchStaticState` (force-dynamic). |
| `components/SearchProvider.tsx` | Client: hydrates static state into an interactive engine. |
| `components/SearchInterface.tsx` | Composes the storefront layout (top bar, sidebar, content). |
| `components/SearchBox.tsx` | Search input + type-ahead dropdown (QS + instant results). |
| `components/Facet.tsx` | Reusable facet panel; type-color dots and value formatting. |
| `components/ResultList.tsx` | Product-card grid; links to internal detail pages. |
| `components/QuerySummary.tsx` | "Showing X-Y of N" result count. |
| `components/Pager.tsx` | Numbered pagination. |
| `app/pokemon/[name]/page.tsx` | Detail page; single-document fetch via Search API. |
| `lib/navigator-context.ts` | Builds `NavigatorContext` from Next.js headers/cookies. |
| `middleware.ts` | Sets the stable visitor-id cookie for analytics correlation. |

---

## 7. Search features

- **Faceted filtering** by Type (with official Pokemon type colors) and
  Generation, with result counts.
- **Product-card grid** with artwork, name, generation badge, and colored type
  chips; hover lift and image zoom.
- **Query summary** (result count + echoed query) and **pagination**.
- Responsive layout (sidebar collapses on tablet/mobile).

---

## 8. Type-ahead (two complementary mechanisms)

The search box dropdown has two sections:

1. **Suggestions** - ML **Query Suggestions** from the trained model, **preloaded
   on focus** (top suggestions appear before typing). Powered by the `searchBox`
   controller (`showSuggestions` / `state.suggestions` / `selectSuggestion`).
2. **Pokemon (instant results)** - a debounced live search run as the user types.
   Because Coveo matches whole keywords by default, the query uses a **prefix
   wildcard** (`char` -> `char*`) with `wildcards: true` so partial input matches.
   Cancellable via `AbortController`; gated by an `INSTANT_RESULTS_ENABLED` flag.

This gives comprehensive type-ahead today (instant results) while the ML model
matures (suggestions get richer with traffic).

**Training the QS model (`scripts/simulate_searches.py`):** logs ~3075 Usage
Analytics search events (each Pokemon name, unique visitor per event) so the
model has candidate queries. After seeding, the model must **rebuild** (daily
schedule) to incorporate the data.

---

## 9. SSR & analytics

- **SSR hydration**: server renders initial results (`fetchStaticState`), client
  hydrates (`hydrateStaticState`) for interactivity - good first paint + SEO,
  no flash of empty results.
- **NavigatorContext + middleware**: forwards referrer, user-agent, IP, and a
  stable visitor id so analytics events correlate per visitor across SSR and CSR.

---

## 10. Security

- Credentials moved from hard-coded values to `NEXT_PUBLIC_COVEO_*` **environment
  variables** (`.env.local`, gitignored; `.env.example` committed as a template).
- The previously committed token was **rotated** and **scrubbed from git history**
  with `git filter-repo`, followed by a force-push.
- The Push API key is never stored in code (read from env in the Python script).

---

## 11. Challenges and resolutions

| Challenge | Root cause | Resolution |
| --- | --- | --- |
| `npm ERESOLVE` install failure | React 18 vs 19 peer conflict; npm walked up to a stray project | Isolated `package.json`; pinned React 18; relocated stray project |
| Build error: "stream did not contain valid UTF-8" | Non-ASCII chars saved as ISO-8859 in `.tsx` | Rewrote affected files in ASCII |
| CSS import type error | Missing ambient module type | Added `globals.d.ts` (`declare module '*.css'`) |
| Coveo `fetch failed` | Wrong `organizationId` (DNS) | Corrected to `mrzikora632mb41x` |
| "Missing navigator context" warnings | No NavigatorContext for SSR | Added `middleware.ts` + `navigator-context.ts` |
| PokeAPI `403 Forbidden` | Missing `User-Agent` header | Added a User-Agent to requests |
| Duplicate / HTML-polluted facet values | Mixed web-crawl + push sources | Constant query restricting to the push source |
| Type text missing in results | `@type` not "Include in results" in Coveo | Admin toggle (pending); UI renders chips when available |
| Query Suggestions empty | Cold-start: no analytics data | Simulated search traffic; relies on daily model rebuild |
| Instant results returned 0 for partial input | Coveo matches whole keywords | Enabled `wildcards` + prefix query (`char*`) |
| RGA not available in code | `defineGeneratedAnswer` absent in SSR 2.9.16 | Documented upgrade vs client-only paths |
| Secret in public repo | Token hard-coded and committed | Env vars + rotation + history scrub |

---

## 12. Trade-offs

| Decision | Alternative | Why we chose it |
| --- | --- | --- |
| **Push API ingestion** | Web crawl of pokemondb | Clean, structured `type`/`generation`/`picture`; no HTML noise |
| **Constant query to isolate source** | Delete/rebuild the old crawl source | Non-destructive, instant, reversible |
| **SSR + hydration** | Pure client-side rendering | Better first paint and SEO; matches Coveo's recommended Next.js pattern |
| **Instant results + ML QS together** | ML QS only | QS has cold-start; instant results work immediately and need no model |
| **Wildcard prefix for instant results** | Rely on QS-completed queries | Enables true type-ahead before the model matures (trade: slightly looser ranking) |
| **Direct REST call on detail page** | A second Headless engine instance | Simpler; one focused single-document request |
| **`NEXT_PUBLIC_` token** | Server-only secret + proxy | Required because the client engine hydrates in the browser; token is search-scoped |

---

## 13. Configuration reference

**App env (`.env.local`)**
```
NEXT_PUBLIC_COVEO_ORG_ID=...
NEXT_PUBLIC_COVEO_ACCESS_TOKEN=...
```

**Ingestion env (`scripts/push_pokemon.py`)**
```
COVEO_ORG=...
COVEO_SOURCE=...
COVEO_PUSH_KEY=...
```

**Analytics simulation env (`scripts/simulate_searches.py`)**
```
COVEO_ORG=...
COVEO_ACCESS_TOKEN=...
```

**Coveo admin checklist**
- Push source created and populated (~1025 docs).
- Fields `type`, `generation`, `picture` mapped; `type`/`generation` facetable.
- (Pending) `@type` set to "Include in results" for inline chips.
- QS model created and associated with the `default` pipeline.

---

## 14. Roadmap / pending

- **`@type` displayable**: flip "Include in results" so type chips show in cards.
- **QS maturation**: more/varied search traffic, then daily rebuild for richer
  prefix suggestions.
- **Relevance Generative Answering (RGA)**:
  1. Confirm license/entitlement on the org.
  2. Enable + scope RGA on the `default` pipeline to the push source.
  3. Enrich documents (descriptions, abilities) so answers have text to ground on.
  4. Implement the UI via a headless-react upgrade (`defineGeneratedAnswer`) or a
     client-only `buildGeneratedAnswer` engine.

---

## 15. How to run

```bash
npm install
cp .env.example .env.local   # fill in Coveo org id + search token
npm run dev                  # http://localhost:3000
```

Ingest / refresh data:
```bash
export COVEO_ORG=... COVEO_SOURCE=... COVEO_PUSH_KEY=...
python3 scripts/push_pokemon.py
```

Seed analytics for the QS model:
```bash
export COVEO_ORG=... COVEO_ACCESS_TOKEN=...
python3 scripts/simulate_searches.py
```
