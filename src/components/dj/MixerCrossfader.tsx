/**
 * MixerCrossfader - Horizontal crossfader with curve selector
 *
 * Slider goes from 0 (full Deck A) to 1 (full Deck B), default 0.5 center.
 * Curve selector offers Linear, Cut, and Smooth (constant-power) modes.
 */

import React, { useCallback, useRef, useEffect } from 'react';
import { useDJStore, type CrossfaderCurve } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';

interface CrossfaderState {
  position: number;
  curve: CrossfaderCurve;
}

const CURVES: { key: CrossfaderCurve; label: string }[] = [
  { key: 'linear', label: 'Linear' },
  { key: 'cut', label: 'Cut' },
  { key: 'smooth', label: 'Smooth' },
];

export const MixerCrossfader: React.FC = () => {
  const position = useDJStore((s) => s.crossfaderPosition);
  const curve = useDJStore((s) => s.crossfaderCurve);

  // Ref pattern for drag handling to avoid stale closures
  const stateRef = useRef<CrossfaderState>({ position, curve });
  useEffect(() => {
    stateRef.current = { position, curve };
  }, [position, curve]);

  const handlePositionChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    useDJStore.getState().setCrossfader(value);
    try {
      getDJEngine().mixer.setCrossfader(value);
    } catch {
      // Engine might not be initialized yet
    }
  }, []);

  const handleCurveChange = useCallback((newCurve: CrossfaderCurve) => {
    useDJStore.getState().setCrossfaderCurve(newCurve);
    try {
      getDJEngine().mixer.setCurve(newCurve);
    } catch {
      // Engine might not be initialized yet
    }
  }, []);

  return (
    <div className="flex flex-col items-center gap-1 w-full px-2" title="Crossfader">
      {/* A / B labels + slider */}
      <div className="flex items-center gap-3 w-full">
        <span className="text-text-secondary text-xs font-mono font-bold" title="Deck 1">1</span>

        <div className="flex-1 relative">
          <input
            type="range"
            min={0}
            max={1}
            step={0.005}
            value={position}
            onChange={handlePositionChange}
            className="crossfader-slider w-full"
            title={`Crossfader — blend between Deck 1 and Deck 2`}
            style={{
              appearance: 'none',
              WebkitAppearance: 'none',
              height: 24,
              background: 'transparent',
              cursor: 'pointer',
            }}
          />
        </div>

        <span className="text-text-secondary text-xs font-mono font-bold" title="Deck 2">2</span>
      </div>

      {/* Curve selector */}
      <div className="flex gap-1">
        {CURVES.map(({ key, label }) => {
          const curveDescriptions: Record<CrossfaderCurve, string> = {
            linear: 'Linear — equal crossfade, smooth blend',
            cut: 'Cut — hard switch, no blending',
            smooth: 'Smooth — constant-power crossfade',
          };
          return (
            <button
              key={key}
              onClick={() => handleCurveChange(key)}
              className={`
                px-2 py-0.5 text-[10px] font-mono rounded transition-colors
                ${
                  curve === key
                    ? 'bg-accent-primary text-text-inverse'
                    : 'bg-dark-bgTertiary text-text-muted hover:text-text-secondary border border-dark-borderLight'
                }
              `}
              title={curveDescriptions[key]}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Slider styles */}
      <style>{`
        .crossfader-slider::-webkit-slider-runnable-track {
          height: 6px;
          background: var(--color-bg-tertiary);
          border-radius: 3px;
          border: 1px solid var(--color-border);
        }
        .crossfader-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 32px;
          height: 18px;
          background: var(--color-border-light);
          border: 1px solid var(--color-border);
          border-radius: 3px;
          cursor: grab;
          margin-top: -7px;
        }
        .crossfader-slider::-webkit-slider-thumb:active {
          cursor: grabbing;
          background: var(--color-text-muted);
        }
        .crossfader-slider::-moz-range-track {
          height: 6px;
          background: var(--color-bg-tertiary);
          border-radius: 3px;
          border: 1px solid var(--color-border);
        }
        .crossfader-slider::-moz-range-thumb {
          width: 32px;
          height: 18px;
          background: var(--color-border-light);
          border: 1px solid var(--color-border);
          border-radius: 3px;
          cursor: grab;
        }
      `}</style>
    </div>
  );
};
