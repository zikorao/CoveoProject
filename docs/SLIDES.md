---
marp: true
title: PokeMart - Coveo Search Solution
paginate: true
theme: default
class: lead
---

# PokeMart
## A Commerce-Style Pokemon Search

Built with **Next.js (App Router)** + **Coveo Headless React (SSR)**

Repo: github.com/zikorao/CoveoProject

---

# The Brief

**Core requirements**
- Facet search results by **Pokemon Type**
- Facet search results by **Pokemon Generation**
- Show each Pokemon's **picture** in the results

**Stretch goals**
- Server-side rendering, analytics, type-ahead, detail pages
- Make it look like a real commerce storefront

---

# Solution at a Glance

- **Storefront UI**: search bar, type/generation facets, product-card grid, pagination
- **Clean data**: ~1025 Pokemon via Push API (`push API solution` source)
- **Type-ahead**: ML Query Suggestions + instant results (wildcard prefix)
- **Detail page**: `/pokemon/[name]` from Coveo Search API
- **ML**: QS + **ART** + **RGA** + **CPR** on **`Search pipeline - pokemon-zikora`**
- **Generated answer** panel: RGA (`buildGeneratedAnswer` + SSE) + nested **Source passages (CPR)** via Passage Retrieval API
- **Verification**: `test_art.py`, `test_rga.py`, `retrieve_passages.py`, **Relevance Inspector**

---

# Architecture

```
PokeAPI -> push_pokemon.py (HTML + descriptions) -> Push API -> Index
Usage Analytics -> QS + ART models
Search pipeline - pokemon-zikora -> QS + ART + RGA + CPR (Semantic Encoder)
Next.js: fetchStaticState -> hydrate -> SearchInterface + GeneratedAnswer
SearchBox -> QS + instant wildcard | RGA SSE | PR API passages/retrieve
scripts: simulate_searches | simulate_clicks | test_art | test_rga | retrieve_passages
```

---

# Tech Stack

- **Next.js 14** App Router, **React 18**, **TypeScript**
- **@coveo/headless-react 2.9.16** (`/ssr` entrypoint)
- **@coveo/headless 3.50.1** (`buildGeneratedAnswer` for RGA UI)
- **Python 3** (stdlib only) for ingestion + analytics simulation
- **PokeAPI** as the upstream data source

---

# Data Pipeline (Push, not Crawl)

`scripts/push_pokemon.py`
- Fields: `title`, `type`, `generation`, `picture`, **`description`**
- **`data` / `body`**: HTML with genus + Pokedex flavor text (RGA grounding)
- Push API batch (~1025 docs) -> signal **`IDLE`** rebuild
- Credentials from env vars; ~2-3 min for species enrichment

**Why push over crawl?** Clean facets; rich generative text without crawl noise.

---

# Coveo Configuration

- Engine reads `organizationId` + `accessToken` from env vars
- `analytics: { enabled: true }`
- **Constant query** isolates the clean source:
  `cq = @source=="push API solution"`
- Controllers: searchBox, resultList (`picture/type/generation`),
  typeFacet, generationFacet, querySummary, pager
- Live pipeline: **Search pipeline - pokemon-zikora** (search hub `pokemon-zikora`)
- QS + ART + **RGA** + **CPR** on that pipeline (hub aligned to API key)

---

# Search Experience

- Faceted filtering with **official Pokemon type colors** + counts
- Product-card grid: artwork, name, **generation badge**, **type chips**
- Query summary and pagination
- **Generated answer** (RGA) above the grid when the model responds
- **Source passages (CPR)** - collapsible evidence under RGA (Passage Retrieval API)
- Fully responsive storefront layout

---

# Type-Ahead: Two Mechanisms

**1. ML Query Suggestions** (preloaded on focus)
- From the trained QS model; richer as traffic grows

**2. Instant Results** (live, as-you-type)
- Coveo matches whole words -> we use **wildcard prefix** (`char` -> `char*`)
- Debounced + cancellable (`AbortController`)
- Toggle via `INSTANT_RESULTS_ENABLED`

> Together: works today (instant) + improves over time (ML).

