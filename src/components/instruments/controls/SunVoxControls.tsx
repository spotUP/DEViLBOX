/**
 * SunVoxControls.tsx — React parameter panel for SunVox instruments
 *
 * Fetches the control list from the loaded SunVox module via `synth.getControls()`
 * and renders a grid of knobs — one per control. On mount, or whenever the
 * synth reference changes, the controls are re-fetched so they always reflect
 * the currently loaded patch.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { SunVoxConfig } from '@typedefs/instrument';
import type { SunVoxControl } from '@engine/sunvox/SunVoxEngine';
import type { SunVoxSynth } from '@engine/sunvox/SunVoxSynth';
import { Knob } from '@components/controls/Knob';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SunVoxControlsProps {
  synth: SunVoxSynth;
  config: SunVoxConfig;
  onChange: (config: SunVoxConfig) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const SunVoxControls: React.FC<SunVoxControlsProps> = ({
  synth,
  config,
  onChange,
}) => {
  // Track current config in a ref to avoid stale state in callbacks (CLAUDE.md pattern)
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Controls fetched from WASM
  const [controls, setControls] = useState<SunVoxControl[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch controls on mount and whenever the synth prop changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    synth
      .getControls()
      .then((ctls) => {
        if (!cancelled) {
          setControls(ctls);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [synth]);

  // Callback for knob changes — applies the stale-state-safe ref pattern
  const handleControlChange = useCallback(
    (ctlId: number, value: number) => {
      // Send value to WASM engine immediately (fire-and-forget)
      synth.set(ctlId.toString(), value);

      // Merge into config.controlValues and propagate up
      onChange({
        ...configRef.current,
        controlValues: {
          ...configRef.current.controlValues,
          [ctlId.toString()]: value,
        },
      });
    },
    [synth, onChange],
  );

  // ── Render states ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-text-muted text-sm font-mono">
        Loading controls…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8 text-red-400 text-sm font-mono">
        Error: {error}
      </div>
    );
  }

  if (controls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-8 text-text-muted">
        <span className="text-sm font-mono">No patch loaded</span>
        <span className="text-xs opacity-60">Import a .sunsynth file to see controls</span>
      </div>
    );
  }

  // ── Normal render — grid of knobs ─────────────────────────────────────────

  return (
    <div className="p-4">
      <div
        className="flex flex-wrap gap-4"
        role="group"
        aria-label="SunVox module controls"
      >
        {controls.map((ctl, idx) => {
          // Use the persisted value if available; otherwise fall back to the
          // value reported by WASM at load time.
          const persistedValue = configRef.current.controlValues[idx.toString()];
          const currentValue = persistedValue !== undefined ? persistedValue : ctl.value;

          return (
            <div
              key={idx}
              className="flex flex-col items-center"
              style={{ minWidth: '64px' }}
            >
              <Knob
                value={currentValue}
                min={ctl.min}
                max={ctl.max}
                defaultValue={ctl.value}
                label={ctl.name}
                size="md"
                color="#00d4aa"
                onChange={(v) => handleControlChange(idx, v)}
                formatValue={(v) => {
                  // Integer-like range: show as integer
                  if (Number.isInteger(ctl.min) && Number.isInteger(ctl.max)) {
                    return Math.round(v).toString();
                  }
                  return v.toFixed(2);
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

SunVoxControls.displayName = 'SunVoxControls';
