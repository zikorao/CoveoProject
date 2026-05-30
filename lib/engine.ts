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
const SOURCE_FILTER = '@source=="push API solution"';

export const engineDefinition = defineSearchEngine({
  configuration: {
    organizationId: 'mrzikora632mb41x',
    accessToken: 'REMOVED_ROTATED_TOKEN',
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
    searchBox: defineSearchBox(),
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
} = engineDefinition;
