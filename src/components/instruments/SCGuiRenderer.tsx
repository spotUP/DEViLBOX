/**
 * SCGuiRenderer.tsx — Render a parsed SuperCollider GUI widget tree as React components.
 *
 * Maps SC widgets (Window, Slider, Button, StaticText, NumberBox, Knob) to
 * native HTML controls styled to match the DEViLBOX dark theme. Actions
 * containing `s.sendMsg("n_set", ...)` fire `onParamChange(param, value)`.
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import type { SCWidget, SCGuiParseResult, SCColor, SCButtonState } from '@engine/sc/scGuiParser';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SCGuiRendererProps {
  /** Parsed SC GUI result */
  gui: SCGuiParseResult;
  /** Called when a widget action fires a synth param change */
  onParamChange?: (param: string, value: number) => void;
  /** Optional className on the root container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Color helper
// ---------------------------------------------------------------------------

function scColorToCSS(c: SCColor | undefined, fallback?: string): string {
  if (!c) return fallback ?? 'transparent';
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  return c.a !== undefined ? `rgba(${r},${g},${b},${c.a})` : `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------------------
// Transform evaluator
// ---------------------------------------------------------------------------

/**
 * Build a function from an SC action transform expression.
 * `transform` is a JS expression where `value` is the slider 0–1 value.
 * e.g. "((value)*(10000-50))+50" → f(0.5) = 5025
 */
function buildTransformFn(transform: string): (value: number) => number {
  try {
    // eslint-disable-next-line no-new-func
    return new Function('value', `return (${transform});`) as (v: number) => number;
  } catch {
    return (v: number) => v;
  }
}

// ---------------------------------------------------------------------------
// Individual widget renderers
// ---------------------------------------------------------------------------

interface WidgetProps {
  widget: SCWidget;
  onParamChange?: (param: string, value: number) => void;
}

/** StaticText → label span */
const SCStaticText: React.FC<WidgetProps> = ({ widget }) => {
  const text = widget.label ?? widget.properties.string ?? '';
  const bg = scColorToCSS(widget.properties.background);
  const color = scColorToCSS(widget.properties.stringColor, 'var(--color-text-secondary, #aaa)');
  const style: React.CSSProperties = {
    color,
    fontSize: 11,
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
    padding: '1px 4px',
    whiteSpace: 'nowrap',
    ...(bg !== 'transparent' ? { background: bg, borderRadius: 2 } : {}),
  };
  if (widget.rect) {
    style.width = widget.rect.w;
    style.height = widget.rect.h;
    style.display = 'inline-flex';
    style.alignItems = 'center';
  }
  return <span style={style}>{text}</span>;
};

/** NumberBox → compact input */
const SCNumberBox: React.FC<WidgetProps> = ({ widget, onParamChange }) => {
  const initial = widget.properties.value ?? 0;
  const [val, setVal] = useState(initial);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setVal(v);
    if (widget.action && onParamChange) {
      const fn = buildTransformFn(widget.action.transform);
      onParamChange(widget.action.param, fn(v));
    }
  }, [widget.action, onParamChange]);

  const style: React.CSSProperties = {
    width: widget.rect?.w ?? 50,
    height: widget.rect?.h ?? 18,
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    background: 'var(--color-bg-tertiary, #1a1a2e)',
    border: '1px solid var(--color-border, #333)',
    borderRadius: 2,
    color: 'var(--color-text-secondary, #aaa)',
    padding: '0 4px',
    textAlign: 'center' as const,
    outline: 'none',
  };

  return (
    <input
      type="number"
      value={val}
      onChange={handleChange}
      style={style}
    />
  );
};

/** Slider → range input (horizontal or vertical) */
const SCSlider: React.FC<WidgetProps> = ({ widget, onParamChange }) => {
  const initial = widget.properties.value != null ? widget.properties.value : 0;
  const [val, setVal] = useState(initial);
  const transformRef = useRef<((v: number) => number) | null>(null);

  // Memoize transform function
  if (!transformRef.current && widget.action) {
    transformRef.current = buildTransformFn(widget.action.transform);
  }

  const step = widget.properties.step ?? 0.005;
  const isVertical = widget.properties.orientation === 'vertical';

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setVal(v);
    if (widget.action && onParamChange && transformRef.current) {
      onParamChange(widget.action.param, transformRef.current(v));
    }
  }, [widget.action, onParamChange]);

  const bg = scColorToCSS(widget.properties.background, 'var(--color-bg-tertiary, #1a1a2e)');
  const w = widget.rect?.w ?? 80;
  const h = widget.rect?.h ?? 20;

  const style: React.CSSProperties = {
    width: isVertical ? h : w,
    height: isVertical ? w : h,
    accentColor: 'var(--color-accent-primary, #7c3aed)',
    background: bg,
    borderRadius: 3,
    cursor: 'pointer',
    ...(isVertical ? { writingMode: 'vertical-lr' as const, direction: 'rtl' as const } : {}),
  };

  return (
    <input
      type="range"
      min={0}
      max={1}
      step={step}
      value={val}
      onChange={handleChange}
      className="appearance-none"
      style={style}
      title={widget.action?.param ?? widget.varName ?? ''}
    />
  );
};

