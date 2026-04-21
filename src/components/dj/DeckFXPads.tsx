/**
 * DeckFXPads - Performance pads for one DJ deck
 *
 * Four pages, toggled by header tabs:
 *   FX Pads (2×4): HPF sweep, LPF sweep, Filter reset, Echo out, Kill Lo/Mid/Hi, Brake
 *   Beat Jump (2×4): ◄◄16, ◄◄4, ◄◄1, ◄1 | ►1, ►►1, ►►4, ►►16
 *   Dub 1 (2×4): springSlam, filterDrop, dubSiren, reverseEcho, tapeWobble,
 *                echoThrow, delayTimeThrow, masterDrop
 *   Dub 2 (2×4): dubStab, snareCrack, backwardReverb, tubbyScream,
 *                oscBass, crushBass, echoBuildUp, tapeStop
 *
 * FX / dub-hold pads are momentary (hold) or toggle. Beat jump pads +
 * dub-trigger pads are instant. When quantize is active, FX effects snap
 * to the next beat/bar boundary; dub moves fire immediately (DubRouter
 * manages its own grid alignment via the caller-provided source='live').
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { fire as fireDubMove } from '@/engine/dub/DubRouter';

interface DeckFXPadsProps {
  deckId: 'A' | 'B' | 'C';
}

type PadPage = 'fx' | 'jump' | 'dub' | 'dub2';

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
  { id: 'echo-out', label: 'ECHO', sublabel: 'OUT', color: 'amber', activeColor: 'red', mode: 'toggle' },
  { id: 'kill-low', label: 'KILL', sublabel: 'LO', color: 'orange', activeColor: 'red', mode: 'momentary' },
  { id: 'kill-mid', label: 'KILL', sublabel: 'MID', color: 'gray', activeColor: 'red', mode: 'momentary' },
  { id: 'kill-hi', label: 'KILL', sublabel: 'HI', color: 'cyan', activeColor: 'red', mode: 'momentary' },
  { id: 'brake', label: 'BRK', sublabel: '⏎', color: 'rose', activeColor: 'rose', mode: 'momentary' },
];

// Dub-send pads — fire dub moves straight onto the bus from the deck,
// without having to open the drumpad view or drop a dub-kit pattern.
// Mix of oneshot triggers (springSlam, delayTimeThrow, masterDrop) and
// hold-style processors (filterDrop, dubSiren, reverseEcho, tapeWobble,
// echoThrow). Hold pads use `momentary` so they release on pointer-up.
const DUB_PADS: PadDef[] = [
  { id: 'dub-slam',     label: 'SLAM',  sublabel: 'spring',  color: 'amber',  activeColor: 'red',    mode: 'instant' },
  { id: 'dub-drop',     label: 'DROP',  sublabel: 'filter',  color: 'cyan',   activeColor: 'cyan',   mode: 'momentary' },
  { id: 'dub-siren',    label: 'SIREN', sublabel: 'fb loop', color: 'rose',   activeColor: 'rose',   mode: 'momentary' },
  { id: 'dub-reverse',  label: 'RVRS',  sublabel: 'echo',    color: 'violet', activeColor: 'violet', mode: 'momentary' },
  { id: 'dub-wobble',   label: 'WOBL',  sublabel: 'tape',    color: 'orange', activeColor: 'orange', mode: 'momentary' },
  { id: 'dub-throw',    label: 'ECHO',  sublabel: 'throw',   color: 'sky',    activeColor: 'sky',    mode: 'momentary' },
  { id: 'dub-time',     label: 'TIME',  sublabel: 'throw',   color: 'blue',   activeColor: 'blue',   mode: 'instant' },
  { id: 'dub-master',   label: 'MSTR',  sublabel: 'drop',    color: 'rose',   activeColor: 'red',    mode: 'momentary' },
];

// pad.id → (moveId, trigger-or-hold). Hold moves dispose on pad release.
const DUB_PAD_MAP: Record<string, string> = {
  'dub-slam':    'springSlam',
  'dub-drop':    'filterDrop',
  'dub-siren':   'dubSiren',
  'dub-reverse': 'reverseEcho',
  'dub-wobble':  'tapeWobble',
  'dub-throw':   'echoThrow',
  'dub-time':    'delayTimeThrow',
  'dub-master':  'masterDrop',
  // Dub 2 page (added 2026-04-21) — second set of 8 moves for deep
  // live-throw coverage. Moves that didn't make the main page are
  // still reachable via drumpad kits / keyboard bindings / MIDI CC:
  //   stereoDoubler, sonarPing, radioRiser, subSwell, subHarmonic,
  //   delayPreset380, delayPresetDotted, toast, channelMute,
  //   channelThrow, transportTapeStop
  'dub2-stab':    'dubStab',
  'dub2-crack':   'snareCrack',
  'dub2-back':    'backwardReverb',
  'dub2-scream':  'tubbyScream',
  'dub2-bass':    'oscBass',
  'dub2-crush':   'crushBass',
  'dub2-build':   'echoBuildUp',
  'dub2-tape':    'tapeStop',
};

// Second-page dub pads — stabs + reverse/tape moves + bass textures.
// Complements DUB_PADS (throw/hold moves) with hits and drones.
const DUB2_PADS: PadDef[] = [
  { id: 'dub2-stab',   label: 'STAB',  sublabel: 'dub',      color: 'amber',  activeColor: 'red',    mode: 'instant' },
  { id: 'dub2-crack',  label: 'CRACK', sublabel: 'snare',    color: 'rose',   activeColor: 'rose',   mode: 'instant' },
  { id: 'dub2-back',   label: 'BACK',  sublabel: 'reverb',   color: 'violet', activeColor: 'violet', mode: 'instant' },
  { id: 'dub2-scream', label: 'SCRM',  sublabel: 'tubby',    color: 'cyan',   activeColor: 'red',    mode: 'momentary' },
  { id: 'dub2-bass',   label: 'BASS',  sublabel: 'drone',    color: 'orange', activeColor: 'orange', mode: 'momentary' },
  { id: 'dub2-crush',  label: 'CRSH',  sublabel: 'bits',     color: 'gray',   activeColor: 'orange', mode: 'momentary' },
  { id: 'dub2-build',  label: 'BILD',  sublabel: 'echo',     color: 'sky',    activeColor: 'sky',    mode: 'instant' },
  { id: 'dub2-tape',   label: 'TAPE',  sublabel: 'stop',     color: 'teal',   activeColor: 'red',    mode: 'instant' },
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

// Color map for pad states — static values so Tailwind purging isn't needed
const PAD_COLORS: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  violet:  { bg: 'rgba(139,92,246,0.45)',  text: '#c4b5fd', border: 'rgba(139,92,246,0.6)',  glow: 'rgba(139,92,246,0.5)' },
  blue:    { bg: 'rgba(59,130,246,0.45)',   text: '#93c5fd', border: 'rgba(59,130,246,0.6)',   glow: 'rgba(59,130,246,0.5)' },
  green:   { bg: 'rgba(34,197,94,0.45)',    text: '#86efac', border: 'rgba(34,197,94,0.6)',    glow: 'rgba(34,197,94,0.5)' },
  amber:   { bg: 'rgba(245,158,11,0.45)',   text: '#fcd34d', border: 'rgba(245,158,11,0.6)',   glow: 'rgba(245,158,11,0.5)' },
  red:     { bg: 'rgba(239,68,68,0.50)',    text: '#fca5a5', border: 'rgba(239,68,68,0.6)',    glow: 'rgba(239,68,68,0.5)' },
  orange:  { bg: 'rgba(249,115,22,0.45)',   text: '#fdba74', border: 'rgba(249,115,22,0.6)',   glow: 'rgba(249,115,22,0.5)' },
  cyan:    { bg: 'rgba(6,182,212,0.45)',    text: '#67e8f9', border: 'rgba(6,182,212,0.6)',    glow: 'rgba(6,182,212,0.5)' },
  rose:    { bg: 'rgba(244,63,94,0.45)',    text: '#fda4af', border: 'rgba(244,63,94,0.6)',    glow: 'rgba(244,63,94,0.5)' },
  gray:    { bg: 'rgba(156,163,175,0.35)',  text: '#d1d5db', border: 'rgba(156,163,175,0.5)',  glow: 'rgba(156,163,175,0.4)' },
  indigo:  { bg: 'rgba(99,102,241,0.45)',   text: '#a5b4fc', border: 'rgba(99,102,241,0.6)',   glow: 'rgba(99,102,241,0.5)' },
  sky:     { bg: 'rgba(14,165,233,0.45)',   text: '#7dd3fc', border: 'rgba(14,165,233,0.6)',   glow: 'rgba(14,165,233,0.5)' },
  teal:    { bg: 'rgba(20,184,166,0.45)',   text: '#5eead4', border: 'rgba(20,184,166,0.6)',   glow: 'rgba(20,184,166,0.5)' },
};

export const DeckFXPads: React.FC<DeckFXPadsProps> = ({ deckId }) => {
  const [page, setPage] = useState<PadPage>('fx');
  const [activePads, setActivePads] = useState<Set<string>>(new Set());
  const cancelRefs = useRef<Map<string, () => void>>(new Map());
  const flashTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const filterResetTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Cleanup stray timers on unmount
  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      if (filterResetTimerRef.current) clearTimeout(filterResetTimerRef.current);
    };
  }, []);
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
    // For toggle-style pads: if already active, just cancel (don't restart)
    if (padId === 'echo-out' && cancelRefs.current.has(padId)) {
      cancelPad(padId);
      return;
    }

    // Cancel conflicting filter pads (HPF and LPF are mutually exclusive)
    if (padId === 'hpf-sweep' || padId === 'lpf-sweep') {
      const opposing = padId === 'hpf-sweep' ? 'lpf-sweep' : 'hpf-sweep';
      if (cancelRefs.current.has(opposing)) {
        cancelPad(opposing);
      }
    }

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
        filterResetTimerRef.current = setTimeout(() => cancelPad(padId), 150);
        break;
      case 'echo-out':
        cancelFn = echoOut(deckId, 8, () => cancelPad(padId));
        break;
      case 'kill-low':
      case 'kill-mid':
      case 'kill-hi': {
        const band = BAND_MAP[padId];
        useDJStore.getState().setDeckEQKill(deckId, band, true);
        if (getQuantizeMode() !== 'off') {
          cancelFn = quantizedEQKill(deckId, band, true);
        } else {
          instantEQKill(deckId, band, true);
        }
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
              try { deck.pause(); } catch { /* engine may be gone */ }
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

  const activateDubPad = useCallback((padId: string, mode: 'momentary' | 'instant') => {
    const moveId = DUB_PAD_MAP[padId];
    if (!moveId) return;
    const disposer = fireDubMove(moveId, undefined, {}, 'live');
    setActivePads((prev) => new Set(prev).add(padId));
    if (mode === 'instant') {
      // Trigger-kind move — dispose immediately since there's no hold semantics,
      // and clear the visual flash after ~120 ms so the button reads as a tap.
      if (disposer) try { disposer.dispose(); } catch { /* ok */ }
      flashTimerRef.current = setTimeout(() => setActivePads((prev) => {
        const n = new Set(prev); n.delete(padId); return n;
      }), 120);
    } else if (disposer) {
      // Hold — keep the disposer so pointerup can dispose cleanly.
      cancelRefs.current.set(padId, () => { try { disposer.dispose(); } catch { /* ok */ } });
    }
  }, []);

  const handlePadDown = useCallback((pad: PadDef) => {
    // Dub pads are in DUB_PAD_MAP regardless of mode (instant or momentary).
    if (pad.id in DUB_PAD_MAP) {
      activateDubPad(pad.id, pad.mode === 'instant' ? 'instant' : 'momentary');
      return;
    }
    if (pad.mode === 'instant') {
      // Beat jump pads
      const beats = BEAT_JUMPS[pad.id];
      if (beats !== undefined) beatJump(deckId, beats);
      // Visual flash
      setActivePads((prev) => new Set(prev).add(pad.id));
      flashTimerRef.current = setTimeout(() => setActivePads((prev) => { const n = new Set(prev); n.delete(pad.id); return n; }), 120);
    } else {
      activateFXPad(pad.id);
    }
  }, [deckId, activateFXPad, activateDubPad]);

  const handlePadUp = useCallback((pad: PadDef) => {
    if (pad.mode === 'momentary') {
      if (pad.id in DUB_PAD_MAP) {
        // Dub hold-kind — dispose the returned handle.
        cancelPad(pad.id);
      } else if (pad.id === 'hpf-sweep' || pad.id === 'lpf-sweep') {
        cancelPad(pad.id);
        filterReset(deckId);
      } else if (pad.id === 'kill-low' || pad.id === 'kill-mid' || pad.id === 'kill-hi') {
        // Release kill — unmute the band
        const band = BAND_MAP[pad.id];
        cancelPad(pad.id);
        useDJStore.getState().setDeckEQKill(deckId, band, false);
        if (getQuantizeMode() !== 'off') {
          quantizedEQKill(deckId, band, false);
        } else {
          instantEQKill(deckId, band, false);
        }
      }
    }
  }, [deckId, cancelPad]);

  const isActive = (padId: string) => {
    if (padId in killState) return killState[padId];
    return activePads.has(padId);
  };

  const pads =
    page === 'fx'   ? FX_PADS   :
    page === 'jump' ? JUMP_PADS :
    page === 'dub'  ? DUB_PADS  :
                      DUB2_PADS;

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
        <button
          onClick={() => setPage('dub')}
          className={`px-2 py-0.5 rounded text-[8px] font-bold transition-colors ${
            page === 'dub'
              ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40'
              : 'bg-dark-bgTertiary text-text-muted border border-dark-border hover:text-text-secondary'
          }`}
          title="Dub bus sends — throws, holds, drops, wobble, echo, siren"
        >
          DUB
        </button>
        <button
          onClick={() => setPage('dub2')}
          className={`px-2 py-0.5 rounded text-[8px] font-bold transition-colors ${
            page === 'dub2'
              ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40'
              : 'bg-dark-bgTertiary text-text-muted border border-dark-border hover:text-text-secondary'
          }`}
          title="Dub bus sends page 2 — stabs, reverse/tape, bass drones"
        >
          DUB 2
        </button>
        {page === 'jump' && hasBeatGrid && (
          <span className="text-[7px] text-green-400 ml-auto">● GRID</span>
        )}
      </div>

      {/* Pad grid */}
      <div className="grid grid-cols-4 gap-1">
        {pads.map((pad) => {
          const active = isActive(pad.id);
          const pressed = activePads.has(pad.id);
          const colorKey = active ? pad.activeColor : pad.color;
          const colors = PAD_COLORS[colorKey] || PAD_COLORS.gray;
          return (
            <button
              key={pad.id}
              onPointerDown={() => handlePadDown(pad)}
              onPointerUp={() => handlePadUp(pad)}
              onPointerLeave={() => (pad.mode === 'momentary') && handlePadUp(pad)}
              className="relative flex flex-col items-center justify-center rounded-md select-none touch-none overflow-hidden transform-gpu will-change-transform"
              style={{
                height: 40,
                transition: pressed ? 'transform 50ms' : 'transform 120ms ease-out',
                transform: pressed ? 'scale(0.92)' : 'scale(1)',
                backgroundColor: active ? colors.bg : 'var(--color-dark-bgHover)',
                color: active ? colors.text : 'var(--color-text-secondary)',
                border: `1px solid ${active ? colors.border : 'var(--color-dark-borderLight)'}`,
                boxShadow: active ? `0 0 12px ${colors.glow}, inset 0 0 8px ${colors.glow}` : 'inset 0 1px 0 rgba(255,255,255,0.04)',
              }}
              title={`${pad.label} ${pad.sublabel ?? ''} (${pad.mode})`}
            >
              {/* Active glow overlay */}
              {active && (
                <div
                  className="absolute inset-0 rounded-md pointer-events-none"
                  style={{
                    background: `radial-gradient(circle at center, ${colors.glow} 0%, transparent 70%)`,
                    opacity: 0.4,
                  }}
                />
              )}
              {/* Press flash */}
              {pressed && (
                <div
                  className="absolute inset-0 rounded-md pointer-events-none"
                  style={{
                    background: `radial-gradient(circle at center, rgba(255,255,255,0.3) 0%, transparent 60%)`,
                  }}
                />
              )}
              <span className="relative text-[9px] font-bold">{pad.label}</span>
              {pad.sublabel && <span className="relative text-[7px] opacity-60">{pad.sublabel}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};
