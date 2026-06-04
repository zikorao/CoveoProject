// lib/engine.ts

import {
  defineSearchEngine,
  defineSearchBox,
  defineResultList,
  defineFacet,
  defineQuerySummary,
  definePager,
  type InferStaticState,
  type InferHydratedState,
} from '@coveo/headless-react/ssr';

// Custom index fields that must be returned with each result so the UI can
// render them (the picture is shown directly inside each search result).
const POKEMON_FIELDS = ['picture', 'type', 'generation'];

// Restrict every search to the clean PokeAPI push source. This excludes the
// older web-crawl source, preventing duplicate results and HTML-polluted
// facet values so the Type/Generation facets and pictures stay clean.
export const SOURCE_FILTER = '@source=="push API solution"';

// Credentials are read from environment variables so they are never committed to
// source control. They use the NEXT_PUBLIC_ prefix because the search token must
// be available in the browser to hydrate the client-side Coveo engine.
// Define these in a local `.env.local` file (see `.env.example`).
const organizationId = process.env.NEXT_PUBLIC_COVEO_ORG_ID;
const accessToken = process.env.NEXT_PUBLIC_COVEO_ACCESS_TOKEN;

if (!organizationId || !accessToken) {
  throw new Error(
    'Missing Coveo configuration. Set NEXT_PUBLIC_COVEO_ORG_ID and ' +
      'NEXT_PUBLIC_COVEO_ACCESS_TOKEN in your .env.local file.'
  );
}

export const engineDefinition = defineSearchEngine({
  configuration: {
    organizationId,
    accessToken,
    analytics: {enabled: true},
    preprocessRequest: (request, clientOrigin) => {
      if (clientOrigin === 'searchApiFetch' && typeof request.body === 'string') {
        const body = JSON.parse(request.body);
        body.cq = SOURCE_FILTER;
        request.body = JSON.stringify(body);
      }
      return request;
    },
  },
  controllers: {
    searchBox: defineSearchBox({options: {numberOfSuggestions: 8}}),
    resultList: defineResultList({
      options: {fieldsToInclude: POKEMON_FIELDS},
    }),
    typeFacet: defineFacet({options: {field: 'type', numberOfValues: 18}}),
    generationFacet: defineFacet({
      options: {field: 'generation', numberOfValues: 9, sortCriteria: 'alphanumeric'},
    }),
    querySummary: defineQuerySummary(),
    pager: definePager({options: {numberOfPages: 5}}),
  },
});

export type SearchStaticState = InferStaticState<typeof engineDefinition>;
export type SearchHydratedState = InferHydratedState<typeof engineDefinition>;

// Controller hooks (each controller key -> use<Key> hook).
export const {
  useSearchBox,
  useResultList,
  useTypeFacet,
  useGenerationFacet,
  useQuerySummary,
  usePager,
} = engineDefinition.controllers;

// SSR helpers + context providers used by the Next.js App Router.
export const {
  fetchStaticState,
  hydrateStaticState,
  setNavigatorContextProvider,
  StaticStateProvider,
  HydratedStateProvider,
  useEngine,
} = engineDefinition;
