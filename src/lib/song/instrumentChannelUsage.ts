/**
 * instrumentChannelUsage - which tracker channels each instrument plays on.
 *
 * The engine keeps one native synth instance per (instrument, channel) for the
 * per-channel synth types (see `engine/perChannelNativeSynths.ts`), so a song
 * load has to know, before the first row plays, which channels an instrument
 * will sound on. This scans every pattern the same way the scheduler resolves
 * an instrument for a cell: the cell's own instrument column (and the extra
 * instrument columns of a multi-note cell), falling back to the channel's
 * default instrument when the cell carries none.
 *
 * Pure: no store, no engine. Channel index is the position in `pattern.channels`.
 */
import type { Pattern } from '@/types';

export function instrumentChannelUsage(patterns: readonly Pattern[]): Map<number, Set<number>> {
  const usage = new Map<number, Set<number>>();
  const add = (instrumentId: number | null | undefined, channelIndex: number): void => {
    if (!instrumentId || instrumentId <= 0) return;
    let channels = usage.get(instrumentId);
    if (!channels) {
      channels = new Set<number>();
      usage.set(instrumentId, channels);
    }
    channels.add(channelIndex);
  };

  for (const pattern of patterns) {
    pattern.channels.forEach((channel, channelIndex) => {
      let channelDefaultUsed = false;
      for (const cell of channel.rows) {
        const own = cell.instrument ?? 0;
        if (own > 0) add(own, channelIndex);
        else if (cell.note > 0 && cell.note !== 97) channelDefaultUsed = true; // 97 = note off, no trigger
        add(cell.instrument2, channelIndex);
        add(cell.instrument3, channelIndex);
        add(cell.instrument4, channelIndex);
      }
      if (channelDefaultUsed) add(channel.instrumentId, channelIndex);
    });
  }
  return usage;
}
