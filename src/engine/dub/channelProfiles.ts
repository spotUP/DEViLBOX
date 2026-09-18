/**
 * Shared channel profiling for the dub system.
 *
 * Lives outside AutoDub because the moves need the same profiles the performer
 * uses: `versionDrop` deciding what is safe to mute has to agree with the
 * targeting that chose the channel, and two copies of "what is this channel"
 * would eventually disagree.
 */

import type { Pattern } from '@/types/tracker';
import {
  buildMusicalChannelProfile,
  type MusicalChannelProfile,
} from '@/lib/dub/musicalChannelProfile';

/**
 * Gate H: one `MusicalChannelProfile` per channel, rebuilt when the pattern or
 * the grid changes.
 *
 * Evidence, not guesswork: the instrument NAME (the only signal that separates
 * an organ from a piano), the channel's own onset rows, and the grid from the
 * clock. Every axis carries its confidence, so `pickTarget` can refuse to act
 * on a guess instead of treating "probably percussion" as fact.
 *
 * Cached by pattern identity and grid because building it every 250 ms tick
 * would re-derive the same answer four times a second for no benefit.
 */
let _profileCache: {
  key: string;
  profiles: Map<number, MusicalChannelProfile>;
} | null = null;

export function getChannelProfiles(
  pattern: Pattern | null,
  names: readonly (string | null | undefined)[],
  rowsPerBeat: number,
  rowsPerBar: number,
): ReadonlyMap<number, MusicalChannelProfile> {
  if (!pattern?.channels?.length) return new Map();
  const key = `${pattern.id ?? 'p'}:${pattern.channels.length}:${rowsPerBeat}:${rowsPerBar}:${names.join(',')}`;
  if (_profileCache?.key === key) return _profileCache.profiles;

  const profiles = new Map<number, MusicalChannelProfile>();
  for (let ch = 0; ch < pattern.channels.length; ch++) {
    const rows = pattern.channels[ch]?.rows ?? [];
    const onsetRows: number[] = [];
    for (let r = 0; r < rows.length; r++) {
      const cell = rows[r];
      if (cell && cell.note >= 1 && cell.note <= 96) onsetRows.push(r);
    }
    profiles.set(ch, buildMusicalChannelProfile({
      channel: ch,
      instrumentName: names[ch] ?? null,
      onsetRows,
      rowsPerBeat,
      rowsPerBar,
      totalRows: rows.length,
    }));
  }
  _profileCache = { key, profiles };
  return profiles;
}
