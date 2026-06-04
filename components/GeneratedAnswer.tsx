'use client';

import {useEffect, useState} from 'react';
import {buildGeneratedAnswer, type GeneratedAnswer} from '@coveo/headless';
import {useEngine} from '../lib/engine';

export function GeneratedAnswerPanel() {
  const engine = useEngine();
  const [controller, setController] = useState<GeneratedAnswer | null>(null);
  const [state, setState] = useState(controller?.state);

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

  if (!state?.isEnabled || (!state.isLoading && !state.answer && state.cannotAnswer)) {
    return null;
  }

  const steps = state.generationSteps ?? [];
  const activeStep = steps.find((s) => s.status === 'active');

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
        <p className="generated-answer-placeholder">Preparing an answer from your Pokemon catalog...</p>
      ) : null}

      {state.citations.length > 0 ? (
        <div className="generated-answer-citations">
          <p className="generated-answer-citations-title">Sources</p>
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
