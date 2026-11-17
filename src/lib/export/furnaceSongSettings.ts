/**
 * Furnace song settings (author, album, system name, tuning, speeds, virtual tempo, grooves) as the
 * module exporter takes them. One mapping for the .fur export and for the derived playback, so the
 * song info editor, the export and the sequencer cannot disagree.
 */
import type { FurnaceModuleSong } from './FurnaceModuleExporter';
import type { ProjectMetadata } from '@typedefs/project';

export function furnaceSettingsForExport(meta: ProjectMetadata): Partial<FurnaceModuleSong> {
  const f = meta.furnace ?? {};
  const out: Partial<FurnaceModuleSong> = {
    author: meta.author === 'Unknown' ? '' : meta.author,
    album: f.album, systemName: f.systemName, tuning: f.tuning, arpSpeed: f.arpSpeed,
    speedPattern: f.speedPattern?.length ? f.speedPattern : undefined,
    virtualTempoN: f.virtualTempoN, virtualTempoD: f.virtualTempoD, hz: f.hz,
    grooves: f.grooves?.length ? f.grooves : undefined,
  };
  // Absent keys keep the song's own value (spread order in the caller), so drop undefined ones.
  for (const k of Object.keys(out) as (keyof typeof out)[]) if (out[k] === undefined) delete out[k];
  return out;
}

/** "6, 4, 5" -> [6, 4, 5]; non-numbers and values outside 1-255 are dropped, at most `max` entries. */
export function parseSpeedList(text: string, max = 16): number[] {
  return text.split(/[\s,]+/).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 255).slice(0, max);
}

/** One groove per line, entries like a speed list; empty lines are dropped. */
export function parseGrooves(text: string): number[][] {
  return text.split('\n').map((l) => parseSpeedList(l)).filter((g) => g.length > 0).slice(0, 255);
}