---

# Experiment: QS Cold-Start

1. QS model created -> status **Limited** (empty)
2. `querySuggest` API -> `completions: []`
3. **`simulate_searches.py`** -> **3,075** search events (`originLevel1: pokemon-zikora`)
4. Daily **rebuild** -> e.g. preload suggests `bulbasaur`

**Lesson:** QS needs analytics + rebuild; instant results bridge the gap.

---

# Experiment: Instant Type-Ahead

- Coveo matches **whole words** -> `pik` returns 0
- Fix: `wildcards: true` + prefix query (`char*`)
- Debounced Search API calls in `SearchBox.tsx`
- Flag: `INSTANT_RESULTS_ENABLED` (on for production)

---

# Experiment: ART Deployment

| Issue | Fix |
| --- | --- |
| ART not in Relevance Inspector | Wrong pipeline / strict conditions |
| Token overrides searchHub | Match API key hub `pokemon-zikora` |
| Recommendation condition | Removed for catalog search |
| Search-only analytics | **`simulate_clicks.py`** (search + click) |

**Rebuild ART** after aligned analytics.

---

# ART Verified (`electric`)

- **66 results** - Kilowattrel, Pawmi, Bellibolt, ...
- Relevance Inspector: **Automatic Relevance Tuning** in query journey
- **Boost: 0** - ART **ran**, no extra promotion (simulated data / tied scores)
- **Pass criterion:** ART **executes**, not QRE > 0 in API

---

# ML Toolkit (scripts)

| Script | Purpose |
| --- | --- |
| `simulate_searches.py` | ~3075 UA search events (QS) |
| `simulate_clicks.py` | ~1025 search+click sessions (ART) |
| `test_art.py` | Checklist + **searchUid** for RI |
| `test_rga.py` | RGA stream + **answerGenerated** on push index |
| `retrieve_passages.py` | **Passage Retrieval API** - ranked CPR passages |

`originLevel1` = **`pokemon-zikora`** (matches search hub)

---

# Experiment: RGA on Push Catalog

| Step | Result |
| --- | --- |
| RGA on **pokemon-zikora** pipeline | `generativeQuestionAnsweringId` on every search |
| Push-only, short `data` | `answerGenerated: false` |
| Enriched HTML + flavor text + rebuild | `answerGenerated: true` |
| UI | `GeneratedAnswer.tsx` + `buildGeneratedAnswer` |

**Verified:** `pikachu`, `what type is bulbasaur` - citations from **push API solution**

---

# Generated Answer UI (RGA)

- `useEngine()` from hydrated SSR engine
- `buildGeneratedAnswer` (`@coveo/headless`) enables + streams SSE
- Panel: loading steps, answer text, **RGA sources**, Helpful / Regenerate
- Same `cq` as catalog - answers use push documents only

---

# Experiment: Passage Retrieval (CPR)

| Step | Result |
| --- | --- |
| CPR + Semantic Encoder on **pokemon-zikora** pipeline | PR API returns ranked `items[]` |
| `lib/passage-retrieval.ts` + `retrieve_passages.py` | `POST /v3/passages/retrieve` + push `filter` |
| Standalone CPR panel (prototype) | Redundant next to RGA |
| **Merged UX** | Collapsible **Source passages (CPR)** inside RGA panel |

Fetch after **query executed** (not every keystroke). Commit `5c10175`.

---

# Three search surfaces

| Surface | Mechanism | User sees |
| --- | --- | --- |
| **Catalog** | Search API (Headless) | Facets, cards, pager |
| **Generated answer** | RGA SSE stream | NL answer + citations |
| **Source passages** | Passage Retrieval API | Ranked evidence snippets |

Same index filter: `@source=="push API solution"`

---

# Solution journey (how we got here)

1. **Storefront** - Push ingest, facets, SSR hydration, `cq` isolation
2. **Type-ahead** - QS cold-start + wildcard instant results + detail pages
3. **ART** - Pipeline/hub alignment, click analytics, Relevance Inspector
4. **RGA** - HTML + flavor enrichment, `test_rga.py`, `GeneratedAnswer.tsx`
5. **CPR** - Passage Retrieval API, nested under RGA (approved UX)

