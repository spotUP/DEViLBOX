/**
 * ScaleSelector - Dropdown for selecting musical scale and root note
 */

import React, { useMemo } from 'react';
import { SCALES, getScaleOptions } from '../../lib/scales';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

interface ScaleSelectorProps {
  scaleKey: string;
  rootNote: number;
  onScaleChange: (scaleKey: string) => void;
  onRootNoteChange: (rootNote: number) => void;
}

export const ScaleSelector: React.FC<ScaleSelectorProps> = ({
  scaleKey,
  rootNote,
  onScaleChange,
  onRootNoteChange,
}) => {
  // Memoize scale options to avoid recalculation
  const scaleOptions = useMemo(() => getScaleOptions(), []);

  // Validate scale key and fallback to chromatic if invalid
  const selectedScale = useMemo(() => {
    return SCALES[scaleKey] || SCALES.chromatic;
  }, [scaleKey]);

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <label className="text-xs text-text-secondary whitespace-nowrap">Root:</label>
        <select
          value={rootNote}
          onChange={(e) => onRootNoteChange(parseInt(e.target.value, 10))}
          className="bg-dark-bgSecondary border border-dark-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
        >
          {NOTE_NAMES.map((note, index) => (
            <option key={index} value={index}>
              {note}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-text-secondary whitespace-nowrap">Scale:</label>
        <select
          value={scaleKey}
          onChange={(e) => onScaleChange(e.target.value)}
          className="bg-dark-bgSecondary border border-dark-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary min-w-[140px]"
          title={selectedScale?.description}
        >
          {scaleOptions.map((option) => (
            <option key={option.value} value={option.value} title={option.description}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {selectedScale.name !== 'Chromatic' && (
        <span className="text-[10px] text-text-muted">
          ({selectedScale.intervals.length} notes)
        </span>
      )}
    </div>
  );
};
