# PokeMart - Coveo Pokemon Catalog

A commerce-style product search experience built with **Next.js (App Router)** and
the **Coveo Headless React** library. It searches a Coveo index of Pokemon and
presents them as a browsable product catalog with faceted filtering, pagination,
and server-side rendering.

> Full design notes and a presentation deck live in [`docs/`](docs/) -
> see [`docs/SOLUTION.md`](docs/SOLUTION.md) and [`docs/SLIDES.md`](docs/SLIDES.md).

## Features

- **Search-as-you-type** search box powered by Coveo Headless.
- **Faceted filtering** by Pokemon **Type** (with official type colors) and **Generation**.
- **Product card grid** showing each Pokemon's artwork, name, generation badge, and type chips.
- **Pagination** and a live **result summary** ("Showing 1-10 of N Pokemon").
- **Server-side rendering (SSR)** using Coveo's `fetchStaticState` / `hydrateStaticState` pattern.
- **Analytics navigator context** wired through Next.js middleware for per-visitor tracking.

## Tech stack

- [Next.js 14](https://nextjs.org/) (App Router)
- [React 18](https://react.dev/)
- [@coveo/headless-react](https://docs.coveo.com/en/headless/latest/) (SSR entrypoint)
- TypeScript

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your Coveo credentials
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

### Environment variables

Create a `.env.local` file (gitignored) with your Coveo credentials:

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_COVEO_ORG_ID` | Your Coveo organization id |
| `NEXT_PUBLIC_COVEO_ACCESS_TOKEN` | A search-scoped (low-privilege) access token |

## Project structure

```
app/                 Next.js App Router (layout, page, global styles)
components/          UI components (SearchBox, Facet, ResultList, Pager, ...)
lib/engine.ts        Coveo search engine + controller definitions
lib/navigator-context.ts  NavigatorContext for SSR analytics
middleware.ts        Sets a stable visitor id cookie
scripts/push_pokemon.py   Ingests Pokemon data from PokeAPI into a Coveo Push source
```

## Data ingestion

`scripts/push_pokemon.py` builds one clean document per Pokemon (title, types,
generation, official artwork) from [PokeAPI](https://pokeapi.co/) and pushes them
to a Coveo Push source. Credentials are read from environment variables so no key
is stored in the repo:

```bash
export COVEO_ORG=your_org_id
export COVEO_SOURCE=your_source_id
export COVEO_PUSH_KEY=your_push_api_key
python3 scripts/push_pokemon.py
```

## Configuration

The Coveo `organizationId` and search `accessToken` are read from environment
variables in `lib/engine.ts` (see [Environment variables](#environment-variables)),
so no credentials are committed to source control. The search token is exposed to
the browser (standard for client-side Coveo apps), so use a search-scoped,
low-privilege token.
