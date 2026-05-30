'use client';

import {useEffect, useState, type PropsWithChildren} from 'react';
import {engineDefinition} from '../lib/engine';
import type {InferStaticState, InferHydratedState} from '@coveo/headless-react/ssr';

const {hydrateStaticState, StaticStateProvider, HydratedStateProvider} =
  engineDefinition;

type StaticState = InferStaticState<typeof engineDefinition>;
type HydratedState = InferHydratedState<typeof engineDefinition>;

export function SearchProvider({
  staticState,
  children,
}: PropsWithChildren<{staticState: StaticState}>) {
  const [hydratedState, setHydratedState] = useState<HydratedState | null>(
    null
  );

  useEffect(() => {
    hydrateStaticState({
      searchAction: staticState.searchAction,
    }).then(setHydratedState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!hydratedState) {
    return (
      <StaticStateProvider controllers={staticState.controllers}>
        {children}
      </StaticStateProvider>
    );
  }

  return (
    <HydratedStateProvider
      engine={hydratedState.engine}
      controllers={hydratedState.controllers}
    >
      {children}
    </HydratedStateProvider>
  );
}
