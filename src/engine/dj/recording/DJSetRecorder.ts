/**
 * DJSetRecorder — Captures DJ actions as timestamped events.
 *
 * Subscribes to useDJStore and records state changes. Continuous params
 * (crossfader, EQ, filter, volume) are sampled at max 60Hz. Discrete
 * events (play, stop, load) are recorded immediately.
 */

import { useDJStore } from '@/stores/useDJStore';
import type { DJSetEvent, TrackSource, DJEventType } from './DJSetEvent';
import { continuousEvent, discreteEvent, loadEvent } from './DJSetEvent';
import type { DJSet, DJSetTrack, DJSetMetadata } from './DJSetFormat';

type DeckId = 'A' | 'B' | 'C';
const DECK_IDS: DeckId[] = ['A', 'B', 'C'];

/** Min interval between continuous param events (ms) — ~60Hz */
const CONTINUOUS_INTERVAL_MS = 16;

export class DJSetRecorder {
  private _events: DJSetEvent[] = [];
  private _tracks: DJSetTrack[] = [];
  private _startTime = 0;
  private _recording = false;
  private _unsubscribers: (() => void)[] = [];
  /** Last emit time per param key — for continuous event throttling */
  private _lastEmit = new Map<string, number>();

  // ── Lifecycle ─────────────────────────────────────────────────────────

  startRecording(): void {
    if (this._recording) return;
    this._recording = true;
    this._events = [];
    this._tracks = [];
    this._lastEmit.clear();
    this._startTime = performance.now();
    this._subscribeToStore();
  }

  stopRecording(name: string, authorId: string, authorName: string): DJSet {
    this._recording = false;
    this._unsubscribeAll();
    const durationMs = performance.now() - this._startTime;

    const metadata: DJSetMetadata = {
      id: crypto.randomUUID(),
      name,
      authorId,
      authorName,
      createdAt: Date.now(),
      durationMs: Math.round(durationMs),
      trackList: this._tracks,
      version: 1,
    };

    return { metadata, events: this._events };
  }

  /** Microseconds elapsed since recording started */
  elapsed(): number {
    return (performance.now() - this._startTime) * 1000;
  }

  get isRecording(): boolean {
    return this._recording;
  }

  get eventCount(): number {
    return this._events.length;
  }

  // ── Track load recording (called from DJEngine) ───────────────────────

  recordTrackLoad(deck: DeckId, source: TrackSource, fileName: string, trackName: string, bpm: number): void {
    if (!this._recording) return;
    const t = this.elapsed();
    this._events.push(loadEvent(t, deck, source, fileName, bpm));
    this._tracks.push({ source, fileName, trackName, bpm, loadedAt: t });
  }

  // ── Store subscriptions ───────────────────────────────────────────────

