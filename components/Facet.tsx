'use client';

import type {useTypeFacet} from '../lib/engine';

// useTypeFacet / useGenerationFacet share the same controller shape.
type FacetController = ReturnType<typeof useTypeFacet>;

interface FacetProps {
  title: string;
  controller: FacetController;
  // Show a colored dot before each value (used for the Type facet).
  colorize?: boolean;
  // Transform the raw facet value into a display label (e.g. "1" -> "Gen 1").
  formatValue?: (value: string) => string;
}

export function Facet({title, controller, colorize, formatValue}: FacetProps) {
  const {state, methods} = controller;

  if (!state.values.length) {
    return null;
  }

  return (
    <section className="facet-panel">
      <h3>{title}</h3>
      <ul>
        {state.values.map((value) => {
          const selected = methods?.isValueSelected(value) ?? false;
          const label = formatValue ? formatValue(value.value) : value.value;
          return (
            <li key={value.value}>
              <label className={`facet-row${selected ? ' selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => methods?.toggleSelect(value)}
                />
                <span className="facet-label">
                  {colorize ? (
                    <span
                      className={`color-dot type-${value.value.toLowerCase()}`}
                    />
                  ) : null}
                  {label}
                </span>
                <span className="facet-count">{value.numberOfResults}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
