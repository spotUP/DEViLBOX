/**
 * DJQuantizedFX — Beat-quantized effect triggers for DJ decks
 *
 * Provides functions that schedule effect changes (EQ kills, filter sweeps,
 * crossfader cuts, echo-out) to snap to beat or bar boundaries, giving a
 * professional-sounding mix even when the DJ presses the button slightly
 * off-beat.
 *
 * Uses DJAutoSync beat-grid timing to calculate the next boundary, then
 * schedules via setTimeout. Each function returns a cancel handle.
 */

import { getDJEngine } from './DJEngine';
import type { DeckId } from './DeckEngine';
import { timeToNextBeat, timeToNextDownbeat, onNextBeat, onNextDownbeat, syncBPMToOther, phaseAlign } from './DJAutoSync';
import { useDJStore } from '@/stores/useDJStore';

// ── Types ────────────────────────────────────────────────────────────────────

export type QuantizeMode = 'off' | 'beat' | 'bar';
export type EQBand = 'low' | 'mid' | 'high';

interface ActiveSweep {
  /** RAF / timer id */
  id: number;
  /** Set to true when cancelled */
  cancelled: boolean;
}

// ── Module state ─────────────────────────────────────────────────────────────

let quantizeMode: QuantizeMode = 'beat';
const activeSweeps = new Map<string, ActiveSweep>();

// ── Configuration ────────────────────────────────────────────────────────────

export function setQuantizeMode(mode: QuantizeMode): void {
  quantizeMode = mode;
}

export function getQuantizeMode(): QuantizeMode {
  return quantizeMode;
}

// ── Core scheduler helper ────────────────────────────────────────────────────

/**
 * Schedules `action` to fire on the next beat/bar boundary (or immediately
 * if quantize is off or no beat grid exists). Returns a cancel function.
 */
function scheduleQuantized(deckId: DeckId, action: () => void): () => void {
  if (quantizeMode === 'off') {
    action();
    return () => { /* already fired */ };
  }

  // Check if there's a beat grid — fall back to immediate if not
  const fn = quantizeMode === 'bar' ? onNextDownbeat : onNextBeat;
  const delay = quantizeMode === 'bar' ? timeToNextDownbeat(deckId) : timeToNextBeat(deckId);

  // If delay is extremely small (<10ms) just fire now
  if (delay < 0.01) {
    action();
    return () => {};
  }

  return fn(deckId, action);
}

// ── EQ Kill (quantized) ─────────────────────────────────────────────────────

/**
 * Toggle an EQ band kill quantized to the next beat/bar boundary.
 * Returns a cancel function.
 */
export function quantizedEQKill(
  deckId: DeckId,
  band: EQBand,
  enabled: boolean,
): () => void {
  return scheduleQuantized(deckId, () => {
    try {
      const deck = getDJEngine().getDeck(deckId);
      deck.setEQKill(band, enabled);
    } catch { /* engine not ready */ }
  });
}

/**
 * Instant (non-quantized) EQ kill — useful for performance pads.
 */
export function instantEQKill(deckId: DeckId, band: EQBand, enabled: boolean): void {
  try {
    getDJEngine().getDeck(deckId).setEQKill(band, enabled);
  } catch { /* engine not ready */ }
}

// ── Filter Sweep (beat-timed) ────────────────────────────────────────────────

/**
 * Sweep the filter from its current position to `targetPosition` over
 * `beats` beats. Uses requestAnimationFrame for smooth interpolation.
 *
 * @param deckId   Deck to sweep on
 * @param target   Target filter position: -1 (HPF) → 0 (off) → +1 (LPF)
 * @param beats    Duration in beats
 * @param onDone   Optional callback when sweep completes
 * @returns cancel function
 */
