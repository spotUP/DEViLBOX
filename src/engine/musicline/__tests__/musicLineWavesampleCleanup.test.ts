/**
 * MusicLine "Remove Unused Wavesamples" and "Merge Equal Wavesamples" work
 * on a real module and survive the .ml round trip.
 *
 * The toolbar buttons were disabled with "not yet implemented" (owner,
 * 2026-10-04, ledger F35). A wavesample is an instrument here (INST+SMPL
 * pair, numbered by position), so removing one renumbers the rest and the
 * cells must follow; the exported file must still play the kept sample where
 * the duplicate was.
 *
 * Fixture: public/data/songs/musicline-editor/drax.ml (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseMusicLineFile } from '@/lib/import/formats/MusicLineParser';
import { exportMusicLineFile, musicLineInstrumentBytes } from '@/lib/export/MusicLineExporter';
import { planUnusedWavesampleRemoval, planEqualWavesampleMerge, applyWavesampleIdMap } from '../wavesampleCleanup';
import type { Pattern } from '@/types/tracker';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const FIXTURE = join(process.cwd(), 'public/data/songs/musicline-editor/drax.ml');

function cellsPlaying(patterns: Pattern[], id: number): number {
  let n = 0;
  for (const p of patterns) for (const ch of p.channels) for (const c of ch.rows) if (c.instrument === id) n++;
  return n;
}

/** The real song plus a byte-equal copy of instrument 1 (played by one cell) and an instrument no cell plays. */
function songWithDuplicateAndUnused(): { song: TrackerSong; n: number } {
  const song = parseMusicLineFile(new Uint8Array(readFileSync(FIXTURE)));
  if (!song) throw new Error('parse failed');
  const n = song.instruments.length;
  const dupe = structuredClone(song.instruments[0]);
  dupe.id = n + 1;
  const unused = structuredClone(song.instruments[1]);
  unused.id = n + 2;
  unused.name = 'never played';
  song.instruments.push(dupe, unused);
  outer: for (const p of song.patterns) for (const ch of p.channels) for (const c of ch.rows) {
    if (c.instrument > 0) { c.instrument = n + 1; break outer; }
  }
  expect(cellsPlaying(song.patterns, n + 1)).toBe(1);
  return { song, n };
}

describe('MusicLine wavesample cleanup', () => {
  it('merges the byte-equal copy into instrument 1, renumbers, and the exported file plays instrument 1 there', () => {
    const { song, n } = songWithDuplicateAndUnused();
    const plan = planEqualWavesampleMerge(song.instruments, musicLineInstrumentBytes);
    expect(plan.removeIds).toContain(n + 1);
    expect(plan.removeIds).not.toContain(n + 2); // a different title is a different INST
    expect(plan.idMap.get(n + 1)).toBe(1);
    expect(plan.idMap.get(n + 2)).toBe(n + 2 - (plan.removeIds.length));

    const before1 = cellsPlaying(song.patterns, 1);
    applyWavesampleIdMap(song.patterns, plan.idMap);
    expect(cellsPlaying(song.patterns, n + 1)).toBe(0);
    expect(cellsPlaying(song.patterns, 1)).toBe(before1 + 1);
    song.instruments = song.instruments.filter((i) => !plan.removeIds.includes(i.id)).map((i, k) => ({ ...i, id: k + 1 }));

    const back = parseMusicLineFile(exportMusicLineFile(song));
    if (!back) throw new Error('re-parse failed');
    expect(back.instruments.length).toBe(n + 2 - plan.removeIds.length);
    expect(cellsPlaying(back.patterns, 1)).toBe(before1 + 1);
    // The exporter writes the waveform synth's downsampled PCM and the parser
    // downsamples again, so the bytes are not compared; the kept instrument is.
    expect(back.instruments[0].name).toBe(song.instruments[0].name);
    expect(back.instruments[0].metadata?.mlSynthConfig?.waveformType).toBe(song.instruments[0].metadata?.mlSynthConfig?.waveformType);
  });

  it('removes the instrument no cell plays and keeps the played ones', () => {
    const { song, n } = songWithDuplicateAndUnused();
    const plan = planUnusedWavesampleRemoval(song.patterns, song.instruments);
    expect(plan.removeIds).toContain(n + 2);
    expect(plan.removeIds).not.toContain(n + 1);
    expect(plan.idMap.get(n + 1)).toBe(n + 2 - plan.removeIds.length);
  });

  it('never removes every instrument', () => {
    const { song } = songWithDuplicateAndUnused();
    for (const p of song.patterns) for (const ch of p.channels) for (const c of ch.rows) c.instrument = 0;
    expect(planUnusedWavesampleRemoval(song.patterns, song.instruments).removeIds).toEqual([]);
  });

  it('the format store actions remap the cells and renumber the instrument store', async () => {
    const { useFormatStore } = await import('@/stores/useFormatStore');
    const { useTrackerStore } = await import('@/stores/useTrackerStore');
    const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
    const { song, n } = songWithDuplicateAndUnused();
    useTrackerStore.setState({ patterns: song.patterns });
    useInstrumentStore.setState({ instruments: song.instruments, currentInstrumentId: n + 1 });

    // drax.ml carries byte-equal instruments of its own; the plan says how many go.
    const equal = planEqualWavesampleMerge(song.instruments, musicLineInstrumentBytes).removeIds.length;
    expect(equal).toBeGreaterThanOrEqual(1);
    expect(useFormatStore.getState().mergeEqualMusicLineWavesamples()).toBe(equal);
    let inst = useInstrumentStore.getState().instruments;
    expect(inst.length).toBe(n + 2 - equal);
    expect(inst.map((i) => i.id)).toEqual(inst.map((_, k) => k + 1));
    expect(inst.map((i) => i.metadata?.mlInstIdx)).toEqual(inst.map((_, k) => k));
    expect(useInstrumentStore.getState().currentInstrumentId).toBe(1); // the removed copy's cells now play 1
    expect(cellsPlaying(useTrackerStore.getState().patterns, n + 1)).toBe(0);

    const removed = useFormatStore.getState().removeUnusedMusicLineWavesamples();
    expect(removed).toBeGreaterThanOrEqual(1);
    inst = useInstrumentStore.getState().instruments;
    expect(inst.some((i) => i.name === 'never played')).toBe(false);
    expect(inst.map((i) => i.id)).toEqual(inst.map((_, k) => k + 1));
    for (const p of useTrackerStore.getState().patterns) for (const ch of p.channels) for (const c of ch.rows) {
      expect(c.instrument).toBeLessThanOrEqual(inst.length);
    }
    expect(useFormatStore.getState().removeUnusedMusicLineWavesamples()).toBe(0);
  }, 60_000);
});
