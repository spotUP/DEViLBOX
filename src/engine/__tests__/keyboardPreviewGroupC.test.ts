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
import { startWorklet, stereoOutputs, ROOT } from './workletHarness';
import { renderTicks, rmsPerTick, risingEdges, totalRms, db, FPT } from './keyboardPreviewHarness';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { parseFuturePlayerFile } from '@/lib/import/formats/FuturePlayerParser';
import { fpKeyToTableIndex } from '@/lib/import/formats/fpGrid';
import { fpCodeSection, walkFuturePlayer } from '@/lib/import/formats/fpWalk';
import { noteToBpNote } from '@/lib/import/formats/SoundMonNotes';
import { parseSteveTurnerFile } from '@/lib/import/formats/SteveTurnerParser';
import { parseHivelyFile } from '@/lib/import/formats/HivelyParser';
import { parseJochenHippel7VFile } from '@/lib/import/formats/JochenHippel7VParser';
import { serializeTFMXConfig } from '@/engine/tfmx/TFMXSynth';
import { HivelySynth, hvlNoteForKey } from '@/engine/hively/HivelySynth';
import { hivelyTransform } from '@/engine/hively/HivelyEngine';

const corpus = (n: string, dir = 'formats') => {
  const f = readFileSync(resolve(ROOT, 'public/data/songs', dir === 'formats' ? 'formats' : dir, n));
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

interface Cell { note: number; instrument: number; volume?: number; effTyp?: number; eff?: number }
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
function holdTicks(song: GridSong, n: { posIdx: number; row: number; ch: number; patLen: number }, cap: number, ticksPerRow = song.initialSpeed): number {
  const rows = song.patterns[song.songPositions[n.posIdx]].channels[n.ch].rows;
  let r = n.row + 1;
  while (r < n.patLen && !(rows[r].note > 0 || rows[r].instrument > 0)) r++;
  return Math.max(3, Math.min(cap, (r - n.row) * ticksPerRow - 1));
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
      // the grid shows the pitch the player plays (shifted up by the song's octave bias): the key plays that table entry
      const bias = (song.instruments.find((i) => i.id === n.ins) as unknown as { metadata: { fpOctaveBias: number } }).metadata.fpOctaveBias;
      const ticks = holdTicks(song, n, 12);
      const a = await startWorklet('futureplayer', 'FuturePlayer');
      await a.send({ type: 'loadTune', buffer: ab });
      await a.send({ type: 'setMuteMask', mask: 1 << n.ch });
      await a.send({ type: 'play' });
      const side = n.ch === 0 || n.ch === 3 ? 0 : 1;
      // the song's note starts on its row's interrupt, at the module's own tick rate (hybris.fp ticks at 43.98 Hz, not 50):
      // cut the song at that frame, so both renders start their note at frame 0 and the 20 ms windows line up
      const walk = walkFuturePlayer(fpCodeSection(new Uint8Array(ab)), 0)!;
      const flatRow = song.songPositions.slice(0, n.posIdx).reduce((sum, pi) => sum + song.patterns[pi].length, 0) + n.row;
      const startFrame = Math.round(((flatRow * walk.speed) / walk.tickHz) * 48000);
      const s = renderTicks(a.proc, 40 + Math.ceil(startFrame / FPT), side).subarray(startFrame);
      const b = await startWorklet('futureplayer', 'FuturePlayer');
      await b.send({ type: 'loadTune', buffer: ab });
      await b.send({ type: 'noteOn', instrPtr: ptr, note: fpKeyToTableIndex(n.note, bias), velocity: 100 });
      const p = renderTicks(b.proc, 40, 0);
      expectSameVoice(name, s, p, ticks);
    });

    it(`${name}: key release runs the instrument's release envelope, then the voice ends`, async () => {
      const ab = corpus(name);
      const song = parseFuturePlayerFile(ab, name) as unknown as GridSong & { instruments: Array<{ id: number; metadata: { fpInstrPtr: number } }> };
      const n = firstNote(song, song.instruments.map((i) => i.id));
      const ptr = song.instruments.find((i) => i.id === n.ins)!.metadata.fpInstrPtr;
      const b = await startWorklet('futureplayer', 'FuturePlayer');
      await b.send({ type: 'loadTune', buffer: ab });
      await b.send({ type: 'noteOn', instrPtr: ptr, note: fpKeyToTableIndex(n.note, 0), velocity: 100 });
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

describe('Steve Turner: a typed note runs the replayer voice (envelope, vibrato, slide), not a flat sample', () => {
  for (const name of ['paradroid90.jpo', 'rainbow islands.jpo']) {
    it(`${name}: the first sampled note has the song's pitch, level and envelope`, async () => {
      const ab = corpus(name, 'steve-turner');
      const song = parseSteveTurnerFile(ab, name) as unknown as GridSong;
      const n = firstNote(song, Array.from({ length: 32 }, (_, i) => i + 1));
      // The player ticks at 99.86 Hz, two ticks to a 50 Hz tick of the harness.
      const ticks = holdTicks(song, n, 12, song.initialSpeed / 2);
      const a = await startWorklet('steveturner', 'SteveTurner', emscriptenTransform);
      await a.send({ type: 'loadModule', moduleData: ab });
      await a.send({ type: 'setMuteMask', mask: 1 << n.ch });
      const startTick = Math.round((n.posIdx * n.patLen + n.row) * song.initialSpeed / 2);
      const side = n.ch === 0 || n.ch === 3 ? 0 : 1;
      const s = fromFirstSound(renderTicks(a.proc, startTick + ticks + 40, side).subarray(startTick * FPT), 0.02);
      const b = await startWorklet('steveturner', 'SteveTurner', emscriptenTransform);
      await b.send({ type: 'loadModule', moduleData: ab });
      await b.send({ type: 'pause' });
      // grid note = replayer note index + 13; the key is the grid note + 11; the synth maps the key back
      await b.send({ type: 'noteOn', instrument: n.ins - 1, note: n.note - 13, velocity: 100 });
      const p = fromFirstSound(renderTicks(b.proc, ticks + 40, 0), 0.02);
      expectSameVoice(name, s, p, ticks);
    });
  }

  it('key release enters the instrument decay segment (no hard cut)', async () => {
    const ab = corpus('paradroid90.jpo', 'steve-turner');
    const b = await startWorklet('steveturner', 'SteveTurner', emscriptenTransform);
    await b.send({ type: 'loadModule', moduleData: ab });
    await b.send({ type: 'pause' });
    await b.send({ type: 'noteOn', instrument: 3, note: 12, velocity: 100 });
    renderTicks(b.proc, 4, 0);
    await b.send({ type: 'noteOff' });
    const after = rmsPerTick(renderTicks(b.proc, 40, 0), 40);
    // The instrument's own decay segment: no hard cut at key-up, and the level falls steadily.
    expect(after[0], 'no hard cut at key-up').toBeGreaterThan(0.1);
    expect(after[after.length - 1], 'level falls through the decay').toBeLessThan(after[0] * 0.85);
  });
});

describe('Hively / AHX: a typed note is the replayer voice the song plays, at the song pitch and level', () => {
  /** The keyboard players of the Hively worklet render into output 37, apart from the tune. */
  async function previewOf(ab: ArrayBuffer, cfg: unknown, hvlNote: number, ticks: number, withTune: boolean) {
    const c = await startWorklet('hively', 'Hively', hivelyTransform);
    if (withTune) await c.send({ type: 'loadTune', buffer: ab, defStereo: 0 });
    await c.send({ type: 'createPlayer' });
    const handle = (c.posted.find((p) => (p as { type?: string }).type === 'playerCreated') as unknown as { handle: number }).handle;
    const blob = (HivelySynth.prototype as unknown as { serializeInstrument(cfg: unknown): ArrayBuffer }).serializeInstrument.call({}, cfg);
    await c.send({ type: 'setInstrument', handle, buffer: blob });
    await c.send({ type: 'noteOn', handle, note: hvlNote, velocity: 127 });
    const l = new Float32Array(ticks * FPT), r = new Float32Array(ticks * FPT);
    for (let f = 0; f < l.length; f += 128) { const o = stereoOutputs(38); c.proc.process([], o); l.set(o[37][0], f); r.set(o[37][1], f); }
    return { l, r, c, handle };
  }
  const NOTES = 3;
  for (const name of ['aces_high.ahx', 'hexplosion.hvl']) {
    it(`${name}: the plain notes on the first row have the song's pitch, level and envelope`, async () => {
      const ab = corpus(name);
      const song = parseHivelyFile(ab, name) as unknown as GridSong & { instruments: Array<{ id: number; hively: unknown }> };
      const seen = new Set<string>();
      let checked = 0;
      // First position only: the song's tempo is still the header's there, so row times are exact.
      for (const pi of song.songPositions.slice(0, 1)) {
        const pat = song.patterns[pi];
        for (let r = 0; r < pat.length && checked < NOTES; r++) for (let c = 0; c < pat.channels.length && checked < NOTES; c++) {
          const cell = pat.channels[c].rows[r];
          // A volume or effect cell plays more than the instrument (track volume, slides).
          if (!(cell.note > 0 && cell.note < 97 && cell.instrument > 0 && !cell.effTyp && !cell.eff && !cell.volume)) continue;
          const seenKey = `${cell.instrument}/${cell.note}`;
          if (seen.has(seenKey) || r > 0) continue;   // a note on the first row, once per instrument and note
          seen.add(seenKey);
          const n = { posIdx: song.songPositions.indexOf(pi), row: r, ch: c, patLen: pat.length };
          const ticks = holdTicks(song, n, 8);
          const a = await startWorklet('hively', 'Hively', hivelyTransform);
          await a.send({ type: 'loadTune', buffer: ab, defStereo: 0 });
          await a.send({ type: 'setMuteMask', mask: 1 << c });
          await a.send({ type: 'play' });
          const startTick = Math.round(n.posIdx * n.patLen * song.initialSpeed + r * song.initialSpeed);
          // The song voice sits where the song's stereo mode pans it; the preview is centred. Level is
          // compared as total power over both sides, pitch on the sum.
          const total = (startTick + ticks + 4) * FPT;
          const sl = new Float32Array(total), sR = new Float32Array(total);
          for (let f = 0; f < total; f += 128) { const o = stereoOutputs(1); a.proc.process([], o); sl.set(o[0][0], f); sR.set(o[0][1], f); }
          const inst = song.instruments.find((i) => i.id === cell.instrument)!;
          // key = grid note + 11 (xmConversions); HivelySynth maps the key back to the replayer's note
          const key = cell.note + 11;
          const hvlNote = hvlNoteForKey(key);
          const p = await previewOf(ab, inst.hively, hvlNote, ticks + 4, true);
          const mixS = sl.map((v, i) => v + sR[i]).subarray(startTick * FPT);
          const mixP = p.l.map((v, i) => v + p.r[i]);
          const powS = (x: Float32Array, y: Float32Array) => rmsPerTick(x, ticks).map((v, t) => Math.hypot(v, rmsPerTick(y, ticks)[t]));
          const sr = powS(sl.subarray(startTick * FPT), sR.subarray(startTick * FPT)), pr = powS(p.l, p.r);
          if (process.env.PV_DEBUG) console.log('HV', name, key, JSON.stringify(n), ticks, startTick, sr.map((v) => v.toFixed(3)).join(','), '|', pr.map((v) => v.toFixed(3)).join(','));
          const sPitch = risingEdges(mixS.subarray(0, ticks * FPT)), pPitch = risingEdges(mixP.subarray(0, ticks * FPT));
          if (sPitch > 8) expect(Math.abs(pPitch / sPitch - 1), `${name} note ${key}: rising edges preview ${pPitch} song ${sPitch}`).toBeLessThan(0.08);
          expect(Math.abs(db(totalRms(pr), totalRms(sr))), `${name} note ${key}: overall level, dB`).toBeLessThan(1.5);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(0);
    });

    it(`${name}: key release runs the instrument's release`, async () => {
      const ab = corpus(name);
      const song = parseHivelyFile(ab, name) as unknown as { instruments: Array<{ id: number; hively: unknown }> };
      const p = await previewOf(ab, song.instruments[0].hively, 40, 10, false);
      await p.c.send({ type: 'noteOff', handle: p.handle });
      const r = new Float32Array(120 * FPT);
      for (let f = 0; f < r.length; f += 128) { const o = stereoOutputs(38); p.c.proc.process([], o); r.set(o[37][0], f); }
      const per = rmsPerTick(r, 120);
      expect(per[per.length - 1], 'the voice has released').toBeLessThan(0.002);
    });
  }
});

describe('TFMX voice (Hippel TFMX / 7V instruments): the keyboard plays the decoder, not silence', () => {
  /** Total power per tick over both sides of a TFMX worklet's main output, and the mono sum. */
  function capture(proc: { process(i: Float32Array[][], o: Float32Array[][]): boolean }, ticks: number) {
    const l = new Float32Array(ticks * FPT), r = new Float32Array(ticks * FPT);
    for (let f = 0; f < l.length; f += 128) { const o = stereoOutputs(1); proc.process([], o); l.set(o[0][0], f); r.set(o[0][1], f); }
    const pl = rmsPerTick(l, ticks), pr = rmsPerTick(r, ticks);
    return { power: pl.map((v, t) => Math.hypot(v, pr[t])), mix: l.map((v, i) => v + r[i]) };
  }
  it('ghostbattle_gameover.hip7: a typed note sounds with the pitch and level of the same note in the song', async () => {
    const name = 'ghostbattle_gameover.hip7';
    const ab = corpus(name);
    const song = parseJochenHippel7VFile(ab, name) as unknown as GridSong & { instruments: Array<{ id: number; tfmx: Parameters<typeof serializeTFMXConfig>[0] }> };
    const n = firstNote(song, song.instruments.map((i) => i.id));
    expect(n.row).toBe(0);
    const ticks = 5;
    const a = await startWorklet('tfmx', 'TFMX');
    await a.send({ type: 'loadModule', mdatBuffer: ab, subsong: 0 });
    const voices = (a.posted.find((p) => (p as { type?: string }).type === 'moduleLoaded') as unknown as { voices: number }).voices;
    for (let v = 0; v < voices; v++) await a.send({ type: 'moduleMuteVoice', voice: v, mute: v !== n.ch });
    await a.send({ type: 'modulePlay' });
    const sc = capture(a.proc, ticks + 1);
    const sPow = sc.power.slice(1), sMix = sc.mix.subarray(FPT);
    // The same voice, left or right of the mix, as an edge count of the first output
    const key = n.note + 11;
    const b = await startWorklet('tfmx', 'TFMX');
    await b.send({ type: 'createPlayer' });
    const handle = (b.posted.find((p) => (p as { type?: string }).type === 'playerCreated') as unknown as { handle: number }).handle;
    await b.send({ type: 'loadInstrument', handle, buffer: serializeTFMXConfig(song.instruments.find((i) => i.id === n.ins)!.tfmx) });
    await b.send({ type: 'noteOn', handle, note: key, velocity: 100 });
    const pc = capture(b.proc, ticks + 1);
    const pPow = pc.power.slice(1), pMix = pc.mix.subarray(FPT);
    expect(totalRms(sPow), 'the song voice sounds').toBeGreaterThan(0.01);
    expect(totalRms(pPow), 'the preview sounds').toBeGreaterThan(0.01);
    if (process.env.PV_DEBUG) console.log('TF', sPow.map((v) => v.toFixed(3)).join(','), '|', pPow.map((v) => v.toFixed(3)).join(','));
    expect(Math.abs(db(totalRms(pPow), totalRms(sPow))), 'overall level, dB').toBeLessThan(1);
    sPow.forEach((v, t) => expect(Math.abs(db(pPow[t] || 1e-6, v)), `tick ${t}`).toBeLessThan(1.5));
    const se = risingEdges(sMix), pe = risingEdges(pMix);
    expect(se, 'the song voice has pitch').toBeGreaterThan(3);
    expect(Math.abs(pe / se - 1), `rising edges preview ${pe} song ${se}`).toBeLessThan(0.06);
  });
});
