/**
 * DJActions — Shared action functions for atomic store + engine synchronization
 *
 * Every DJ control (transport, EQ, filter, volume, crossfader, etc.) goes through
 * these functions. They update the Zustand store FIRST (for immediate UI feedback),
 * then update the audio engine. Engine calls are wrapped in try/catch because the
 * engine may not be initialized yet.
 *
 * Views (DOM, Pixi, 3D) call these instead of touching the store or engine directly.
 * This eliminates the dual-write problem where some views update only the store,
 * some only the engine, and some both — with no consistency.
 */

import { useDJStore, type CrossfaderCurve } from '@/stores/useDJStore';
import { getDJEngine } from './DJEngine';
import { quantizedEQKill, getQuantizeMode, setTrackedFilterPosition } from './DJQuantizedFX';
import { quantizedPlay } from './DJAutoSync';
import type { DeckId } from './DeckEngine';

// ============================================================================
// TYPES
// ============================================================================

export interface TogglePlayOptions {
  /** Use quantized play if mode is beat/bar (default: true) */
  quantize?: boolean;
  /** Spin-down duration on pause in ms (default: 800, 0 = instant) */
  spinDownMs?: number;
  /** Spin-down curve shape (default: 'exponential') */
  spinDownCurve?: 'exponential' | 'linear';
}

// ============================================================================
// TRANSPORT
// ============================================================================

/**
 * Toggle play/pause for a deck.
 *
 * On pause: applies spin-down effect (if spinDownMs > 0), then sets deck not playing.
 * On play: checks quantize mode and other deck state, uses quantizedPlay if applicable.
 */
