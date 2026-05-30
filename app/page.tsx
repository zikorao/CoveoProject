import {headers} from 'next/headers';
import {fetchStaticState, setNavigatorContextProvider} from '../lib/engine';
import {NextJsNavigatorContext} from '../lib/navigator-context';
import {SearchProvider} from '../components/SearchProvider';
import {SearchInterface} from '../components/SearchInterface';

// The initial search runs per-request (not at build time) so prerendering
// doesn't depend on network access to the Coveo API.
export const dynamic = 'force-dynamic';

// Server component: fetch the static state on the server, then pass it to the
// client provider which hydrates it to restore interactivity.
export default async function SearchPage() {
  const navigatorContext = new NextJsNavigatorContext(headers());
  setNavigatorContextProvider(() => navigatorContext);

  const staticState = await fetchStaticState();

  return (
    <SearchProvider staticState={staticState}>
      <SearchInterface />
    </SearchProvider>
  );
}
