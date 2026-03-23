/**
 * DJSetFormat — Container format for recorded DJ sets.
 *
 * A set contains metadata (name, author, track list) and an ordered
 * array of timestamped events. On playback, events are dispatched
 * against the DJ engine to regenerate the set live.
 */

import type { DJSetEvent, TrackSource } from './DJSetEvent';

// ── Track entry in the set ──────────────────────────────────────────────

export interface DJSetTrack {
  source: TrackSource;
  fileName: string;
  trackName?: string;
  bpm?: number;
  duration?: number;
  /** When this track was first loaded in the set (microseconds) */
  loadedAt: number;
}

// ── Set metadata ────────────────────────────────────────────────────────

export interface DJSetMetadata {
  id: string;
  name: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  durationMs: number;
  trackList: DJSetTrack[];
  /** Format version for future compatibility */
  version: 1;
}

// ── Full set ────────────────────────────────────────────────────────────

export interface DJSet {
  metadata: DJSetMetadata;
  events: DJSetEvent[];
  /** Server blob ID for recorded mic audio (Opus/WebM) */
  micAudioId?: string;
}
