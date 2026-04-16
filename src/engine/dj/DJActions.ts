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
import { useDJSetStore } from '@/stores/useDJSetStore';
import { getDJEngine, getDJEngineIfActive } from './DJEngine';
import type { DJSet } from './recording/DJSetFormat';
import { quantizedEQKill, getQuantizeMode, setTrackedFilterPosition, quantizeAction } from './DJQuantizedFX';
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
// PITCH
// ============================================================================

/**
 * Set the pitch offset (in semitones) for a deck.
 * Updates the store and propagates to the engine.
 */
export function setDeckPitch(deckId: DeckId, semitones: number): void {
  useDJStore.getState().setDeckPitch(deckId, semitones);
  try {
    getDJEngine().getDeck(deckId).setPitch(semitones);
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
