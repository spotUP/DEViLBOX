/**
 * DeckScratch - Scratch preset buttons and fader LFO controls.
 *
 * Layout:
 *   [Baby Scratch] [Transformer] [Two-Click Flare] ...    LFO: [OFF] [¼] [⅛] [⅟₁₆] [⅟₃₂]
 *   Button labels are the gesture's full English name (CLAUDE.md, ledger SCR-P1.12).
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
import { SCRATCH_PATTERNS } from '@/engine/dj/DJScratchEngine';
import { getGesture } from '@/engine/dj/scratch/scratchGestureCatalog';
import { fireDjFx, releaseDjFx } from '@/engine/drumpad/DjFxActions';
import { fxIdForPattern } from '@/engine/dj/scratch/scratchActionMap';
import {
  startDeckFaderLFO,
  stopDeckFaderLFO,
} from '@/engine/dj/DJActions';

interface DeckScratchProps {
  deckId: 'A' | 'B' | 'C';
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
  const scratchVelocity = useDJStore((s) => s.decks[deckId].scratchVelocity);
  const scratchFaderGain = useDJStore((s) => s.decks[deckId].scratchFaderGain);
  const faderLFOActive = useDJStore((s) => s.decks[deckId].faderLFOActive);
  const faderLFODivision = useDJStore((s) => s.decks[deckId].faderLFODivision);

  const [waitingPattern, setWaitingPattern] = useState<string | null>(null);


  const isB = deckId === 'B';
  const deckColor = isB ? 'text-deck-b' : 'text-deck-a';
  const deckActiveBg = isB ? 'bg-deck-b/20 border-deck-b/60' : 'bg-deck-a/20 border-deck-a/60';
  const deckWaitBg = isB ? 'bg-deck-b/10 border-deck-b/30' : 'bg-deck-a/10 border-deck-a/30';

  // ── Pattern buttons ──────────────────────────────────────────────────────

  const handlePatternPointerDown = useCallback((patternName: string, e: React.PointerEvent) => {
    // Capture pointer so pointerup fires on this element even if cursor leaves
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    // Ignore if any routine is already running (including this one)
    if (activePatternName !== null) return;

    const store = useDJStore.getState();

    setWaitingPattern(patternName);
    let quantizeWaitMs = 0;

    // One action path (owner scratch plan section 81): the button fires the
    // same registry action the pads, keyboard, MIDI, MCP and Auto DJ use.
    const fxId = fxIdForPattern(patternName);
    const ok = fxId !== null && fireDjFx(fxId, {
      deck: deckId,
      source: 'pad',
      onWaiting: (waitMs) => {
        quantizeWaitMs = waitMs;
        setTimeout(() => {
          setWaitingPattern(null);
          store.setDeckPattern(deckId, patternName);
        }, waitMs);
      },
    });
    if (!ok) {
      setWaitingPattern(null);
      return;
    }

    if (quantizeWaitMs === 0) {
      setWaitingPattern(null);
      store.setDeckPattern(deckId, patternName);
    }
  }, [deckId, activePatternName]);

  const handlePatternPointerUp = useCallback((patternName: string) => {
    // Tap or hold release: let the current cycle finish (no abrupt cut)
    const fxId = fxIdForPattern(patternName);
    if (fxId) releaseDjFx(fxId, { deck: deckId, source: 'pad', finishCycle: true });
    // Always clear active state so button goes inactive immediately
    useDJStore.getState().setDeckPattern(deckId, null);
    setWaitingPattern(null);
  }, [deckId]);

  // ── Fader LFO buttons ────────────────────────────────────────────────────

  const handleLFOClick = useCallback((division: FaderLFODivision | null) => {
    const store = useDJStore.getState();

    if (division === null || (faderLFOActive && faderLFODivision === division)) {
      // Turn off
      stopDeckFaderLFO(deckId);
      store.setDeckFaderLFO(deckId, false);
      return;
    }

    startDeckFaderLFO(deckId, division);
    store.setDeckFaderLFO(deckId, true, division);
  }, [deckId, faderLFOActive, faderLFODivision]);

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
                      : 'bg-transparent border-white/10 text-white/40 hover:border-white/30 hover:text-text-primary/70'
                }
              `}
              title={pattern.name}
            >
              {isWaiting ? 'WAIT' : getGesture(pattern.gestureId).name}
            </button>
          );
        })}
      </div>

      {/* Scratch status — velocity direction + fader state when a pattern or LFO is active */}
      {(activePatternName || faderLFOActive) && (
        <div className={`flex items-center gap-1 font-mono text-xs ${deckColor}`}>
          {activePatternName && (
            <>
              <span className="opacity-60">
                {scratchVelocity > 0.1 ? '>' : scratchVelocity < -0.1 ? '<' : '|'}
              </span>
              <span className="w-6 text-right tabular-nums opacity-80">
                {Math.abs(scratchVelocity).toFixed(1)}
              </span>
            </>
          )}
          {/* Fader state: mini bar showing open/cut */}
          <div
            className="rounded-sm border"
            style={{
              width: 4,
              height: 12,
              borderColor: isB ? 'rgba(248, 113, 113, 0.4)' : 'rgba(96, 165, 250, 0.4)',
              backgroundColor: scratchFaderGain > 0.5
                ? (isB ? 'rgba(248, 113, 113, 0.7)' : 'rgba(96, 165, 250, 0.7)')
                : 'transparent',
            }}
          />
        </div>
      )}

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
              : 'bg-transparent border-white/10 text-white/40 hover:border-white/30 hover:text-text-primary/70'
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
                  : 'bg-transparent border-white/10 text-white/40 hover:border-white/30 hover:text-text-primary/70'
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
