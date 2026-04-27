/**
 * Stream Auto Dub — autonomous dub-move performer for DJ audio decks.
 *
 * Reuses the pure `chooseMove()` rule engine from AutoDub, but builds
 * context from DJ deck state (beat grid, stems, audio position) instead
 * of tracker state (patterns, transport, oscilloscope).
 *
 * When stems are available, maps them to channel roles:
 *   drums → percussion, bass → bass, vocals → lead, other → pad
 *
 * BPM and bar position come from the deck's beat grid (or fallback BPM).
 * No pattern look-ahead or density — `currentPattern` is always null.
 */

import { fire } from './DubRouter';
import { getPersona } from './AutoDubPersonas';
import { useDubStore } from '@/stores/useDubStore';
import { useDJStore, type DeckId } from '@/stores/useDJStore';
import { chooseMove, type AutoDubTickCtx } from './AutoDub';
import type { ChannelRole } from '@/bridge/analysis/MusicAnalysis';

const TICK_MS = 250;

/** Map stem names to tracker-compatible channel roles */
const STEM_ROLE_MAP: Record<string, ChannelRole> = {
  drums: 'percussion',
  bass: 'bass',
  vocals: 'lead',
  other: 'pad',
  guitar: 'lead',
  piano: 'chord',
};

// ─── Per-deck runtime state ──────────────────────────────────────────────────

interface DeckDubState {
  timer: ReturnType<typeof setInterval> | null;
  enableTimeMs: number;
  lastBar: number;
  movesFiredThisBar: number;
  wetFiredThisBar: number;
  moveLastFiredBar: Map<string, number>;
  heldDisposers: Set<{ dispose(): void }>;
}

const _deckState = new Map<DeckId, DeckDubState>();

function getOrCreateDeckState(deckId: DeckId): DeckDubState {
  let s = _deckState.get(deckId);
  if (!s) {
    s = {
      timer: null,
      enableTimeMs: 0,
      lastBar: -1,
      movesFiredThisBar: 0,
      wetFiredThisBar: 0,
      moveLastFiredBar: new Map(),
      heldDisposers: new Set(),
    };
    _deckState.set(deckId, s);
  }
  return s;
}

/** Derive bar position from beat grid + audio position */
function getBarContext(deckId: DeckId): { bar: number; barPos: number; bpm: number } | null {
  const deck = useDJStore.getState().decks[deckId];
  if (!deck.isPlaying) return null;

  const pos = deck.audioPosition; // seconds
  const grid = deck.beatGrid;

  if (grid && grid.bpm > 0) {
    const beatsPerBar = grid.timeSignature || 4;
    const bpm = grid.bpm;
    const beatDuration = 60 / bpm;
    const barDuration = beatDuration * beatsPerBar;

    // Find which bar we're in using downbeats if available
    if (grid.downbeats.length > 1) {
      let barIdx = 0;
      for (let i = 0; i < grid.downbeats.length - 1; i++) {
        if (pos >= grid.downbeats[i]) barIdx = i;
        else break;
      }
      const barStart = grid.downbeats[barIdx] ?? 0;
      const barEnd = grid.downbeats[barIdx + 1] ?? barStart + barDuration;
      const barFrac = Math.max(0, Math.min(1, (pos - barStart) / (barEnd - barStart)));
      return { bar: barIdx, barPos: barFrac, bpm };
    }

    // Fallback: compute from BPM + position
    const totalBeats = pos / beatDuration;
    const totalBars = totalBeats / beatsPerBar;
    return {
      bar: Math.floor(totalBars),
      barPos: totalBars - Math.floor(totalBars),
      bpm,
    };
  }

  // No beat grid — use deck BPM or default 120
  const bpm = 120;
  const barDuration = (60 / bpm) * 4;
  const totalBars = pos / barDuration;
  return {
    bar: Math.floor(totalBars),
    barPos: totalBars - Math.floor(totalBars),
    bpm,
  };
}

/** Build stem-based channel roles */
function getStemRoles(deckId: DeckId): { roles: ChannelRole[]; names: string[]; count: number } {
  const deck = useDJStore.getState().decks[deckId];
  if (!deck.stemsAvailable || deck.stemNames.length === 0) {
    return { roles: [], names: [], count: 0 };
  }

  const roles: ChannelRole[] = [];
  const names: string[] = [];
  for (const stem of deck.stemNames) {
    roles.push(STEM_ROLE_MAP[stem] ?? 'pad');
    names.push(stem);
  }
  return { roles, names, count: roles.length };
}

