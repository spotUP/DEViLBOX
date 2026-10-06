/**
 * InStereo2: a SetTrackLen effect lengthens the replayer's rows per track
 * mid-song, so the reported row ran past the end of a grid sized by the
 * sub-song header (16 rows). The grid's pattern length now follows what the
 * replayer plays. Real worklet and WASM; the song is stereo_feeling.is20 with
 * SetTrackLen 24 written on row 0 of every track.
 */
import { describe, it, expect } from 'vitest';
import { loadSharedWorkletScripts, startWorklet, songBuffer, stereoOutputs } from './workletHarness';
import { instereo2Transform } from '@/engine/instereo2/InStereo2Engine';
import { parseInStereo2File } from '@/lib/import/formats/InStereo2Parser';

const FILE = 'public/data/songs/formats/stereo_feeling.is20';

function withTrackLen(src: Uint8Array, len: number): Uint8Array {
  const b = src.slice();
  let n = -1;
  for (let i = 0; i < b.length - 4; i++) if (b[i] === 0x4e && b[i + 1] === 0x54 && b[i + 2] === 0x42 && b[i + 3] === 0x4c) { n = i; break; }
  const num = new DataView(b.buffer).getUint32(n + 4);
  for (let l = 0; l < num; l += 16) { const o = n + 8 + l * 4; b[o + 2] = (b[o + 2] & 0xf0) | 9; b[o + 3] = len; }
  return b;
}

describe('InStereo2 reported row stays inside the grid after a track length change', { timeout: 60_000 }, () => {
  it('grid pattern length follows SetTrackLen and the played row never exceeds it', async () => {
    loadSharedWorkletScripts();
    const patched = withTrackLen(new Uint8Array(songBuffer(FILE).slice(0)), 24);
    const song = parseInStereo2File(patched.slice(), FILE)!;
    expect(song.patterns[0].length).toBe(24);

    const { proc, send, posted } = await startWorklet('instereo2', 'InStereo2', instereo2Transform);
    await send({ type: 'loadModule', moduleData: patched.buffer.slice(0) });
    await send({ type: 'play' });
    const outs = stereoOutputs(5);
    let maxRow = 0; let beyond = 0; let reports = 0;
    for (let block = 0; block < 6000; block++) {
      proc.process([], outs);
      while (posted.length) {
        const p = posted.shift() as { type?: string; songPos?: number; row?: number };
        if (p.type !== 'position') continue;
        reports++;
        maxRow = Math.max(maxRow, p.row!);
        if (p.row! >= (song.patterns[p.songPos!]?.length ?? 0)) beyond++;
      }
    }
    expect(reports).toBeGreaterThan(20);
    expect(maxRow).toBeGreaterThan(16);
    expect(beyond).toBe(0);
  });
});
