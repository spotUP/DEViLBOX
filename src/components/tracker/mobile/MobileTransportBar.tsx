/**
 * MobileTransportBar — Combined header + transport for mobile.
 * Single 40px bar with: [Rec][Play] [CH◄►] [BPM±] [PAT±] [Instrument▼]
 * Octave and edit step are now in the piano input area (contextual to note entry).
 */

import React, { useCallback } from 'react';
import { Circle, Play, Square, ChevronLeft, ChevronRight } from 'lucide-react';
import * as Tone from 'tone';
import { useTransportStore, useTrackerStore, useEditorStore, useInstrumentStore } from '@stores';
import { haptics } from '@/utils/haptics';
import { useShallow } from 'zustand/react/shallow';
import { CustomSelect } from '@components/common/CustomSelect';

interface MobileTransportBarProps {
  /** Channel index for portrait mode navigation */
  mobileChannel: number;
  onChannelPrev: () => void;
  onChannelNext: () => void;
  maxChannels: number;
  /** Show channel nav (portrait + non-format mode) */
  showChannelNav?: boolean;
  /** Format label (e.g. "furnace") when in custom format mode */
  formatLabel?: string;
}

/** Compact stepper: [−] value [+] */
const MiniStepper: React.FC<{
  value: string | number;
  onIncrement: () => void;
  onDecrement: () => void;
  disabled?: { min?: boolean; max?: boolean };
}> = ({ value, onIncrement, onDecrement, disabled }) => (
  <div className="flex items-center">
    <button
      onClick={() => { haptics.selection(); onDecrement(); }}
      disabled={disabled?.min}
      className="w-7 h-7 flex items-center justify-center rounded-l bg-dark-bgTertiary text-text-secondary disabled:opacity-30 active:bg-dark-bgHover active:scale-95 text-sm font-bold transition-transform"
    >
      −
    </button>
    <span className="text-[11px] font-mono font-bold text-accent-primary min-w-[28px] text-center bg-dark-bg/50 h-7 flex items-center justify-center">
      {value}
    </span>
    <button
      onClick={() => { haptics.selection(); onIncrement(); }}
      disabled={disabled?.max}
      className="w-7 h-7 flex items-center justify-center rounded-r bg-dark-bgTertiary text-text-secondary disabled:opacity-30 active:bg-dark-bgHover active:scale-95 text-sm font-bold transition-transform"
    >
      +
    </button>
  </div>
);

export const MobileTransportBar: React.FC<MobileTransportBarProps> = ({
  mobileChannel,
  onChannelPrev,
  onChannelNext,
  maxChannels,
  showChannelNav = true,
  formatLabel,
}) => {
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const bpm = useTransportStore((s) => s.bpm);
  const togglePlayPause = useTransportStore((s) => s.togglePlayPause);
  const setBPM = useTransportStore((s) => s.setBPM);

  const currentPatternIndex = useTrackerStore((s) => s.currentPatternIndex);
  const patternCount = useTrackerStore((s) => s.patterns.length);
  const setCurrentPattern = useTrackerStore((s) => s.setCurrentPattern);

  const recordMode = useEditorStore((s) => s.recordMode);
  const toggleRecordMode = useEditorStore((s) => s.toggleRecordMode);

  const { instruments, currentInstrumentId, setCurrentInstrument } = useInstrumentStore(useShallow((s) => ({
    instruments: s.instruments,
    currentInstrumentId: s.currentInstrumentId,
    setCurrentInstrument: s.setCurrentInstrument,
  })));

  const handlePlay = useCallback(() => {
    Tone.start();
    togglePlayPause().catch(console.error);
  }, [togglePlayPause]);

  const handleRecord = useCallback(() => {
    haptics.heavy();
    toggleRecordMode();
  }, [toggleRecordMode]);

  return (
    <div className={`flex-shrink-0 flex items-center gap-1 px-1.5 h-10 border-b safe-area-top ${
      recordMode ? 'bg-accent-error/10 border-accent-error/30' : 'bg-dark-bgSecondary border-dark-border'
    }`}>
      {/* Record */}
      <button
        onClick={handleRecord}
        className={`w-8 h-8 flex items-center justify-center rounded-full flex-shrink-0 transition-all active:scale-90 ${
          recordMode ? 'bg-accent-error text-white shadow-lg shadow-accent-error/30' : 'bg-dark-bgTertiary text-text-muted'
        }`}
      >
        <Circle size={14} fill={recordMode ? 'currentColor' : 'none'} />
      </button>

      {/* Play/Stop */}
      <button
        onClick={handlePlay}
        className={`w-8 h-8 flex items-center justify-center rounded flex-shrink-0 transition-all active:scale-90 ${
          isPlaying ? 'bg-accent-primary text-text-inverse' : 'bg-dark-bgTertiary text-text-primary'
        }`}
      >
        {isPlaying ? <Square size={14} /> : <Play size={14} />}
      </button>

      {/* Channel nav (portrait, non-format) */}
      {showChannelNav && (
        <div className="flex items-center flex-shrink-0">
          <button
            onClick={onChannelPrev}
            disabled={mobileChannel === 0}
            className="w-6 h-8 flex items-center justify-center text-text-secondary disabled:opacity-30 active:scale-90 transition-transform"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-[10px] font-mono text-accent-primary min-w-[20px] text-center font-bold">
            {mobileChannel + 1}
          </span>
          <button
            onClick={onChannelNext}
            disabled={mobileChannel >= maxChannels - 1}
            className="w-6 h-8 flex items-center justify-center text-text-secondary disabled:opacity-30 active:scale-90 transition-transform"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Format label */}
      {formatLabel && (
        <span className="text-[10px] font-bold text-accent-primary uppercase tracking-wide flex-shrink-0">{formatLabel}</span>
      )}

      <div className="w-px h-5 bg-dark-border flex-shrink-0" />

      {/* BPM */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <span className="text-[8px] text-text-muted font-mono">BPM</span>
        <MiniStepper
          value={bpm}
          onIncrement={() => setBPM(Math.min(999, bpm + 1))}
          onDecrement={() => setBPM(Math.max(20, bpm - 1))}
          disabled={{ min: bpm <= 20, max: bpm >= 999 }}
        />
      </div>

      {/* Pattern */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <span className="text-[8px] text-text-muted font-mono">PAT</span>
        <MiniStepper
          value={currentPatternIndex.toString().padStart(2, '0')}
          onIncrement={() => setCurrentPattern(Math.min(patternCount - 1, currentPatternIndex + 1))}
          onDecrement={() => setCurrentPattern(Math.max(0, currentPatternIndex - 1))}
          disabled={{ min: currentPatternIndex <= 0, max: currentPatternIndex >= patternCount - 1 }}
        />
      </div>

      {/* Spacer */}
      <div className="flex-1 min-w-0" />

      {/* Instrument selector */}
      <CustomSelect
        value={String(currentInstrumentId ?? 1)}
        onChange={(v) => { haptics.selection(); setCurrentInstrument(parseInt(v, 10)); }}
        options={instruments.map((inst) => ({
          value: String(inst.id),
          label: inst.name.substring(0, 12),
        }))}
        className="text-[10px] bg-dark-bgTertiary border border-dark-border rounded h-8 px-1.5 text-text-primary font-mono truncate flex-shrink min-w-0 max-w-[90px]"
      />

      {/* Spacer for hamburger menu */}
      <div className="w-8 flex-shrink-0" />
    </div>
  );
};

export default MobileTransportBar;
