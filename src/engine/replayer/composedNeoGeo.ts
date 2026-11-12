/**
 * Play gate for a song COMPOSED in the app on the Neo Geo (YM2610) chip.
 *
 * Such a song has no `furnaceNative` (nothing was imported). Without it Play fell to the hybrid
 * route: an XM through libopenmpt plus `routeRowToChip` and the TypeScript tick code. With it,
 * it takes the same C++ sequencer path an imported .fur takes. This file only decides and
 * prepares data; sequencing and chip state stay in WASM.
 */
import type { TrackerSong } from '../TrackerReplayer';
import type { InstrumentConfig } from '@typedefs/instrument';
import { isNeoGeoInstrument, type FurnaceModuleSong } from '@/lib/export/FurnaceModuleExporter';
import { deriveFurnaceNativeFromSong, type DerivedFurnaceNative } from '@/lib/export/deriveFurnaceNative';

/** Does Play route this song to the C++ sequencer through a derived native? */
export function composedNeoGeoSequencerRoute(
  song: Pick<TrackerSong, 'furnaceNative' | 'instruments'>,
): boolean {
  if (song.furnaceNative) return false; // imported .fur: already on the sequencer
  const ins = song.instruments;
  return ins.length > 0 && ins.every((i) => isNeoGeoInstrument(i));
}

export function composedNeoGeoModuleSong(
  song: Pick<TrackerSong, 'name' | 'patterns' | 'instruments' | 'songPositions' | 'initialSpeed' | 'initialBPM'>,
): FurnaceModuleSong {
  return {
    name: song.name,
    patterns: song.patterns,
    instruments: song.instruments,
    songPositions: song.songPositions,
    initialSpeed: song.initialSpeed,
    initialBPM: song.initialBPM,
  };
}

export function deriveComposedNeoGeo(song: TrackerSong): Promise<DerivedFurnaceNative> {
  return deriveFurnaceNativeFromSong(composedNeoGeoModuleSong(song));
}

/**
 * The hybrid block fires ToneEngine notes for instruments it counts as replaced. The sequencer
 * already plays every instrument of a derived song (they carry no INS2 blob of their own, so the
 * normal rule would count them as replaced and play each note twice).
 */
export function isReplacedForDerivedSong(inst: InstrumentConfig, derivedIds: ReadonlySet<number>): boolean {
  return !derivedIds.has(inst.id);
}

/** Do two derived sample lists hold the same sample data, in the same order? */
export function sameDerivedSamples(a: DerivedFurnaceNative['samples'], b: DerivedFurnaceNative['samples']): boolean {
  return a.length === b.length && a.every((s, i) => {
    const t = b[i];
    return s.rate === t.rate && s.data.length === t.data.length && s.data.every((v, j) => v === t.data[j]);
  });
}
