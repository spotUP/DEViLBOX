/**
 * DJSetEvent — Timestamped DJ action for set recording/playback.
 *
 * Events capture every DJ action at microsecond resolution. On playback,
 * events are dispatched against the DJ engine to regenerate the set live.
 */

// ── Track source — determines how to reload during playback ─────────────

export type TrackSource =
  | { type: 'modland'; fullPath: string }
  | { type: 'hvsc'; path: string }
  | { type: 'embedded'; blobId: string; originalSource?: TrackSource }
  | { type: 'local'; fileName: string };

// ── Event types ─────────────────────────────────────────────────────────

export type DJEventType =
  // Transport
  | 'load'
  | 'play'
  | 'stop'
  | 'pause'
  | 'resume'
  | 'cue'
  | 'hotCue'
  // Mixing
  | 'crossfader'
  | 'crossfaderCurve'
  | 'volume'
  | 'masterVolume'
  // EQ
  | 'eqLow'
  | 'eqMid'
  | 'eqHigh'
  | 'eqKill'
  // Filter
  | 'filter'
  | 'filterRes'
  // Pitch
  | 'pitch'
  | 'nudge'
  | 'keyLock'
  // Scratch
  | 'scratchStart'
  | 'scratchStop'
  | 'faderLFO'
  // Loop
  | 'loop'
  | 'beatJump'
  // Channel
  | 'channelMute'
  // FX
  | 'masterFX'
  // Mic
  | 'micOn'
  | 'micOff'
  | 'micGain';

// ── Event interface ─────────────────────────────────────────────────────

/** High-resolution timestamp in microseconds from set start */
export type MicrosecondTimestamp = number;

export interface DJSetEvent {
  /** Microseconds from recording start (performance.now() * 1000) */
  t: MicrosecondTimestamp;
  /** Event type */
  type: DJEventType;
  /** Target deck (omit for global events like crossfader, masterVolume) */
  deck?: 'A' | 'B' | 'C';
  /** Single numeric value (crossfader position, volume, EQ dB, etc.) */
  value?: number;
  /** Structured values for complex events */
  values?: Record<string, unknown>;
}

// ── Typed event constructors (for type safety in recorder) ──────────────

export function loadEvent(t: number, deck: 'A' | 'B' | 'C', source: TrackSource, fileName: string, bpm: number): DJSetEvent {
  return { t, type: 'load', deck, values: { source, fileName, bpm } };
}

export function continuousEvent(t: number, type: DJEventType, value: number, deck?: 'A' | 'B' | 'C'): DJSetEvent {
  return deck ? { t, type, deck, value } : { t, type, value };
}

export function discreteEvent(t: number, type: DJEventType, deck?: 'A' | 'B' | 'C', values?: Record<string, unknown>): DJSetEvent {
  const e: DJSetEvent = { t, type };
  if (deck) e.deck = deck;
  if (values) e.values = values;
  return e;
}