export function filterSweep(
  deckId: DeckId,
  target: number,
  beats: number = 4,
  onDone?: () => void,
): () => void {
  const key = `filterSweep:${deckId}`;

  // Cancel any in-progress sweep on this deck
  cancelSweep(key);

  const sweep: ActiveSweep = { id: 0, cancelled: false };
  activeSweeps.set(key, sweep);

  // Calculate sweep duration from BPM
  let durationMs = 500; // fallback (1 beat at 120 BPM)
  try {
    const state = useDJStore.getState().decks[deckId];
    const bpm = state.beatGrid?.bpm || state.detectedBPM || state.effectiveBPM || 120;
    durationMs = (beats * 60 / bpm) * 1000;
  } catch { /* use fallback */ }

  const clampedTarget = Math.max(-1, Math.min(1, target));

  // Start the sweep (optionally quantized to next beat)
  const cancelSchedule = scheduleQuantized(deckId, () => {
    // Read actual start position at the moment the sweep begins
    // For now we just begin from current state
    let actualStart = 0;
    try {
      // We'll snapshot approximately from the engine
      // DeckEngine doesn't expose getFilterPosition, so we track in this module
      actualStart = getTrackedFilterPosition(deckId);
    } catch {
      actualStart = 0;
    }

    const sweepStartTime = performance.now();

    function animate() {
      if (sweep.cancelled) return;

      const elapsed = performance.now() - sweepStartTime;
      const progress = Math.min(1, elapsed / durationMs);

      // Ease-in-out for smooth sweep
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      const current = actualStart + (clampedTarget - actualStart) * eased;

      try {
        getDJEngine().getDeck(deckId).setFilterPosition(current);
        setTrackedFilterPosition(deckId, current);
      } catch { /* engine not ready */ }

      if (progress < 1) {
        sweep.id = requestAnimationFrame(animate);
      } else {
        activeSweeps.delete(key);
        onDone?.();
      }
    }

    sweep.id = requestAnimationFrame(animate);
  });

  return () => {
    sweep.cancelled = true;
    cancelAnimationFrame(sweep.id);
    activeSweeps.delete(key);
    cancelSchedule();
  };
}

/**
 * Snap-reset the filter to center (bypass) on the next beat.
 */
export function filterReset(deckId: DeckId): () => void {
  return scheduleQuantized(deckId, () => {
    try {
      getDJEngine().getDeck(deckId).setFilterPosition(0);
      setTrackedFilterPosition(deckId, 0);
    } catch { /* engine not ready */ }
  });
}

// ── Crossfader Automation ────────────────────────────────────────────────────

/**
 * Smooth crossfade from current position to `target` over `beats` beats.
 * Useful for automated transitions.
 */
export function crossfaderSweep(
  target: number,
  beats: number = 16,
  referenceDeckId: DeckId = 'A',
  onDone?: () => void,
): () => void {
  const key = 'crossfaderSweep';
  cancelSweep(key);

  const sweep: ActiveSweep = { id: 0, cancelled: false };
  activeSweeps.set(key, sweep);

  let durationMs = 8000; // fallback
  try {
    const state = useDJStore.getState().decks[referenceDeckId];
    const bpm = state.beatGrid?.bpm || state.detectedBPM || state.effectiveBPM || 120;
    durationMs = (beats * 60 / bpm) * 1000;
  } catch { /* fallback */ }

  const clampedTarget = Math.max(0, Math.min(1, target));

  const cancelSchedule = scheduleQuantized(referenceDeckId, () => {
    let startVal = 0.5;
    try {
      startVal = getDJEngine().mixer.getCrossfader();
    } catch { /* fallback */ }

    const sweepStart = performance.now();

    function animate() {
      if (sweep.cancelled) return;

      const elapsed = performance.now() - sweepStart;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      const current = startVal + (clampedTarget - startVal) * eased;

      try {
        getDJEngine().setCrossfader(current);
      } catch { /* engine not ready */ }

      if (progress < 1) {
        sweep.id = requestAnimationFrame(animate);
      } else {
        activeSweeps.delete(key);
        onDone?.();
      }
    }

    sweep.id = requestAnimationFrame(animate);
  });

  return () => {
    sweep.cancelled = true;
    cancelAnimationFrame(sweep.id);
    activeSweeps.delete(key);
    cancelSchedule();
  };
}

// ── Beat-Matched Transition ──────────────────────────────────────────────────

/**
 * Full automated beat-matched transition: sync BPM, crossfade over N bars,
 * optionally with a filter sweep on the outgoing deck.
 *
 * @param fromDeck       Outgoing deck (currently playing)
 * @param toDeck         Incoming deck (cued, will start playing)
 * @param bars           Duration of transition in bars (e.g. 8 = 8 bars)
 * @param withFilter     Apply HPF sweep on outgoing deck during transition
 * @returns cancel function
 */
