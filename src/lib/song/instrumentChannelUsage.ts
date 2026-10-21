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

type Usage = Map<number, Set<number>>;

function addTo(usage: Usage, instrumentId: number | null | undefined, value: number): void {
  if (!instrumentId || instrumentId <= 0) return;
  let values = usage.get(instrumentId);
  if (!values) {
    values = new Set<number>();
    usage.set(instrumentId, values);
  }
  values.add(value);
}

const isPlayedNote = (note: number | undefined): note is number => !!note && note > 0 && note !== 97; // 97 = note off

export function instrumentChannelUsage(patterns: readonly Pattern[]): Map<number, Set<number>> {
  const usage: Usage = new Map();
  for (const pattern of patterns) {
    pattern.channels.forEach((channel, channelIndex) => {
      let channelDefaultUsed = false;
      for (const cell of channel.rows) {
        const own = cell.instrument ?? 0;
        if (own > 0) addTo(usage, own, channelIndex);
        else if (isPlayedNote(cell.note)) channelDefaultUsed = true;
        addTo(usage, cell.instrument2, channelIndex);
        addTo(usage, cell.instrument3, channelIndex);
        addTo(usage, cell.instrument4, channelIndex);
      }
      if (channelDefaultUsed) addTo(usage, channel.instrumentId, channelIndex);
    });
  }
  return usage;
}

/**
 * Which notes (XM note numbers, 1-96) each instrument plays, resolved the same way as above: the
 * cell's instrument column, else the channel's default instrument. An extra note column without its
 * own instrument plays on the cell's instrument. Lets a synth that renders per note (UpRoughSoftsynth)
 * render the song's notes at load, so no render runs on the trigger path.
 */
export function instrumentNoteUsage(patterns: readonly Pattern[]): Map<number, Set<number>> {
  const usage: Usage = new Map();
  for (const pattern of patterns) {
    for (const channel of pattern.channels) {
      for (const cell of channel.rows) {
        const own = cell.instrument && cell.instrument > 0 ? cell.instrument : channel.instrumentId;
        if (isPlayedNote(cell.note)) addTo(usage, own, cell.note);
        if (isPlayedNote(cell.note2)) addTo(usage, cell.instrument2 || own, cell.note2);
        if (isPlayedNote(cell.note3)) addTo(usage, cell.instrument3 || own, cell.note3);
        if (isPlayedNote(cell.note4)) addTo(usage, cell.instrument4 || own, cell.note4);
      }
    }
  }
  return usage;
}
