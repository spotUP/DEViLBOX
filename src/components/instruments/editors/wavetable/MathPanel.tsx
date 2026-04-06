/**
 * MathPanel — expression-driven waveform generator.
 *
 * Live-parses an expression like `sin(x*TAU) + 0.3*saw(x*3)` and
 * renders the waveform on every keystroke. Shows errors inline.
 */

import React, { useCallback, useState } from 'react';
import { Play, AlertTriangle } from 'lucide-react';
import { evaluateWaveformExpression, MATH_PRESETS } from './waveformMath';

interface MathPanelProps {
  expr: string;
  onExprChange: (expr: string) => void;
  length: number;
  maxValue: number;
  onDataChange: (data: number[]) => void;
}

export const MathPanel: React.FC<MathPanelProps> = ({
  expr, onExprChange, length, maxValue, onDataChange,
}) => {
  const [error, setError] = useState<string | null>(null);

  const applyExpression = useCallback(
    (text: string) => {
      const result = evaluateWaveformExpression(text, length, maxValue);
      if (result.error) {
        setError(result.error);
      } else {
        setError(null);
        onDataChange(result.data);
      }
    },
    [length, maxValue, onDataChange],
  );

  const handleChange = (value: string) => {
    onExprChange(value);
    applyExpression(value);
  };

  const loadPreset = (presetExpr: string) => {
    onExprChange(presetExpr);
    applyExpression(presetExpr);
  };

  return (
    <div className="space-y-2 p-2 bg-dark-bgSecondary rounded border border-dark-border">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono font-bold text-text-primary uppercase">
          Math / Expression
        </span>
      </div>

      {/* Expression input */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-accent-highlight">f(x) =</span>
          <input
            type="text"
            value={expr}
            onChange={(e) => handleChange(e.target.value)}
            spellCheck={false}
            className="flex-1 bg-dark-bg border border-dark-border rounded px-2 py-1 text-[11px] font-mono text-text-primary focus:outline-none focus:border-accent-highlight/50"
            placeholder="sin(x*TAU)"
          />
          <button
            onClick={() => applyExpression(expr)}
            title="Re-evaluate"
            className="p-1 rounded text-text-muted hover:text-accent-highlight border border-dark-border"
          >
            <Play size={12} />
          </button>
        </div>
        {error && (
          <div className="flex items-center gap-1 px-2 py-1 bg-accent-error/10 border border-accent-error/30 rounded">
            <AlertTriangle size={11} className="text-accent-error flex-shrink-0" />
            <span className="text-[9px] font-mono text-accent-error">{error}</span>
          </div>
        )}
      </div>

      {/* Reference */}
      <details className="text-[9px] font-mono">
        <summary className="cursor-pointer text-text-muted hover:text-text-primary">
          Functions & variables
        </summary>
        <div className="mt-1 pl-3 space-y-0.5 text-text-subtle">
          <div><span className="text-accent-highlight">x</span> — phase, 0..1</div>
          <div><span className="text-accent-highlight">PI, TAU, E</span> — constants</div>
          <div><span className="text-accent-highlight">sin, cos, tan, abs, sqrt, exp, log</span></div>
          <div><span className="text-accent-highlight">saw(x), tri(x), sq(x)</span> — bipolar waves</div>
          <div><span className="text-accent-highlight">pulse(x, duty)</span> — pulse with duty 0..1</div>
          <div><span className="text-accent-highlight">noise(x)</span> — deterministic noise</div>
          <div><span className="text-accent-highlight">env(x, attack, release)</span> — 0..1 envelope</div>
          <div><span className="text-accent-highlight">clamp, mix, min, max</span></div>
        </div>
      </details>

      {/* Example presets */}
      <div className="space-y-1">
        <span className="text-[9px] font-mono text-text-muted uppercase">Examples:</span>
        <div className="flex flex-wrap gap-1">
          {MATH_PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => loadPreset(p.expr)}
              title={p.expr}
              className="px-2 py-0.5 rounded text-[9px] font-mono bg-dark-bg text-text-muted hover:text-text-primary border border-dark-border hover:border-accent-highlight/50"
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