export async function togglePlay(
  deckId: DeckId,
  options: TogglePlayOptions = {},
): Promise<void> {
  const {
    quantize = true,
    spinDownMs = 800,
    spinDownCurve = 'exponential',
  } = options;

  const store = useDJStore.getState();
  const isPlaying = store.decks[deckId].isPlaying;

  if (isPlaying) {
    // ── PAUSE ──
    if (spinDownMs > 0) {
      // Spin-down: gradually decelerate then stop
      try {
        const deck = getDJEngine().getDeck(deckId);
        const startTime = performance.now();
        const startRate = 1.0;

        await new Promise<void>((resolve) => {
          function tick() {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(1, elapsed / spinDownMs);

            let rate: number;
            if (spinDownCurve === 'exponential') {
              // Exponential decay: sounds like a turntable losing power
              rate = startRate * Math.pow(1 - progress, 2);
            } else {
              rate = startRate * (1 - progress);
            }

            if (progress >= 1) {
              // Spin-down complete — stop
              deck.pause();
              // Restore normal playback rate for next play
              if (deck.playbackMode === 'audio') {
                deck.audioPlayer.setPlaybackRate(1.0);
              } else {
                deck.replayer.setTempoMultiplier(1.0);
                deck.replayer.setPitchMultiplier(1.0);
              }
              useDJStore.getState().setDeckPlaying(deckId, false);
              resolve();
              return;
            }

            // Apply deceleration
            const clampedRate = Math.max(0.01, rate);
            if (deck.playbackMode === 'audio') {
              deck.audioPlayer.setPlaybackRate(clampedRate);
            } else {
              deck.replayer.setTempoMultiplier(clampedRate);
              deck.replayer.setPitchMultiplier(clampedRate);
            }

            requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        });
      } catch {
        // Engine not ready — instant pause via store only
        store.setDeckPlaying(deckId, false);
      }
    } else {
      // Instant pause
      store.setDeckPlaying(deckId, false);
      try {
        getDJEngine().getDeck(deckId).pause();
      } catch { /* engine not ready */ }
    }
  } else {
    // ── PLAY ──
    const otherDeckId: DeckId = deckId === 'A' ? 'B' : 'A';
    const otherIsPlaying = store.decks[otherDeckId].isPlaying;
    const qMode = getQuantizeMode();

    if (quantize && qMode !== 'off' && otherIsPlaying) {
      // Quantized play: wait for next beat/bar boundary on the other deck
      await quantizedPlay(deckId, qMode as 'beat' | 'bar');
    } else {
      // Immediate play
      store.setDeckPlaying(deckId, true);
      try {
        await getDJEngine().getDeck(deckId).play();
      } catch {
        // Engine failed — revert store
        useDJStore.getState().setDeckPlaying(deckId, false);
      }
    }
  }
}

/**
 * Hard stop a deck — immediate, no spin-down.
 */
export function stopDeck(deckId: DeckId): void {
  useDJStore.getState().setDeckPlaying(deckId, false);
  try {
    getDJEngine().getDeck(deckId).stop();
  } catch { /* engine not ready */ }
}

/**
 * Cue a deck to a specific position.
 *
 * @param position - Song position (pattern index for tracker mode, seconds for audio mode)
 * @param pattPos - Row within pattern (tracker mode only, default 0)
 */
export function cueDeck(deckId: DeckId, position: number, pattPos = 0): void {
  useDJStore.getState().setDeckCuePoint(deckId, position);
  try {
    getDJEngine().getDeck(deckId).cue(position, pattPos);
  } catch { /* engine not ready */ }
}

// ============================================================================
// EQ
// ============================================================================

/**
 * Set an EQ band value in dB (clamped -24 to +6).
 */
export function setDeckEQ(deckId: DeckId, band: 'low' | 'mid' | 'high', dB: number): void {
  const clamped = Math.max(-24, Math.min(6, dB));
  useDJStore.getState().setDeckEQ(deckId, band, clamped);
  try {
    getDJEngine().getDeck(deckId).setEQ(band, clamped);
  } catch { /* engine not ready */ }
}

/**
 * Toggle EQ kill for a band. Supports quantized triggering.
 *
 * @returns Cancel function (for quantized kills that haven't fired yet)
 */
export function setDeckEQKill(
  deckId: DeckId,
  band: 'low' | 'mid' | 'high',
  kill: boolean,
): (() => void) | void {
  // Update store immediately for UI feedback
  useDJStore.getState().setDeckEQKill(deckId, band, kill);

  // Engine update may be quantized
  const qMode = getQuantizeMode();
  if (qMode !== 'off') {
    return quantizedEQKill(deckId, band, kill);
  }

  // Immediate (non-quantized)
  try {
    getDJEngine().getDeck(deckId).setEQKill(band, kill);
  } catch { /* engine not ready */ }
}

// ============================================================================
// FILTER
// ============================================================================

/**
 * Set filter position: -1 (HPF full) to 0 (bypass) to +1 (LPF full).
 */
export function setDeckFilter(deckId: DeckId, position: number): void {
  const clamped = Math.max(-1, Math.min(1, position));
  useDJStore.getState().setDeckFilter(deckId, clamped);
  setTrackedFilterPosition(deckId, clamped);
  try {
    getDJEngine().getDeck(deckId).setFilterPosition(clamped);
  } catch { /* engine not ready */ }
}

// ============================================================================
// VOLUME
// ============================================================================

/**
 * Set channel fader volume (clamped 0 to 1).
 */
export function setDeckVolume(deckId: DeckId, volume: number): void {
  const clamped = Math.max(0, Math.min(1, volume));
  useDJStore.getState().setDeckVolume(deckId, clamped);
  try {
    getDJEngine().getDeck(deckId).setVolume(clamped);
  } catch { /* engine not ready */ }
}

/**
 * Set trim/auto-gain in dB (clamped -12 to +12).
 */
export function setDeckTrimGain(deckId: DeckId, dB: number): void {
  const clamped = Math.max(-12, Math.min(12, dB));
  useDJStore.getState().setDeckTrimGain(deckId, clamped);
  try {
    getDJEngine().getDeck(deckId).setTrimGain(clamped);
  } catch { /* engine not ready */ }
}

// ============================================================================
// CROSSFADER
// ============================================================================

/**
 * Set crossfader position (0 = deck A, 1 = deck B).
 */
export function setCrossfader(position: number): void {
  const clamped = Math.max(0, Math.min(1, position));
  useDJStore.getState().setCrossfader(clamped);
  try {
    getDJEngine().mixer.setCrossfader(clamped);
  } catch { /* engine not ready */ }
}

/**
 * Set crossfader curve type.
 */
export function setCrossfaderCurve(curve: CrossfaderCurve): void {
  useDJStore.getState().setCrossfaderCurve(curve);
  try {
    getDJEngine().mixer.setCurve(curve);
  } catch { /* engine not ready */ }
}

// ============================================================================
// MASTER
// ============================================================================

/**
 * Set master output volume (clamped 0 to 1.5).
 */
export function setMasterVolume(volume: number): void {
  const clamped = Math.max(0, Math.min(1.5, volume));
  useDJStore.getState().setMasterVolume(clamped);
  try {
    getDJEngine().mixer.setMasterVolume(clamped);
  } catch { /* engine not ready */ }
}

/**
 * Set booth/monitor output volume (clamped 0 to 1.5).
 * Note: Booth output is a store-only value currently (no separate engine node).
 */
export function setBoothVolume(volume: number): void {
  const clamped = Math.max(0, Math.min(1.5, volume));
  useDJStore.getState().setBoothVolume(clamped);
  // Booth volume is store-only — no engine equivalent yet
}

// ============================================================================
// PFL (Pre-Fader Listen / Headphone Cue)
// ============================================================================

/**
 * Toggle PFL (headphone cue) for a deck.
 */
export function togglePFL(deckId: DeckId): void {
  const store = useDJStore.getState();
  const current = store.decks[deckId].pflEnabled;
  const next = !current;
  store.setDeckPFL(deckId, next);
  try {
    getDJEngine().mixer.setPFL(deckId, next);
  } catch { /* engine not ready */ }
}

// ============================================================================
// KEY LOCK
// ============================================================================

/**
 * Enable/disable key lock (master tempo) for a deck.
 * When enabled, pitch slider changes only affect tempo, not musical key.
 */
export function setDeckKeyLock(deckId: DeckId, enabled: boolean): void {
  useDJStore.getState().setDeckKeyLock(deckId, enabled);
  try {
    getDJEngine().getDeck(deckId).setKeyLock(enabled);
  } catch { /* engine not ready */ }
}

// ============================================================================
// SCRATCH
// ============================================================================

/**
 * Enter scratch mode — cancels any in-progress decay, marks jog wheel as active.
 */
export function startScratch(deckId: DeckId): void {
  useDJStore.getState().setDeckScratchActive(deckId, true);
  try {
    getDJEngine().getDeck(deckId).startScratch();
  } catch { /* engine not ready */ }
}

/**
 * Update scratch velocity while in scratch mode.
 * Positive = forward, negative = backward. Clamped to [-4, 4].
 */
export function setScratchVelocity(deckId: DeckId, velocity: number): void {
  useDJStore.getState().setDeckState(deckId, { scratchVelocity: velocity });
  try {
    getDJEngine().getDeck(deckId).setScratchVelocity(velocity);
  } catch { /* engine not ready */ }
}

/**
 * Exit scratch mode — smoothly decays pitch/tempo back to rest over decayMs.
 *
 * @param decayMs - Decay duration in ms (default 200)
 */
export function stopScratch(deckId: DeckId, decayMs = 200): void {
  useDJStore.getState().setDeckScratchActive(deckId, false);
  useDJStore.getState().setDeckState(deckId, { scratchVelocity: 0 });
  try {
    getDJEngine().getDeck(deckId).stopScratch(decayMs);
  } catch { /* engine not ready */ }
}
