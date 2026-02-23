/**
 * DeckTrackInfo - Track info display for one DJ deck
 *
 * Shows track name, BPM (LED-style), musical key (Camelot notation),
 * pitch %, elapsed time, beat phase, and analysis state indicator.
 * BPM turns green when matched to the other deck.
 * Key shows compatibility color with the other deck's key.
 */

import React, { useMemo } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { camelotDisplay, camelotColor, keyCompatibility, keyCompatibilityColor } from '@/engine/dj/DJKeyUtils';
import { DeckBeatPhase } from './DeckBeatPhase';

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
  const musicalKey = useDJStore((s) => s.decks[deckId].musicalKey);
  const seratoKey = useDJStore((s) => s.decks[deckId].seratoKey);
  const analysisState = useDJStore((s) => s.decks[deckId].analysisState);
  const analysisProgress = useDJStore((s) => s.decks[deckId].analysisProgress);
  const analysisBPM = useDJStore((s) => s.decks[deckId].beatGrid?.bpm ?? 0);
  const pitchOffset = useDJStore((s) => s.decks[deckId].pitchOffset);

  const otherDeckId = deckId === 'A' ? 'B' : 'A';
  const otherBPM = useDJStore((s) => s.decks[otherDeckId].effectiveBPM);
  const otherKey = useDJStore((s) => s.decks[otherDeckId].musicalKey ?? s.decks[otherDeckId].seratoKey);

  // Use analysis BPM if available, otherwise tracker-detected BPM
  const displayBPM = analysisBPM > 0 ? analysisBPM : (playbackMode === 'audio' ? detectedBPM : effectiveBPM);

  // Best available key: analysis > serato > null
  const displayKey = musicalKey ?? seratoKey ?? null;
  const camelot = camelotDisplay(displayKey);

  const isBPMMatched = useMemo(() => {
    return Math.abs(displayBPM - otherBPM) < BPM_MATCH_THRESHOLD;
  }, [displayBPM, otherBPM]);

  // Key compatibility with other deck
  const keyCompat = useMemo(() => {
    return keyCompatibility(displayKey, otherKey);
  }, [displayKey, otherKey]);

  const keyColor = useMemo(() => {
    if (!displayKey) return '#6b7280';
    // If other deck has a key, show compatibility color; otherwise show the key's own color
    if (otherKey) return keyCompatibilityColor(keyCompat);
    return camelotColor(displayKey);
  }, [displayKey, otherKey, keyCompat]);

  // Pitch offset as percentage (e.g., +3.2%, -1.5%)
  const pitchPercent = useMemo(() => {
    if (pitchOffset === 0) return null;
    const pct = (Math.pow(2, pitchOffset / 12) - 1) * 100;
    const sign = pct > 0 ? '+' : '';
    return `${sign}${pct.toFixed(1)}%`;
  }, [pitchOffset]);

  // Short key compatibility label
  const keyCompatLabel = useMemo(() => {
    if (!otherKey || !displayKey) return null;
    switch (keyCompat) {
      case 'perfect':      return 'MATCH';
      case 'compatible':   return 'COMPAT';
      case 'energy-boost': return 'ENERGY↑';
      case 'energy-drop':  return 'ENERGY↓';
      case 'mood-change':  return 'MOOD';
      case 'clash':        return 'CLASH';
      default:             return null;
    }
  }, [keyCompat, otherKey, displayKey]);

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

  // Analysis state indicator
  const analysisIndicator = useMemo(() => {
    const pct = analysisProgress > 0 ? ` ${analysisProgress}%` : '';
    switch (analysisState) {
      case 'pending':   return { text: 'QUEUE', color: 'text-yellow-600' };
      case 'rendering': return { text: `REND${pct}`,  color: 'text-blue-400' };
      case 'analyzing': return { text: `ANLZ${pct}`,  color: 'text-purple-400' };
      default:          return null;
    }
  }, [analysisState, analysisProgress]);

  return (
    <div className="flex flex-col gap-1 min-w-0">
      {/* Track name + analysis state */}
      <div className="flex items-center gap-2">
        <div
          className="text-sm text-text-primary truncate flex-1"
          title={trackName || 'No track loaded'}
        >
          {trackName || 'No track loaded'}
        </div>
        {analysisIndicator && (
          <span className={`text-[9px] font-bold ${analysisIndicator.color} animate-pulse tracking-wider flex-shrink-0`}>
            {analysisIndicator.text}
          </span>
        )}
      </div>

      {/* BPM, Key, and time row */}
      <div className="flex items-center gap-3">
        {/* Beat phase indicator (1-2-3-4) */}
        <DeckBeatPhase deckId={deckId} />

        {/* BPM display - LED style */}
        <span
          className={`font-mono text-2xl font-bold tabular-nums ${isBPMMatched ? 'text-accent-success' : 'text-text-primary'}`}
        >
          {displayBPM > 0 ? displayBPM.toFixed(1) : '---.-'}
        </span>
        <span className="text-xs text-text-muted uppercase tracking-wider">
          BPM
        </span>

        {/* Pitch percentage */}
        {pitchPercent && (
          <span className="font-mono text-xs tabular-nums text-text-secondary">
            {pitchPercent}
          </span>
        )}

        {/* Musical key — Camelot notation + compatibility label */}
        {displayKey && (
          <span
            className="font-mono text-sm font-semibold tabular-nums"
            style={{ color: keyColor }}
            title={`${displayKey} (${camelot})${otherKey ? ` • ${keyCompat} with ${camelotDisplay(otherKey)}` : ''}`}
          >
            {camelot}
            {keyCompatLabel && (
              <span className="ml-1 text-[9px] font-normal opacity-80">
                {keyCompatLabel}
              </span>
            )}
          </span>
        )}

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
