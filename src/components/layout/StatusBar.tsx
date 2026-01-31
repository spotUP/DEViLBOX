/**
 * StatusBar - Bottom status bar showing current state
 */

import React from 'react';
import { useTrackerStore, useTransportStore, useAudioStore, useMIDIStore } from '@stores';
import { MIDIKnobControlBar } from '../midi/MIDIKnobControlBar';
import { Lightbulb } from 'lucide-react';

interface StatusBarProps {
  onShowTips?: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = React.memo(({ onShowTips }) => {
  const showKnobBar = useMIDIStore((state) => state.showKnobBar);
  // Optimize: Only subscribe to specific values, not entire patterns array
  const cursor = useTrackerStore((state) => state.cursor);
  const currentOctave = useTrackerStore((state) => state.currentOctave);
  const patternOrderLength = useTrackerStore((state) => state.patternOrder.length);
  const currentPositionIndex = useTrackerStore((state) => state.currentPositionIndex);
  const patternLength = useTrackerStore((state) => state.patterns[state.currentPatternIndex]?.length || 64);
  const patternName = useTrackerStore((state) => state.patterns[state.currentPatternIndex]?.name || 'Untitled');

  const { bpm, position, isPlaying } = useTransportStore();
  const { contextState } = useAudioStore();

  const rowDisplay = `${String(cursor.rowIndex).padStart(2, '0')}/${String(patternLength).padStart(2, '0')}`;
  const channelDisplay = `Ch ${cursor.channelIndex + 1}`;

  // Format song position (current position in pattern order)
  const songPositionDisplay = `${currentPositionIndex.toString(16).padStart(2, '0').toUpperCase()}/${patternOrderLength.toString(16).padStart(2, '0').toUpperCase()}`;

  return (
    <div className="flex flex-col">
      {/* Integrated MIDI Knob Bar */}
      {showKnobBar && <MIDIKnobControlBar />}
      
      <div className="bg-dark-bgSecondary border-t border-dark-border flex items-center justify-between px-4 py-1.5 text-xs font-mono">
        {/* Left: Cursor Position */}
      <div className="flex items-center gap-4">
        <span className="text-text-secondary">
          Row <span className="text-accent-primary font-semibold">{rowDisplay}</span>
        </span>
        <div className="w-px h-3 bg-dark-border"></div>
        <span className="text-text-secondary">
          {channelDisplay}
        </span>
        <div className="w-px h-3 bg-dark-border"></div>
        <span className="text-text-secondary capitalize">
          {cursor.columnType}
        </span>
        <div className="w-px h-3 bg-dark-border"></div>
        <span className="text-text-secondary">
          Oct <span className="text-accent-primary font-semibold">{currentOctave}</span>
        </span>
      </div>

      {/* Center: Song Info (Time, BPM, Pattern, Position) */}
      <div className="flex items-center gap-4">
        {/* Playback Time */}
        <span className="text-text-secondary">
          <span className={`font-semibold ${isPlaying ? 'text-accent-primary' : 'text-text-muted'}`}>
            {position}
          </span>
        </span>
        <div className="w-px h-3 bg-dark-border"></div>
        {/* BPM */}
        <span className="text-text-secondary">
          <span className="text-accent-primary">{bpm}</span> BPM
        </span>
        <div className="w-px h-3 bg-dark-border"></div>
        {/* Pattern Name */}
        <span className="text-text-secondary">
          Pattern <span className="text-text-primary">{patternName}</span>
        </span>
        <div className="w-px h-3 bg-dark-border"></div>
        {/* Song Position (Pattern Order Position) */}
        <span className="text-text-secondary">
          Pos <span className="text-accent-primary font-semibold">{songPositionDisplay}</span>
        </span>
      </div>

      {/* Right: Audio State & Tips */}
      <div className="flex items-center gap-4">
        {onShowTips && (
          <button
            onClick={onShowTips}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-accent-warning/10 text-accent-warning hover:bg-accent-warning/20 transition-colors"
            title="Tip of the Day"
          >
            <Lightbulb size={12} />
            <span className="text-[10px] font-bold uppercase tracking-tight">Tips</span>
          </button>
        )}

        <span
          className={`flex items-center gap-1.5 ${
            contextState === 'running' ? 'text-accent-success' : 'text-text-muted'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${contextState === 'running' ? 'bg-accent-success' : 'bg-text-muted'}`}></span>
          {contextState === 'running' ? 'Audio Active' : 'Audio Off'}
        </span>
      </div>
    </div>
  </div>
  );
});
