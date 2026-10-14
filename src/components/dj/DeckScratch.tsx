/**
 * DeckScratch - Scratch preset buttons and fader LFO controls.
 *
 * Layout:
 *   Pattern pad grid (wraps, every pattern reachable), then: Fader LFO: [Off] [1/4] [1/8] [1/16] [1/32]
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
import { CRATE_LOAD_ORDER } from '@/engine/dj/scratch/scratchCatalogue';
import { CustomSelect } from '@components/common/CustomSelect';
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
  { division: '1/4',  label: '1/4' },
  { division: '1/8',  label: '1/8' },
  { division: '1/16', label: '1/16' },
  { division: '1/32', label: '1/32' },
];

export const DeckScratch: React.FC<DeckScratchProps> = ({ deckId }) => {
  const activePatternName = useDJStore((s) => s.decks[deckId].activePatternName);
  const scratchVelocity = useDJStore((s) => s.decks[deckId].scratchVelocity);
  const scratchFaderGain = useDJStore((s) => s.decks[deckId].scratchFaderGain);
  const faderLFOActive = useDJStore((s) => s.decks[deckId].faderLFOActive);
  const faderLFODivision = useDJStore((s) => s.decks[deckId].faderLFODivision);

  const [waitingPattern, setWaitingPattern] = useState<string | null>(null);
  // Deck C is the scratch deck: its pads scratch the selected CRATE record on the scratch voice pool (same
  // voices the Auto DJ's scratch DJ uses); a track loaded on C does not change that.
  const isDeckC = deckId === 'C';
  const recordId = useDJStore((s) => s.deckCRecordId);
  const scratchOnly = useDJStore((s) => isDeckC && !s.decks.C.fileName);


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
      record: isDeckC ? useDJStore.getState().deckCRecordId : undefined,
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
  }, [deckId, activePatternName, isDeckC]);

  const handlePatternPointerUp = useCallback((patternName: string) => {
    // Tap or hold release: let the current cycle finish (no abrupt cut)
    const fxId = fxIdForPattern(patternName);
    if (fxId) releaseDjFx(fxId, { deck: deckId, source: 'pad', finishCycle: true, record: isDeckC ? useDJStore.getState().deckCRecordId : undefined });
    // Always clear active state so button goes inactive immediately
    useDJStore.getState().setDeckPattern(deckId, null);
    setWaitingPattern(null);
  }, [deckId, isDeckC]);

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
    <div className="flex flex-col gap-2 min-w-0">
      {isDeckC && (
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono text-text-muted">Record</span>
          <CustomSelect
            value={recordId}
            onChange={(id) => useDJStore.getState().setDeckCRecordId(id)}
            options={CRATE_LOAD_ORDER.map((r) => ({ value: r.id, label: r.canonicalName }))}
            title="Crate record the scratch pads play"
            className="min-w-0"
          />
        </div>
      )}
      {/* Pattern pad grid: wraps so every pattern is reachable at any deck width */}
      <div className="grid gap-1 min-w-0" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))' }}>
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
                min-w-0 px-1 py-1.5 rounded border font-mono text-[11px] leading-tight transition-all select-none
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
              {isWaiting ? 'Waiting' : getGesture(pattern.gestureId).name}
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

      {/* Fader LFO acts on a DeckEngine channel: nothing to drive on the scratch-only Deck C */}
      {!scratchOnly && <div className="h-px bg-white/10 flex-shrink-0" />}
      {!scratchOnly && <div className="flex items-center gap-1">
        <span className="text-xs font-mono text-white/30 mr-0.5">Fader LFO</span>

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
          Off
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
      </div>}
    </div>
  );
};
