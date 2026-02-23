/**
 * DeckTrackInfo - Track info display for one DJ deck
 *
 * Shows track name, BPM (LED-style), and elapsed time.
 * BPM turns green when matched to the other deck.
 */

import React, { useMemo } from 'react';
import { useDJStore } from '@/stores/useDJStore';

interface DeckTrackInfoProps {
  deckId: 'A' | 'B' | 'C';
}

const BPM_MATCH_THRESHOLD = 0.5; // BPM within 0.5 = "matched"

export const DeckTrackInfo: React.FC<DeckTrackInfoProps> = ({ deckId }) => {
  const trackName = useDJStore((s) => s.decks[deckId].trackName);
  const effectiveBPM = useDJStore((s) => s.decks[deckId].effectiveBPM);
  const detectedBPM = useDJStore((s) => s.decks[deckId].detectedBPM);
  const elapsedMs = useDJStore((s) => s.decks[deckId].elapsedMs);
  const playbackMode = useDJStore((s) => s.decks[deckId].playbackMode);
  const durationMs = useDJStore((s) => s.decks[deckId].durationMs);

  const otherDeckId = deckId === 'A' ? 'B' : 'A';
  const otherBPM = useDJStore((s) => s.decks[otherDeckId].effectiveBPM);

  const displayBPM = playbackMode === 'audio' ? detectedBPM : effectiveBPM;

  const isBPMMatched = useMemo(() => {
    return Math.abs(displayBPM - otherBPM) < BPM_MATCH_THRESHOLD;
  }, [displayBPM, otherBPM]);

  // Format elapsed time as MM:SS
  const formattedTime = useMemo(() => {
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, [elapsedMs]);

  // Format remaining time for audio mode
  const formattedRemaining = useMemo(() => {
    if (playbackMode !== 'audio' || durationMs <= 0) return null;
    const remainMs = Math.max(0, durationMs - elapsedMs);
    const totalSeconds = Math.floor(remainMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `-${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, [playbackMode, durationMs, elapsedMs]);

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
          className={`font-mono text-2xl font-bold tabular-nums ${isBPMMatched ? 'text-accent-success' : 'text-text-primary'}`}
        >
          {displayBPM > 0 ? displayBPM.toFixed(1) : '---.-'}
        </span>
        <span className="text-xs text-text-muted uppercase tracking-wider">
          BPM
        </span>

        {/* Elapsed time */}
        <span className="font-mono text-sm text-text-secondary tabular-nums">
          {formattedTime}
        </span>

        {/* Remaining time (audio mode only) */}
        {formattedRemaining && (
          <span className="font-mono text-sm text-text-muted tabular-nums">
            {formattedRemaining}
          </span>
        )}
      </div>
    </div>
  );
};
