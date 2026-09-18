/**
 * MusicalEventProvider + look-ahead — plan items C1 and C3.
 *
 * The performer needs to ask "what is about to happen?" so it can PREPARE →
 * CAPTURE → RELEASE, instead of reacting after a stab has already passed.
 * Auto Dub already does a narrow pattern look-ahead for role-targeted rules;
 * this generalises it and, per C1, unifies the SEMANTIC OUTPUT of the tracker
 * and DJ contexts without pretending their data sources are alike.
 *
 * Design decisions worth stating, because each one removes a class of bug:
 *
 * - **Stateless.** Every function takes the rows it needs and returns a
 *   result. C3 requires "seek must reset prediction state"; the cheapest way
 *   to honour that is to hold no prediction state at all, so a seek cannot
 *   leave a stale queue behind. A caching provider may be added later, but it
 *   would then own that reset explicitly.
 * - **Rows are the timebase.** The tracker's native unit, and what
 *   MusicalClock already speaks. Window sizes come from the clock, so
 *   look-ahead automatically follows song speed and metre rather than
 *   assuming 4 rows per beat.
 * - **Sources, not engines.** Both contexts supply `ChannelEventSource`. That
 *   is the unification point: a DJ deck's beat grid and a tracker pattern
 *   produce the same semantic events, and the performer never branches on
 *   which one it is talking to.
 */

import type { MusicalChannelProfile } from './musicalChannelProfile';
import {
  computeMusicalPosition,
  rowsPerBeat,
  DEFAULT_BEAT_UNIT,
  type MusicalClockSettings,
} from './musicalClock';

/** A note starting. Note-offs are deliberately out of scope for v1: no move
 *  in the registry triggers on a release, and inventing events nothing
 *  consumes would be dead weight. */
export interface MusicalEvent {
  /** Absolute row. Fractional allowed for sub-row sources (DJ beat grids). */
  row: number;
  channel: number;
  /** Tracker note number where known; DJ sources may omit it. */
  note?: number;
  /** Relative strength 0..1 — a transient's prominence, not MIDI velocity. */
  strength: number;
  /** Semantic context for the channel, when the caller has profiled it. */
  profile?: MusicalChannelProfile;
}

/**
 * One channel's onsets. The tracker fills this from pattern cells; the DJ
 * context would fill it from a deck's beat grid or stem transients. Same
 * shape, so everything downstream is context-agnostic.
 */
export interface ChannelEventSource {
  channel: number;
  onsets: readonly { row: number; note?: number; strength?: number }[];
  profile?: MusicalChannelProfile;
}

/**
 * Look-ahead windows.
 *
 * Note-value windows are ABSOLUTE: `'1/8'` is an eighth note whatever the
 * metre. Only `'beat'` depends on `beatUnit`. So in 4/4 an eighth is half a
 * beat, while in 6/8 the beat IS an eighth and the two coincide — which is
 * the correct reading of "give me an eighth of look-ahead", and the reason
 * these are not derived from the beat length.
 */
export type LookAheadWindow = '1/16' | '1/8' | '1/4' | 'beat' | 'bar' | 'phrase';

/** Window length in rows, derived from the clock — never hardcoded. */
export function rowsForWindow(
  window: LookAheadWindow,
  ticksPerRow: number,
  settings?: Partial<MusicalClockSettings>,
): number {
  const pos = computeMusicalPosition(0, ticksPerRow, settings);
  switch (window) {
    case 'beat': return pos.rowsPerBeat;
    case 'bar': return pos.rowsPerBar;
    case 'phrase': return pos.rowsPerPhrase;
    default: {
      // Rows per quarter note: the beat-unit-independent reference.
      const rowsPerQuarter = rowsPerBeat(ticksPerRow, DEFAULT_BEAT_UNIT);
      if (window === '1/4') return rowsPerQuarter;
      if (window === '1/8') return rowsPerQuarter / 2;
      return rowsPerQuarter / 4; // '1/16'
    }
  }
}

export interface LookAheadOptions {
  /** Ignore channels whose profile confidence or content fails this test. */
  filter?: (event: MusicalEvent) => boolean;
  /** Cap the result; the nearest events are kept. */
  limit?: number;
}