  private _subscribeToStore(): void {
    const store = useDJStore;

    // ── Global continuous params ──
    this._subscribeContinuous(
      () => store.getState().crossfaderPosition,
      'crossfader', 'crossfader',
    );
    this._subscribeContinuous(
      () => store.getState().masterVolume,
      'masterVolume', 'masterVolume',
    );

    // ── Global discrete params ──
    this._subscribeDiscrete(
      () => store.getState().crossfaderCurve,
      (curve) => this._emit(discreteEvent(this.elapsed(), 'crossfaderCurve', undefined, { curve })),
    );

    // ── Per-deck subscriptions ──
    for (const deck of DECK_IDS) {
      const getDeck = () => store.getState().decks[deck];

      // Transport (discrete)
      this._subscribeDiscrete(
        () => getDeck().isPlaying,
        (playing) => this._emit(discreteEvent(this.elapsed(), playing ? 'play' : 'stop', deck)),
      );

      // Continuous params
      this._subscribeContinuous(() => getDeck().volume, `${deck}.volume`, 'volume', deck);
      this._subscribeContinuous(() => getDeck().eqLow, `${deck}.eqLow`, 'eqLow', deck);
      this._subscribeContinuous(() => getDeck().eqMid, `${deck}.eqMid`, 'eqMid', deck);
      this._subscribeContinuous(() => getDeck().eqHigh, `${deck}.eqHigh`, 'eqHigh', deck);
      this._subscribeContinuous(() => getDeck().filterPosition, `${deck}.filter`, 'filter', deck);
      this._subscribeContinuous(() => getDeck().filterResonance, `${deck}.filterRes`, 'filterRes', deck);
      this._subscribeContinuous(() => getDeck().pitchOffset, `${deck}.pitch`, 'pitch', deck);

      // EQ kill (discrete)
      this._subscribeDiscrete(
        () => getDeck().eqLowKill,
        (kill) => this._emit(discreteEvent(this.elapsed(), 'eqKill', deck, { band: 'low', kill })),
      );
      this._subscribeDiscrete(
        () => getDeck().eqMidKill,
        (kill) => this._emit(discreteEvent(this.elapsed(), 'eqKill', deck, { band: 'mid', kill })),
      );
      this._subscribeDiscrete(
        () => getDeck().eqHighKill,
        (kill) => this._emit(discreteEvent(this.elapsed(), 'eqKill', deck, { band: 'high', kill })),
      );

      // Key lock (discrete)
      this._subscribeDiscrete(
        () => getDeck().keyLockEnabled,
        (enabled) => this._emit(discreteEvent(this.elapsed(), 'keyLock', deck, { enabled })),
      );

      // Scratch (discrete)
      this._subscribeDiscrete(
        () => getDeck().scratchActive,
        (active) => {
          if (active) {
            const pattern = getDeck().activePatternName;
            this._emit(discreteEvent(this.elapsed(), 'scratchStart', deck, { pattern }));
          } else {
            this._emit(discreteEvent(this.elapsed(), 'scratchStop', deck));
          }
        },
      );

      // Fader LFO (discrete)
      this._subscribeDiscrete(
        () => getDeck().faderLFOActive,
        (active) => {
          const division = getDeck().faderLFODivision;
          this._emit(discreteEvent(this.elapsed(), 'faderLFO', deck, { active, division }));
        },
      );

      // Loop (discrete)
      this._subscribeDiscrete(
        () => `${getDeck().loopActive}:${getDeck().loopMode}:${getDeck().lineLoopSize}`,
        () => {
          const d = getDeck();
          this._emit(discreteEvent(this.elapsed(), 'loop', deck, {
            active: d.loopActive, mode: d.loopMode, size: d.lineLoopSize,
          }));
        },
      );

      // Channel mutes (discrete — bitmask)
      this._subscribeDiscrete(
        () => getDeck().channelMask,
        (mask) => this._emit(discreteEvent(this.elapsed(), 'channelMute', deck, { mask })),
      );
    }
  }

  // ── Subscription helpers ──────────────────────────────────────────────

  private _subscribeContinuous(
    selector: () => number,
    key: string,
    eventType: DJEventType,
    deck?: DeckId,
  ): void {
    let prev = selector();
    const unsub = useDJStore.subscribe((state) => {
      void state; // ensure subscription fires
      const val = selector();
      if (val === prev) return;
      prev = val;

      const now = performance.now();
      const lastMs = this._lastEmit.get(key) ?? 0;
      if (now - lastMs < CONTINUOUS_INTERVAL_MS) return;
      this._lastEmit.set(key, now);

      this._emit(continuousEvent(this.elapsed(), eventType, val, deck));
    });
    this._unsubscribers.push(unsub);
  }

  private _subscribeDiscrete<T>(
    selector: () => T,
    handler: (val: T) => void,
  ): void {
    let prev = selector();
    const unsub = useDJStore.subscribe(() => {
      const val = selector();
      if (val === prev) return;
      prev = val;
      handler(val);
    });
    this._unsubscribers.push(unsub);
  }

  private _emit(event: DJSetEvent): void {
    if (!this._recording) return;
    this._events.push(event);
  }

  private _unsubscribeAll(): void {
    for (const unsub of this._unsubscribers) unsub();
    this._unsubscribers = [];
  }
}
