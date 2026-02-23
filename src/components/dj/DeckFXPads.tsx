/**
 * DeckFXPads - Performance pads for one DJ deck
 *
 * Two pages, toggled by header tabs:
 *   FX Pads (2×4): HPF sweep, LPF sweep, Filter reset, Echo out, Kill Lo/Mid/Hi, Brake
 *   Beat Jump (2×4): ◄◄16, ◄◄4, ◄◄1, ◄1 | ►1, ►►1, ►►4, ►►16
 *
 * FX pads are momentary (hold) or toggle. Beat jump pads are instant.
 * When quantize is active, FX effects snap to the next beat/bar boundary.
 */

import React, { useCallback, useRef, useState } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import {
  filterSweep,
  filterReset,
  echoOut,
  quantizedEQKill,
  instantEQKill,
  getQuantizeMode,
  type EQBand,
} from '@/engine/dj/DJQuantizedFX';
import { beatJump } from '@/engine/dj/DJBeatJump';

interface DeckFXPadsProps {
  deckId: 'A' | 'B' | 'C';
}

type PadPage = 'fx' | 'jump';

interface PadDef {
  id: string;
  label: string;
  sublabel?: string;
  color: string;
  activeColor: string;
  mode: 'momentary' | 'toggle' | 'instant';
}

const FX_PADS: PadDef[] = [
  { id: 'hpf-sweep', label: 'HPF', sublabel: '▲', color: 'violet', activeColor: 'violet', mode: 'momentary' },
  { id: 'lpf-sweep', label: 'LPF', sublabel: '▼', color: 'blue', activeColor: 'blue', mode: 'momentary' },
  { id: 'filter-reset', label: 'FLT', sublabel: 'RST', color: 'gray', activeColor: 'green', mode: 'momentary' },
  { id: 'echo-out', label: 'ECHO', sublabel: 'OUT', color: 'amber', activeColor: 'red', mode: 'momentary' },
  { id: 'kill-low', label: 'KILL', sublabel: 'LO', color: 'orange', activeColor: 'red', mode: 'toggle' },
  { id: 'kill-mid', label: 'KILL', sublabel: 'MID', color: 'gray', activeColor: 'red', mode: 'toggle' },
  { id: 'kill-hi', label: 'KILL', sublabel: 'HI', color: 'cyan', activeColor: 'red', mode: 'toggle' },
  { id: 'brake', label: 'BRK', sublabel: '⏎', color: 'rose', activeColor: 'rose', mode: 'momentary' },
];

const JUMP_PADS: PadDef[] = [
  { id: 'jump-back-16', label: '◄◄', sublabel: '16', color: 'indigo', activeColor: 'indigo', mode: 'instant' },
  { id: 'jump-back-4', label: '◄◄', sublabel: '4', color: 'blue', activeColor: 'blue', mode: 'instant' },
  { id: 'jump-back-1', label: '◄', sublabel: '1', color: 'sky', activeColor: 'sky', mode: 'instant' },
  { id: 'jump-back-half', label: '◄', sublabel: '½', color: 'teal', activeColor: 'teal', mode: 'instant' },
  { id: 'jump-fwd-half', label: '►', sublabel: '½', color: 'teal', activeColor: 'teal', mode: 'instant' },
  { id: 'jump-fwd-1', label: '►', sublabel: '1', color: 'sky', activeColor: 'sky', mode: 'instant' },
  { id: 'jump-fwd-4', label: '►►', sublabel: '4', color: 'blue', activeColor: 'blue', mode: 'instant' },
  { id: 'jump-fwd-16', label: '►►', sublabel: '16', color: 'indigo', activeColor: 'indigo', mode: 'instant' },
];

const BAND_MAP: Record<string, EQBand> = {
  'kill-low': 'low',
  'kill-mid': 'mid',
  'kill-hi': 'high',
};

const BEAT_JUMPS: Record<string, number> = {
  'jump-back-16': -16,
  'jump-back-4': -4,
  'jump-back-1': -1,
  'jump-back-half': -0.5,
  'jump-fwd-half': 0.5,
  'jump-fwd-1': 1,
  'jump-fwd-4': 4,
  'jump-fwd-16': 16,
};

// ── Component ────────────────────────────────────────────────────────────────

