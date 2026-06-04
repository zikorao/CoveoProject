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
| **Extended work** | SSR, analytics context, clean data ingestion, type-ahead (ML QS + instant results), Pokemon detail page, **ART** + **RGA** on `pokemon-zikora` pipeline, ML analytics simulation, verification scripts, **Generated Answer** UI, security hardening. |
| **Repository** | https://github.com/zikorao/CoveoProject |
| **Coveo org** | `mrzikora632mb41x` - live traffic uses **`Search pipeline - pokemon-zikora`** (search hub `pokemon-zikora`) |

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
        IDX --> ART[ML ART model]
        IDX --> RGA[ML RGA model]
        UA[Usage Analytics] --> QS
        UA --> ART
        PIPE[Search pipeline - pokemon-zikora]
        PIPE --> QS
        PIPE --> ART
        PIPE --> RGA
    end

    subgraph "Next.js App (App Router)"
        SC[page.tsx - Server Component<br/>fetchStaticState] --> SP[SearchProvider<br/>hydrateStaticState]
        SP --> UI[SearchInterface<br/>SearchBox / Facets / RGA / Results / Pager]
        DP[pokemon/[name]/page.tsx<br/>Server Component]
    end

    SC --> SAPI
    UI -->|search / facets / suggestions| SAPI
    UI -->|instant results wildcard| SAPI
    UI -->|query suggest| QS
    UI -->|generativeQuestionAnsweringId| RGA
    UI -->|SSE stream answer| RGA
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
- **@coveo/headless 3.50.1** (client `buildGeneratedAnswer` for RGA; bundled with headless-react)
- **Python 3** (standard library only) for ingestion + analytics simulation
- **PokeAPI** as the data source

---

## 4. Data pipeline (`scripts/push_pokemon.py`)

We push clean, structured documents instead of crawling HTML.

- Fetches species **by generation** (1-9) and **types** from PokeAPI.
- Builds one document per Pokemon (~1025 total) with:
  - `title` (display name), `type` (multi-value), `generation` (1-9),
    `picture` (official artwork URL), `clickableUri`/`documentId`
    (`https://pokemondb.net/pokedex/<slug>`).
  - **`description`** - English genus + up to four Pokedex flavor lines (PokeAPI
    `pokemon-species`) for generative grounding.
  - **`data` / `body`** - small HTML page (`<h1>`, type, generation, flavor text)
    so indexed content is rich enough for **RGA** on the push source alone.
- Uploads via the Push API **file-container** flow, then signals **`IDLE`** so
  Coveo rebuilds the push source after batch ingest.
- Reads credentials from env vars (`COVEO_ORG`, `COVEO_SOURCE`, `COVEO_PUSH_KEY`)
  so no key is stored in the repo. Idempotent / re-runnable (~2-3 min for species text).

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
- **Query Suggestions (QS)** model associated with the query pipeline, trained
  on Usage Analytics **search** events (`queryText`).
- **Automatic Relevance Tuning (ART)** model associated with **`Search pipeline -
  pokemon-zikora`**, trained on Usage Analytics **search + click** pairs.
- **Relevance Generative Answering (RGA)** model associated with the same pipeline
  and search hub `pokemon-zikora`. Search responses expose
  `extendedResults.generativeQuestionAnsweringId`; answers stream from
  `GET /rest/organizations/{org}/machinelearning/streaming/{streamId}`.
- API key enforces **search hub** `pokemon-zikora` (request `searchHub` params are
  overridden by the token).

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
| `components/GeneratedAnswer.tsx` | RGA panel: `buildGeneratedAnswer` on hydrated engine; streams answer, citations, feedback. |
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
- **Generated answer** (RGA) panel above the result grid when Coveo returns an
  answer for the current query (Helpful / Not helpful / Regenerate).
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

## 9. ML experiments and verification activities

This section documents the hands-on ML work beyond the base storefront: cold-start
training, pipeline alignment, ART deployment, and how results were validated.

### 9.1 Experiment A - Query Suggestions (QS) cold-start

**Hypothesis:** A new catalog has no Usage Analytics traffic, so the QS model
stays empty until events exist.

