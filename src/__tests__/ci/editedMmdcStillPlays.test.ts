/**
 * An edited OctaMED MMDC song still plays on nuade.
 *
 * Bug (2026-11-13): one note typed into "knightmare - ingame 3.mmdc" made the Nuade engine silent. The edited block
 * re-packed to an odd length (+3 bytes), every object after it moved to an odd offset, and nuade's MMDC parser rejects
 * a sample record on an odd offset ("nuade open failed (-2): not a valid MMDC module").
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { loadSharedWorkletScripts, startWorklet, stereoOutputs, type WorkletMsg } from '@/engine/__tests__/workletHarness';

const FILE = 'public/data/songs/octamed-mmdc/knightmare - ingame 3.mmdc';

async function exportEdited(): Promise<Uint8Array> {
  const raw = new Uint8Array(readFileSync(FILE));
  const song = await parseModuleToSong(new File([raw], FILE.split('/').pop()!));
  expect(song.uadePatternLayout!.formatId).toBe('mmdc');
  // The edit measured live: channel 2, row 1, C-3 (note 37) with instrument 2.
  song.patterns[0].channels[2].rows[1] = { ...song.patterns[0].channels[2].rows[1], note: 37, instrument: 2 };
  const { exportNativeSong } = await import('@/lib/export/nativeExportRouter');
  const out = (await exportNativeSong(song))!.data as Uint8Array;
  expect(out.length).not.toBe(raw.length); // the edited block really changed size
  return out;
}

describe('edited MMDC still plays', () => {
  it('knightmare with one edited cell opens on nuade and is not silent', async () => {
    const bytes = await exportEdited();
    loadSharedWorkletScripts();
    const rig = await startWorklet('nuade', 'Nuade');
    const buf = bytes.slice().buffer;
    await rig.send({ type: 'loadModule', bytes: buf, playerId: 'mmdc', fileName: 'edited.mmdc', subsong: undefined, companions: [] });
    const msg = rig.posted.find((m: WorkletMsg) => m.type === 'moduleLoaded' || m.type === 'error');
    expect(msg?.type, JSON.stringify(msg)).toBe('moduleLoaded');
    await rig.send({ type: 'play' });
    let peak = 0;
    for (let q = 0; q < 600; q++) {
      const out = stereoOutputs(9);
      rig.proc.process([], out);
      for (const ch of out[0]!) for (const v of ch) peak = Math.max(peak, Math.abs(v));
    }
    expect(peak).toBeGreaterThan(0.05);
  }, 120_000);
});
