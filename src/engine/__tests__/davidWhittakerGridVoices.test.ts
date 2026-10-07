/**
 * David Whittaker: the grid shows every voice the replayer plays (owner, apb.dw: "I hear and
 * see only one channel"). A channel whose position list is shorter than the longest loops it in
 * the replayer; the grid used to leave it empty after its list ended.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startWorklet, ROOT } from './workletHarness';
import { renderTicks, rmsPerTick } from './keyboardPreviewHarness';
import { parseDavidWhittakerFile } from '@/lib/import/formats/DavidWhittakerParser';

const corpus = (n: string) => {
  const f = readFileSync(resolve(ROOT, 'public/data/songs', n));
  return f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
};
const emscriptenTransform = (c: string) => c
  .replace(/import\.meta\.url/g, "'.'").replace(/export\s+default\s+\w+;?/g, '')
  .replace(/self\.location\.href/g, "'.'")
  .replace(/_scriptName=globalThis\.document\?\.currentScript\?\.src/, '_scriptName="."')
  .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
  .replace('HEAPU8=new Uint8Array(b);', 'HEAPU8=Module["HEAPU8"]=new Uint8Array(b);')
  .replace('HEAPF32=new Float32Array(b);', 'HEAPF32=Module["HEAPF32"]=new Float32Array(b);');
interface GridSong { songPositions: number[]; patterns: Array<{ channels: Array<{ rows: Array<{ note: number }> }> }> }

describe.each(['formats/apb.dw', 'david-whittaker/garfield2+.dw'])('David Whittaker %s: the grid shows every voice the replayer plays', (name) => {
  it('each voice that sounds has notes in (nearly) every position, a shorter position list looping as the replayer loops it', async () => {
    const ab = corpus(name);
    const song = parseDavidWhittakerFile(ab, name) as unknown as GridSong;
    for (let ch = 0; ch < 4; ch++) {
      const a = await startWorklet('davidwhittaker', 'DavidWhittaker', emscriptenTransform);
      await a.send({ type: 'loadModule', moduleData: ab.slice(0) });
      await a.send({ type: 'setChannelMask', mask: 1 << ch });
      await a.send({ type: 'play' });
      const r = rmsPerTick(renderTicks(a.proc, 400, ch === 1 || ch === 2 ? 1 : 0), 400);
      if (!r.some((v) => v > 0.05)) continue;   // a voice the song never plays
      const withNotes = song.songPositions.filter((pi) => song.patterns[pi].channels[ch].rows.some((c) => c.note > 0 && c.note < 97)).length;
      expect(withNotes, `voice ${ch} has notes in ${withNotes} of ${song.songPositions.length} positions`).toBeGreaterThanOrEqual(Math.floor(song.songPositions.length * 0.8));
    }
  });
});

describe('David Whittaker apb.dw: a voice that never sounds shows empty cells, not a note-off on every row', () => {
  it('voices 3 and 4 (silent in subsong 0) have no note-off cells', () => {
    const song = parseDavidWhittakerFile(corpus('formats/apb.dw'), 'apb.dw') as unknown as GridSong;
    const offs = (ch: number) => song.songPositions.reduce((n, pi) => n + song.patterns[pi].channels[ch].rows.filter((c) => c.note === 97).length, 0);
    expect(offs(2), 'voice 3 note-offs').toBe(0);
    expect(offs(3), 'voice 4 note-offs').toBe(0);
  });
});
