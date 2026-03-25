/**
 * MobileTransportBar — Compact transport and editor controls for mobile.
 * BPM, pattern selector, record, octave, edit step in a single row.
 */

import React, { useCallback } from 'react';
import { Circle, Play, Square } from 'lucide-react';
import * as Tone from 'tone';
import { useTransportStore, useTrackerStore, useEditorStore } from '@stores';
import { haptics } from '@/utils/haptics';

/** Touch-friendly stepper: label + value + ±buttons */
const Stepper: React.FC<{
  label: string;
  value: string | number;
  onIncrement: () => void;
  onDecrement: () => void;
  min?: number;
  max?: number;
  currentValue?: number;
}> = ({ label, value, onIncrement, onDecrement, min, max, currentValue }) => {
  const atMin = min !== undefined && currentValue !== undefined && currentValue <= min;
  const atMax = max !== undefined && currentValue !== undefined && currentValue >= max;
  return (
    <div className="flex items-center gap-0.5">
      <span className="text-[9px] text-text-muted font-mono uppercase w-[22px] text-right mr-0.5">{label}</span>
      <button
        onClick={() => { haptics.selection(); onDecrement(); }}
        disabled={atMin}
        className="w-6 h-6 flex items-center justify-center rounded bg-dark-bgTertiary text-text-secondary disabled:opacity-30 active:bg-dark-bgHover text-xs font-bold"
      >
        −
      </button>
      <span className="text-[11px] font-mono font-bold text-accent-primary min-w-[24px] text-center">{value}</span>
      <button
        onClick={() => { haptics.selection(); onIncrement(); }}
        disabled={atMax}
        className="w-6 h-6 flex items-center justify-center rounded bg-dark-bgTertiary text-text-secondary disabled:opacity-30 active:bg-dark-bgHover text-xs font-bold"
      >
        +
      </button>
    </div>
  );
};

export const MobileTransportBar: React.FC = () => {
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const bpm = useTransportStore((s) => s.bpm);
  const togglePlayPause = useTransportStore((s) => s.togglePlayPause);
  const setBPM = useTransportStore((s) => s.setBPM);

  const currentPatternIndex = useTrackerStore((s) => s.currentPatternIndex);
  const patternCount = useTrackerStore((s) => s.patterns.length);
  const setCurrentPattern = useTrackerStore((s) => s.setCurrentPattern);

  const recordMode = useEditorStore((s) => s.recordMode);
  const toggleRecordMode = useEditorStore((s) => s.toggleRecordMode);
  const octave = useEditorStore((s) => s.currentOctave);
  const setOctave = useEditorStore((s) => s.setCurrentOctave);
  const editStep = useEditorStore((s) => s.editStep);
  const setEditStep = useEditorStore((s) => s.setEditStep);

  const handlePlay = useCallback(() => {
    Tone.start();
    togglePlayPause().catch(console.error);
  }, [togglePlayPause]);

  const handleRecord = useCallback(() => {
    haptics.medium();
    toggleRecordMode();
  }, [toggleRecordMode]);

  return (
    <div className={`flex-shrink-0 flex items-center gap-1.5 px-2 py-1.5 border-b overflow-x-auto scrollbar-none ${
      recordMode ? 'bg-accent-error/10 border-accent-error/30' : 'bg-dark-bgSecondary border-dark-border'
    }`}>
      {/* Record */}
      <button
        onClick={handleRecord}
        className={`w-7 h-7 flex items-center justify-center rounded-full flex-shrink-0 transition-colors ${
          recordMode
            ? 'bg-accent-error text-white'
            : 'bg-dark-bgTertiary text-text-muted'
        }`}
        aria-label="Toggle record mode"
      >
        <Circle size={12} fill={recordMode ? 'currentColor' : 'none'} />
      </button>

      {/* Play/Stop */}
      <button
        onClick={handlePlay}
        className={`w-7 h-7 flex items-center justify-center rounded flex-shrink-0 transition-colors ${
          isPlaying ? 'bg-accent-primary text-text-inverse' : 'bg-dark-bgTertiary text-text-primary'
        }`}
        aria-label={isPlaying ? 'Stop' : 'Play'}
      >
        {isPlaying ? <Square size={12} /> : <Play size={12} />}
      </button>

      <div className="w-px h-5 bg-dark-border flex-shrink-0" />

      {/* BPM */}
      <Stepper
        label="BPM"
        value={bpm}
        currentValue={bpm}
        min={20}
        max={999}
        onIncrement={() => setBPM(Math.min(999, bpm + 1))}
        onDecrement={() => setBPM(Math.max(20, bpm - 1))}
      />

      <div className="w-px h-5 bg-dark-border flex-shrink-0" />

      {/* Pattern */}
      <Stepper
        label="PAT"
        value={currentPatternIndex.toString().padStart(2, '0')}
        currentValue={currentPatternIndex}
        min={0}
        max={patternCount - 1}
        onIncrement={() => setCurrentPattern(Math.min(patternCount - 1, currentPatternIndex + 1))}
        onDecrement={() => setCurrentPattern(Math.max(0, currentPatternIndex - 1))}
      />

      <div className="w-px h-5 bg-dark-border flex-shrink-0" />

      {/* Octave */}
      <Stepper
        label="OCT"
        value={octave}
        currentValue={octave}
        min={0}
        max={8}
        onIncrement={() => setOctave(Math.min(8, octave + 1))}
        onDecrement={() => setOctave(Math.max(0, octave - 1))}
      />

      <div className="w-px h-5 bg-dark-border flex-shrink-0" />

      {/* Edit Step */}
      <Stepper
        label="STP"
        value={editStep}
        currentValue={editStep}
        min={0}
        max={16}
        onIncrement={() => setEditStep(Math.min(16, editStep + 1))}
        onDecrement={() => setEditStep(Math.max(0, editStep - 1))}
      />
    </div>
  );
};

export default MobileTransportBar;
