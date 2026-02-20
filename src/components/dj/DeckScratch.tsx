/**
 * DeckScratch - Scratch preset buttons and fader LFO controls.
 *
 * Layout:
 *   [Baby] [Trans] [Flare] [Hydro] [Crab] [Orbit]    LFO: [OFF] [¼] [⅛] [⅟₁₆] [⅟₃₂]
 *
 * Pattern buttons toggle looping scratch routines that combine velocity curves
 * and fader automation. Beat-quantized start: button pulses "WAIT" while waiting
 * for next beat boundary.
 *
 * Fader LFO buttons schedule rapid fader chops at a given beat division, synced
 * to the deck's current effectiveBPM. The LFO automatically rescheduled if BPM
 * changes by > 2% (handled in DJDeck RAF via deck.notifyBPMChange).
 */

import React, { useState, useCallback } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { SCRATCH_PATTERNS } from '@/engine/dj/DJScratchEngine';

interface DeckScratchProps {
  deckId: 'A' | 'B';
}

type FaderLFODivision = '1/4' | '1/8' | '1/16' | '1/32';

const LFO_LABELS: { division: FaderLFODivision; label: string }[] = [
  { division: '1/4',  label: '¼' },
  { division: '1/8',  label: '⅛' },
  { division: '1/16', label: '⅟₁₆' },
  { division: '1/32', label: '⅟₃₂' },
];

export const DeckScratch: React.FC<DeckScratchProps> = ({ deckId }) => {
  const activePatternName = useDJStore((s) => s.decks[deckId].activePatternName);
  const faderLFOActive = useDJStore((s) => s.decks[deckId].faderLFOActive);
  const faderLFODivision = useDJStore((s) => s.decks[deckId].faderLFODivision);

  const [waitingPattern, setWaitingPattern] = useState<string | null>(null);

  const isB = deckId === 'B';
  const deckColor = isB ? 'text-red-400' : 'text-blue-400';
  const deckActiveBg = isB ? 'bg-red-900/40 border-red-500/60' : 'bg-blue-900/40 border-blue-500/60';
  const deckWaitBg = isB ? 'bg-red-900/20 border-red-500/30' : 'bg-blue-900/20 border-blue-500/30';

  const getDeck = useCallback(() => getDJEngine().getDeck(deckId), [deckId]);

  // ── Pattern buttons ──────────────────────────────────────────────────────

  const handlePatternClick = useCallback((patternName: string) => {
    const store = useDJStore.getState();

    if (activePatternName === patternName) {
      // Toggle off
      try { getDeck().stopPattern(); } catch { /* engine not ready */ }
      store.setDeckPattern(deckId, null);
      setWaitingPattern(null);
      return;
    }

    // Stop any existing pattern
    if (activePatternName) {
      try { getDeck().stopPattern(); } catch { /* engine not ready */ }
      store.setDeckPattern(deckId, null);
    }

    setWaitingPattern(patternName);

    // Track whether the onWaiting callback fired synchronously
    let quantizeWaitMs = 0;

    try {
      getDeck().playPattern(patternName, (waitMs) => {
        // Pattern is waiting for beat boundary
        quantizeWaitMs = waitMs;
        setTimeout(() => {
          setWaitingPattern(null);
          store.setDeckPattern(deckId, patternName);
        }, waitMs);
      });
    } catch {
      setWaitingPattern(null);
      return;
    }

    // If no quantize delay (immediate start), update state right away
    if (quantizeWaitMs === 0) {
      setWaitingPattern(null);
      store.setDeckPattern(deckId, patternName);
    }
  }, [deckId, activePatternName, getDeck]);

  // ── Fader LFO buttons ────────────────────────────────────────────────────

  const handleLFOClick = useCallback((division: FaderLFODivision | null) => {
    const store = useDJStore.getState();

    if (division === null || (faderLFOActive && faderLFODivision === division)) {
      // Turn off
      try { getDeck().stopFaderLFO(); } catch { /* engine not ready */ }
      store.setDeckFaderLFO(deckId, false);
      return;
    }

    try { getDeck().startFaderLFO(division); } catch { /* engine not ready */ }
    store.setDeckFaderLFO(deckId, true, division);
  }, [deckId, faderLFOActive, faderLFODivision, getDeck]);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Pattern buttons */}
      <div className="flex items-center gap-1">
        {SCRATCH_PATTERNS.map((pattern) => {
          const isActive = activePatternName === pattern.name;
          const isWaiting = waitingPattern === pattern.name;
          return (
            <button
              key={pattern.name}
              onClick={() => handlePatternClick(pattern.name)}
              className={`
                px-2 py-0.5 rounded border font-mono text-xs tracking-wider transition-all
                ${isActive
                  ? `${deckActiveBg} ${deckColor}`
                  : isWaiting
                    ? `${deckWaitBg} ${deckColor} animate-pulse`
                    : 'bg-transparent border-white/10 text-white/40 hover:border-white/30 hover:text-white/70'
                }
              `}
              title={pattern.name}
            >
              {isWaiting ? 'WAIT' : pattern.shortName}
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-white/10 flex-shrink-0" />

      {/* Fader LFO */}
      <div className="flex items-center gap-1">
        <span className="text-xs font-mono text-white/30 mr-0.5">LFO</span>

        {/* OFF button */}
        <button
          onClick={() => handleLFOClick(null)}
          className={`
            px-2 py-0.5 rounded border font-mono text-xs tracking-wider transition-all
            ${!faderLFOActive
              ? `${deckActiveBg} ${deckColor}`
              : 'bg-transparent border-white/10 text-white/40 hover:border-white/30 hover:text-white/70'
            }
          `}
        >
          OFF
        </button>

        {LFO_LABELS.map(({ division, label }) => {
          const isActive = faderLFOActive && faderLFODivision === division;
          return (
            <button
              key={division}
              onClick={() => handleLFOClick(division)}
              className={`
                px-2 py-0.5 rounded border font-mono text-xs tracking-wider transition-all
                ${isActive
                  ? `${deckActiveBg} ${deckColor}`
                  : 'bg-transparent border-white/10 text-white/40 hover:border-white/30 hover:text-white/70'
                }
              `}
              title={`Fader LFO ${division} note`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
