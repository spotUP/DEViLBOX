/**
 * StatusBar - Bottom status bar showing current state
 */

import React from 'react';
import { useTrackerStore, useTransportStore, useAudioStore } from '@stores';

export const StatusBar: React.FC = () => {
  const { cursor, patterns, currentPatternIndex, currentOctave } = useTrackerStore();
  const { bpm } = useTransportStore();
  const { contextState } = useAudioStore();

  const pattern = patterns[currentPatternIndex];
  const rowDisplay = `${String(cursor.rowIndex).padStart(2, '0')}/${String(pattern?.length || 64).padStart(2, '0')}`;
  const channelDisplay = `Ch ${cursor.channelIndex + 1}`;

  return (
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

      {/* Center: Pattern Info */}
      <div className="flex items-center gap-4">
        <span className="text-text-secondary">
          Pattern <span className="text-text-primary">{pattern?.name || 'Untitled'}</span>
        </span>
        <div className="w-px h-3 bg-dark-border"></div>
        <span className="text-text-secondary">
          <span className="text-accent-primary">{bpm}</span> BPM
        </span>
      </div>

      {/* Right: Audio State */}
      <div className="flex items-center gap-2">
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
  );
};
