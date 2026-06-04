// Passage Retrieval API (PR API) - Coveo Search v3
// https://docs.coveo.com/en/ (Passage Retrieval API)

import {SOURCE_FILTER} from './engine';

const organizationId = process.env.NEXT_PUBLIC_COVEO_ORG_ID;
const accessToken = process.env.NEXT_PUBLIC_COVEO_ACCESS_TOKEN;

/** Omit in requests when possible; the search token enforces hub (e.g. Pokemon-zikora). */
export const PASSAGE_SEARCH_HUB = 'Pokemon-zikora';

export interface PassageDocument {
  title?: string;
  primaryid?: string;
  clickableuri?: string;
  picture?: string;
  type?: string | string[];
  generation?: string | string[];
  [key: string]: unknown;
}

export interface RetrievedPassage {
  text: string;
  relevanceScore?: number;
  document?: PassageDocument;
}

export interface PassageRetrievalResponse {
  items: RetrievedPassage[];
  responseId?: string;
}

export interface RetrievePassagesOptions {
  query: string;
  maxPassages?: number;
  filter?: string;
  additionalFields?: string[];
  searchHub?: string;
  locale?: string;
  timezone?: string;
}

export async function retrievePassages(
  options: RetrievePassagesOptions
): Promise<PassageRetrievalResponse> {
  if (!organizationId || !accessToken) {
    throw new Error(
      'Missing Coveo configuration for Passage Retrieval API.'
    );
  }

  const {
    query,
    maxPassages = 5,
    filter = SOURCE_FILTER,
    additionalFields = ['clickableuri', 'picture', 'type', 'generation'],
    searchHub,
    locale = 'en-US',
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  } = options;

  const body: Record<string, unknown> = {
    query,
    filter,
    additionalFields,
    maxPassages,
    localization: {locale, timezone},
    analytics: {
      capture: true,
      userAgent:
        typeof navigator !== 'undefined'
          ? navigator.userAgent
          : 'PokeMart/1.0',
    },
  };

  // Token may enforce searchHub; only send when explicitly needed.
  if (searchHub) {
    body.searchHub = searchHub;
  }

  const url = `https://${organizationId}.org.coveo.com/rest/search/v3/passages/retrieve`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Passage Retrieval API failed (${response.status}): ${detail.slice(0, 400)}`
    );
  }

  return (await response.json()) as PassageRetrievalResponse;
}