function tickForDeck(deckId: DeckId): void {
  const djState = useDJStore.getState();
  if (!djState.streamAutoDub) {
    stopStreamAutoDub(deckId);
    return;
  }

  const barCtx = getBarContext(deckId);
  if (!barCtx) return;

  const s = getOrCreateDeckState(deckId);
  const { bar, barPos, bpm } = barCtx;

  const isNewBar = bar !== s.lastBar;
  if (isNewBar) {
    s.lastBar = bar;
    s.movesFiredThisBar = 0;
    s.wetFiredThisBar = 0;
  }

  const dub = useDubStore.getState();
  const persona = getPersona(dub.autoDubPersona);
  const { roles, names, count } = getStemRoles(deckId);

  const ctx: AutoDubTickCtx = {
    bar,
    barPos,
    isNewBar,
    intensity: dub.autoDubIntensity,
    persona,
    blacklist: new Set(dub.autoDubMoveBlacklist),
    movesFiredThisBar: s.movesFiredThisBar,
    wetFiredThisBar: s.wetFiredThisBar,
    moveLastFiredBar: s.moveLastFiredBar,
    channelCount: count || 1,
    roles,
    transientChannels: [], // no oscilloscope for streams
    currentPattern: null,  // no pattern data for streams
    currentRow: 0,
    channelNames: names,
    densityByRole: new Map(), // no pattern density for streams
    phraseIntensityMult: 1.0,
    lastGlobalFireBar: -99,
    eqSnapshot: null,
    inRiddimSection: false,
  };

  const choice = chooseMove(ctx, Math.random);
  if (!choice) return;

  // Fire dub move — channelId = -1 for global (stems are tapped via DubBus)
  const disposer = fire(choice.moveId, -1, choice.params, 'live');
  s.movesFiredThisBar += 1;
  if (choice.wet) s.wetFiredThisBar += 1;
  s.moveLastFiredBar.set(choice.moveId, bar);

  if (disposer) {
    s.heldDisposers.add(disposer);
    const holdMs = (60000 / bpm) * 4 * choice.holdBars;
    setTimeout(() => {
      try { disposer.dispose(); } catch { /* ok */ }
      s.heldDisposers.delete(disposer);
    }, holdMs);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function startStreamAutoDub(deckId: DeckId): void {
  const s = getOrCreateDeckState(deckId);
  if (s.timer !== null) return;

  // Auto-enable dub sends on key stems if none are active
  const deck = useDJStore.getState().decks[deckId];
  if (deck.stemsAvailable && deck.stemNames.length > 0) {
    const sends = deck.stemDubSends;
    const hasAnySend = Object.values(sends).some(v => v);
    if (!hasAnySend) {
      import('@/engine/dj/DJActions').then(({ toggleStemDubSend }) => {
        const d = useDJStore.getState().decks[deckId];
        for (const stem of ['drums', 'vocals']) {
          if (d.stemNames.includes(stem)) {
            toggleStemDubSend(deckId, stem);
          }
        }
      });
    }
  }

  s.enableTimeMs = performance.now();
  s.lastBar = -1;
  s.movesFiredThisBar = 0;
  s.wetFiredThisBar = 0;
  s.moveLastFiredBar.clear();
  s.timer = setInterval(() => tickForDeck(deckId), TICK_MS);
}

export function stopStreamAutoDub(deckId: DeckId): void {
  const s = _deckState.get(deckId);
  if (!s) return;
  if (s.timer !== null) {
    clearInterval(s.timer);
    s.timer = null;
  }
  for (const d of s.heldDisposers) {
    try { d.dispose(); } catch { /* ok */ }
  }
  s.heldDisposers.clear();
}

export function stopAllStreamAutoDub(): void {
  for (const deckId of _deckState.keys()) {
    stopStreamAutoDub(deckId);
  }
}

export function isStreamAutoDubRunning(deckId: DeckId): boolean {
  return (_deckState.get(deckId)?.timer ?? null) !== null;
}

// ─── Auto-sync: watch store toggle to start/stop ticking ─────────────────────

let _unsub: (() => void) | null = null;

/** Call once at app startup (or lazy-init). Watches `streamAutoDub` toggle
 *  and starts/stops tick loops on all playing decks. */
export function initStreamAutoDubWatcher(): void {
  if (_unsub) return;
  _unsub = useDJStore.subscribe(
    (s) => s.streamAutoDub,
    (enabled) => {
      if (enabled) {
        const decks = useDJStore.getState().decks;
        for (const id of ['A', 'B', 'C'] as const) {
          if (decks[id].isPlaying) startStreamAutoDub(id);
        }
      } else {
        stopAllStreamAutoDub();
      }
    },
  );
}
