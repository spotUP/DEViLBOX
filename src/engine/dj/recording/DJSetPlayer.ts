/**
 * DJSetPlayer — Replays recorded DJ sets by dispatching events against
 * the DJ engine. Uses requestAnimationFrame for timing.
 *
 * Track preloading: scans all load events on start, downloads tracks
 * in parallel, and caches them before playback begins.
 */

import { useDJStore } from '@/stores/useDJStore';
import type { DJSet } from './DJSetFormat';
import type { DJSetEvent, TrackSource } from './DJSetEvent';
import * as DJActions from '../DJActions';

type DeckId = 'A' | 'B' | 'C';

export class DJSetPlayer {
  private _set: DJSet | null = null;
  private _startTime = 0;
  private _eventIndex = 0;
  private _rafId = 0;
  private _playing = false;
  private _paused = false;
  private _pauseOffset = 0;
  private _micSource: AudioBufferSourceNode | null = null;

  /** Callbacks for UI updates */
  onProgress?: (elapsed: number, total: number) => void;
  onTrackLoading?: (fileName: string) => void;
  onComplete?: () => void;

  // ── Lifecycle ─────────────────────────────────────────────────────────

  async startPlayback(set: DJSet, _preloadedTracks: Map<string, { song: unknown; buffer?: ArrayBuffer }>): Promise<void> {
    this._set = set;
    this._eventIndex = 0;
    this._pauseOffset = 0;
    this._playing = true;
    this._paused = false;
    this._startTime = performance.now();

    // Start the playback loop
    this._tick();
  }

  stopPlayback(): void {
    this._playing = false;
    this._paused = false;
    cancelAnimationFrame(this._rafId);
    this._stopMicAudio();
    this._set = null;
  }

  pausePlayback(): void {
    if (!this._playing || this._paused) return;
    this._paused = true;
    this._pauseOffset = this._elapsedUs();
    cancelAnimationFrame(this._rafId);
    this._stopMicAudio();
  }

  resumePlayback(): void {
    if (!this._playing || !this._paused) return;
    this._paused = false;
    this._startTime = performance.now() - this._pauseOffset / 1000;
    this._tick();
  }

  get isPlaying(): boolean { return this._playing && !this._paused; }
  get isPaused(): boolean { return this._paused; }

  // ── Playback loop ─────────────────────────────────────────────────────

  private _tick = (): void => {
    if (!this._playing || this._paused || !this._set) return;

    const elapsed = this._elapsedUs();
    const events = this._set.events;

    // Dispatch all events up to current time
    while (this._eventIndex < events.length && events[this._eventIndex].t <= elapsed) {
      this._dispatch(events[this._eventIndex]);
      this._eventIndex++;
    }

    // Progress callback
    if (this.onProgress) {
      this.onProgress(elapsed / 1000, this._set.metadata.durationMs);
    }

    // Check if set is complete
    if (this._eventIndex >= events.length) {
      // Wait for the full duration before signaling complete
      if (elapsed / 1000 >= this._set.metadata.durationMs) {
        this._playing = false;
        this.onComplete?.();
        return;
      }
    }

    this._rafId = requestAnimationFrame(this._tick);
  };

  private _elapsedUs(): number {
    return (performance.now() - this._startTime) * 1000;
  }

  // ── Event dispatcher ──────────────────────────────────────────────────

