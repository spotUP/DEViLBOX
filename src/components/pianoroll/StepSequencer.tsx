/**
 * StepSequencer — DOM version of the grid-based step sequencer.
 * Visually 1:1 with PixiStepSequencer. Same data model.
 *
 * Grid: rows = pads/notes, columns = steps.
 * Toggle cells on/off, drag vertical for velocity.
 */

import React, { useState, useCallback } from 'react';

export interface StepPad {
  note: number;
  label: string;
  color?: string;
}

export interface StepData {
  active: boolean;
  velocity: number;
}

interface StepSequencerProps {
  steps: number;
  pads: StepPad[];
  data: StepData[][];
  currentStep?: number;
  onToggle?: (padIndex: number, stepIndex: number) => void;
  onVelocityChange?: (padIndex: number, stepIndex: number, velocity: number) => void;
}

const LABEL_W = 60;

export const StepSequencer: React.FC<StepSequencerProps> = ({
  steps,
  pads,
  data,
  currentStep,
  onToggle,
  onVelocityChange,
}) => {
  const [dragPad, setDragPad] = useState<{ pad: number; step: number } | null>(null);

  const handleMouseDown = useCallback((pad: number, step: number) => {
    onToggle?.(pad, step);
    setDragPad({ pad, step });
  }, [onToggle]);

  const handleMouseMove = useCallback((e: React.MouseEvent, pad: number, step: number) => {
    if (!dragPad || dragPad.pad !== pad || dragPad.step !== step) return;
    const cell = data[pad]?.[step];
    if (!cell?.active) return;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const relY = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    onVelocityChange?.(pad, step, Math.round(relY * 127));
  }, [dragPad, data, onVelocityChange]);

  const handleMouseUp = useCallback(() => setDragPad(null), []);

  return (
    <div className="flex flex-col bg-dark-bg select-none" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      {pads.map((pad, padIdx) => (
        <div key={padIdx} className="flex items-stretch" style={{ height: 32 }}>
          {/* Pad label */}
          <div
            className="flex-shrink-0 flex items-center px-2 text-[10px] font-mono border-r border-dark-border bg-dark-bgSecondary"
            style={{ width: LABEL_W, color: pad.color ?? 'var(--color-text-secondary)' }}
          >
            {pad.label}
          </div>

          {/* Step cells */}
          {Array.from({ length: steps }, (_, stepIdx) => {
            const cell = data[padIdx]?.[stepIdx];
            const isActive = cell?.active ?? false;
            const velocity = cell?.velocity ?? 100;
            const isBeat = stepIdx % 4 === 0;
            const isCurrent = stepIdx === currentStep;

            return (
              <button
                key={stepIdx}
                className={`flex-1 border border-dark-border rounded-sm mx-px relative transition-colors
                  ${isCurrent ? 'ring-1 ring-accent-primary/40' : ''}
                  ${!isActive && isBeat ? 'bg-dark-bgSecondary' : !isActive ? 'bg-dark-bg' : ''}
                `}
                style={isActive ? {
                  backgroundColor: `${pad.color ?? 'var(--color-accent)'}`,
                  opacity: 0.3 + (velocity / 127) * 0.7,
                } : undefined}
                onMouseDown={() => handleMouseDown(padIdx, stepIdx)}
                onMouseMove={(e) => handleMouseMove(e, padIdx, stepIdx)}
              >
                {/* Velocity bar */}
                {isActive && (
                  <div
                    className="absolute bottom-0 left-0 right-0 rounded-sm"
                    style={{
                      height: `${(velocity / 127) * 100}%`,
                      backgroundColor: pad.color ?? 'var(--color-accent)',
                      opacity: 0.3,
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
};