**Activities:**
1. Created a QS model in Coveo Admin and associated it with the query pipeline.
2. Observed model status **Limited** - *"Model is empty and won't return responses"*.
3. Verified `querySuggest` API returned `"completions": []` for `q=char` and empty `q`.
4. Ran `scripts/simulate_searches.py` - **3,075** accepted search events (1,025
   Pokemon names x 3 repeats, unique visitor per event).
5. After daily rebuild, QS returned completions (e.g. empty query -> `bulbasaur`);
   prefix suggestions remained sparse until more varied traffic accumulates.

**Outcome:** QS **works** but needs analytics volume and rebuild cycles; instant
results (Section 8) cover type-ahead in the meantime.

### 9.2 Experiment B - Instant results type-ahead (wildcard)

**Hypothesis:** Coveo matches whole keywords by default, so partial input (`pik`)
returns zero hits unless wildcards are enabled.

**Activities:**
1. Direct Search API tests: `q=pik` -> 0 results; `q=pik*` with `wildcards: true`
   -> Pikachu, Pikipek.
2. Implemented debounced client-side search in `SearchBox.tsx` with prefix query
   (`char` -> `char*`) and `AbortController` cancellation.
3. Toggled `INSTANT_RESULTS_ENABLED` off during QS-only testing, then re-enabled
   for production UX.

**Outcome:** Comprehensive type-ahead **without** waiting for ML QS maturity.

### 9.3 Experiment C - Automatic Relevance Tuning (ART) deployment

**Hypothesis:** ART must be associated on the **same pipeline and search hub**
as live traffic, with **click** analytics (not search-only).

**Activities:**

| Step | Action | Finding |
| --- | --- | --- |
| 1 | Associated ART on `default` with strict conditions (search hub, IPX context, Recommendation) | Relevance Inspector: empty **Query pipeline rules and models**; Boost 0 |
| 2 | Discovered token **overrides** `searchHub` in all requests | Condition must match **API key search hub**, not arbitrary values |
| 3 | Aligned hub to `pokemon-zikora` | Traffic routes to **`Search pipeline - pokemon-zikora`** |
| 4 | Moved ART association to that pipeline; simplified conditions (catalog: hub only, no Recommendation clause) | RI shows **Automatic Relevance Tuning** executed |
| 5 | Ran `scripts/simulate_clicks.py` (first with `originLevel1: default`) | **1,025** search+click sessions on push source results |
| 6 | Re-aligned analytics to `originLevel1: pokemon-zikora` in both simulators; re-ran searches + clicks | **3,075** search + **1,025** click events accepted |
| 7 | Rebuilt ART model in Admin | Model active; ART runs on queries |

**Validated query (`electric`):**
- **66 results** via Search pipeline - pokemon-zikora
- Relevance Inspector: ART in query journey; top hits Kilowattrel, Pawmi, Bellibolt, etc.
- **Boost: 0** on rows - ART **executed** but did not add extra QRE weight yet (common with simulated, uniform click data and tied lexical scores)

**Outcome:** ART is **deployed and executing**; Relevance Inspector is the authoritative
pass/fail. API `QRE: 0` in `rankingInfo` is not required for ART to be "on."

### 9.4 Verification toolkit (`scripts/test_art.py`)

Automated checklist (run after env vars are set):

```bash
export COVEO_ORG=your_org_id
export COVEO_ACCESS_TOKEN=your_search_token
python3 scripts/test_art.py
```

| Check | What it proves |
| --- | --- |
| Pipeline = pokemon-zikora | Hub/routing alignment |
| Results for `pikachu` | Index + cq filter healthy |
| QS completions | ML suggest path alive |
| QRE > 0 | Strict signal for ranking boost (often still 0 when ART runs) |
| ITD / `lq` | Intelligent Term Detection (needs ITD enabled + richer docs) |

Each run prints a **searchUid** for Coveo **Relevance Inspector**.

### 9.5 Analytics alignment (`originLevel1` = search hub)

Coveo maps **`originLevel1` in Usage Analytics to `searchHub`**. Simulators were
updated from `default` to **`pokemon-zikora`** so training data matches the API
key and ART association:

- `scripts/simulate_searches.py` - search events for QS
- `scripts/simulate_clicks.py` - paired search + `documentOpen` click with
  `contentIdKey` / `contentIdValue` = `permanentid` (required for ART)

**Note:** Rebuilding with web-crawl + push analytics was **not** used for PokeMart;
the app filters to the push source only, so crawl traffic would add noise.

