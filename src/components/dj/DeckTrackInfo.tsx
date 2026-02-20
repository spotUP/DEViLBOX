/**
 * DeckTrackInfo - Track info display for one DJ deck
 *
 * Shows track name, BPM (LED-style), and elapsed time.
 * BPM turns green when matched to the other deck.
 */

import React, { useMemo } from 'react';
import { useDJStore } from '@/stores/useDJStore';

interface DeckTrackInfoProps {
  deckId: 'A' | 'B';
}

const BPM_MATCH_THRESHOLD = 0.5; // BPM within 0.5 = "matched"

export const DeckTrackInfo: React.FC<DeckTrackInfoProps> = ({ deckId }) => {
  const trackName = useDJStore((s) => s.decks[deckId].trackName);
  const effectiveBPM = useDJStore((s) => s.decks[deckId].effectiveBPM);
  const elapsedMs = useDJStore((s) => s.decks[deckId].elapsedMs);

  const otherDeckId = deckId === 'A' ? 'B' : 'A';
  const otherBPM = useDJStore((s) => s.decks[otherDeckId].effectiveBPM);

  const isBPMMatched = useMemo(() => {
    return Math.abs(effectiveBPM - otherBPM) < BPM_MATCH_THRESHOLD;
  }, [effectiveBPM, otherBPM]);

  // Format elapsed time as MM:SS
  const formattedTime = useMemo(() => {
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, [elapsedMs]);

  return (
    <div className="flex flex-col gap-1 min-w-0">
      {/* Track name */}
      <div
        className="text-sm text-text-primary truncate"
        title={trackName || 'No track loaded'}
      >
        {trackName || 'No track loaded'}
      </div>

      {/* BPM and elapsed time row */}
      <div className="flex items-baseline gap-3">
        {/* BPM display - LED style */}
        <span
          className="font-mono text-2xl font-bold tabular-nums"
          style={{
            color: isBPMMatched ? '#22c55e' : '#e2e8f0',
            textShadow: isBPMMatched
              ? '0 0 8px #22c55e'
              : '0 0 8px currentColor',
          }}
        >
          {effectiveBPM.toFixed(1)}
        </span>
        <span className="text-xs text-text-muted uppercase tracking-wider">
          BPM
        </span>

        {/* Elapsed time */}
        <span
          className="font-mono text-sm text-text-secondary tabular-nums"
          style={{ textShadow: '0 0 4px rgba(148,163,184,0.3)' }}
        >
          {formattedTime}
        </span>
      </div>
    </div>
  );
};
