/**
 * DeckLoopControls - Loop controls for one DJ deck
 *
 * Tracker mode: Loop ON/OFF toggle (cyan glow), loop size selector (1/2/4/8/16/32)
 * Audio mode: Loop IN / Loop OUT markers + loop toggle + auto-loop bar buttons
 * Both modes: Slip mode toggle (amber).
 */

import React, { useCallback, useRef } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';

interface DeckLoopControlsProps {
  deckId: 'A' | 'B' | 'C';
}

const LOOP_SIZES = [1, 2, 4, 8, 16, 32] as const;
type LoopSize = (typeof LOOP_SIZES)[number];

const AUTO_LOOP_BARS = [1, 2, 4, 8] as const;

export const DeckLoopControls: React.FC<DeckLoopControlsProps> = ({ deckId }) => {
  const loopActive = useDJStore((s) => s.decks[deckId].loopActive);
  const lineLoopSize = useDJStore((s) => s.decks[deckId].lineLoopSize);
  const slipEnabled = useDJStore((s) => s.decks[deckId].slipEnabled);
  const playbackMode = useDJStore((s) => s.decks[deckId].playbackMode);
  const audioLoopIn = useDJStore((s) => s.decks[deckId].audioLoopIn);
  const audioLoopOut = useDJStore((s) => s.decks[deckId].audioLoopOut);
  const setDeckLoop = useDJStore((s) => s.setDeckLoop);
  const setDeckLoopSize = useDJStore((s) => s.setDeckLoopSize);
  const setDeckSlip = useDJStore((s) => s.setDeckSlip);

  // Track which auto-loop bar size was last used (for highlight)
  const activeBarRef = useRef<number | null>(null);
  const activeBar = loopActive ? activeBarRef.current : null;

  // ── Tracker loop toggle ──
  const handleLoopToggle = useCallback(() => {
    const engine = getDJEngine();
    const deck = engine.getDeck(deckId);

    if (playbackMode === 'audio') {
      if (loopActive) {
        deck.clearAudioLoop();
        setDeckLoop(deckId, 'off', false);
        activeBarRef.current = null;
      } else if (audioLoopIn !== null && audioLoopOut !== null && audioLoopOut > audioLoopIn) {
        deck.setAudioLoop(audioLoopIn, audioLoopOut);
        setDeckLoop(deckId, 'line', true);
      }
    } else {
      if (loopActive) {
        deck.clearLineLoop();
        setDeckLoop(deckId, 'off', false);
      } else {
        deck.setLineLoop(lineLoopSize);
        setDeckLoop(deckId, 'line', true);
      }
    }
  }, [deckId, loopActive, lineLoopSize, setDeckLoop, playbackMode, audioLoopIn, audioLoopOut]);

  // ── Tracker loop size (update size; re-engage if already looping) ──
  const handleSizeChange = useCallback(
    (size: LoopSize) => {
      setDeckLoopSize(deckId, size);
      if (loopActive) {
        // Re-engage loop at new size from current position
        const engine = getDJEngine();
        const deck = engine.getDeck(deckId);
        deck.setLineLoop(size);
      }
    },
    [deckId, loopActive, setDeckLoopSize]
  );

  // ── Audio loop in/out ──
  const handleSetLoopIn = useCallback(() => {
    try {
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);
      const pos = deck.audioPlayer.getPosition();
      const store = useDJStore.getState();
      store.setAudioLoopIn(deckId, pos);

      const currentOut = store.decks[deckId].audioLoopOut;
      if (currentOut !== null && currentOut > pos) {
        deck.setAudioLoop(pos, currentOut);
        store.setDeckLoop(deckId, 'line', true);
      }
    } catch { /* engine not ready */ }
  }, [deckId]);

  const handleSetLoopOut = useCallback(() => {
    try {
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);
      const pos = deck.audioPlayer.getPosition();
      const store = useDJStore.getState();
      store.setAudioLoopOut(deckId, pos);

      const currentIn = store.decks[deckId].audioLoopIn;
      if (currentIn !== null && pos > currentIn) {
        deck.setAudioLoop(currentIn, pos);
        store.setDeckLoop(deckId, 'line', true);
      }
    } catch { /* engine not ready */ }
  }, [deckId]);

  const handleClearAudioLoop = useCallback(() => {
    try {
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);
      deck.clearAudioLoop();
      const store = useDJStore.getState();
      store.setAudioLoopIn(deckId, null);
      store.setAudioLoopOut(deckId, null);
      store.setDeckLoop(deckId, 'off', false);
      activeBarRef.current = null;
    } catch { /* engine not ready */ }
  }, [deckId]);

  // ── Auto-loop bar button (beat-snapped) ──
  const handleAutoLoop = useCallback(
    (bars: number) => {
      try {
        const engine = getDJEngine();
        const deck = engine.getDeck(deckId);
        const state = useDJStore.getState().decks[deckId];
        const bpm = state.beatGrid?.bpm || state.detectedBPM || state.effectiveBPM || 120;
        const beatSec = 60 / bpm;
        const loopDuration = bars * 4 * beatSec;
        const rawPos = deck.audioPlayer.getPosition();

        // Snap start to nearest beat if beat grid available
        const grid = state.beatGrid;
        let inPos = rawPos;
        if (grid && grid.beats && grid.beats.length > 0) {
          // Snap DOWN to nearest beat boundary (quantize start)
          const beats = grid.beats;
          let lo = 0, hi = beats.length - 1;
          while (lo < hi) {
            const mid = (lo + hi + 1) >>> 1;
            if (beats[mid] <= rawPos) lo = mid;
            else hi = mid - 1;
          }
          inPos = beats[lo];
        }
        const outPos = inPos + loopDuration;

        const store = useDJStore.getState();
        store.setAudioLoopIn(deckId, inPos);
        store.setAudioLoopOut(deckId, outPos);
        deck.setAudioLoop(inPos, outPos);
        store.setDeckLoop(deckId, 'line', true);
        activeBarRef.current = bars;
      } catch { /* engine not ready */ }
    },
    [deckId]
  );

  // ── Slip ──
  const handleSlipToggle = useCallback(() => {
    const engine = getDJEngine();
    const deck = engine.getDeck(deckId);
    const newSlip = !slipEnabled;
    deck.setSlipEnabled(newSlip);
    setDeckSlip(deckId, newSlip);
  }, [deckId, slipEnabled, setDeckSlip]);

  const isAudio = playbackMode === 'audio';
  const audioLoopReady = audioLoopIn !== null && audioLoopOut !== null;

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      {/* Loop ON/OFF toggle — strong ring when active */}
      <button
        onClick={handleLoopToggle}
        className={`
          relative flex items-center justify-center font-mono text-xs font-bold
          rounded-sm transition-all duration-100 select-none
          active:translate-y-[0.5px]
          ${
            loopActive
              ? 'bg-accent-highlight text-dark-bg ring-2 ring-accent-highlight ring-offset-1 ring-offset-dark-bg shadow-[0_0_8px_rgba(0,255,255,0.4)]'
              : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover border border-dark-border'
          }
        `}
        style={{ width: 40, height: 40 }}
        title={loopActive ? 'Disable loop' : isAudio ? (audioLoopReady ? 'Enable loop' : 'Set IN/OUT first') : 'Enable loop'}
      >
        LOOP
      </button>

      {isAudio ? (
        /* Audio mode: IN / OUT markers + auto-loop bars */
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <button
            onClick={handleSetLoopIn}
            className={`
              flex items-center justify-center font-mono font-bold
              transition-all duration-75 select-none rounded-l-sm
              ${audioLoopIn !== null
                ? 'bg-accent-highlight/60 text-accent-highlight ring-1 ring-accent-highlight/50'
                : 'bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover hover:text-text-secondary'
              }
            `}
            style={{ height: 40, fontSize: 10, width: 28, minWidth: 28 }}
            title={audioLoopIn !== null ? `Loop IN: ${formatSec(audioLoopIn)}` : 'Set loop IN at current position'}
          >
            IN
          </button>
          <button
            onClick={handleSetLoopOut}
            className={`
              flex items-center justify-center font-mono font-bold
              transition-all duration-75 select-none
              ${audioLoopOut !== null
                ? 'bg-accent-highlight/60 text-accent-highlight ring-1 ring-accent-highlight/50'
                : 'bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover hover:text-text-secondary'
              }
            `}
            style={{ height: 40, fontSize: 10, width: 32, minWidth: 32 }}
            title={audioLoopOut !== null ? `Loop OUT: ${formatSec(audioLoopOut)}` : 'Set loop OUT at current position'}
          >
            OUT
          </button>
          {/* Auto-loop bar sizes (beat-snapped) */}
          {AUTO_LOOP_BARS.map((bars) => {
            const isThisBar = activeBar === bars;
            return (
              <button
                key={bars}
                onClick={() => handleAutoLoop(bars)}
                className={`
                  flex items-center justify-center font-mono font-bold
                  transition-all duration-75 select-none
                  ${
                    isThisBar
                      ? 'bg-accent-highlight text-dark-bg ring-1 ring-accent-highlight/60'
                      : 'bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover'
                  }
                `}
                style={{ height: 40, width: 28, fontSize: 9 }}
                title={`Auto-loop ${bars} bar${bars > 1 ? 's' : ''}`}
              >
                {bars}
              </button>
            );
          })}
          <button
            onClick={handleClearAudioLoop}
            className="flex items-center justify-center font-mono font-bold rounded-r-sm
              transition-all duration-75 select-none bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover hover:text-red-400"
            style={{ height: 40, width: 28, fontSize: 8 }}
            title="Clear loop"
          >
            CLR
          </button>
        </div>
      ) : (
        /* Tracker mode: Loop size selector */
        <div className="flex items-center gap-px flex-1 min-w-0">
          {LOOP_SIZES.map((size) => {
            const isActive = lineLoopSize === size && loopActive;
            const isSelected = lineLoopSize === size;
            return (
              <button
                key={size}
                onClick={() => handleSizeChange(size)}
                className={`
                  flex-1 flex items-center justify-center font-mono font-bold
                  transition-all duration-75 select-none
                  ${
                    isActive
                      ? 'bg-accent-highlight text-dark-bg ring-1 ring-accent-highlight/60'
                      : isSelected
                        ? 'bg-dark-borderLight text-text-primary'
                        : 'bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover hover:text-text-secondary'
                  }
                  ${size === LOOP_SIZES[0] ? 'rounded-l-sm' : ''}
                  ${size === LOOP_SIZES[LOOP_SIZES.length - 1] ? 'rounded-r-sm' : ''}
                `}
                style={{ height: 40, fontSize: size >= 10 ? 9 : 11, minWidth: 24 }}
                title={`Loop ${size} rows`}
              >
                {size}
              </button>
            );
          })}
        </div>
      )}

      {/* Slip mode toggle — amber ring when active */}
      <button
        onClick={handleSlipToggle}
        className={`
          relative flex items-center justify-center font-mono text-xs font-bold
          rounded-sm transition-all duration-100 select-none
          active:translate-y-[0.5px]
          ${
            slipEnabled
              ? 'bg-amber-600 text-text-primary ring-2 ring-amber-500 ring-offset-1 ring-offset-dark-bg shadow-[0_0_8px_rgba(255,191,0,0.3)]'
              : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover border border-dark-border'
          }
        `}
        style={{ width: 40, height: 40 }}
        title={slipEnabled ? 'Disable slip mode' : 'Enable slip mode'}
      >
        SLIP
      </button>
    </div>
  );
};

function formatSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}