/** Button → toggle or multi-state button */
const SCButton: React.FC<WidgetProps> = ({ widget, onParamChange }) => {
  const states = widget.properties.states ?? [{ label: '?' }];
  const [stateIdx, setStateIdx] = useState(0);

  const handleClick = useCallback(() => {
    const next = (stateIdx + 1) % states.length;
    setStateIdx(next);
    if (widget.action && onParamChange) {
      const fn = buildTransformFn(widget.action.transform);
      onParamChange(widget.action.param, fn(next));
    }
  }, [stateIdx, states.length, widget.action, onParamChange]);

  const currentState = states[stateIdx] as SCButtonState;
  const w = widget.rect?.w ?? 45;
  const h = widget.rect?.h ?? 22;

  return (
    <button
      onClick={handleClick}
      style={{
        width: w,
        height: h,
        fontSize: 11,
        fontFamily: "'JetBrains Mono', monospace",
        background: scColorToCSS(currentState.bgColor, 'var(--color-bg-tertiary, #1a1a2e)'),
        color: scColorToCSS(currentState.textColor, 'var(--color-text-primary, #ddd)'),
        border: '1px solid var(--color-border, #444)',
        borderRadius: 3,
        cursor: 'pointer',
        padding: '0 6px',
        whiteSpace: 'nowrap',
        transition: 'background 0.1s',
      }}
      title={widget.action ? `${widget.action.param}: ${currentState.label}` : currentState.label}
    >
      {currentState.label}
    </button>
  );
};

// ---------------------------------------------------------------------------
// Widget dispatcher
// ---------------------------------------------------------------------------

const WidgetRenderer: React.FC<WidgetProps> = (props) => {
  switch (props.widget.type) {
    case 'staticText': return <SCStaticText {...props} />;
    case 'numberBox': return <SCNumberBox {...props} />;
    case 'slider': return <SCSlider {...props} />;
    case 'button': return <SCButton {...props} />;
    case 'knob': return <SCSlider {...props} />; // fallback to slider for knobs
    default: return null;
  }
};

// ---------------------------------------------------------------------------
// Row grouping: group adjacent labels + controls into rows
// ---------------------------------------------------------------------------

interface WidgetRow {
  labels: SCWidget[];
  controls: SCWidget[];
}

function groupWidgetsIntoRows(widgets: SCWidget[]): WidgetRow[] {
  const rows: WidgetRow[] = [];
  let currentLabels: SCWidget[] = [];
  let currentControls: SCWidget[] = [];

  // Sort widgets by source order (approximate via rect position)
  const sorted = [...widgets].filter(w => w.type !== 'window' && w.type !== 'compositeView');

  for (const w of sorted) {
    if (w.type === 'staticText' && !w.action) {
      // Labels break into new row if we have pending controls
      if (currentControls.length > 0) {
        rows.push({ labels: currentLabels, controls: currentControls });
        currentLabels = [];
        currentControls = [];
      }
      currentLabels.push(w);
    } else {
      currentControls.push(w);
    }
  }

  // Flush remaining
  if (currentLabels.length > 0 || currentControls.length > 0) {
    rows.push({ labels: currentLabels, controls: currentControls });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------

export const SCGuiRenderer: React.FC<SCGuiRendererProps> = ({
  gui,
  onParamChange,
  className,
}) => {
  const rows = useMemo(() => groupWidgetsIntoRows(gui.widgets), [gui.widgets]);
  const title = gui.window?.label ?? 'SC GUI';

  if (!gui.hasGui || gui.widgets.length === 0) return null;

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 10,
        background: 'var(--color-bg-secondary, #111)',
        borderRadius: 6,
        border: '1px solid var(--color-border, #333)',
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
        fontSize: 11,
        overflow: 'auto',
      }}
    >
      {/* Title bar */}
      <div style={{
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--color-text-primary, #ddd)',
        borderBottom: '1px solid var(--color-border, #333)',
        paddingBottom: 6,
        marginBottom: 2,
        letterSpacing: '0.04em',
      }}>
        {title}
      </div>

      {/* Widget rows */}
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Label row */}
          {row.labels.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {row.labels.map((w, j) => (
                <WidgetRenderer key={`l-${i}-${j}`} widget={w} onParamChange={onParamChange} />
              ))}
            </div>
          )}
          {/* Control row */}
          {row.controls.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {row.controls.map((w, j) => (
                <WidgetRenderer key={`c-${i}-${j}`} widget={w} onParamChange={onParamChange} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default SCGuiRenderer;
