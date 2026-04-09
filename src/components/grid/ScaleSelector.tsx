/**
 * ScaleSelector - Dropdown for selecting musical scale and root note
 */

import React, { useMemo } from 'react';
import { CustomSelect } from '@components/common/CustomSelect';
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
        <CustomSelect
           value={String(rootNote)}
           onChange={(v) => onRootNoteChange(parseInt(v, 10))}
           options={NOTE_NAMES.map((note, index) => ({
             value: String(index),
             label: note,
           }))}
           className="bg-dark-bgSecondary border border-dark-border rounded px-2 py-1 text-xs text-text-primary"
         />
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-text-secondary whitespace-nowrap">Scale:</label>
        <CustomSelect
           value={scaleKey}
           onChange={(v) => onScaleChange(v)}
           options={scaleOptions.map((option) => ({
             value: option.value,
             label: option.label,
           }))}
           className="bg-dark-bgSecondary border border-dark-border rounded px-2 py-1 text-xs text-text-primary min-w-[140px]"
           title={selectedScale?.description}
         />
      </div>

      {selectedScale.name !== 'Chromatic' && (
        <span className="text-[10px] text-text-muted">
          ({selectedScale.intervals.length} notes)
        </span>
      )}
    </div>
  );
};