export function beatMatchedTransition(
  fromDeck: DeckId,
  toDeck: DeckId,
  bars: number = 8,
  withFilter: boolean = true,
): () => void {
  const cancellers: (() => void)[] = [];
  let cancelled = false;

  // Step 1: Sync BPM of incoming deck to outgoing
  syncBPMToOther(toDeck, fromDeck);
  phaseAlign(toDeck, fromDeck, 'bar');

  // Calculate beats from bars
  let beatsPerBar = 4;
  try {
    const state = useDJStore.getState().decks[fromDeck];
    beatsPerBar = state.beatGrid?.timeSignature || 4;
  } catch { /* fallback */ }

  const totalBeats = bars * beatsPerBar;

  // Step 2: On next downbeat, start the crossfade
  const cancelSchedule = scheduleQuantized(fromDeck, () => {
    if (cancelled) return;

    // Start the incoming deck
    try {
      const engine = getDJEngine();
      const incoming = engine.getDeck(toDeck);
      incoming.play();
    } catch { /* engine not ready */ }

    // Crossfade: move from current position toward toDeck
    const crossfadeTarget = toDeck === 'A' ? 0 : toDeck === 'B' ? 1 : 0.5;
    cancellers.push(
      crossfaderSweep(crossfadeTarget, totalBeats, fromDeck)
    );

    // Optional: HPF sweep on outgoing deck (sweep to mid HPF over first half)
    if (withFilter) {
      cancellers.push(
        filterSweep(fromDeck, -0.6, Math.floor(totalBeats * 0.75), () => {
          // At the end, fully HPF the outgoing deck
          if (!cancelled) {
            try {
              getDJEngine().getDeck(fromDeck).setFilterPosition(-1);
              setTrackedFilterPosition(fromDeck, -1);
            } catch { /* engine not ready */ }
          }
        })
      );
    }
  });

  cancellers.push(cancelSchedule);

  return () => {
    cancelled = true;
    cancellers.forEach(c => c());
  };
}

// ── Echo Out ─────────────────────────────────────────────────────────────────

/**
 * "Echo out" effect: gradually reduce volume over N beats, kill the deck.
 * The DJ classic for dropping a track out.
 */
export function echoOut(
  deckId: DeckId,
  beats: number = 4,
  onDone?: () => void,
): () => void {
  const key = `echoOut:${deckId}`;
  cancelSweep(key);

  const sweep: ActiveSweep = { id: 0, cancelled: false };
  activeSweeps.set(key, sweep);

  let durationMs = 2000;
  try {
    const state = useDJStore.getState().decks[deckId];
    const bpm = state.beatGrid?.bpm || state.detectedBPM || state.effectiveBPM || 120;
    durationMs = (beats * 60 / bpm) * 1000;
  } catch { /* fallback */ }

  const cancelSchedule = scheduleQuantized(deckId, () => {
    let startVol = 1;
    try {
      startVol = getDJEngine().getDeck(deckId).getVolume();
    } catch { /* fallback */ }

    const sweepStart = performance.now();

    function animate() {
      if (sweep.cancelled) return;

      const elapsed = performance.now() - sweepStart;
      const progress = Math.min(1, elapsed / durationMs);

      // Exponential fade for natural-sounding decay
      const volume = startVol * Math.pow(1 - progress, 2);

      try {
        getDJEngine().getDeck(deckId).setVolume(volume);
      } catch { /* engine not ready */ }

      if (progress < 1) {
        sweep.id = requestAnimationFrame(animate);
      } else {
        activeSweeps.delete(key);
        onDone?.();
      }
    }

    sweep.id = requestAnimationFrame(animate);
  });

  return () => {
    sweep.cancelled = true;
    cancelAnimationFrame(sweep.id);
    activeSweeps.delete(key);
    cancelSchedule();
  };
}

// ── Cancel All ───────────────────────────────────────────────────────────────

/**
 * Cancel all active sweeps/automations (panic button).
 */
export function cancelAllAutomation(): void {
  activeSweeps.forEach((sweep) => {
    sweep.cancelled = true;
    cancelAnimationFrame(sweep.id);
  });
  activeSweeps.clear();
}

// ── Internal Helpers ─────────────────────────────────────────────────────────

function cancelSweep(key: string): void {
  const existing = activeSweeps.get(key);
  if (existing) {
    existing.cancelled = true;
    cancelAnimationFrame(existing.id);
    activeSweeps.delete(key);
  }
}

/** Tracked filter positions so sweeps can read the current value */
const trackedFilterPositions: Record<string, number> = {};

function getTrackedFilterPosition(deckId: DeckId): number {
  return trackedFilterPositions[deckId] ?? 0;
}

export function setTrackedFilterPosition(deckId: DeckId, value: number): void {
  trackedFilterPositions[deckId] = value;
}