/**
 * Events in `[fromRow, fromRow + windowRows)`, nearest first.
 *
 * Half-open on purpose: an event exactly at `fromRow` is NOW, not upcoming,
 * and returning it would make a PREPARE step fire on something already
 * sounding. The upper bound is exclusive so adjacent windows tile without
 * reporting the same event twice.
 */
export function eventsInRowWindow(
  sources: readonly ChannelEventSource[],
  fromRow: number,
  windowRows: number,
  options?: LookAheadOptions,
): MusicalEvent[] {
  if (!Number.isFinite(fromRow) || !Number.isFinite(windowRows) || windowRows <= 0) return [];
  const end = fromRow + windowRows;
  const out: MusicalEvent[] = [];

  for (const source of sources) {
    for (const onset of source.onsets) {
      if (!Number.isFinite(onset.row)) continue;
      if (onset.row <= fromRow || onset.row >= end) continue;
      const event: MusicalEvent = {
        row: onset.row,
        channel: source.channel,
        note: onset.note,
        strength: clamp01(onset.strength ?? 1),
        profile: source.profile,
      };
      if (options?.filter && !options.filter(event)) continue;
      out.push(event);
    }
  }

  out.sort((a, b) => (a.row - b.row) || (a.channel - b.channel));
  return options?.limit !== undefined ? out.slice(0, Math.max(0, options.limit)) : out;
}

/** Same, with the window named musically instead of in rows. */
export function eventsInWindow(
  sources: readonly ChannelEventSource[],
  fromRow: number,
  window: LookAheadWindow,
  ticksPerRow: number,
  settings?: Partial<MusicalClockSettings>,
  options?: LookAheadOptions,
): MusicalEvent[] {
  return eventsInRowWindow(sources, fromRow, rowsForWindow(window, ticksPerRow, settings), options);
}

/**
 * The next event strictly after `fromRow`, or null.
 *
 * `withinRows` bounds the search so a caller is not handed something four
 * bars away and told to prepare for it.
 */
export function nextEvent(
  sources: readonly ChannelEventSource[],
  fromRow: number,
  withinRows: number,
  options?: LookAheadOptions,
): MusicalEvent | null {
  return eventsInRowWindow(sources, fromRow, withinRows, { ...options, limit: 1 })[0] ?? null;
}

/**
 * Rows until the next event, or null when the window is empty. What a
 * quantized PREPARE schedules against.
 */
export function rowsUntilNextEvent(
  sources: readonly ChannelEventSource[],
  fromRow: number,
  withinRows: number,
  options?: LookAheadOptions,
): number | null {
  const next = nextEvent(sources, fromRow, withinRows, options);
  return next ? next.row - fromRow : null;
}

/**
 * Build sources from tracker pattern channels.
 *
 * `rowOffset` maps pattern-relative rows onto the song-absolute timebase the
 * clock uses, so look-ahead does not silently reset at a pattern boundary.
 */
export function trackerEventSources(
  channels: readonly { rows: readonly ({ note: number; volume?: number } | null | undefined)[] }[],
  options?: {
    rowOffset?: number;
    profiles?: ReadonlyMap<number, MusicalChannelProfile>;
    /** Channels to skip — muted ones, typically. */
    skipChannels?: ReadonlySet<number>;
  },
): ChannelEventSource[] {
  const offset = options?.rowOffset ?? 0;
  const sources: ChannelEventSource[] = [];

  for (let ch = 0; ch < channels.length; ch++) {
    if (options?.skipChannels?.has(ch)) continue;
    const onsets: { row: number; note?: number; strength?: number }[] = [];
    const rows = channels[ch]?.rows ?? [];
    for (let r = 0; r < rows.length; r++) {
      const cell = rows[r];
      // 1..96 are notes; 97 is note-off, which is not an onset.
      if (!cell || !(cell.note >= 1 && cell.note <= 96)) continue;
      onsets.push({
        row: r + offset,
        note: cell.note,
        // Volume column 0x10..0x50 is the XM set-volume range; absent means
        // full. Anything else (effect-style volume commands) is not a level.
        strength: volumeToStrength(cell.volume),
      });
    }
    if (onsets.length === 0) continue;
    sources.push({ channel: ch, onsets, profile: options?.profiles?.get(ch) });
  }
  return sources;
}

function volumeToStrength(volume: number | undefined): number {
  if (volume === undefined || volume === 0) return 1;
  if (volume >= 0x10 && volume <= 0x50) return (volume - 0x10) / 0x40;
  return 1;
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}
