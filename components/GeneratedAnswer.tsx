'use client';

import {useEffect, useRef, useState} from 'react';
import {buildGeneratedAnswer, type GeneratedAnswer} from '@coveo/headless';
import {useEngine} from '../lib/engine';
import {
  retrievePassages,
  type RetrievedPassage,
} from '../lib/passage-retrieval';

export function GeneratedAnswerPanel() {
  const engine = useEngine();
  const [controller, setController] = useState<GeneratedAnswer | null>(null);
  const [state, setState] = useState(controller?.state);
  const [passages, setPassages] = useState<RetrievedPassage[]>([]);
  const [passagesLoading, setPassagesLoading] = useState(false);
  const [passagesError, setPassagesError] = useState<string | null>(null);
  const lastPassageQueryRef = useRef('');

  useEffect(() => {
    if (!engine) {
      return;
    }

    const generatedAnswer = buildGeneratedAnswer(engine);
    generatedAnswer.enable();

    const sync = () => setState({...generatedAnswer.state});
    sync();
    const unsubscribe = generatedAnswer.subscribe(sync);
    setController(generatedAnswer);

    return () => {
      unsubscribe();
      generatedAnswer.disable();
    };
  }, [engine]);

  useEffect(() => {
    if (!engine) {
      return;
    }

    const unsubscribe = engine.subscribe(() => {
      const query = (engine.state.search?.queryExecuted ?? '').trim();
      if (!query) {
        setPassages([]);
        setPassagesError(null);
        lastPassageQueryRef.current = '';
        return;
      }

      if (engine.state.search?.isLoading || query === lastPassageQueryRef.current) {
        return;
      }

      lastPassageQueryRef.current = query;
      setPassagesLoading(true);
      setPassagesError(null);

      void retrievePassages({query, maxPassages: 5})
        .then((result) => {
          setPassages(result.items ?? []);
        })
        .catch((e) => {
          setPassages([]);
          setPassagesError(
            e instanceof Error ? e.message : 'Could not load source passages.'
          );
        })
        .finally(() => {
          setPassagesLoading(false);
        });
    });

    return () => unsubscribe();
  }, [engine]);

  if (!state?.isEnabled || (!state.isLoading && !state.answer && state.cannotAnswer)) {
    return null;
  }

  const steps = state.generationSteps ?? [];
  const activeStep = steps.find((s) => s.status === 'active');
  const showPassagesBlock =
    passagesLoading || passagesError != null || passages.length > 0;

  return (
    <section className="generated-answer" aria-live="polite">
      <div className="generated-answer-header">
        <h2>Generated answer</h2>
        {state.isLoading || state.isStreaming ? (
          <span className="generated-answer-status">
            {activeStep?.name === 'searching'
              ? 'Searching catalog...'
              : activeStep?.name === 'thinking'
                ? 'Thinking...'
                : 'Generating...'}
          </span>
        ) : null}
      </div>

      {state.error?.message ? (
        <p className="generated-answer-error">{state.error.message}</p>
      ) : null}

      {state.answer ? (
        <p className="generated-answer-text">{state.answer}</p>
      ) : state.isLoading ? (
        <p className="generated-answer-placeholder">
          Preparing an answer from your Pokemon catalog...
        </p>
      ) : null}

      {state.citations.length > 0 ? (
        <div className="generated-answer-citations">
          <p className="generated-answer-citations-title">RGA sources</p>
          <ul>
            {state.citations.map((cite) => (
              <li key={cite.id ?? cite.permanentid ?? cite.title}>
                {cite.clickUri || cite.uri ? (
                  <a href={cite.clickUri ?? cite.uri} target="_blank" rel="noreferrer">
                    {cite.title ?? cite.clickUri}
                  </a>
                ) : (
                  <span>{cite.title}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {showPassagesBlock ? (
        <details className="generated-answer-passages">
          <summary>
            Source passages (CPR)
            {passagesLoading
              ? ' - loading...'
              : passages.length > 0
                ? ` - ${passages.length}`
                : ''}
          </summary>
          {passagesError ? (
            <p className="generated-answer-passages-error">{passagesError}</p>
          ) : null}
          {!passagesError && passagesLoading && passages.length === 0 ? (
            <p className="generated-answer-passages-loading">
              Retrieving ranked passages...
            </p>
          ) : null}
          <ol className="generated-answer-passage-list">
            {passages.map((passage, index) => {
              const doc = passage.document ?? {};
              const href = doc.clickableuri as string | undefined;
              const title = (doc.title as string) ?? `Passage ${index + 1}`;
              const score =
                passage.relevanceScore != null
                  ? passage.relevanceScore.toFixed(3)
                  : null;

              return (
                <li
                  key={`${doc.primaryid ?? title}-${index}`}
                  className="generated-answer-passage-item"
                >
                  <div className="generated-answer-passage-meta">
                    {href ? (
                      <a href={href} target="_blank" rel="noreferrer">
                        {title}
                      </a>
                    ) : (
                      <span>{title}</span>
                    )}
                    {score ? <span className="passage-score">score {score}</span> : null}
                  </div>
                  <p className="generated-answer-passage-text">{passage.text}</p>
                </li>
              );
            })}
          </ol>
        </details>
      ) : null}

      {state.answer && controller ? (
        <div className="generated-answer-actions">
          <button
            type="button"
            className={state.liked ? 'active' : undefined}
            onClick={() => controller.like()}
            aria-pressed={state.liked}
          >
            Helpful
          </button>
          <button
            type="button"
            className={state.disliked ? 'active' : undefined}
            onClick={() => controller.dislike()}
            aria-pressed={state.disliked}
          >
            Not helpful
          </button>
          <button type="button" onClick={() => controller.retry()}>
            Regenerate
          </button>
        </div>
      ) : null}
    </section>
  );
}
