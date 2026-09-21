/**
 * Shared channel profiling for the dub system.
 *
 * Lives outside AutoDub because the moves need the same profiles the performer
 * uses: `versionDrop` deciding what is safe to mute has to agree with the
 * targeting that chose the channel, and two copies of "what is this channel"
 * would eventually disagree.
 */

import type { Pattern } from '@/types/tracker';
import type { InstrumentConfig } from '@/types/instrument';
import {
  buildMusicalChannelProfile,
  type MusicalChannelProfile,
} from '@/lib/dub/musicalChannelProfile';
import {
  classifyChannelWithInstruments,
  classifyInstrument,
  getChannelInstruments,
} from '@/bridge/analysis/ChannelNaming';
import { getAllRuntimeChannelRoles } from '@/bridge/analysis/ChannelAudioClassifier';
import { useInstrumentStore } from '@/stores/useInstrumentStore';

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
/**
 * The instrument lookup `classifyChannelWithInstruments` and `classifyInstrument`
 * expect, built from the live store.
 *
 * Here rather than at each call site so the two consumers — the performer and
 * `versionDrop` — cannot drift into building it differently, which is the same
 * reason this module exists at all.
 */
export function buildInstrumentLookup(): Map<number, InstrumentConfig> {
  const lookup = new Map<number, InstrumentConfig>();
  try {
    const { instruments } = useInstrumentStore.getState();
    for (const inst of instruments) {
      if (inst && typeof inst.id === 'number') lookup.set(inst.id, inst);
    }
  } catch { /* store not ready — callers degrade to note statistics */ }
  return lookup;
}

let _profileCache: {
  key: string;
  profiles: Map<number, MusicalChannelProfile>;
} | null = null;

export function getChannelProfiles(
  pattern: Pattern | null,
  names: readonly (string | null | undefined)[],
  rowsPerBeat: number,
  rowsPerBar: number,
  instruments?: Map<number, InstrumentConfig>,
): ReadonlyMap<number, MusicalChannelProfile> {
  if (!pattern?.channels?.length) return new Map();
  const key = `${pattern.id ?? 'p'}:${pattern.channels.length}:${rowsPerBeat}:${rowsPerBar}:${names.join(',')}:${instruments?.size ?? 0}`;
  if (_profileCache?.key === key) return _profileCache.profiles;

  // Live audio evidence for every channel at once. Read here rather than per
  // channel because the accessor walks its own ring buffer each call.
  //
  // This matters most for the formats where nothing else works. A UADE tune —
  // FC, TFMX, Hippel, Whittaker, Sonic Arranger — and the chip formats define
  // their instruments inside the replayer: there is no sample to put through
  // SampleSpectrum, and the name slot holds the musician's greetings rather
  // than a description. For those channels the rendered audio is the only
  // evidence that describes the SOUND, and it was not reaching this function
  // at all.
  const runtimeHints = getAllRuntimeChannelRoles(pattern.channels.length);

  const profiles = new Map<number, MusicalChannelProfile>();
  for (let ch = 0; ch < pattern.channels.length; ch++) {
    const channel = pattern.channels[ch];
    const rows = channel?.rows ?? [];
    const onsetRows: number[] = [];
    for (let r = 0; r < rows.length; r++) {
      const cell = rows[r];
      if (cell && cell.note >= 1 && cell.note <= 96) onsetRows.push(r);
    }

    // Note statistics and the instrument verdict, both of which the evidence
    // type has always accepted and nothing ever supplied. Without them the
    // family axis fell through to the instrument NAME at 0.75 confidence, or
    // to `unknown` at 0 — so the performer was targeting on a guess while the
    // measurements sat one import away.
    const enhanced = channel && instruments
      ? classifyChannelWithInstruments(channel, ch, instruments)
      : null;

    // The instrument verdict for the instrument this channel actually leans
    // on. `EnhancedChannelAnalysis` carries the role and subrole but not the
    // classification itself, so resolve the dominant instrument and classify
    // it directly — the same pair of calls `classifyChannelWithInstruments`
    // makes internally.
    let instrumentClass = null;
    if (channel && instruments) {
      const freq = getChannelInstruments(channel);
      let topId = -1;
      let topCount = 0;
      for (const [id, count] of freq) {
        if (count > topCount) { topId = id; topCount = count; }
      }
      if (topId >= 0) instrumentClass = classifyInstrument(instruments.get(topId));
    }

    profiles.set(ch, buildMusicalChannelProfile({
      channel: ch,
      analysis: enhanced,
      instrument: instrumentClass,
      runtime: runtimeHints[ch] ?? null,
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
