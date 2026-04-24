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

import * as Tone from 'tone';
import { useDJStore, type CrossfaderCurve } from '@/stores/useDJStore';
import type { DjEqPreset } from '@/constants/djEqPresets';
import { useDJSetStore } from '@/stores/useDJSetStore';
import { useAudioStore } from '@/stores/useAudioStore';
import { useVocoderStore } from '@/stores/useVocoderStore';
import { getDrumPadEngine, getNoteRepeatEngine } from '@/hooks/drumpad/useMIDIPadRouting';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import { getDJEngine, getDJEngineIfActive } from './DJEngine';
import type { DJSet } from './recording/DJSetFormat';
import { quantizedEQKill, getQuantizeMode, quantizeAction, cancelAllAutomation } from './DJQuantizedFX';
import { syncBPMToOther, phaseAlign, snapPositionToBeat } from './DJAutoSync';
import { DJBeatSync } from './DJBeatSync';
import { getAutoDJ } from './DJAutoDJ';
import { smartSort } from './DJPlaylistSort';
import { useDJPlaylistStore } from '@/stores/useDJPlaylistStore';
import type { DeckId, FaderLFODivision } from './DeckEngine';

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

  // Ensure AudioContext is running (browser suspends until user gesture)
  if (Tone.getContext().state !== 'running') {
    await Tone.start();
  }

  const store = useDJStore.getState();
  const isPlaying = store.decks[deckId].isPlaying;

  if (isPlaying) {
    // ── PAUSE ──
    // If Auto DJ is active, pause it so its poll guard doesn't
    // immediately resume the deck the user just paused.
    if (store.autoDJEnabled) {
      getAutoDJ().pause();
    }
    if (spinDownMs > 0) {
      // Spin-down: gradually decelerate then stop
      try {
        const deck = getDJEngine().getDeck(deckId);
        const startTime = performance.now();
        const startRate = 1.0;

        await new Promise<void>((resolve) => {
          function finishSpinDown() {
            deck.pause();
            // Restore normal playback rate for next play
            if (deck.playbackMode === 'audio') {
              deck.audioPlayer.setPlaybackRate(1.0);
            } else {
              deck.replayer.setTempoMultiplier(1.0);
              deck.replayer.setPitchMultiplier(1.0);
            }
            useDJStore.getState().setDeckPlaying(deckId, false);
            import('@/engine/dub/StreamAutoDub').then(({ stopStreamAutoDub }) => {
              stopStreamAutoDub(deckId);
            });
            resolve();
          }

          function tick() {
            // Tab backgrounded — skip animation, stop immediately
            if (document.hidden) {
              finishSpinDown();
              return;
            }

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
              finishSpinDown();
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
      import('@/engine/dub/StreamAutoDub').then(({ stopStreamAutoDub }) => {
        stopStreamAutoDub(deckId);
      });
      try {
        getDJEngine().getDeck(deckId).pause();
      } catch { /* engine not ready */ }
    }
  } else {
    // ── PLAY ──
    // Sync engine volume from store (may be out of sync after echo-out or other FX)
    try {
      getDJEngine().getDeck(deckId).setVolume(store.decks[deckId].volume);
    } catch { /* engine not ready */ }

    // The actual "press play now" action — runs immediately or deferred to a beat.
    const fire = async (): Promise<void> => {
      const s = useDJStore.getState();
      const otherDeckId: DeckId = deckId === 'A' ? 'B' : 'A';
      const otherIsPlaying = s.decks[otherDeckId].isPlaying;
      // Phase-align right before starting if there's a master to lock to.
      if (otherIsPlaying && s.decks[otherDeckId].beatGrid && s.decks[deckId].beatGrid) {
        syncBPMToOther(deckId, otherDeckId);
        const mode = getQuantizeMode();
        phaseAlign(deckId, otherDeckId, mode === 'bar' ? 'bar' : 'beat');
      }
      s.setDeckPlaying(deckId, true);
      try {
        await getDJEngine().getDeck(deckId).play();
        // Start stream auto-dub if enabled
        if (useDJStore.getState().streamAutoDub) {
          import('@/engine/dub/StreamAutoDub').then(({ startStreamAutoDub }) => {
            startStreamAutoDub(deckId);
          });
        }
      } catch {
        useDJStore.getState().setDeckPlaying(deckId, false);
      }
    };

    if (quantize === false) {
      // Escape hatch (used by DeckVinyl3DView scrub-release).
      await fire();
    } else {
      // quantizeAction handles the off-mode and the no-grid fall-through itself.
      // Solo snap is enabled so a press while the other deck is silent still
      // lands on this deck's own grid.
      quantizeAction(deckId, fire, { kind: 'play', allowSolo: true });
    }
  }
}

/**
 * Hard stop a deck — immediate, no spin-down.
 */
export function stopDeck(deckId: DeckId): void {
  useDJStore.getState().setDeckPlaying(deckId, false);
  import('@/engine/dub/StreamAutoDub').then(({ stopStreamAutoDub }) => {
    stopStreamAutoDub(deckId);
  });
  try {
    getDJEngine().getDeck(deckId).stop();
  } catch { /* engine not ready */ }
}

/**
 * Cue a deck to a specific position.
 *
 * If quantize is on, the jump is deferred to the next beat/bar boundary of
 * the master (other) deck (or this deck's own grid in solo mode), so cue
 * presses always land on the grid. For audio-mode decks, the requested
 * position is also snapped to the nearest beat in this deck's own grid so
 * the stored cue point is musically meaningful.
 *
 * @param position - Song position (pattern index for tracker mode, seconds for audio mode)
 * @param pattPos - Row within pattern (tracker mode only, default 0)
 */
export function cueDeck(deckId: DeckId, position: number, pattPos = 0): void {
  // Snap the cue target itself for audio-mode decks (positions are seconds).
  // Tracker-mode positions are pattern indices and don't have a meaningful
  // beat-snap, so leave them as-is.
  let snapped = position;
  try {
    const deck = getDJEngine().getDeck(deckId);
    if (deck.playbackMode === 'audio') {
      snapped = snapPositionToBeat(deckId, position, 'beat');
    }
  } catch { /* engine not ready — use raw position */ }

  useDJStore.getState().setDeckCuePoint(deckId, snapped);

  quantizeAction(
    deckId,
    () => {
      try {
        getDJEngine().getDeck(deckId).cue(snapped, pattPos);
      } catch { /* engine not ready */ }
    },
    { kind: 'cue', allowSolo: true },
  );
}

/**
 * Sync this deck's BPM/pitch to the other deck.
 *
 * Handles beat grid sync (with phase align), audio-mode BPM matching, and
 * tracker-mode BPM sync. Also auto-plays this deck if it isn't already playing.
 *
 * @param deckId - The deck to sync (the follower)
 * @param otherDeckId - The deck to sync to (the leader, defaults to the opposite deck)
 */
export function syncDeckBPM(deckId: DeckId, otherDeckId?: DeckId): void {
  const resolvedOther: DeckId = otherDeckId ?? (deckId === 'A' ? 'B' : 'A');
  try {
    const engine = getDJEngine();
    const thisDeck = engine.getDeck(deckId);
    const otherDeck = engine.getDeck(resolvedOther);
    const store = useDJStore.getState();
    const otherState = store.decks[resolvedOther];
    const thisState = store.decks[deckId];

    if (!otherState.fileName) return;

    // Move crossfader fully to the other (leader) deck
    const cf = store.crossfaderPosition;
    if (deckId === 'A' && cf < 1) store.setCrossfader(1);
    else if (deckId === 'B' && cf > 0) store.setCrossfader(0);

    if (thisState.beatGrid && otherState.beatGrid) {
      // Precise beat-grid sync + phase align
      const semitones = syncBPMToOther(deckId, resolvedOther);
      store.setDeckPitch(deckId, semitones);
      phaseAlign(deckId, resolvedOther);
    } else if (otherDeck.playbackMode === 'audio' || thisDeck.playbackMode === 'audio') {
      // Audio mode — match via detected BPM
      const targetBPM = otherState.detectedBPM;
      const thisBPMBase = thisState.detectedBPM;
      if (targetBPM > 0 && thisBPMBase > 0) {
        const ratio = targetBPM / thisBPMBase;
        const semitones = 12 * Math.log2(ratio);
        store.setDeckPitch(deckId, semitones);
      }
    } else {
      // Tracker mode
      if (!otherDeck.replayer.getSong()) return;
      const semitones = DJBeatSync.syncBPM(otherDeck, thisDeck);
      store.setDeckPitch(deckId, semitones);
    }

    // Auto-play this deck if it isn't already playing
    if (!thisState.isPlaying) {
      thisDeck.play().then(() => {
        useDJStore.getState().setDeckPlaying(deckId, true);
      }).catch(() => { /* engine not ready */ });
    }
  } catch {
    // Engine might not be initialized yet
  }
}

// ============================================================================
// EQ
// ============================================================================

/**
 * Set an EQ band value in dB (clamped -12 to +12).
 */
export function setDeckEQ(deckId: DeckId, band: 'low' | 'mid' | 'high', dB: number): void {
  const clamped = Math.max(-12, Math.min(12, dB));
  useDJStore.getState().setDeckEQ(deckId, band, clamped);
  try {
    getDJEngine().getDeck(deckId).setEQ(band, clamped);
  } catch { /* engine not ready */ }
}

/** Apply a quick-EQ preset to a deck (all 3 bands atomically). */
export function applyEqPreset(deckId: DeckId, preset: DjEqPreset): void {
  useDJStore.getState().setDeckState(deckId, {
    eqLow: preset.eqLow,
    eqMid: preset.eqMid,
    eqHigh: preset.eqHigh,
    eqPreset: preset.id,
  });
  try {
    const deck = getDJEngine().getDeck(deckId);
    // Longer ramp on preset jumps so Flat → Deep / Punch / Warm reads as a
    // smooth crossfade of the EQ curve, not a click + abrupt timbre shift.
    // 250 ms is the sweet spot: fast enough to feel responsive to the tap,
    // slow enough for the bass lift to audibly slide in.
    const RAMP_SEC = 0.25;
    deck.setEQ('low', preset.eqLow, RAMP_SEC);
    deck.setEQ('mid', preset.eqMid, RAMP_SEC);
    deck.setEQ('high', preset.eqHigh, RAMP_SEC);
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
  try {
    getDJEngine().getDeck(deckId).setFilterPosition(clamped);
  } catch { /* engine not ready */ }
}

/**
 * Set filter resonance/Q: 0.5 (gentle) to 15 (screaming).
 * Applied to both HPF and LPF simultaneously so resonance is consistent
 * regardless of which side of the sweep the filter is on.
 */
export function setDeckFilterResonance(deckId: DeckId, q: number): void {
  const clamped = Math.max(0.5, Math.min(15, q));
  useDJStore.getState().setDeckFilterResonance(deckId, clamped);
  try {
    getDJEngine().getDeck(deckId).setFilterResonance(clamped);
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

// ============================================================================
// MIC
// ============================================================================

/**
 * Toggle the microphone on/off. Updates store with the resulting state.
 */
export async function toggleMic(): Promise<void> {
  const engine = getDJEngineIfActive();
  if (!engine) return;
  const active = await engine.toggleMic();
  useDJSetStore.getState().setMicEnabled(active);
}

/**
 * Set microphone gain (clamped 0 to 1.5).
 */
export function setMicGain(gain: number): void {
  const clamped = Math.max(0, Math.min(1.5, gain));
  useDJSetStore.getState().setMicGain(clamped);
  const engine = getDJEngineIfActive();
  engine?.mic?.setGain(clamped);
}

// ============================================================================
// NUDGE
// ============================================================================

/**
 * Nudge a deck forward or backward by a number of ticks.
 *
 * @param offset - Positive = forward, negative = backward
 * @param ticks - Duration of nudge in ticks (default 8)
 */
export function nudgeDeck(deckId: DeckId, offset: number, ticks = 8): void {
  try {
    getDJEngine().getDeck(deckId).nudge(offset, ticks);
  } catch { /* engine not ready */ }
}

// ============================================================================
// LOOP
// ============================================================================

/**
 * Set a line loop on the deck (loop N rows from current position).
 */
export function setDeckLineLoop(deckId: DeckId, size: number): void {
  try {
    getDJEngine().getDeck(deckId).setLineLoop(size);
  } catch { /* engine not ready */ }
}

/**
 * Clear the active line loop on the deck.
 */
export function clearDeckLineLoop(deckId: DeckId): void {
  try {
    getDJEngine().getDeck(deckId).clearLineLoop();
  } catch { /* engine not ready */ }
}

// ============================================================================
// SLIP
// ============================================================================

/**
 * Enable or disable slip mode on a deck.
 */
export function setDeckSlipEnabled(deckId: DeckId, enabled: boolean): void {
  try {
    getDJEngine().getDeck(deckId).setSlipEnabled(enabled);
  } catch { /* engine not ready */ }
}

// ============================================================================
// KILL ALL
// ============================================================================

/**
 * Kill all audio on all decks (emergency stop).
 */
export function killAllDecks(): void {
  useDJStore.getState().setDeckPlaying('A', false);
  useDJStore.getState().setDeckPlaying('B', false);
  try {
    getDJEngine().killAll();
  } catch { /* engine not ready */ }
}

// ============================================================================
// PANIC
// ============================================================================

/**
 * DJ panic — silence all effects, drumpads, mic/vocoder, and reset all
 * stuck-able per-deck state (EQ kills, filter, loops, slip, pitch, scratch,
 * channel mutes). Decks keep playing.
 *
 * Bound to the ESC key in DJKeyboardHandler when no modal intercepts.
 */
export function djPanic(): void {
  const state = useDJStore.getState();
  const decks: DeckId[] = state.thirdDeckActive ? ['A', 'B', 'C'] : ['A', 'B'];

  useAudioStore.getState().setMasterEffects([]);

  // Panic the drumpad engine directly — can't rely on the `dj-panic` event
  // listener to handle the dub bus, because that listener lives in PadGrid
  // (drumpad view only). If the user is in DJ view when they hit ESC, the
  // event fires but no one listens, so siren feedback / stuck holds keep
  // the pink-noise floor amplified into sustained white noise.
  const dpe = getDrumPadEngine();
  if (dpe) {
    dpe.stopAll();
    dpe.dubPanic();
  }
  // Keep the store flag in sync with the engine's flushed state — without
  // this the Dub Bus UI still reports "enabled", and any knob tweak would
  // re-open the bus and bring the noise back.
  useDrumPadStore.getState().setDubBus({ enabled: false });
  getNoteRepeatEngine()?.stopAll();
  // Still fire the event for any other listeners (PadGrid, DJSamplerPanel)
  // that may be mounted and holding releaser-state we don't know about.
  window.dispatchEvent(new CustomEvent('dj-panic'));

  cancelAllAutomation();

  for (const d of decks) {
    stopDeckFaderLFO(d);
    setDeckEQKill(d, 'low', false);
    setDeckEQKill(d, 'mid', false);
    setDeckEQKill(d, 'high', false);
    setDeckFilter(d, 0);
    clearDeckLineLoop(d);
    setDeckChannelMuteMask(d, 0);
    setDeckSlipEnabled(d, false);
    setDeckPitch(d, 0);
    stopScratch(d, 50);
  }

  if (useDJSetStore.getState().micEnabled) {
    void toggleMic();
  }
  useVocoderStore.getState().setPTT(false);
}

/**
 * Nuclear kill — strongest possible teardown short of disposing the engine.
 * Calls djPanic() and, in addition, clamps the master bus gain to 0 for
 * 250 ms so any surviving audio (stuck worklet, long reverb tail, wedged
 * feedback loop) is inaudible while the rest of panic's work completes.
 * The master gain ramps back to 1 so the next deck press resumes normally.
 *
 * Also exposed as `window.__djKillAll()` so the DJ can mash it from the
 * DevTools console during a live set if panic isn't reaching something.
 */
export function djKillAll(): void {
  console.warn('[DJKillAll] NUCLEAR PANIC — silencing master bus + running djPanic()');

  // 1. Clamp the master output gain to 0 for ~250 ms so nothing escapes
  //    while we tear the bus down, then ramp it back up via the public
  //    setMasterVolume API (which ramps over 20 ms on each side).
  try {
    const engine = getDJEngineIfActive();
    if (engine) {
      const prevMaster = useDJStore.getState().masterVolume;
      engine.mixer.setMasterVolume(0);
      setTimeout(() => {
        try {
          engine.mixer.setMasterVolume(prevMaster);
        } catch { /* engine gone */ }
      }, 250);
    }
  } catch (err) {
    console.warn('[DJKillAll] master gain clamp failed:', err);
  }

  // 2. The full panic path (master FX cleared, dub bus drained, EQs
  //    reset, LFOs stopped, channel mutes cleared, mic off, etc.).
  djPanic();

  // 3. Explicitly flush the dub bus store — the engine's dubPanic clears
  //    internal state, but the mirror store value may be restored by a
  //    React render cycle during the drain window. Force-writing enabled
  //    = false AND echoWet/springWet = 0 lets the mirror push zeros to
  //    the engine even after the 2 s _draining window ends.
  try {
    useDrumPadStore.getState().setDubBus({
      enabled: false,
      echoWet: 0,
      springWet: 0,
      echoIntensity: 0,
      returnGain: 0,
    });
  } catch (err) {
    console.warn('[DJKillAll] dub bus store flush failed:', err);
  }
}

/**
 * Dump a full snapshot of dub-bus + drumpad state to the console. Used
 * during live debugging when something is audible that shouldn't be —
 * the output tells us which gain/wet/feedback/release is non-zero.
 *
 * Expose as window.__djDubDump(): call it anytime from DevTools to
 * see the current mix without having to click through the UI.
 */
export function djDubDump(): void {
  try {
    const dpe = getDrumPadEngine();
    if (!dpe) {
      console.warn('[DubDump] no drumpad engine');
      return;
    }
    // Access via the engine's public surface + a couple of non-private
    // internals we read through typed accessors. Wrapped in try so a
    // field-rename never silently breaks the dump.
    const e = dpe as unknown as {
      context: BaseAudioContext;
      dubBusEnabled: boolean;
      dubBusSettings: Record<string, unknown>;
      dubBusInput: { gain: AudioParam };
      dubBusReturn: { gain: AudioParam };
      dubBusFeedback: { gain: AudioParam };
      dubBusLPF: { frequency: AudioParam };
      dubBusNoiseGain?: { gain: AudioParam };
      dubDeckTaps: Map<string, { gain: AudioParam }>;
      dubActionReleasers: Map<unknown, unknown>;
      dubThrowTimers: Set<unknown>;
      _draining?: boolean;
    };
    const deckTaps: Record<string, number> = {};
    try { e.dubDeckTaps.forEach((tap, id) => { deckTaps[String(id)] = tap.gain.value; }); } catch { /* */ }
    const storeDubBus = useDrumPadStore.getState().dubBus;
    console.group('[DubDump] Dub bus state');
    console.log('Engine enabled:', e.dubBusEnabled);
    console.log('Engine _draining:', e._draining);
    console.log('Input gain:', e.dubBusInput.gain.value.toFixed(4));
    console.log('Return gain:', e.dubBusReturn.gain.value.toFixed(4));
    console.log('Feedback gain (siren):', e.dubBusFeedback.gain.value.toFixed(4));
    console.log('LPF cutoff (Hz):', Math.round(e.dubBusLPF.frequency.value));
    if (e.dubBusNoiseGain) {
      console.log('Pink-noise floor gain:', e.dubBusNoiseGain.gain.value.toFixed(6));
    }
    console.log('Deck taps:', deckTaps);
    console.log('Active releasers:', e.dubActionReleasers.size);
    console.log('Pending throw timers:', e.dubThrowTimers.size);
    console.log('Engine settings:', e.dubBusSettings);
    console.log('Store.dubBus:', storeDubBus);
    const master = useAudioStore.getState().masterEffects;
    console.log(`Master FX (${master.length}):`, master.map(fx => ({ type: fx.type, enabled: fx.enabled, wet: fx.wet })));
    console.groupEnd();
  } catch (err) {
    console.warn('[DubDump] failed:', err);
  }
}

// Expose to window for emergency console access mid-gig. Typed narrowly
// so we don't pollute the global shape beyond the functions we need.
if (typeof window !== 'undefined') {
  const w = window as unknown as { __djKillAll?: () => void; __djDubDump?: () => void };
  w.__djKillAll = djKillAll;
  w.__djDubDump = djDubDump;
}

// ============================================================================
// PITCH
// ============================================================================

/**
 * Set the pitch offset (in semitones) for a deck.
 * Updates the store and propagates to the engine.
 */
export function setDeckPitch(deckId: DeckId, semitones: number): void {
  const safe = Number.isFinite(semitones) ? semitones : 0;
  const clamped = Math.max(-16, Math.min(16, safe));
  useDJStore.getState().setDeckPitch(deckId, clamped);
  try {
    getDJEngine().getDeck(deckId).setPitch(clamped);
  } catch { /* engine not ready */ }
}

export function setDeckRepitchLock(deckId: DeckId, locked: boolean): void {
  useDJStore.getState().setDeckState(deckId, { repitchLock: locked });
  try {
    getDJEngine().getDeck(deckId).setRepitchLock(locked);
  } catch { /* engine not ready */ }
}

// ============================================================================
// CHANNEL MUTE MASK
// ============================================================================

/**
 * Set the channel mute mask on a deck's replayer.
 */
export function setDeckChannelMuteMask(deckId: DeckId, mask: number): void {
  try {
    getDJEngine().getDeck(deckId).replayer.setChannelMuteMask(mask);
  } catch { /* engine not ready */ }
}

/**
 * Read the current channel mute mask from a deck's replayer. Bit N = 1
 * means channel N is audible. Returns 0xFFFFFFFF (all audible) if the
 * engine is not yet ready so callers default to the safe "all on" state.
 */
export function getDeckChannelMuteMask(deckId: DeckId): number {
  try {
    return getDJEngine().getDeck(deckId).replayer.getChannelMuteMask() >>> 0;
  } catch {
    return 0xFFFFFFFF;
  }
}

// ============================================================================
// SEEK
// ============================================================================

/**
 * Seek a deck to a position (pattern index for tracker, seconds for audio).
 */
export function seekDeck(deckId: DeckId, position: number, pattPos = 0): void {
  try {
    getDJEngine().getDeck(deckId).cue(position, pattPos);
  } catch { /* engine not ready */ }
}

/**
 * Seek an audio-mode deck to a specific time in seconds.
 */
export function seekDeckAudio(deckId: DeckId, seconds: number): void {
  try {
    getDJEngine().getDeck(deckId).audioPlayer.seek(seconds);
  } catch (err) {
    console.warn('[DJActions] seek failed (crossfade or engine not ready):', err);
  }
}

// ============================================================================
// SCRATCH PATTERNS
// ============================================================================

/**
 * Start a named scratch pattern on a deck.
 */
export function playDeckPattern(
  deckId: DeckId,
  name: string,
  onWaiting?: (ms: number) => void,
): void {
  try {
    getDJEngine().getDeck(deckId).playPattern(name, onWaiting);
  } catch { /* engine not ready */ }
}

/**
 * Stop the active scratch pattern immediately.
 */
export function stopDeckPattern(deckId: DeckId): void {
  try {
    getDJEngine().getDeck(deckId).stopPattern();
  } catch { /* engine not ready */ }
}

/**
 * Let the current scratch pattern cycle finish, then stop.
 */
export function finishDeckPatternCycle(deckId: DeckId): void {
  try {
    getDJEngine().getDeck(deckId).finishPatternCycle();
  } catch { /* engine not ready */ }
}

/**
 * Start a fader LFO at the given beat division.
 */
export function startDeckFaderLFO(deckId: DeckId, division: FaderLFODivision): void {
  try {
    getDJEngine().getDeck(deckId).startFaderLFO(division);
  } catch { /* engine not ready */ }
}

/**
 * Stop the fader LFO on a deck.
 */
export function stopDeckFaderLFO(deckId: DeckId): void {
  try {
    getDJEngine().getDeck(deckId).stopFaderLFO();
  } catch { /* engine not ready */ }
}

// ============================================================================
// RECORDING
// ============================================================================

/**
 * Start recording a DJ set. Creates a new DJSetRecorder, starts it, and
 * attaches it to the engine (if active). Updates store state.
 */
export async function startRecording(): Promise<void> {
  const { DJSetRecorder } = await import('@/engine/dj/recording/DJSetRecorder');
  const recorder = new DJSetRecorder();
  recorder.startRecording();
  const engine = getDJEngineIfActive();
  if (engine) engine.recorder = recorder;
  useDJSetStore.getState().setRecording(true);
  useDJSetStore.getState().setRecordingStartTime(Date.now());
}

/**
 * Stop recording and return the DJSet object. Detaches recorder from engine.
 * Updates store state. Returns null if no recording is active.
 */
export async function stopRecording(
  name: string,
  userId: string,
  username: string,
): Promise<DJSet | null> {
  const engine = getDJEngineIfActive();
  if (!engine?.recorder) return null;
  const set = engine.recorder.stopRecording(name, userId, username);
  engine.recorder = null;
  useDJSetStore.getState().setRecording(false);
  useDJSetStore.getState().setRecordingDuration(0);
  return set;
}

// ============================================================================
// AUTO DJ
// ============================================================================

/** Enable Auto DJ — plays through the active playlist with beatmatched transitions.
 *  Returns null on success, or an error message string on failure. */
export async function enableAutoDJ(startIndex?: number): Promise<string | null> {
  // Smart-sort the playlist before starting for optimal BPM/key/energy flow
  const { activePlaylistId, playlists, sortTracks } = useDJPlaylistStore.getState();
  if (activePlaylistId) {
    const playlist = playlists.find((p) => p.id === activePlaylistId);
    if (playlist && playlist.tracks.length >= 2) {
      const sorted = smartSort([...playlist.tracks]);
      sortTracks(activePlaylistId, sorted);
    }
  }
  return await getAutoDJ().enable(startIndex);
}

/** Disable Auto DJ — current track keeps playing. */
export function disableAutoDJ(): void {
  getAutoDJ().disable();
}

/** Skip to the next Auto DJ track with a short transition. */
export async function skipAutoDJ(): Promise<void> {
  await getAutoDJ().skip();
}

/** Pause Auto DJ — stops transitions but keeps current track playing. */
export function pauseAutoDJ(): void {
  getAutoDJ().pause();
}

/** Resume Auto DJ after pause. */
export function resumeAutoDJ(): void {
  getAutoDJ().resume();
}

/** Jump to a specific track in the playlist and play it. */
export async function playAutoDJFromIndex(index: number): Promise<void> {
  await getAutoDJ().playFromIndex(index);
}

// ============================================================================
// STEM PLAYBACK
// ============================================================================

/** Toggle stem playback mode for a deck. */
export function setStemMode(deckId: DeckId, enabled: boolean): void {
  try {
    getDJEngine().getDeck(deckId).setStemMode(enabled);
  } catch { /* engine not ready */ }
}

/** Toggle mute on an individual stem. */
export function toggleStemMute(deckId: DeckId, stemName: string): void {
  try {
    const deck = getDJEngine().getDeck(deckId);
    const current = deck.stemPlayer.isStemMuted(stemName);
    deck.setStemMute(stemName, !current);
  } catch { /* engine not ready */ }
}

/** Set mute state on an individual stem. */
export function setStemMute(deckId: DeckId, stemName: string, muted: boolean): void {
  try {
    getDJEngine().getDeck(deckId).setStemMute(stemName, muted);
  } catch { /* engine not ready */ }
}

/** Toggle dub bus send for an individual stem. */
export function toggleStemDubSend(deckId: DeckId, stemName: string): void {
  const state = useDJStore.getState();
  const current = state.decks[deckId].stemDubSends[stemName] ?? false;
  const newSends = { ...state.decks[deckId].stemDubSends, [stemName]: !current };
  state.setDeckState(deckId, { stemDubSends: newSends });
}

/** Set per-stem volume (0-1). */
export function setStemVolume(deckId: DeckId, stemName: string, volume: number): void {
  try {
    getDJEngine().getDeck(deckId).stemPlayer.setStemVolume(stemName, volume);
  } catch { /* engine not ready */ }
  const state = useDJStore.getState();
  const newVols = { ...state.decks[deckId].stemVolumes, [stemName]: volume };
  state.setDeckState(deckId, { stemVolumes: newVols });
}

/** Toggle solo on an individual stem — solos mute all other stems. */
export function toggleStemSolo(deckId: DeckId, stemName: string): void {
  const state = useDJStore.getState();
  const current = state.decks[deckId].stemSolos[stemName] ?? false;
  const newSolos = { ...state.decks[deckId].stemSolos };
  const stemNames = state.decks[deckId].stemNames;

  if (current) {
    // Un-solo: clear this solo, unmute all
    newSolos[stemName] = false;
    const anySoloLeft = stemNames.some(n => n !== stemName && newSolos[n]);
    if (!anySoloLeft) {
      // No solos left — unmute all
      const newMutes: Record<string, boolean> = {};
      for (const n of stemNames) newMutes[n] = false;
      state.setDeckState(deckId, { stemSolos: newSolos, stemMutes: newMutes });
      try {
        for (const n of stemNames) getDJEngine().getDeck(deckId).setStemMute(n, false);
      } catch { /* engine not ready */ }
    } else {
      // Other solos still active — mute un-soloed stems
      const newMutes: Record<string, boolean> = {};
      for (const n of stemNames) newMutes[n] = !newSolos[n];
      state.setDeckState(deckId, { stemSolos: newSolos, stemMutes: newMutes });
      try {
        for (const n of stemNames) getDJEngine().getDeck(deckId).setStemMute(n, !newSolos[n]);
      } catch { /* engine not ready */ }
    }
  } else {
    // Solo: set this solo, mute all others
    for (const n of stemNames) newSolos[n] = (n === stemName);
    const newMutes: Record<string, boolean> = {};
    for (const n of stemNames) newMutes[n] = (n !== stemName);
    state.setDeckState(deckId, { stemSolos: newSolos, stemMutes: newMutes });
    try {
      for (const n of stemNames) {
        getDJEngine().getDeck(deckId).setStemMute(n, n !== stemName);
      }
    } catch { /* engine not ready */ }
  }
}

/**
 * Run Demucs stem separation on the currently loaded deck audio.
 * Works with all formats — audio files have stereo AudioBuffer directly,
 * tracker formats are pre-rendered to stereo WAV by the pipeline.
 *
 * Routes through DJStemQueue for priority scheduling — manual requests
 * take priority over background pre-separation jobs.
 */
export async function separateStems(deckId: DeckId): Promise<void> {
  const store = useDJStore.getState();
  const fileName = store.decks[deckId].fileName;
  if (!fileName) throw new Error('No track loaded on deck ' + deckId);

  const deck = getDJEngine().getDeck(deckId);
  const audioBuffer = deck.audioPlayer.getAudioBuffer();
  if (!audioBuffer) throw new Error('Audio not decoded yet — wait for track to finish loading');

  // Duration guard — very long tracks consume excessive memory
  if (audioBuffer.duration > 600) {
    throw new Error(`Track too long for stem separation (${Math.round(audioBuffer.duration / 60)} min, max 10 min)`);
  }

  const left = audioBuffer.getChannelData(0);
  const right = audioBuffer.numberOfChannels >= 2 ? audioBuffer.getChannelData(1) : left;
  const sampleRate = audioBuffer.sampleRate;

  // Hash the file for cache keying
  const { hashFile } = await import('@/engine/dj/DJAudioCache');
  const fileBytes = deck.audioPlayer.getOriginalFileBytes();
  if (!fileBytes) throw new Error('No file bytes available for hashing');
  const fileHash = await hashFile(fileBytes);

  // Capture filename for stale-result guard
  const startFileName = fileName;
  store.setDeckState(deckId, { stemSeparationProgress: 0 });

  try {
    const { enqueueStemJob } = await import('@/engine/dj/DJStemQueue');

    const result = await enqueueStemJob({
      priority: 'manual',
      fileHash,
      fileName,
      left,
      right,
      sampleRate,
      deckId,
      onProgress: (p) => {
        useDJStore.getState().setDeckState(deckId, { stemSeparationProgress: p });
      },
    });

    // Stale-result guard — user may have loaded a different track
    if (useDJStore.getState().decks[deckId].fileName !== startFileName) {
      console.log(`[DJActions] Discarding stale stems for ${fileName} — deck moved on`);
      useDJStore.getState().setDeckState(deckId, { stemSeparationProgress: null });
      return;
    }

    if (result) {
      await deck.loadStems(result, sampleRate);
      // Compute per-stem waveform peaks for visualization
      const stemPeaks = deck.stemPlayer.computeStemPeaks();
      useDJStore.getState().setDeckState(deckId, { stemWaveformPeaks: stemPeaks });
      console.log(`[DJActions] Stems separated for ${fileName}`);
    }
    useDJStore.getState().setDeckState(deckId, { stemSeparationProgress: null });
  } catch (err) {
    useDJStore.getState().setDeckState(deckId, { stemSeparationProgress: null });
    throw err;
  }
}