### 9.6 Relevance Inspector workflow (recommended)

1. Run a search in the app (e.g. `electric`).
2. Copy `searchUid` from the `/rest/search/v2` response (or from `test_art.py`).
3. **Admin -> Relevance Inspector** -> paste UID -> **Inspect**.
4. Confirm **Query pipeline selection** and **Automatic Relevance Tuning** under
   **Query pipeline rules and models**.
5. Review per-result **Boost** column (0 is OK when ART ran but did not promote).

### 9.7 Experiment D - Relevance Generative Answering (RGA)

**Hypothesis:** RGA on **`Search pipeline - pokemon-zikora`** can ground answers on
push documents when they contain enough textual content, without relying on the
legacy pokemondb crawl.

**Activities:**

| Step | Action | Finding |
| --- | --- | --- |
| 1 | Confirmed RGA model associated on **pokemon-zikora** pipeline (search hub `pokemon-zikora`) | Every search returns `generativeQuestionAnsweringId` in `extendedResults` |
| 2 | Ran `scripts/test_rga.py` on push-only `cq` after first description push | Stream completes; **`answerGenerated: false`** (sparse `data` text) |
| 3 | Compared push vs full index (no `cq`) | Crawl (`filetype: html`, ~600+ words) -> **`answerGenerated: true`**; push alone failed |
| 4 | Enriched push: genus + multiple flavor lines; wrapped `data`/`body` in **HTML** | Re-pushed ~1025 docs; signaled **`statusType=IDLE`** rebuild |
| 5 | Re-ran `scripts/test_rga.py` after rebuild | **`answerGenerated: true`** on push-only for `pikachu`, `bulbasaur`, `what type is bulbasaur` |
| 6 | Added `components/GeneratedAnswer.tsx` | UI streams answer via `buildGeneratedAnswer` + `useEngine()` from headless-react SSR |

**Validated queries (push source only):**
- `pikachu` - Electric type, tail/lightning flavor text; citation **push API solution**
- `what type is bulbasaur` - Grass/Poison answer with seed-on-back context

**Outcome:** RGA is **live** on the catalog the app searches (constant query to push).
The storefront shows answers in the **Generated answer** panel when the model
returns content.

---

## 10. RGA in the application

`@coveo/headless-react` SSR 2.9.16 does not expose `defineGeneratedAnswer`, so RGA
uses the hydrated search engine from headless-react and **`buildGeneratedAnswer`**
from **`@coveo/headless`** (same version as the SSR bundle: 3.50.1).

**Flow:**
1. User searches; Search API returns results + `generativeQuestionAnsweringId`.
2. `GeneratedAnswer` controller subscribes to engine state and opens the ML **SSE**
   stream for that id.
3. `components/GeneratedAnswer.tsx` renders loading steps, streamed text, citations,
   and feedback actions.

**Engine export:** `useEngine` is re-exported from `lib/engine.ts` alongside the
SSR controller hooks.

**Verification:**

```bash
export COVEO_ORG=your_org_id
export COVEO_ACCESS_TOKEN=your_search_token
python3 scripts/test_rga.py
python3 scripts/test_rga.py --query "what type is bulbasaur"
```

Optional `--include-crawl` runs a second scenario without `cq` (includes pokemondb
crawl) for comparison.

---

## 11. SSR & analytics

- **SSR hydration**: server renders initial results (`fetchStaticState`), client
  hydrates (`hydrateStaticState`) for interactivity - good first paint + SEO,
  no flash of empty results.
- **NavigatorContext + middleware**: forwards referrer, user-agent, IP, and a
  stable visitor id so analytics events correlate per visitor across SSR and CSR.

---

## 12. Security

- Credentials moved from hard-coded values to `NEXT_PUBLIC_COVEO_*` **environment
  variables** (`.env.local`, gitignored; `.env.example` committed as a template).
- The previously committed token was **rotated** and **scrubbed from git history**
  with `git filter-repo`, followed by a force-push.
- The Push API key is never stored in code (read from env in the Python script).

---

