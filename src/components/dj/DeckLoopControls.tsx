/**
 * DeckLoopControls - Loop controls for one DJ deck
 *
 * Tracker mode: Loop ON/OFF toggle (cyan glow), loop size selector (1/2/4/8/16/32)
 * Audio mode: Loop IN / Loop OUT markers + loop toggle
 * Both modes: Slip mode toggle (amber).
 */

import React, { useCallback } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';

interface DeckLoopControlsProps {
  deckId: 'A' | 'B' | 'C';
}

const LOOP_SIZES = [1, 2, 4, 8, 16, 32] as const;
type LoopSize = (typeof LOOP_SIZES)[number];

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

  // ── Tracker loop toggle ──
  const handleLoopToggle = useCallback(() => {
    const engine = getDJEngine();
    const deck = engine.getDeck(deckId);

    if (playbackMode === 'audio') {
      // Audio mode — toggle loop (only if both in/out are set)
      if (loopActive) {
        deck.clearAudioLoop();
        setDeckLoop(deckId, 'off', false);
      } else if (audioLoopIn !== null && audioLoopOut !== null) {
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

  // ── Tracker loop size ──
  const handleSizeChange = useCallback(
    (size: LoopSize) => {
      setDeckLoopSize(deckId, size);
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);
      deck.setLineLoop(size);
      if (!loopActive) {
        setDeckLoop(deckId, 'line', true);
      }
    },
    [deckId, loopActive, setDeckLoopSize, setDeckLoop]
  );

  // ── Audio loop in/out ──
  const handleSetLoopIn = useCallback(() => {
    try {
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);
      const pos = deck.audioPlayer.getPosition();
      const store = useDJStore.getState();
      store.setAudioLoopIn(deckId, pos);

      // If out is already set and valid, activate the loop
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

      // If in is already set and valid, activate the loop
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
      useDJStore.getState().setAudioLoopIn(deckId, null);
      useDJStore.getState().setAudioLoopOut(deckId, null);
      useDJStore.getState().setDeckLoop(deckId, 'off', false);
    } catch { /* engine not ready */ }
  }, [deckId]);

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
      {/* Loop ON/OFF toggle */}
      <button
        onClick={handleLoopToggle}
        className={`
          relative flex items-center justify-center font-mono text-xs font-bold
          rounded-sm transition-all duration-100 select-none border border-dark-border
          active:translate-y-[0.5px]
          ${
            loopActive
              ? 'bg-cyan-600 text-white'
              : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
          }
        `}
        style={{ width: 40, height: 40 }}
        title={loopActive ? 'Disable loop' : isAudio ? (audioLoopReady ? 'Enable loop' : 'Set IN/OUT first') : 'Enable loop'}
      >
        <div
          className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${
            loopActive ? 'bg-cyan-300' : 'bg-dark-border'
          }`}
        />
        LOOP
      </button>

      {isAudio ? (
        /* Audio mode: IN / OUT markers */
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <button
            onClick={handleSetLoopIn}
            className={`
              flex-1 flex items-center justify-center font-mono font-bold
              transition-all duration-75 select-none rounded-l-sm
              ${audioLoopIn !== null
                ? 'bg-cyan-700/60 text-cyan-200'
                : 'bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover hover:text-text-secondary'
              }
            `}
            style={{ height: 40, fontSize: 10, minWidth: 36 }}
            title={audioLoopIn !== null ? `Loop IN: ${formatSec(audioLoopIn)}` : 'Set loop IN at current position'}
          >
            IN
          </button>
          <button
            onClick={handleSetLoopOut}
            className={`
              flex-1 flex items-center justify-center font-mono font-bold
              transition-all duration-75 select-none
              ${audioLoopOut !== null
                ? 'bg-cyan-700/60 text-cyan-200'
                : 'bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover hover:text-text-secondary'
              }
            `}
            style={{ height: 40, fontSize: 10, minWidth: 36 }}
            title={audioLoopOut !== null ? `Loop OUT: ${formatSec(audioLoopOut)}` : 'Set loop OUT at current position'}
          >
            OUT
          </button>
          {/* Auto-loop sizes (seconds-based using beat grid) */}
          {([1, 2, 4, 8] as const).map((bars) => (
            <button
              key={bars}
              onClick={() => {
                try {
                  const engine = getDJEngine();
                  const deck = engine.getDeck(deckId);
                  const state = useDJStore.getState().decks[deckId];
                  const bpm = state.beatGrid?.bpm || state.detectedBPM || state.effectiveBPM || 120;
                  const beatSec = 60 / bpm;
                  const pos = deck.audioPlayer.getPosition();
                  const loopDuration = bars * 4 * beatSec; // bars * beats_per_bar * sec_per_beat
                  const inPos = pos;
                  const outPos = pos + loopDuration;

                  useDJStore.getState().setAudioLoopIn(deckId, inPos);
                  useDJStore.getState().setAudioLoopOut(deckId, outPos);
                  deck.setAudioLoop(inPos, outPos);
                  useDJStore.getState().setDeckLoop(deckId, 'line', true);
                } catch { /* engine not ready */ }
              }}
              className={`
                flex items-center justify-center font-mono font-bold
                transition-all duration-75 select-none
                ${loopActive && audioLoopReady ? 'bg-cyan-700/40 text-cyan-300' : 'bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover'}
              `}
              style={{ height: 40, width: 28, fontSize: 9 }}
              title={`Auto-loop ${bars} bar${bars > 1 ? 's' : ''}`}
            >
              {bars}
            </button>
          ))}
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
                      ? 'bg-cyan-700/80 text-cyan-100'
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

      {/* Slip mode toggle */}
      <button
        onClick={handleSlipToggle}
        className={`
          relative flex items-center justify-center font-mono text-xs font-bold
          rounded-sm transition-all duration-100 select-none border border-dark-border
          active:translate-y-[0.5px]
          ${
            slipEnabled
              ? 'bg-amber-600 text-white'
              : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
          }
        `}
        style={{ width: 40, height: 40 }}
        title={slipEnabled ? 'Disable slip mode' : 'Enable slip mode'}
      >
        <div
          className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${
            slipEnabled ? 'bg-amber-300' : 'bg-dark-border'
          }`}
        />
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
