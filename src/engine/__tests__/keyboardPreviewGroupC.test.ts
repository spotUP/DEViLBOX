/**
 * Keyboard preview of the replayer-driven voices sounds like the same
 * instrument and note in the song (owner, 2026-10-06: Fred preview was an
 * octave and a half low, never decayed, 27 dB loud; the sibling audit found the
 * same class in the others).
 *
 * Oracle: the song engine with every voice but one muted, at the first note of
 * an instrument in the real corpus song. The preview is the voice the keyboard
 * plays (the replayer's own voice for the loaded module) fed the key the grid
 * cell of that note stands for (grid note n = MIDI n + 11, xmConversions).
 * Compared on what is heard: rising edges (pitch), RMS per 50 Hz tick (level and
 * envelope).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startWorklet, ROOT } from './workletHarness';
import { renderTicks, rmsPerTick, risingEdges, totalRms, db, FPT } from './keyboardPreviewHarness';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { parseFuturePlayerFile } from '@/lib/import/formats/FuturePlayerParser';
import { noteToBpNote } from '@/lib/import/formats/SoundMonNotes';

const corpus = (n: string) => {
  const f = readFileSync(resolve(ROOT, 'public/data/songs/formats', n));
  return f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
};
/** The Emscripten glue of the replayer wasm, made loadable in a worklet scope. */
const emscriptenTransform = (c: string) => c
  .replace(/import\.meta\.url/g, "'.'").replace(/export\s+default\s+\w+;?/g, '')
  .replace(/self\.location\.href/g, "'.'")
  .replace(/_scriptName=globalThis\.document\?\.currentScript\?\.src/, '_scriptName="."')
  .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
  .replace('HEAPU8=new Uint8Array(b);', 'HEAPU8=Module["HEAPU8"]=new Uint8Array(b);')
  .replace('HEAPF32=new Float32Array(b);', 'HEAPF32=Module["HEAPF32"]=new Float32Array(b);');

interface Cell { note: number; instrument: number; effTyp?: number; eff?: number }
interface GridSong {
  songPositions: number[];
  initialSpeed: number;
  patterns: Array<{ length: number; channels: Array<{ rows: Cell[] }> }>;
}
/** The first note of an instrument (any of `ids`) in song order: position index, row, channel, note, instrument. */
function firstNote(song: GridSong, ids: number[]) {
  for (const [posIdx, pi] of song.songPositions.entries()) {
    const pat = song.patterns[pi];
    for (let r = 0; r < pat.length; r++) for (let c = 0; c < pat.channels.length; c++) {
      const cell = pat.channels[c].rows[r];
      // A cell with an effect (arpeggio, slide, vibrato) plays more than the instrument.
      if (cell.note > 0 && cell.note < 97 && ids.includes(cell.instrument) && !cell.effTyp && !cell.eff) return { posIdx, row: r, ch: c, note: cell.note, ins: cell.instrument, patLen: pat.length };
    }
  }
  throw new Error('no note');
}

/** Ticks the note sounds before its channel's next note or instrument cell (within the pattern), capped. */
function holdTicks(song: GridSong, n: { posIdx: number; row: number; ch: number; patLen: number }, cap: number): number {
  const rows = song.patterns[song.songPositions[n.posIdx]].channels[n.ch].rows;
  let r = n.row + 1;
  while (r < n.patLen && !(rows[r].note > 0 || rows[r].instrument > 0)) r++;
  return Math.max(3, Math.min(cap, (r - n.row) * song.initialSpeed - 1));
}

/** Pitch, overall level and per-tick envelope of `prev` against `song` (both from their first sound). */
function expectSameVoice(label: string, song: Float32Array, prev: Float32Array, ticks: number) {
  const sr = rmsPerTick(song, ticks), pr = rmsPerTick(prev, ticks);
  const sPitch = risingEdges(song.subarray(0, ticks * FPT)), pPitch = risingEdges(prev.subarray(0, ticks * FPT));
  expect(sPitch, `${label}: song has pitch`).toBeGreaterThan(3);
  expect(Math.abs(pPitch / sPitch - 1), `${label}: rising edges preview ${pPitch} song ${sPitch}`).toBeLessThan(0.06);
  expect(Math.abs(db(totalRms(pr), totalRms(sr))), `${label}: overall level, dB`).toBeLessThan(1.5);
  sr.forEach((v, t) => { if (v > 0.002) expect(Math.abs(db(pr[t] || 1e-6, v)), `${label}: tick ${t}`).toBeLessThan(3); });
}
/** `out` from the first tick whose RMS is at least `thr`. */
function fromFirstSound(out: Float32Array, thr = 0.02): Float32Array {
  const r = rmsPerTick(out, Math.floor(out.length / FPT));
  const t = r.findIndex((v) => v >= thr);
  return out.subarray(Math.max(0, t) * FPT);
}