export const DeckFXPads: React.FC<DeckFXPadsProps> = ({ deckId }) => {
  const [page, setPage] = useState<PadPage>('fx');
  const [activePads, setActivePads] = useState<Set<string>>(new Set());
  const cancelRefs = useRef<Map<string, () => void>>(new Map());
  const killLow = useDJStore((s) => s.decks[deckId].eqLowKill);
  const killMid = useDJStore((s) => s.decks[deckId].eqMidKill);
  const killHigh = useDJStore((s) => s.decks[deckId].eqHighKill);
  const hasBeatGrid = useDJStore((s) => !!s.decks[deckId].beatGrid);

  const killState: Record<string, boolean> = {
    'kill-low': killLow,
    'kill-mid': killMid,
    'kill-hi': killHigh,
  };

  const cancelPad = useCallback((padId: string) => {
    const cancel = cancelRefs.current.get(padId);
    if (cancel) {
      cancel();
      cancelRefs.current.delete(padId);
    }
    setActivePads((prev) => {
      const next = new Set(prev);
      next.delete(padId);
      return next;
    });
  }, []);

  const activateFXPad = useCallback((padId: string) => {
    cancelPad(padId);
    setActivePads((prev) => new Set(prev).add(padId));

    let cancelFn: (() => void) | undefined;

    switch (padId) {
      case 'hpf-sweep':
        cancelFn = filterSweep(deckId, -0.85, 4, () => cancelPad(padId));
        break;
      case 'lpf-sweep':
        cancelFn = filterSweep(deckId, 0.85, 4, () => cancelPad(padId));
        break;
      case 'filter-reset':
        cancelFn = filterReset(deckId);
        setTimeout(() => cancelPad(padId), 150);
        break;
      case 'echo-out':
        cancelFn = echoOut(deckId, 8, () => cancelPad(padId));
        break;
      case 'kill-low':
      case 'kill-mid':
      case 'kill-hi': {
        const band = BAND_MAP[padId];
        const killKey = `eq${band.charAt(0).toUpperCase() + band.slice(1)}Kill` as 'eqLowKill' | 'eqMidKill' | 'eqHighKill';
        const current = useDJStore.getState().decks[deckId][killKey];
        const newKill = !current;
        useDJStore.getState().setDeckEQKill(deckId, band, newKill);
        if (getQuantizeMode() !== 'off') {
          cancelFn = quantizedEQKill(deckId, band, newKill);
        } else {
          instantEQKill(deckId, band, newKill);
        }
        if (!newKill) cancelPad(padId);
        break;
      }
      case 'brake': {
        try {
          const engine = getDJEngine();
          const deck = engine.getDeck(deckId);
          const state = useDJStore.getState().decks[deckId];
          const bpm = state.beatGrid?.bpm || state.detectedBPM || state.effectiveBPM || 120;
          const durationMs = (2 * 60 / bpm) * 1000;

          let rafId = 0;
          const startTime = performance.now();
          const animate = () => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(1, elapsed / durationMs);
            const rate = 1 - progress * progress;
            useDJStore.getState().setDeckPitch(deckId, 12 * Math.log2(Math.max(0.01, rate)));
            if (progress < 1) {
              rafId = requestAnimationFrame(animate);
            } else {
              deck.pause();
              useDJStore.getState().setDeckPlaying(deckId, false);
              useDJStore.getState().setDeckPitch(deckId, 0);
              cancelPad(padId);
            }
          };
          rafId = requestAnimationFrame(animate);
          cancelFn = () => {
            cancelAnimationFrame(rafId);
            useDJStore.getState().setDeckPitch(deckId, 0);
          };
        } catch {
          cancelPad(padId);
        }
        break;
      }
    }

    if (cancelFn) {
      cancelRefs.current.set(padId, cancelFn);
    }
  }, [deckId, cancelPad]);

  const handlePadDown = useCallback((pad: PadDef) => {
    if (pad.mode === 'instant') {
      // Beat jump pads
      const beats = BEAT_JUMPS[pad.id];
      if (beats !== undefined) beatJump(deckId, beats);
      // Visual flash
      setActivePads((prev) => new Set(prev).add(pad.id));
      setTimeout(() => setActivePads((prev) => { const n = new Set(prev); n.delete(pad.id); return n; }), 120);
    } else {
      activateFXPad(pad.id);
    }
  }, [deckId, activateFXPad]);

  const handlePadUp = useCallback((pad: PadDef) => {
    if (pad.mode === 'momentary') {
      if (pad.id === 'hpf-sweep' || pad.id === 'lpf-sweep') {
        cancelPad(pad.id);
        filterReset(deckId);
      }
    }
  }, [deckId, cancelPad]);

  const isActive = (padId: string) => {
    if (padId in killState) return killState[padId];
    return activePads.has(padId);
  };

  const pads = page === 'fx' ? FX_PADS : JUMP_PADS;

  return (
    <div className="flex flex-col gap-1">
      {/* Page tabs */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setPage('fx')}
          className={`px-2 py-0.5 rounded text-[8px] font-bold transition-colors ${
            page === 'fx'
              ? 'bg-violet-600/30 text-violet-300 border border-violet-500/40'
              : 'bg-dark-bgTertiary text-text-muted border border-dark-border hover:text-text-secondary'
          }`}
        >
          FX PADS
        </button>
        <button
          onClick={() => setPage('jump')}
          className={`px-2 py-0.5 rounded text-[8px] font-bold transition-colors ${
            page === 'jump'
              ? 'bg-sky-600/30 text-sky-300 border border-sky-500/40'
              : 'bg-dark-bgTertiary text-text-muted border border-dark-border hover:text-text-secondary'
          }`}
        >
          BEAT JUMP
        </button>
        {page === 'jump' && hasBeatGrid && (
          <span className="text-[7px] text-green-400 ml-auto">● GRID</span>
        )}
      </div>

      {/* Pad grid */}
      <div className="grid grid-cols-4 gap-1">
        {pads.map((pad) => {
          const active = isActive(pad.id);
          return (
            <button
              key={pad.id}
              onPointerDown={() => handlePadDown(pad)}
              onPointerUp={() => handlePadUp(pad)}
              onPointerLeave={() => pad.mode === 'momentary' && handlePadUp(pad)}
              className={`
                flex flex-col items-center justify-center
                h-9 rounded-md text-[8px] font-bold leading-tight
                select-none touch-none
                transition-all duration-75
                active:scale-95
                ${
                  active
                    ? `bg-${pad.activeColor}-600/40 text-${pad.activeColor}-200 border border-${pad.activeColor}-500/50`
                    : 'bg-dark-bgTertiary text-text-muted border border-dark-border hover:bg-dark-bgHover hover:text-text-secondary'
                }
              `}
              title={`${pad.label} ${pad.sublabel ?? ''} (${pad.mode})`}
            >
              <span>{pad.label}</span>
              {pad.sublabel && <span className="text-[7px] opacity-60">{pad.sublabel}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};
