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
  /** Timer id (setInterval) */
  id: ReturnType<typeof setInterval> | number;
  /** Set to true when cancelled */
  cancelled: boolean;
}

// ── Module state ─────────────────────────────────────────────────────────────

// Default to 'bar' so cue/play/hot-cue/jump always land on the next downbeat
// of the master deck. Bar quantize is strictly safer for mixing — phrases
// line up musically and you can't drop in mid-phrase. Users can still cycle
// to 'beat' or 'off' via the Q button on the deck transport.
let quantizeMode: QuantizeMode = 'bar';
const activeSweeps = new Map<string, ActiveSweep>();

/**
 * Start a timer-based animation loop that runs even when the page/element is
 * hidden. requestAnimationFrame is throttled by browsers for invisible
 * elements — catastrophic for auto DJ transitions that must complete
 * regardless of which view is active.
 */
function startSweepTimer(
  sweep: ActiveSweep,
  key: string,
  durationMs: number,
  onTick: (progress: number, eased: number) => void,
  onDone?: () => void,
): void {
  const TICK_MS = 16; // ~60fps
  const sweepStart = performance.now();

  sweep.id = setInterval(() => {
    if (sweep.cancelled) {
      clearInterval(sweep.id as ReturnType<typeof setInterval>);
      return;
    }
    const elapsed = performance.now() - sweepStart;
    const progress = Math.min(1, elapsed / durationMs);
    const eased = progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    onTick(progress, eased);

    if (progress >= 1) {
      clearInterval(sweep.id as ReturnType<typeof setInterval>);
      activeSweeps.delete(key);
      onDone?.();
    }
  }, TICK_MS);
}

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
/** Humanization jitter: ±30ms around the quantized beat for natural feel */
const HUMANIZE_JITTER_MS = 30;

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

  // Add micro-timing jitter for human feel (±30ms)
  const jitteredAction = () => {
    const jitter = (Math.random() - 0.5) * 2 * HUMANIZE_JITTER_MS;
    if (jitter > 5) {
      setTimeout(action, jitter);
    } else {
      action(); // fire slightly early or on-time
    }
  };

  return fn(deckId, jitteredAction);
}

// ── quantizeAction — universal beat-quantized transport scheduler ────────────
//
// This is the spine that powers the foolproof beat-snap behaviour for cue,
// play, hot cue, beat jump, loop activation, etc. Unlike scheduleQuantized
// (which always references THIS deck's own grid and is used by FX), this
// helper picks the best reference deck and lets the caller fall back to
// solo behaviour for the case where no other deck is playing.
//
// Reference deck selection:
//   1. The OTHER deck, if it is playing AND has a beat grid (master-locked)
//   2. THIS deck, if `allowSolo` is true AND it has a beat grid (solo snap)
//   3. Otherwise: fire immediately
//
// While the action is waiting, a `pendingAction` is set on the deck for
// UI feedback (the cue/play button can pulse). The returned cancel fn
// clears both the timer and the pending state.

export type QuantizeOpts = {
  /** Override the global quantize mode for this single call. */
  mode?: QuantizeMode;
  /** If true and no other deck is playing, fall back to THIS deck's grid. Default: true. */
  allowSolo?: boolean;
  /** UI hint — used to set the pendingAction kind for visual feedback. */
  kind?: 'play' | 'cue' | 'hotcue' | 'loop' | 'jump';
};

/**
 * Schedule a transport/cue action to fire on the next beat or bar boundary.
 * Returns a cancel function. The action runs immediately if quantize is off,
 * if no usable reference deck has a beat grid, or if the computed delay is
 * less than 10ms (well within timer jitter).
 */
