import Link from 'next/link';
import {SOURCE_FILTER} from '../../../lib/engine';

// Fetched fresh per request from the Coveo Search API.
export const dynamic = 'force-dynamic';

const DETAIL_FIELDS = ['picture', 'type', 'generation'];

interface CoveoResult {
  title: string;
  clickUri: string;
  raw: Record<string, unknown>;
}

function toSlug(clickUri: string): string {
  return (
    clickUri.split('?')[0].split('#')[0].replace(/\/$/, '').split('/').pop() ?? ''
  );
}

function toTypes(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (raw) return [String(raw)];
  return [];
}

async function fetchPokemon(slug: string): Promise<CoveoResult | null> {
  const org = process.env.NEXT_PUBLIC_COVEO_ORG_ID;
  const token = process.env.NEXT_PUBLIC_COVEO_ACCESS_TOKEN;
  if (!org || !token) return null;

  const endpoint = `https://${org}.org.coveo.com/rest/search/v2?organizationId=${org}`;

  async function search(body: Record<string, unknown>): Promise<CoveoResult[]> {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results as CoveoResult[]) ?? [];
  }

  const uri = `https://pokemondb.net/pokedex/${slug}`;

  // Primary: exact match on the document URI.
  const exact = await search({
    aq: `@clickableuri=="${uri}"`,
    cq: SOURCE_FILTER,
    fieldsToInclude: DETAIL_FIELDS,
    numberOfResults: 1,
  });
  if (exact.length) return exact[0];

  // Fallback: free-text search by name, then match the slug.
  const byName = await search({
    q: slug.replace(/-/g, ' '),
    cq: SOURCE_FILTER,
    fieldsToInclude: DETAIL_FIELDS,
    numberOfResults: 25,
  });
  return byName.find((r) => toSlug(r.clickUri) === slug) ?? byName[0] ?? null;
}

export default async function PokemonDetailPage({
  params,
}: {
  params: {name: string};
}) {
  const slug = decodeURIComponent(params.name);
  const result = await fetchPokemon(slug);

  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand">
          <span className="logo-dot" />
          <span>
            Poke<span className="accent">Mart</span>
          </span>
        </Link>
      </header>

      <main className="detail-main">
        <Link href="/" className="back-link">
          &larr; Back to catalog
        </Link>

        {!result ? (
          <div className="empty-state">
            <strong>Pokemon not found</strong>
            We could not find a Pokemon for &ldquo;{slug}&rdquo;.
          </div>
        ) : (
          <PokemonDetail result={result} />
        )}
      </main>
    </>
  );
}

function PokemonDetail({result}: {result: CoveoResult}) {
  const picture = result.raw.picture as string | undefined;
  const types = toTypes(result.raw.type);
  const generation = result.raw.generation
    ? String(
        Array.isArray(result.raw.generation)
          ? result.raw.generation[0]
          : result.raw.generation
      )
    : null;

  return (
    <article className="detail-card">
      <div className="detail-media">
        {picture ? (
          <img src={picture} alt={result.title} />
        ) : null}
      </div>
      <div className="detail-info">
        <h1>{result.title}</h1>
        <div className="detail-row">
          {generation ? (
            <dl className="detail-meta">
              <dt>Generation</dt>
              <dd>Generation {generation}</dd>
            </dl>
          ) : null}
          {types.length ? (
            <dl className="detail-meta">
              <dt>Type</dt>
              <dd>
                <div className="type-chips">
                  {types.map((t) => (
                    <span key={t} className={`type-chip type-${t.toLowerCase()}`}>
                      {t}
                    </span>
                  ))}
                </div>
              </dd>
            </dl>
          ) : null}
        </div>
        <a
          className="external-link"
          href={result.clickUri}
          target="_blank"
          rel="noopener noreferrer"
        >
          View full Pokedex entry
        </a>
      </div>
    </article>
  );
}