## 13. Challenges and resolutions

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
| RGA not in headless-react SSR | No `defineGeneratedAnswer` in SSR 2.9.16 | Client `buildGeneratedAnswer` on hydrated engine (`GeneratedAnswer.tsx`) |
| RGA `answerGenerated: false` on push | Plain `data` text too short vs crawl HTML | HTML `data`/`body` + PokeAPI flavor text; push rebuild (`IDLE`) |
| Secret in public repo | Token hard-coded and committed | Env vars + rotation + history scrub |
| ART empty in Relevance Inspector | Wrong pipeline (`default` only), strict conditions (Recommendation, IPX), searchHub mismatch | ART on **Search pipeline - pokemon-zikora**; hub-only condition; token hub `pokemon-zikora` |
| ART QRE always 0 in API | ART runs but no boost on exact/tied queries; simulated clicks | RI confirms execution; Boost 0 acceptable; optional richer clicks |
| QS model empty | No analytics | `simulate_searches.py` + rebuild |
| Analytics hub mismatch | Simulators used `originLevel1: default` | Updated to `pokemon-zikora`; re-seeded + ART rebuild |

---

## 14. Trade-offs

| Decision | Alternative | Why we chose it |
| --- | --- | --- |
| **Push API ingestion** | Web crawl of pokemondb | Clean, structured `type`/`generation`/`picture`; no HTML noise |
| **Constant query to isolate source** | Delete/rebuild the old crawl source | Non-destructive, instant, reversible |
| **SSR + hydration** | Pure client-side rendering | Better first paint and SEO; matches Coveo's recommended Next.js pattern |
| **Instant results + ML QS together** | ML QS only | QS has cold-start; instant results work immediately and need no model |
| **Wildcard prefix for instant results** | Rely on QS-completed queries | Enables true type-ahead before the model matures (trade: slightly looser ranking) |
| **Direct REST call on detail page** | A second Headless engine instance | Simpler; one focused single-document request |
| **`NEXT_PUBLIC_` token** | Server-only secret + proxy | Required because the client engine hydrates in the browser; token is search-scoped |
| **Client `buildGeneratedAnswer`** | Upgrade headless-react for SSR RGA controller | Ships RGA now without a major SSR package bump; uses shared hydrated engine |

---

## 15. Configuration reference

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

**Analytics / verification env (`simulate_searches.py`, `simulate_clicks.py`, `test_art.py`, `test_rga.py`)**
```
COVEO_ORG=...
COVEO_ACCESS_TOKEN=...
```

**Coveo admin checklist**
- Push source populated (~1025 docs); app uses `cq = @source=="push API solution"`.
- Fields `type`, `generation`, `picture` mapped; `type`/`generation` facetable.
- (Pending) `@type` set to "Include in results" for inline chips.
- QS model on query pipeline; rebuild after `simulate_searches.py`.
- ART model on **Search pipeline - pokemon-zikora**; condition **Search hub is pokemon-zikora**; rebuild after `simulate_clicks.py`.
- **RGA** model on **Search pipeline - pokemon-zikora**; content includes **push API solution** source.
- API key **search hub** matches ART/RGA pipeline routing.

**Push source id (example org):** `mrzikora632mb41x-uk6mcizls4f5hgnihkfqjdsej4` (name: push API solution).

---

## 16. Roadmap / pending

- **`@type` displayable**: flip "Include in results" so type chips show in cards.
- **QS maturation**: more/varied search traffic, then daily rebuild for richer
  prefix suggestions.
- **ART stronger boosts**: optional targeted click simulation (e.g. query `electric`
  -> electric-type Pokemon) or real user traffic; compare Boost in RI.
- **ITD**: enable on ART association; optional `lq` queries in the UI.
- **RGA via SSR controller**: upgrade `@coveo/headless-react` when `defineGeneratedAnswer` is available for a single-package SSR pattern.

---

## 17. How to run

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

Seed analytics for ML models (hub-aligned):
```bash
export COVEO_ORG=... COVEO_ACCESS_TOKEN=...
python3 scripts/simulate_searches.py   # QS training (~3075 search events)
python3 scripts/simulate_clicks.py     # ART training (~1025 search+click sessions)
python3 scripts/test_art.py            # ART checklist + searchUid for RI
python3 scripts/test_rga.py            # RGA stream + answerGenerated on push index
```

After `push_pokemon.py`, wait for the push source rebuild (or run `statusType=IDLE`).
Rebuild QS and ART models in Coveo Admin after analytics seeding.
