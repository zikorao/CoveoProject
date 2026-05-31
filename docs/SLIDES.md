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

- **Storefront UI**: search bar, type/generation facets, product-card grid, pagination, result count
- **Clean data**: ~1025 Pokemon pushed from PokeAPI into a Coveo Push source
- **Type-ahead**: ML Query Suggestions (preloaded) + live instant results
- **Detail page**: per-Pokemon view fetched from the Coveo Search API
- **SSR + analytics**: server fetch, client hydration, per-visitor context

---

# Architecture

```
PokeAPI --(push_pokemon.py)--> Coveo Push API --> Coveo Index
                                                      |
   Usage Analytics --> QS model                   Search API
                                                      |
Next.js App Router:
  page.tsx (server, fetchStaticState)
    -> SearchProvider (hydrateStaticState)
      -> SearchInterface (SearchBox / Facets / ResultList / Pager)
  pokemon/[name]/page.tsx (server, single-doc REST)
  middleware.ts -> visitor cookie
```

---

# Tech Stack

- **Next.js 14** App Router, **React 18**, **TypeScript**
- **@coveo/headless-react 2.9.16** (`/ssr` entrypoint)
- **Python 3** (stdlib only) for ingestion + analytics simulation
- **PokeAPI** as the upstream data source

---

# Data Pipeline (Push, not Crawl)

`scripts/push_pokemon.py`
- One clean document per Pokemon: `title`, `type` (multi), `generation`, `picture`
- Push API **file-container** flow -> batch ingestion (~1025 docs)
- Credentials from env vars (no keys on disk); idempotent

**Why push over crawl?** Structured, reliable fields - no HTML noise in facets.

---

# Coveo Configuration

- Engine reads `organizationId` + `accessToken` from env vars
- `analytics: { enabled: true }`
- **Constant query** isolates the clean source:
  `cq = @source=="push API solution"`
- Controllers: searchBox, resultList (`picture/type/generation`),
  typeFacet, generationFacet, querySummary, pager
- QS model associated with the **default** pipeline

---

# Search Experience

- Faceted filtering with **official Pokemon type colors** + counts
- Product-card grid: artwork, name, **generation badge**, **type chips**
- Query summary ("Showing 1-10 of N") and pagination
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

# Training the QS Model

`scripts/simulate_searches.py`
- Logs ~3075 Usage Analytics **search events** (one per Pokemon name)
- Gives the model candidate queries to learn from
- Model **rebuilds daily** to incorporate the data

**Cold-start reality**: a new catalog has no traffic, so the model starts empty
("Model is empty and won't return responses").

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
| QS empty (cold-start) | Simulated analytics traffic + daily rebuild |
| Instant results 0 on partial input | Enabled wildcards + prefix query |
| Secret in public repo | Env vars + rotation + history scrub |
| RGA missing in SSR 2.9.16 | Documented upgrade / client-only paths |

---

# Key Trade-offs

- **Push API** over web crawl -> clean structured data
- **Constant query** over deleting the old source -> non-destructive, reversible
- **SSR + hydration** over pure CSR -> first paint + SEO
- **Instant results + ML QS** over QS-only -> beat the cold-start
- **Direct REST** on detail page over a second engine -> simpler

---

# Roadmap

- Flip `@type` to "Include in results" -> inline type chips everywhere
- Grow search traffic -> richer ML prefix suggestions
- **Relevance Generative Answering (RGA)**:
  - Confirm license -> enable on pipeline -> enrich content -> add UI
    (headless upgrade or client-only `buildGeneratedAnswer`)

---

# Demo

- **Catalog**: facets, product grid, pagination
- **Type-ahead**: focus -> suggestions; type `char` -> instant results
- **Detail page**: click a card -> Pokemon detail

`npm run dev` -> http://localhost:3000

---

# Thank You

**PokeMart - Coveo Search Solution**

github.com/zikorao/CoveoProject

Questions?