describe('Future Player: the keyboard plays the instrument the module defines, as the song plays it', () => {
  for (const name of ['hybris.fp', 'imploder_drums.fp']) {
    it(`${name}: every sample and synth instrument of the module is its own instrument (not one whole-song placeholder)`, () => {
      const song = parseFuturePlayerFile(corpus(name), name);
      expect(song.instruments.length).toBeGreaterThan(5);
      for (const i of song.instruments) {
        const ptr = (i as unknown as { metadata?: { fpInstrPtr?: number } }).metadata?.fpInstrPtr;
        expect(ptr, `${i.name} carries its replayer instrument pointer`).toBeGreaterThan(0);
      }
    });

    it(`${name}: a typed note has the song's pitch, level and envelope`, async () => {
      const ab = corpus(name);
      const song = parseFuturePlayerFile(ab, name) as unknown as GridSong & { instruments: Array<{ id: number; metadata: { fpInstrPtr: number } }> };
      const n = firstNote(song, song.instruments.map((i) => i.id));
      const ptr = song.instruments.find((i) => i.id === n.ins)!.metadata.fpInstrPtr;
      const ticks = holdTicks(song, n, 12);
      const a = await startWorklet('futureplayer', 'FuturePlayer');
      await a.send({ type: 'loadTune', buffer: ab });
      await a.send({ type: 'setMuteMask', mask: 1 << n.ch });
      await a.send({ type: 'play' });
      const side = n.ch === 0 || n.ch === 3 ? 0 : 1;
      const s = fromFirstSound(renderTicks(a.proc, 40, side), 0.05);
      const b = await startWorklet('futureplayer', 'FuturePlayer');
      await b.send({ type: 'loadTune', buffer: ab });
      await b.send({ type: 'noteOn', instrPtr: ptr, note: n.note, velocity: 100 });
      const p = fromFirstSound(renderTicks(b.proc, 40, 0), 0.05);
      expectSameVoice(name, s, p, ticks);
    });

    it(`${name}: key release runs the instrument's release envelope, then the voice ends`, async () => {
      const ab = corpus(name);
      const song = parseFuturePlayerFile(ab, name) as unknown as GridSong & { instruments: Array<{ id: number; metadata: { fpInstrPtr: number } }> };
      const n = firstNote(song, song.instruments.map((i) => i.id));
      const ptr = song.instruments.find((i) => i.id === n.ins)!.metadata.fpInstrPtr;
      const b = await startWorklet('futureplayer', 'FuturePlayer');
      await b.send({ type: 'loadTune', buffer: ab });
      await b.send({ type: 'noteOn', instrPtr: ptr, note: n.note, velocity: 100 });
      renderTicks(b.proc, 6, 0);
      await b.send({ type: 'noteOff' });
      const after = rmsPerTick(renderTicks(b.proc, 60, 0), 60);
      expect(Math.max(...after.slice(0, 60)), 'sounds again after release is not expected to be loud').toBeLessThan(0.3);
      expect(after[after.length - 1], 'the voice has ended').toBe(0);
    });
  }
});

describe('SoundMon: a synth instrument typed on the keyboard is the replayer voice, as the song plays it', () => {
  it('antidust.bp3: instruments 5 and 6 (synth, no PCM) have the song pitch, level and envelope', async () => {
    const name = 'antidust.bp3';
    const raw = corpus(name);
    const song = await parseModuleToSong(new File([raw], name)) as unknown as GridSong & { soundMonFileData?: ArrayBuffer };
    const ab = song.soundMonFileData ?? raw;
    for (const ins of [5, 6]) {
      const n = firstNote(song, [ins]);
      const startTick = (n.posIdx * n.patLen + n.row) * song.initialSpeed;
      const ticks = holdTicks(song, n, 30);
      const a = await startWorklet('soundmon', 'SoundMon', emscriptenTransform);
      await a.send({ type: 'loadModule', moduleData: ab });
      await a.send({ type: 'setChannelMask', mask: 1 << n.ch });
      await a.send({ type: 'play' });
      const side = n.ch === 0 || n.ch === 3 ? 0 : 1;
      // The player's first sound of a row comes one tick after the row starts.
      const s = renderTicks(a.proc, startTick + ticks + 10, side).subarray((startTick + 1) * FPT);
      const b = await startWorklet('soundmon', 'SoundMon', emscriptenTransform);
      await b.send({ type: 'loadModule', moduleData: ab });
      await b.send({ type: 'previewNoteOn', instrument: n.ins, note: noteToBpNote(n.note) });
      const p = renderTicks(b.proc, ticks + 10, 0);
      expectSameVoice(`${name} instrument ${ins}`, s, p, ticks);
    }
  });

  it('key release ends the preview voice (the player has no note-off; a muted channel is the nearest row)', async () => {
    const raw = corpus('antidust.bp3');
    const b = await startWorklet('soundmon', 'SoundMon', emscriptenTransform);
    await b.send({ type: 'loadModule', moduleData: raw });
    await b.send({ type: 'previewNoteOn', instrument: 5, note: 13 });
    renderTicks(b.proc, 5, 0);
    await b.send({ type: 'previewNoteOff' });
    expect(Math.max(...renderTicks(b.proc, 5, 0).map(Math.abs))).toBe(0);
  });
});