export function quantizeAction(
  deckId: DeckId,
  action: () => void | Promise<void>,
  opts: QuantizeOpts = {},
): () => void {
  const mode: QuantizeMode = opts.mode ?? quantizeMode;
  const allowSolo = opts.allowSolo !== false;
  const kind = opts.kind ?? 'play';

  // Off → fire immediately, no pending state.
  if (mode === 'off') {
    void action();
    return () => { /* already fired */ };
  }

  // Pick the reference deck for the next-boundary calculation.
  const store = useDJStore.getState();
  const otherDeckId: DeckId = deckId === 'A' ? 'B' : deckId === 'B' ? 'A' : 'A';
  const otherDeck = store.decks[otherDeckId];
  const thisDeck = store.decks[deckId];

  let refDeckId: DeckId | null = null;
  if (otherDeck.isPlaying && otherDeck.beatGrid) {
    refDeckId = otherDeckId;
  } else if (allowSolo && thisDeck.beatGrid) {
    refDeckId = deckId;
  }

  // No grid to snap to → fire now.
  if (!refDeckId) {
    void action();
    return () => { /* already fired */ };
  }

  // Compute delay from the reference deck's grid.
  const grid = store.decks[refDeckId].beatGrid!;
  const beatPeriod = grid.bpm > 0 ? 60 / grid.bpm : 0.5;
  const period = mode === 'bar' ? beatPeriod * (grid.timeSignature || 4) : beatPeriod;
  const rawDelay = mode === 'bar' ? timeToNextDownbeat(refDeckId) : timeToNextBeat(refDeckId);

  // Jitter guard: if we're within 50ms of a boundary, wait for the NEXT one
  // instead — prevents starting mid-beat due to timer jitter.
  let effectiveDelay = rawDelay;
  if (effectiveDelay < 0.05) effectiveDelay += period;

  // Sub-10ms remainder — fire now, the cost of an extra timer is wasted work.
  if (effectiveDelay < 0.01) {
    void action();
    return () => { /* already fired */ };
  }

  // Set pending state for UI feedback.
  const etaMs = effectiveDelay * 1000;
  store.setDeckPending(deckId, {
    kind,
    mode,
    startedAt: performance.now(),
    etaMs,
  });

  let cancelled = false;
  const timer = setTimeout(() => {
    if (cancelled) return;
    useDJStore.getState().setDeckPending(deckId, null);
    void action();
  }, etaMs);

  return () => {
    if (cancelled) return;
    cancelled = true;
    clearTimeout(timer);
    useDJStore.getState().setDeckPending(deckId, null);
  };
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
 * `beats` beats. Uses setInterval for reliable operation even when hidden.
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

  // Apply an immediate initial offset so even short taps are audible
  const INITIAL_JUMP = 0.15;
  let actualStart = 0;
  try {
    actualStart = getTrackedFilterPosition(deckId);
  } catch {
    actualStart = 0;
  }
  const initialPos = actualStart + (clampedTarget - actualStart) * INITIAL_JUMP;
  try {
    getDJEngine().getDeck(deckId).setFilterPosition(initialPos);
    setTrackedFilterPosition(deckId, initialPos);
  } catch { /* engine not ready */ }
  useDJStore.getState().setDeckFilter(deckId, initialPos);

  // Fire sweep immediately — filter sweeps are continuous animations
  // that don't benefit from beat-quantization (the ramp IS the timing)
  startSweepTimer(sweep, key, durationMs, (progress, _eased) => {
    const jumpBlend = Math.max(INITIAL_JUMP, progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2);
    const current = actualStart + (clampedTarget - actualStart) * jumpBlend;

    try {
      getDJEngine().getDeck(deckId).setFilterPosition(current);
      setTrackedFilterPosition(deckId, current);
    } catch { /* engine not ready */ }
    useDJStore.getState().setDeckFilter(deckId, current);
  }, onDone);

  return () => {
    sweep.cancelled = true;
    clearInterval(sweep.id as ReturnType<typeof setInterval>);
    activeSweeps.delete(key);
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
    const startVal = useDJStore.getState().crossfaderPosition;

    startSweepTimer(sweep, key, durationMs, (_progress, eased) => {
      const current = startVal + (clampedTarget - startVal) * eased;
      try {
        getDJEngine().setCrossfader(current);
      } catch { /* engine not ready */ }
      useDJStore.getState().setCrossfader(current);
    }, onDone);
  });

  return () => {
    sweep.cancelled = true;
    clearInterval(sweep.id as ReturnType<typeof setInterval>);
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
      crossfaderSweep(crossfadeTarget, totalBeats, fromDeck, () => {
        // Crossfade complete — stop the outgoing deck so Auto DJ can advance
        if (!cancelled) {
          try {
            getDJEngine().getDeck(fromDeck).stop();
          } catch { /* engine not ready */ }
          useDJStore.getState().setDeckPlaying(fromDeck, false);
        }
      })
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

// ── Cut Transition ──────────────────────────────────────────────────────────

/**
 * Hard cut: snap crossfader to incoming deck on next downbeat.
 * No overlap — outgoing deck stops immediately. Punchy and energetic.
 */
export function cutTransition(
  fromDeck: DeckId,
  toDeck: DeckId,
): () => void {
  let cancelled = false;

  syncBPMToOther(toDeck, fromDeck);
  phaseAlign(toDeck, fromDeck, 'bar');

  const cancel = scheduleQuantized(fromDeck, () => {
    if (cancelled) return;

    // Start incoming deck
    try { getDJEngine().getDeck(toDeck).play(); } catch { /* */ }

    // Hard snap crossfader
    const target = toDeck === 'A' ? 0 : toDeck === 'B' ? 1 : 0.5;
    try { getDJEngine().setCrossfader(target); } catch { /* */ }
    useDJStore.getState().setCrossfader(target);

    // Stop outgoing immediately
    try { getDJEngine().getDeck(fromDeck).stop(); } catch { /* */ }
    useDJStore.getState().setDeckPlaying(fromDeck, false);
  });

  return () => { cancelled = true; cancel(); };
}

// ── Filter Build Transition ────────────────────────────────────────────────

/**
 * Incoming deck starts with HPF (muffled) and sweeps to full over the
 * transition period. Creates a "building" effect. Outgoing fades out normally.
 */
export function filterBuildTransition(
  fromDeck: DeckId,
  toDeck: DeckId,
  bars: number = 8,
): () => void {
  const cancellers: (() => void)[] = [];
  let cancelled = false;

  syncBPMToOther(toDeck, fromDeck);
  phaseAlign(toDeck, fromDeck, 'bar');

  let beatsPerBar = 4;
  try { beatsPerBar = useDJStore.getState().decks[fromDeck].beatGrid?.timeSignature || 4; } catch { /* */ }
  const totalBeats = bars * beatsPerBar;

  const cancelSchedule = scheduleQuantized(fromDeck, () => {
    if (cancelled) return;

    // Start incoming with HPF applied
    try {
      const engine = getDJEngine();
      engine.getDeck(toDeck).setFilterPosition(-0.8);
      setTrackedFilterPosition(toDeck, -0.8);
      engine.getDeck(toDeck).play();
    } catch { /* */ }

    // Crossfade normally
    const crossfadeTarget = toDeck === 'A' ? 0 : toDeck === 'B' ? 1 : 0.5;
    cancellers.push(
      crossfaderSweep(crossfadeTarget, totalBeats, fromDeck, () => {
        if (!cancelled) {
          try { getDJEngine().getDeck(fromDeck).stop(); } catch { /* */ }
          useDJStore.getState().setDeckPlaying(fromDeck, false);
        }
      })
    );

    // Sweep incoming HPF from -0.8 → 0 over the transition (building effect)
    cancellers.push(
      filterSweep(toDeck, 0, totalBeats, () => {
        // Ensure filter is fully open at end
        if (!cancelled) {
          try { getDJEngine().getDeck(toDeck).setFilterPosition(0); setTrackedFilterPosition(toDeck, 0); } catch { /* */ }
        }
      })
    );

    // Also sweep outgoing HPF out
    cancellers.push(
      filterSweep(fromDeck, -0.8, Math.floor(totalBeats * 0.75))
    );
  });

  cancellers.push(cancelSchedule);
  return () => { cancelled = true; cancellers.forEach(c => c()); };
}

// ── Bass Swap Transition ───────────────────────────────────────────────────

/**
 * Kill bass on outgoing, bring in incoming bass, then full crossfade.
 * Sounds like a real DJ swapping the low end between tracks.
 * Best with tracks in compatible keys.
 */
export function bassSwapTransition(
  fromDeck: DeckId,
  toDeck: DeckId,
  bars: number = 8,
): () => void {
  const cancellers: (() => void)[] = [];
  let cancelled = false;

  syncBPMToOther(toDeck, fromDeck);
  phaseAlign(toDeck, fromDeck, 'bar');

  let beatsPerBar = 4;
  try { beatsPerBar = useDJStore.getState().decks[fromDeck].beatGrid?.timeSignature || 4; } catch { /* */ }
  const totalBeats = bars * beatsPerBar;
  const halfBeats = Math.floor(totalBeats / 2);

  const cancelSchedule = scheduleQuantized(fromDeck, () => {
    if (cancelled) return;

    try {
      const engine = getDJEngine();
      // Start incoming at reduced volume
      engine.getDeck(toDeck).play();
    } catch { /* */ }

    // Phase 1 (first half): crossfade to 50%, kill outgoing bass
    const midTarget = toDeck === 'B' ? 0.5 : 0.5;
    cancellers.push(
      crossfaderSweep(midTarget, halfBeats, fromDeck, () => {
        if (cancelled) return;
        // At midpoint: kill outgoing bass, ensure incoming bass is full
        try {
          getDJEngine().getDeck(fromDeck).setEQ('low', -24);
          useDJStore.getState().setDeckEQ(fromDeck, 'low', -24);
        } catch { /* */ }

        // Phase 2 (second half): complete crossfade
        const finalTarget = toDeck === 'A' ? 0 : toDeck === 'B' ? 1 : 0.5;
        cancellers.push(
          crossfaderSweep(finalTarget, halfBeats, fromDeck, () => {
            if (!cancelled) {
              // Restore outgoing bass EQ for next use
              try {
                getDJEngine().getDeck(fromDeck).setEQ('low', 0);
                useDJStore.getState().setDeckEQ(fromDeck, 'low', 0);
                getDJEngine().getDeck(fromDeck).stop();
              } catch { /* */ }
              useDJStore.getState().setDeckPlaying(fromDeck, false);
            }
          })
        );
      })
    );
  });

  cancellers.push(cancelSchedule);
  return () => { cancelled = true; cancellers.forEach(c => c()); };
}

// ── Echo-Out Transition ────────────────────────────────────────────────────

/**
 * Echo out the outgoing deck while snapping to incoming.
 * Combines echoOut volume fade with crossfader snap.
 */
export function echoOutTransition(
  fromDeck: DeckId,
  toDeck: DeckId,
  beats: number = 8,
): () => void {
  const cancellers: (() => void)[] = [];
  let cancelled = false;

  syncBPMToOther(toDeck, fromDeck);
  phaseAlign(toDeck, fromDeck, 'bar');

  const cancelSchedule = scheduleQuantized(fromDeck, () => {
    if (cancelled) return;

    // Start incoming
    try { getDJEngine().getDeck(toDeck).play(); } catch { /* */ }

    // Snap crossfader to incoming
    const target = toDeck === 'A' ? 0 : toDeck === 'B' ? 1 : 0.5;
    try { getDJEngine().setCrossfader(target); } catch { /* */ }
    useDJStore.getState().setCrossfader(target);

    // Echo out the outgoing deck (volume fade)
    cancellers.push(
      echoOut(fromDeck, beats, () => {
        if (!cancelled) {
          try { getDJEngine().getDeck(fromDeck).stop(); } catch { /* */ }
          useDJStore.getState().setDeckPlaying(fromDeck, false);
          // Restore volume for next use
          try { getDJEngine().getDeck(fromDeck).setVolume(1); } catch { /* */ }
          useDJStore.getState().setDeckVolume(fromDeck, 1);
        }
      })
    );
  });

  cancellers.push(cancelSchedule);
  return () => { cancelled = true; cancellers.forEach(c => c()); };
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

  let startVol = 1;

  const cancelSchedule = scheduleQuantized(deckId, () => {
    try {
      startVol = getDJEngine().getDeck(deckId).getVolume();
    } catch { /* fallback */ }

    startSweepTimer(sweep, key, durationMs, (progress) => {
      // Exponential fade for natural-sounding decay
      const volume = startVol * Math.pow(1 - progress, 2);
      try {
        getDJEngine().getDeck(deckId).setVolume(volume);
      } catch { /* engine not ready */ }
      useDJStore.getState().setDeckVolume(deckId, volume);
    }, () => {
      // Fade complete — stop deck at zero volume
      try {
        const engine = getDJEngine();
        const deck = engine.getDeck(deckId);
        deck.setVolume(0);
        if (deck.playbackMode === 'audio') {
          deck.audioPlayer.stop();
        } else {
          deck.pause();
        }
        useDJStore.getState().setDeckPlaying(deckId, false);
        useDJStore.getState().setDeckVolume(deckId, startVol);
      } catch { /* engine not ready */ }
      onDone?.();
    });
  });

  return () => {
    sweep.cancelled = true;
    clearInterval(sweep.id as ReturnType<typeof setInterval>);
    activeSweeps.delete(key);
    cancelSchedule();
    // Restore volume to pre-echo level
    try {
      getDJEngine().getDeck(deckId).setVolume(startVol);
    } catch { /* engine not ready */ }
  };
}

// ── Cancel All ───────────────────────────────────────────────────────────────

/**
 * Cancel all active sweeps/automations (panic button).
 */
export function cancelAllAutomation(): void {
  activeSweeps.forEach((sweep) => {
    sweep.cancelled = true;
    clearInterval(sweep.id as ReturnType<typeof setInterval>);
  });
  activeSweeps.clear();
}

// ── Internal Helpers ─────────────────────────────────────────────────────────

function cancelSweep(key: string): void {
  const existing = activeSweeps.get(key);
  if (existing) {
    existing.cancelled = true;
    clearInterval(existing.id as ReturnType<typeof setInterval>);
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
