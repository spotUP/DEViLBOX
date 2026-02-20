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

import React, { useState, useRef, useCallback } from 'react';
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

  // Hold vs tap: >= TAP_MS held → stop immediately on release; < TAP_MS → finish current cycle
  const TAP_MS = 300;
  const pressTimeRef = useRef<number>(0);

  const isB = deckId === 'B';
  const deckColor = isB ? 'text-red-400' : 'text-blue-400';
  const deckActiveBg = isB ? 'bg-red-900/40 border-red-500/60' : 'bg-blue-900/40 border-blue-500/60';
  const deckWaitBg = isB ? 'bg-red-900/20 border-red-500/30' : 'bg-blue-900/20 border-blue-500/30';

  const getDeck = useCallback(() => getDJEngine().getDeck(deckId), [deckId]);

  // ── Pattern buttons ──────────────────────────────────────────────────────

  const handlePatternPointerDown = useCallback((patternName: string, e: React.PointerEvent) => {
    // Capture pointer so pointerup fires on this element even if cursor leaves
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    console.log(`[DeckScratch ${deckId}] pointerDown: pattern="${patternName}" activePatternName=${activePatternName}`);

    // Ignore if any routine is already running (including this one)
    if (activePatternName !== null) {
      console.log(`[DeckScratch ${deckId}] BLOCKED — activePatternName is "${activePatternName}"`);
      return;
    }

    pressTimeRef.current = performance.now();
    const store = useDJStore.getState();

    setWaitingPattern(patternName);
    let quantizeWaitMs = 0;

    try {
      getDeck().playPattern(patternName, (waitMs) => {
        quantizeWaitMs = waitMs;
        console.log(`[DeckScratch ${deckId}] quantize callback: waitMs=${waitMs}`);
        setTimeout(() => {
          setWaitingPattern(null);
          store.setDeckPattern(deckId, patternName);
        }, waitMs);
      });
    } catch (err) {
      console.error(`[DeckScratch ${deckId}] playPattern THREW:`, err);
      setWaitingPattern(null);
      return;
    }

    if (quantizeWaitMs === 0) {
      console.log(`[DeckScratch ${deckId}] no quantize wait — activating immediately`);
      setWaitingPattern(null);
      store.setDeckPattern(deckId, patternName);
    }
  }, [deckId, activePatternName, getDeck]);

  const handlePatternPointerUp = useCallback((_patternName: string) => {
    const held = performance.now() - pressTimeRef.current;
    console.log(`[DeckScratch ${deckId}] pointerUp: held=${held.toFixed(0)}ms (TAP_MS=${TAP_MS})`);
    if (held < TAP_MS) {
      // Tap: let current cycle finish then stop (store cleared by DJDeck RAF)
      console.log(`[DeckScratch ${deckId}] TAP — calling finishPatternCycle()`);
      try { getDeck().finishPatternCycle(); } catch (err) { console.error(`[DeckScratch ${deckId}] finishPatternCycle THREW:`, err); }
    } else {
      // Hold release: stop immediately
      console.log(`[DeckScratch ${deckId}] HOLD RELEASE — calling stopPattern()`);
      try { getDeck().stopPattern(); } catch (err) { console.error(`[DeckScratch ${deckId}] stopPattern THREW:`, err); }
      useDJStore.getState().setDeckPattern(deckId, null);
      setWaitingPattern(null);
    }
  }, [deckId, getDeck]);

  // ── Fader LFO buttons ────────────────────────────────────────────────────

  const handleLFOClick = useCallback((division: FaderLFODivision | null) => {
    const store = useDJStore.getState();

    console.log(`[DeckScratch ${deckId}] LFO click: division=${division}, faderLFOActive=${faderLFOActive}, faderLFODivision=${faderLFODivision}`);

    if (division === null || (faderLFOActive && faderLFODivision === division)) {
      // Turn off
      console.log(`[DeckScratch ${deckId}] LFO → OFF`);
      try { getDeck().stopFaderLFO(); } catch (err) { console.error(`[DeckScratch ${deckId}] stopFaderLFO THREW:`, err); }
      store.setDeckFaderLFO(deckId, false);
      return;
    }

    console.log(`[DeckScratch ${deckId}] LFO → START ${division}`);
    try { getDeck().startFaderLFO(division); } catch (err) { console.error(`[DeckScratch ${deckId}] startFaderLFO THREW:`, err); }
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
              onPointerDown={(e) => handlePatternPointerDown(pattern.name, e)}
              onPointerUp={() => handlePatternPointerUp(pattern.name)}
              onContextMenu={(e) => e.preventDefault()}
              className={`
                px-2 py-0.5 rounded border font-mono text-xs tracking-wider transition-all select-none
                ${isActive
                  ? `${deckActiveBg} ${deckColor}`
                  : isWaiting
                    ? `${deckWaitBg} ${deckColor} animate-pulse`
                    : activePatternName !== null
                      ? 'bg-transparent border-white/5 text-white/20 cursor-not-allowed'
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
