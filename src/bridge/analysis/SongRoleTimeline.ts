/**
 * Song-wide channel role timeline.
 *
 * Walks the complete pattern order (every pattern in song sequence, not
 * just unique patterns) and records where each channel's instrument type
 * changes. This gives AutoDub live per-channel roles that update mid-song
 * when an instrument switches (e.g. a channel plays bass in verse, chord in
 * chorus).
 *
 * Look-up at playback time is O(log N) via binary search on the sparse
 * change list per channel.
 */

import type { Pattern } from '@/types/tracker';
import type { ChannelRole } from './MusicAnalysis';
import type { InstrumentType } from './AudioSetInstrumentMap';
import { instrumentTypeToRole } from './AudioSetInstrumentMap';

// ── Types ─────────────────────────────────────────────────────────────────────

/** A point in the song where a channel's instrument type (and therefore role)
 *  changes. `key` = positionIndex * MAX_ROWS + row, used for binary search. */
interface RoleChange {
  key: number;       // comparable scalar: positionIdx * MAX_ROWS + row
  role: ChannelRole;
  confidence: number; // CED confidence at time of classification
}

export interface SongRoleTimeline {
  /** Per-channel sorted list of role changes. Index = channel number. */
  channelChanges: RoleChange[][];
  /** Number of channels. */
  nChannels: number;
}

// Max rows per pattern — generous upper bound for key encoding.
const MAX_ROWS = 1024;

// ── Build ─────────────────────────────────────────────────────────────────────

/**
 * Build a timeline from the full song pattern sequence.
 *
 * @param patterns        All patterns in the song.
 * @param patternOrder    Ordered sequence of pattern indices (song arrangement).
 * @param instrumentTypes Map of instrumentId → InstrumentType from CED.
 */
export function buildSongRoleTimeline(
  patterns: Pattern[],
  patternOrder: number[],
  instrumentTypes: Map<number, InstrumentType>,
  confidences?: Map<number, number>,
): SongRoleTimeline {
  if (!patterns.length || !patternOrder.length) {
    return { channelChanges: [], nChannels: 0 };
  }

  // Determine channel count from first non-empty pattern
  let nChannels = 0;
  for (const idx of patternOrder) {
    const p = patterns[idx];
    if (p?.channels?.length) { nChannels = p.channels.length; break; }
  }
  if (nChannels === 0) return { channelChanges: [], nChannels: 0 };

  const channelChanges: RoleChange[][] = Array.from({ length: nChannels }, () => []);
  // Track the last role assigned per channel to record only actual changes
  const lastRole: (ChannelRole | null)[] = new Array(nChannels).fill(null);
  // Track last instrument per channel to detect instrument changes per row
  const lastInstrument: (number | null)[] = new Array(nChannels).fill(null);

  for (let posIdx = 0; posIdx < patternOrder.length; posIdx++) {
    const pattern = patterns[patternOrder[posIdx]];
    if (!pattern?.channels?.length) continue;

    const nRows = pattern.channels[0]?.rows?.length ?? 0;

    for (let row = 0; row < nRows; row++) {
      for (let ch = 0; ch < nChannels; ch++) {
        const cell = pattern.channels[ch]?.rows?.[row];
        if (!cell) continue;
        const instrId = cell.instrument;
        if (!instrId || instrId === lastInstrument[ch]) continue;

        lastInstrument[ch] = instrId;
        const type = instrumentTypes.get(instrId);
        if (!type) continue;

        const role = instrumentTypeToRole(type);
        if (!role || role === lastRole[ch]) continue;

        lastRole[ch] = role;
        channelChanges[ch].push({
          key: posIdx * MAX_ROWS + row,
          role,
          confidence: confidences?.get(instrId) ?? 1.0,
        });
      }
    }
  }

  return { channelChanges, nChannels };
}

// ── Query ─────────────────────────────────────────────────────────────────────

/**
 * Get the channel role at a given song position using binary search.
 *
 * Returns null if no CED classification was ever seen for this channel
 * (fall through to the existing classifySongRoles result).
 */
export function getRoleAtPosition(
  timeline: SongRoleTimeline,
  channel: number,
  positionIndex: number,
  row: number,
  minConfidence = 0,
): ChannelRole | null {
  const changes = timeline.channelChanges[channel];
  if (!changes || changes.length === 0) return null;

  const key = positionIndex * MAX_ROWS + row;
  let lo = 0, hi = changes.length - 1, result: RoleChange | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (changes[mid].key <= key) {
      result = changes[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (!result) return null;
  return result.confidence >= minConfidence ? result.role : null;
}

/**
 * Snapshot of current roles at a position — one ChannelRole per channel.
 * Returns null entries for channels with no CED data or below minConfidence.
 */
export function getRolesAtPosition(
  timeline: SongRoleTimeline,
  positionIndex: number,
  row: number,
  minConfidence = 0,
): Array<ChannelRole | null> {
  return Array.from({ length: timeline.nChannels }, (_, ch) =>
    getRoleAtPosition(timeline, ch, positionIndex, row, minConfidence)
  );
}