See **`docs/SOLUTION.md` ÿ17** for full analysis.

---

# Verify: test_art + Relevance Inspector

1. `python3 scripts/test_art.py` - checklist + **searchUid**
2. Admin -> **Relevance Inspector** -> paste UID
3. Confirm **Search pipeline - pokemon-zikora** + **ART** in query journey
4. **Boost: 0** is OK when ART executed (RI is authoritative)

---

# SSR + Analytics

- **Hydration pattern**: `fetchStaticState` (server) -> `hydrateStaticState` (client)
  - Better first paint + SEO, no empty-result flash
- **NavigatorContext + middleware**: forwards referrer, UA, IP, stable visitor id
  - Analytics events correlate across SSR and client interactions

---

# Security Hardening

- Hard-coded token -> `NEXT_PUBLIC_COVEO_*` **environment variables**
- `.env.local` gitignored; `.env.example` committed
- Exposed token **rotated** and **scrubbed from git history**
  (`git filter-repo` + force-push)
- Push API key never stored in code

---

# Challenges & Fixes (1/2)

| Challenge | Fix |
| --- | --- |
| npm ERESOLVE (React 18 vs 19) | Isolated package.json, pinned React 18 |
| UTF-8 build error | Rewrote files in ASCII |
| Coveo `fetch failed` | Corrected organization id |
| Missing navigator context | Added middleware + NavigatorContext |
| PokeAPI 403 | Added User-Agent header |

---

# Challenges & Fixes (2/2)

| Challenge | Fix |
| --- | --- |
| Polluted facet values (mixed sources) | Constant query to clean push source |
| QS empty (cold-start) | `simulate_searches.py` + rebuild |
| ART empty in RI | ART on pokemon-zikora pipeline; hub condition |
| Instant results 0 on partial input | Wildcards + prefix query |
| Analytics hub mismatch | `originLevel1: pokemon-zikora` in simulators |
| Secret in public repo | Env vars + rotation + history scrub |
| RGA empty on push | Sparse plain text vs crawl HTML | HTML body + descriptions + rebuild |
| No SSR RGA controller | headless-react 2.9.16 gap | Client `buildGeneratedAnswer` on hydrate |
| PR API 400 on searchHub | Hub mismatch in request body | Omit hub when token enforces it |
| CPR UI clutter | Separate panel | Nested `<details>` under RGA |

---

# Key Trade-offs

- **Push API** over web crawl -> clean structured data
- **Constant query** over deleting the old source -> non-destructive, reversible
- **SSR + hydration** over pure CSR -> first paint + SEO
- **Instant results + ML QS** over QS-only -> beat the cold-start
- **Direct REST** on detail page over a second engine -> simpler
- **Client RGA controller** over SSR `defineGeneratedAnswer` -> ships RGA without package bump
- **CPR nested under RGA** over standalone panel -> one generative region
- **REST PR API** over Headless passage controller -> documented Coveo API path

---

# Roadmap

- `@type` "Include in results" -> inline type chips
- Richer QS prefix suggestions (more traffic)
- Stronger ART boosts (targeted clicks or real usage)
- ITD + optional `lq` in the UI
- **SSR-native RGA** when headless-react adds `defineGeneratedAnswer`
- **CPR tuning** if related-species passages appear too often in top ranks

---

# Demo

- **Catalog**: facets, grid, pagination (`Search pipeline - pokemon-zikora`)
- **Type-ahead**: QS preload + instant (`char` -> Charizard, ...)
- **RGA**: search `pikachu` or `what type is bulbasaur` -> **Generated answer** panel
- **CPR**: expand **Source passages (CPR)** under the answer
- **Detail page**: product card -> `/pokemon/[name]`
- **Verify ML**: `test_art.py`, `test_rga.py`, `retrieve_passages.py`, Relevance Inspector

`npm run dev` -> http://localhost:3000

---

# Thank You

**PokeMart - Coveo Search Solution**

github.com/zikorao/CoveoProject

Questions?