  private _dispatch(event: DJSetEvent): void {
    const store = useDJStore.getState();
    const deck = event.deck as DeckId | undefined;

    switch (event.type) {
      // ── Transport ──
      case 'load':
        // Track loading is handled by preloader — the track should already
        // be in the DJ engine by the time this event fires.
        // The preloader calls DJEngine.loadToDeck() ahead of time.
        break;

      case 'play':
        if (deck) store.setDeckPlaying(deck, true);
        break;
      case 'stop':
        if (deck) store.setDeckPlaying(deck, false);
        break;

      // ── Mixing (route through DJActions for rAF-batched store writes) ──
      case 'crossfader':
        if (event.value != null) DJActions.setCrossfader(event.value);
        break;
      case 'crossfaderCurve':
        if (event.values?.curve) DJActions.setCrossfaderCurve(event.values.curve as 'linear' | 'cut' | 'smooth');
        break;
      case 'volume':
        if (deck && event.value != null) DJActions.setDeckVolume(deck, event.value);
        break;
      case 'masterVolume':
        if (event.value != null) DJActions.setMasterVolume(event.value);
        break;

      // ── EQ ──
      case 'eqLow':
        if (deck && event.value != null) DJActions.setDeckEQ(deck, 'low', event.value);
        break;
      case 'eqMid':
        if (deck && event.value != null) DJActions.setDeckEQ(deck, 'mid', event.value);
        break;
      case 'eqHigh':
        if (deck && event.value != null) DJActions.setDeckEQ(deck, 'high', event.value);
        break;
      case 'eqKill':
        if (deck && event.values) {
          DJActions.setDeckEQKill(deck, event.values.band as 'low' | 'mid' | 'high', event.values.kill as boolean);
        }
        break;

      // ── Filter ──
      case 'filter':
        if (deck && event.value != null) DJActions.setDeckFilter(deck, event.value);
        break;
      case 'filterRes':
        if (deck && event.value != null) {
          DJActions.setDeckFilterResonance(deck, event.value);
        }
        break;

      // ── Pitch ──
      case 'pitch':
        if (deck && event.value != null) DJActions.setDeckPitch(deck, event.value);
        break;
      case 'keyLock':
        if (deck && event.values) {
          store.setDeckState(deck, { keyLockEnabled: event.values.enabled as boolean });
        }
        break;

      // ── Scratch ──
      case 'scratchStart':
        if (deck) {
          store.setDeckState(deck, {
            scratchActive: true,
            activePatternName: (event.values?.pattern as string) || null,
          });
        }
        break;
      case 'scratchStop':
        if (deck) store.setDeckState(deck, { scratchActive: false });
        break;
      case 'faderLFO':
        if (deck && event.values) {
          store.setDeckState(deck, {
            faderLFOActive: event.values.active as boolean,
            faderLFODivision: (event.values.division as DeckState['faderLFODivision']) || null,
          });
        }
        break;

      // ── Loop ──
      case 'loop':
        if (deck && event.values) {
          store.setDeckLoop(
            deck,
            event.values.mode as 'line' | 'pattern' | 'off',
            event.values.active as boolean,
          );
          if (event.values.size) {
            store.setDeckLoopSize(deck, event.values.size as 1 | 2 | 4 | 8 | 16 | 32);
          }
        }
        break;

      // ── Channel mutes ──
      case 'channelMute':
        if (deck && event.values?.mask != null) {
          store.setDeckState(deck, { channelMask: event.values.mask as number });
        }
        break;

      default:
        // Unknown event type — ignore for forward compatibility
        break;
    }
  }

  // ── Mic audio ─────────────────────────────────────────────────────────

  async startMicAudio(audioBuffer: AudioBuffer, mixerSamplerInput: GainNode): Promise<void> {
    this._stopMicAudio();
    const ctx = mixerSamplerInput.context as AudioContext;
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(mixerSamplerInput);
    source.start(0, this._elapsedUs() / 1_000_000); // sync to current position
    this._micSource = source;
  }

  private _stopMicAudio(): void {
    try { this._micSource?.stop(); } catch { /* already stopped */ }
    this._micSource?.disconnect();
    this._micSource = null;
  }

  // ── Track preloading ──────────────────────────────────────────────────

  /**
   * Extract all unique track sources from the event log.
   * Call this before playback to preload all needed tracks.
   */
  static getRequiredTracks(set: DJSet): { source: TrackSource; fileName: string; bpm: number }[] {
    const seen = new Set<string>();
    const tracks: { source: TrackSource; fileName: string; bpm: number }[] = [];

    for (const event of set.events) {
      if (event.type === 'load' && event.values) {
        const source = event.values.source as TrackSource;
        const key = JSON.stringify(source);
        if (!seen.has(key)) {
          seen.add(key);
          tracks.push({
            source,
            fileName: event.values.fileName as string,
            bpm: event.values.bpm as number,
          });
        }
      }
    }

    return tracks;
  }
}

// Import type for reference in dispatch
import type { DeckState } from '@/stores/useDJStore';
