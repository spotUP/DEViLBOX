/**
 * Keyboard preview of the whole-song replayer formats: the key plays the replayer's OWN
 * voice (its track reader, envelope, arpeggio and mixer), so a typed note sounds as the
 * song plays that instrument. One table row per format, each measured against the song
 * engine with every voice but one muted, at the first note of that voice in a corpus song:
 * pitch (rising edges), overall level and the envelope per 50 Hz tick.
 *
 * Reachability is proved once per format here: the preview is driven through the same
 * worklet messages the synth sends (previewLoad / noteOn), never through the song's play.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DW_FX } from '@/lib/import/formats/davidWhittakerEffectGlyphs';
import { installDwNodeFetch } from '@/lib/import/__tests__/helpers/dwNodeFetch';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startWorklet, ROOT, type WorkletProc } from './workletHarness';
import { parseDavidWhittakerFile } from '@/lib/import/formats/DavidWhittakerParser';
import { dwNoteForKey } from '@/engine/davidwhittaker/dwKeyNote';
import { parseStartrekkerAMFile } from '@/lib/import/formats/StartrekkerAMParser';
import { stPeriodForKey } from '@/engine/startrekker-am/stKeyNote';
import { parseDigitalMugicianFile } from '@/lib/import/formats/DigitalMugicianParser';
import { dmNoteForKey } from '@/engine/digmug/dmKeyNote';
import { parseSonicArrangerFile } from '@/lib/import/formats/SonicArrangerParser';
import { saNoteForKey } from '@/engine/sonic-arranger/saKeyNote';
import { parseDeltaMusic1File } from '@/lib/import/formats/DeltaMusic1Parser';
import { dm1NoteForKey } from '@/engine/deltamusic1/dm1KeyNote';
import { parseDeltaMusic2File } from '@/lib/import/formats/DeltaMusic2Parser';
import { dm2NoteForKey } from '@/engine/deltamusic2/dm2KeyNote';
import { parseInStereo1File } from '@/lib/import/formats/InStereo1Parser';
import { parseInStereo2File } from '@/lib/import/formats/InStereo2Parser';
import { parseTFMXFile } from '@/lib/import/formats/TFMXParser';
import { tfmxNoteForKey } from '@/engine/tfmx/tfmxKeyNote';
import { parseSteveTurnerFile } from '@/lib/import/formats/SteveTurnerParser';
import { renderTicks, rmsPerTick, fundamentalHz, totalRms, db, FPT, fromOnset } from './keyboardPreviewHarness';

const corpus = (n: string) => {
  const f = readFileSync(resolve(ROOT, 'public/data/songs', n));
  return f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
};
/** The Emscripten glue of a replayer wasm, made loadable in a worklet scope. */
const emscriptenTransform = (c: string) => c
  .replace(/import\.meta\.url/g, "'.'").replace(/export\s+default\s+\w+;?/g, '')
  .replace(/self\.location\.href/g, "'.'")
  .replace(/_scriptName=globalThis\.document\?\.currentScript\?\.src/, '_scriptName="."')
  .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
  .replace('HEAPU8=new Uint8Array(b);', 'HEAPU8=Module["HEAPU8"]=new Uint8Array(b);')
  .replace('HEAPF32=new Float32Array(b);', 'HEAPF32=Module["HEAPF32"]=new Float32Array(b);');

interface Cell { note: number; instrument: number; effTyp?: number; eff?: number; effTyp2?: number; effTyp3?: number; effTyp4?: number; effTyp5?: number }
interface GridSong { instruments: Array<{ id: number; name?: string; synthType?: string; digMug?: { sampleIndex?: number; fineTune?: number }; inStereo2?: { instrumentNumber?: number } }>; initialSpeed: number; songPositions: number[]; patterns: Array<{ length: number; channels: Array<{ rows: Cell[] }> }> }

/**
 * First note of channel `ch` in song order that carries only the commands a key plays too (the envelope,
 * arpeggio and channel transpose the song pairs with the sample), with its instrument.
 */
function firstNoteOnChannel(song: GridSong, ch: number): { note: number; ins: number } | null {
  const paired = new Set([DW_FX.envelope, DW_FX.arpeggio, DW_FX.channelTranspose]);
  for (const pi of song.songPositions) {
    for (const cell of song.patterns[pi].channels[ch]?.rows ?? []) {
      const fx = [cell.effTyp, cell.effTyp2, cell.effTyp3, cell.effTyp4, cell.effTyp5].filter((t): t is number => !!t);
      if (cell.note > 0 && cell.note < 97 && cell.instrument > 0 && fx.every((t) => paired.has(t as never))) return { note: cell.note, ins: cell.instrument };
    }
  }
  return null;
}

/** First tick of `out` loud enough to be the note (a partial first tick before it is not). */
const onsetTick = (out: Float32Array, ticks: number) => Math.max(0, rmsPerTick(out, ticks).findIndex((v) => v >= 0.05));
function previewVoiceFromOnset(proc: WorkletProc, ticks: number): Float32Array {
  const out = renderTicks(proc, ticks + 8, 0);
  const t = onsetTick(out, ticks + 8);
  return out.subarray(t * FPT, (t + ticks) * FPT);
}

function expectSameVoice(label: string, song: Float32Array, prev: Float32Array, ticks: number) {
  const sr = rmsPerTick(song, ticks), pr = rmsPerTick(prev, ticks);
  expect(ticks, `${label}: the note lasts long enough to measure`).toBeGreaterThanOrEqual(4);
  const hz = (x: Float32Array) => fundamentalHz(x, 30, 4000) || fundamentalHz(x, 30, 400);
  const sHz = hz(song), pHz = hz(prev);
  expect(sHz, `${label}: the song voice has pitch (${ticks} ticks, ${song.length} samples)`).toBeGreaterThan(0);
  const cents = Math.abs(1200 * Math.log2(pHz / sHz));
  expect(cents, `${label}: preview ${pHz.toFixed(1)} Hz, song ${sHz.toFixed(1)} Hz, cents`).toBeLessThan(50);
  expect(Math.abs(db(totalRms(pr), totalRms(sr))), `${label}: overall level, dB`).toBeLessThan(2);
  sr.forEach((v, t) => { if (v > 0.004) expect(Math.abs(db(pr[t] || 1e-6, v)), `${label}: tick ${t}`).toBeLessThan(2); });
}

describe.each(['formats/apb.dw', 'david-whittaker/garfield2+.dw'])('David Whittaker %s: a typed note is the replayer voice, as the song plays it', (name) => {
  let restoreFetch = () => {};
  beforeAll(() => { restoreFetch = installDwNodeFetch(); });
  afterAll(() => restoreFetch());
  it(`${name}: the first note of each voice has the song's pitch, level and envelope`, async () => {
    const ab = corpus(name);
    const song = await parseDavidWhittakerFile(ab, name) as unknown as GridSong;
    // A sample several voices use carries each voice's channel transpose; the preview takes the one
    // the voice that sounds the sample first has, so only that voice is compared (voices that never
    // sound in the first 400 ticks, like apb.dw's 2 and 3 which only rest, have no first note to measure).
    const voices: Array<{ ch: number; ins: number; note: number; onset: number; audio: Float32Array; ticks: number }> = [];
    for (let ch = 0; ch < 4; ch++) {
      const n = firstNoteOnChannel(song, ch);
      if (!n) continue;
      const a = await startWorklet('davidwhittaker', 'DavidWhittaker', emscriptenTransform);
      await a.send({ type: 'loadModule', moduleData: ab.slice(0) });
      await a.send({ type: 'setChannelMask', mask: 1 << ch });
      await a.send({ type: 'play' });
      const out = renderTicks(a.proc, 400, ch === 1 || ch === 2 ? 1 : 0);
      if (!rmsPerTick(out, 400).some((v) => v >= 0.05)) continue;
      const ticks = Math.max(4, song.initialSpeed), t = onsetTick(out, 400);
      voices.push({ ch, ...n, onset: t, audio: out.subarray(t * FPT, (t + ticks) * FPT), ticks });
    }
    expect(voices.length, 'the song has a voice to measure').toBeGreaterThan(0);
    const claimed = new Set<number>();
    for (const v of voices.sort((x, y) => x.onset - y.onset)) {
      if (claimed.has(v.ins)) continue;
      claimed.add(v.ins);
      // The key the grid note stands for (MIDI = grid + 11), on a worklet whose song never plays.
      const b = await startWorklet('davidwhittaker', 'DavidWhittaker', emscriptenTransform);
      await b.send({ type: 'loadModule', moduleData: ab.slice(0) });
      await b.send({ type: 'previewLoad', buffer: ab.slice(0) });
      await b.send({ type: 'noteOn', sample: v.ins - 1, note: dwNoteForKey(v.note + 11) });
      expectSameVoice(`${name} voice ${v.ch}`, v.audio, previewVoiceFromOnset(b.proc, v.ticks), v.ticks);
    }
  });

  it(`${name}: the instrument list is the replayer's sample table`, async () => {
    const ab = corpus(name);
    const a = await startWorklet('davidwhittaker', 'DavidWhittaker', emscriptenTransform);
    await a.send({ type: 'loadModule', moduleData: ab });
    const m = (a.proc as unknown as { module: { _dw_get_instrument_count(h: number): number }; handle: number });
    const parsed = await parseDavidWhittakerFile(ab, name) as unknown as GridSong;
    expect(parsed.instruments.length).toBe(m.module._dw_get_instrument_count(m.handle));
  });

  it(`${name}: a key never starts the song, and key release silences the voice`, async () => {
    const ab = corpus(name);
    const b = await startWorklet('davidwhittaker', 'DavidWhittaker', emscriptenTransform);
    await b.send({ type: 'loadModule', moduleData: ab.slice(0) });
    await b.send({ type: 'previewLoad', buffer: ab.slice(0) });
    expect(totalRms(rmsPerTick(renderTicks(b.proc, 10, 0), 10)), 'silent before a key').toBe(0);
    await b.send({ type: 'noteOn', sample: 0, note: 28 });
    expect(totalRms(rmsPerTick(renderTicks(b.proc, 10, 0), 10)), 'a key sounds').toBeGreaterThan(0.01);
    await b.send({ type: 'noteOff' });
    expect(totalRms(rmsPerTick(renderTicks(b.proc, 10, 0), 10)), 'silent after release').toBe(0);
  });
});

describe.each(['startrekker-am/amsyntdemo.mod'])('StarTrekker AM %s: a typed note is the replayer voice, as the song plays it', (name) => {
  it('the first note of each voice that starts on an AM instrument has the song\'s pitch, level and envelope', async () => {
    const mod = corpus(name), nt = corpus(`${name}.nt`);
    const song = parseStartrekkerAMFile(mod, name, nt) as unknown as GridSong;
    const am = new Set(song.instruments.filter((i) => i.synthType === 'StartrekkerAMSynth').map((i) => i.id));
    let measured = 0;
    for (let ch = 0; ch < 4; ch++) {
      let n: { note: number; ins: number } | null = null, done = false;
      for (const pi of song.songPositions) {
        for (const c of song.patterns[pi].channels[ch].rows) if (!done && c.note > 0) { done = true; if (am.has(c.instrument) && (!c.effTyp || c.effTyp === 15)) n = { note: c.note, ins: c.instrument }; }
      }
      if (!n) continue;   // the voice starts on a sampled instrument (or one with an effect): nothing AM to compare
      const a = await startWorklet('startrekker-am', 'StartrekkerAM');
      await a.send({ type: 'loadMod', data: mod.slice(0) });
      await a.send({ type: 'loadNt', data: nt.slice(0) });
      await a.send({ type: 'setMuteMask', mask: 1 << ch });
      const out = renderTicks(a.proc, 300, ch === 1 || ch === 2 ? 1 : 0);
      if (!rmsPerTick(out, 300).some((v) => v >= 0.02)) continue;
      const on = rmsPerTick(out, 300).findIndex((v) => v >= 0.02);
      const ticks = 8;
      const sAudio = out.subarray(on * FPT, (on + ticks) * FPT);

      const b = await startWorklet('startrekker-am', 'StartrekkerAM');
      await b.send({ type: 'previewLoad', mod: mod.slice(0), nt: nt.slice(0) });
      // The worklet makes the keyboard copy of the replayer on the first key; like the harness's own
      // init, it must not see Node's process.versions or the Emscripten glue takes the Node path.
      const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
      Object.defineProperty(process, 'versions', { value: {}, configurable: true });
      try { await b.send({ type: 'noteOn', instr: n.ins, period: stPeriodForKey(n.note + 11) }); } finally { Object.defineProperty(process, 'versions', versions); }
      const pr = renderTicks(b.proc, ticks + 12, 0);
      const pOn = rmsPerTick(pr, ticks + 12).findIndex((v) => v >= 0.02);
      expect(pOn, `${name} voice ${ch}: the key sounds`).toBeGreaterThanOrEqual(0);
      expectSameVoice(`${name} voice ${ch}`, sAudio, pr.subarray(pOn * FPT, (pOn + ticks) * FPT), ticks);
      measured++;
    }
    expect(measured, 'the song has an AM voice to measure').toBeGreaterThan(0);
  });
});

describe('StarTrekker AM: a key never starts the song, and key release silences the voice', () => {
  it('amsyntdemo.mod: silent before a key, sounds on a key, silent after release', async () => {
    const name = 'startrekker-am/amsyntdemo.mod';
    const b = await startWorklet('startrekker-am', 'StartrekkerAM');
    await b.send({ type: 'previewLoad', mod: corpus(name), nt: corpus(`${name}.nt`) });
    expect(totalRms(rmsPerTick(renderTicks(b.proc, 20, 0), 20)), 'silent before a key').toBe(0);
    const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
    Object.defineProperty(process, 'versions', { value: {}, configurable: true });
    try { await b.send({ type: 'noteOn', instr: 1, period: stPeriodForKey(25 + 11) }); } finally { Object.defineProperty(process, 'versions', versions); }
    const peak = Math.max(...rmsPerTick(renderTicks(b.proc, 20, 0), 20));
    expect(peak, 'a key sounds').toBeGreaterThan(0.01);
    await b.send({ type: 'noteOff' });
    // the AM envelope's own release runs (the voice is not cut)
    expect(rmsPerTick(renderTicks(b.proc, 400, 0), 400)[399], 'quiet 8 s after release').toBeLessThan(peak * 0.05);
  });
});

describe.each(['digital-mugician/believe.dmu', 'formats/flight.dmu', 'formats/cockwise.mug', 'digital-mugician-2/snickle.mug'])('Digital Mugician %s: a typed note is the replayer voice, as the song plays it', (name) => {
  it('the first note of each voice has the song\'s pitch, level and envelope', async () => {
    const ab = corpus(name);
    const raw = new Uint8Array(ab);
    const song = (await parseDigitalMugicianFile(ab, name)) as unknown as GridSong & { uadePatternLayout: { getCellFileOffset(p: number, r: number, c: number): number } };
    const sampleOf = new Map(song.instruments.map((i) => [i.id, i.digMug?.sampleIndex ?? 0]));
    let measured = 0;
    for (let ch = 0; ch < 4; ch++) {
      // The voice's first note, if it is a plain one (effect byte 0, parameter 0): an effect byte
      // can keep the volume envelope or the instrument effect from restarting, which a key cannot say.
      let n = null as { note: number; ins: number } | null;
      let done = false;
      for (const pi of song.songPositions) {
        song.patterns[pi].channels[ch].rows.forEach((c, row) => {
          if (done || c.note <= 0) return;
          done = true;
          const off = song.uadePatternLayout.getCellFileOffset(pi, row, ch);
          if (c.instrument > 0 && raw[off + 2] === 0 && raw[off + 3] === 0) n = { note: c.note, ins: c.instrument };
        });
        if (done) break;
      }
      if (!n || !sampleOf.get(n.ins)) continue;
      const a = await startWorklet('digmug', 'DigMug', emscriptenTransform);
      await a.send({ type: 'loadModule', moduleData: ab.slice(0) });
      await a.send({ type: 'setChannelMask', mask: 1 << ch });
      await a.send({ type: 'play' });
      const out = renderTicks(a.proc, 3000, ch === 1 || ch === 2 ? 1 : 0);
      const r = rmsPerTick(out, 3000);
      const on = r.findIndex((v) => v >= 0.02);
      if (on < 0) continue;
      const ticks = Math.max(4, Math.min(8, song.initialSpeed - 1));   // before the voice's next row
      const b = await startWorklet('digmug', 'DigMug', emscriptenTransform);
      await b.send({ type: 'loadModule', moduleData: ab.slice(0) });
      await b.send({ type: 'previewLoad', buffer: ab.slice(0) });
      await b.send({ type: 'noteOn', instrument: sampleOf.get(n.ins), note: dmNoteForKey(n.note + 11, song.instruments.find((i) => i.id === n!.ins)?.digMug?.fineTune ?? 0) });
      const pr = renderTicks(b.proc, ticks + 12, 0);
      const pOn = rmsPerTick(pr, ticks + 12).findIndex((v) => v >= 0.02);
      expect(pOn, `${name} voice ${ch}: the key sounds`).toBeGreaterThanOrEqual(0);
      expectSameVoice(`${name} voice ${ch}`, out.subarray(on * FPT, (on + ticks) * FPT), pr.subarray(pOn * FPT, (pOn + ticks) * FPT), ticks);
      measured++;
    }
    expect(measured, 'the song has a voice to measure').toBeGreaterThan(0);
  });
});

describe('Digital Mugician: a key never starts the song, and key release silences the voice', () => {
  it('believe.dmu: silent before a key, sounds on a key, silent after release', async () => {
    const ab = corpus('digital-mugician/believe.dmu');
    const b = await startWorklet('digmug', 'DigMug', emscriptenTransform);
    await b.send({ type: 'loadModule', moduleData: ab.slice(0) });
    await b.send({ type: 'previewLoad', buffer: ab.slice(0) });
    expect(totalRms(rmsPerTick(renderTicks(b.proc, 10, 0), 10)), 'silent before a key').toBe(0);
    await b.send({ type: 'noteOn', instrument: 9, note: 30 });
    expect(totalRms(rmsPerTick(renderTicks(b.proc, 10, 0), 10)), 'a key sounds').toBeGreaterThan(0.01);
    await b.send({ type: 'noteOff' });
    expect(totalRms(rmsPerTick(renderTicks(b.proc, 10, 0), 10)), 'silent after release').toBe(0);
  });
});

describe.each(['sonic-arranger/mega end.sa'])('Sonic Arranger %s: a typed note is the replayer voice, as the song plays it', (name) => {
  it('the first note of each voice has the song\'s pitch, level and envelope', async () => {
    const ab = corpus(name);
    const song = (await parseSonicArrangerFile(ab, name)) as unknown as GridSong & { patterns: Array<{ channels: Array<{ rows: Array<{ note: number; instrument: number; saEffect?: number; saEffectArg?: number; saArpTable?: number }> }> }> };
    let measured = 0;
    for (let ch = 0; ch < 4; ch++) {
      // The voice's first note, if it is a plain one (no effect, arpeggio table 0): an effect or an
      // arpeggio changes what the replayer makes of the note, which a key cannot say.
      let n = null as { note: number; ins: number } | null;
      let done = false;
      for (const pi of song.songPositions) {
        for (const c of song.patterns[pi].channels[ch].rows) {
          if (done || c.note <= 0 || c.note >= 97) continue;
          done = true;
          if (c.instrument > 0 && !c.saEffect && !c.saEffectArg && !c.saArpTable) n = { note: c.note, ins: c.instrument };
        }
        if (done) break;
      }
      if (!n) continue;
      const a = await startWorklet('sonic-arranger', 'SonicArranger', emscriptenTransform);
      await a.send({ type: 'loadModule', moduleData: ab.slice(0) });
      await a.send({ type: 'setChannelMask', mask: 1 << ch });
      await a.send({ type: 'play' });
      const out = renderTicks(a.proc, 3000, ch === 1 || ch === 2 ? 1 : 0);
      const on = rmsPerTick(out, 3000).findIndex((v) => v >= 0.02);
      if (on < 0) continue;
      const ticks = Math.max(4, Math.min(8, song.initialSpeed - 1));   // before the voice's next row
      const b = await startWorklet('sonic-arranger', 'SonicArranger', emscriptenTransform);
      await b.send({ type: 'loadModule', moduleData: ab.slice(0) });
      await b.send({ type: 'previewLoad', buffer: ab.slice(0) });
      await b.send({ type: 'noteOn', instrument: n.ins, note: saNoteForKey(n.note + 11) });
      const pr = renderTicks(b.proc, ticks + 12, 0);
      const pOn = rmsPerTick(pr, ticks + 12).findIndex((v) => v >= 0.02);
      expect(pOn, `${name} voice ${ch}: the key sounds`).toBeGreaterThanOrEqual(0);
      // the song's tempo need not be 50 Hz, so compare from each voice's first audible sample, not a tick edge
      expectSameVoice(`${name} voice ${ch}`, fromOnset(out, on, ticks, 1e-3), fromOnset(pr, pOn, ticks, 1e-3), ticks);
      measured++;
    }
    expect(measured, 'the song has a voice to measure').toBeGreaterThan(0);
  });
});

describe('Sonic Arranger: a key never starts the song, and key release silences the voice', () => {
  it('mega end.sa: silent before a key, sounds on a key, silent after release', async () => {
    const ab = corpus('sonic-arranger/mega end.sa');
    const b = await startWorklet('sonic-arranger', 'SonicArranger', emscriptenTransform);
    await b.send({ type: 'loadModule', moduleData: ab.slice(0) });
    await b.send({ type: 'previewLoad', buffer: ab.slice(0) });
    expect(totalRms(rmsPerTick(renderTicks(b.proc, 10, 0), 10)), 'silent before a key').toBe(0);
    await b.send({ type: 'noteOn', instrument: 4, note: 49 });
    expect(totalRms(rmsPerTick(renderTicks(b.proc, 10, 0), 10)), 'a key sounds').toBeGreaterThan(0.01);
    await b.send({ type: 'noteOff' });
    expect(totalRms(rmsPerTick(renderTicks(b.proc, 10, 0), 10)), 'silent after release').toBe(0);
  });
});

// triplex1.dm is not compared: its voice 2 note plays an instrument an earlier effect row has reconfigured (the
// replayer's effects rewrite the playing instrument), which a key, playing the instrument as stored, cannot know.
describe.each(['formats/crusaders1.dm'])('Delta Music 1 %s: a typed note is the replayer voice, as the song plays it', (name) => {
  it('the first note of each voice has the song\'s pitch, level and envelope', async () => {
    const ab = corpus(name);
    const song = (await parseDeltaMusic1File(ab, name)) as unknown as GridSong;
    let measured = 0;
    for (let ch = 0; ch < 4; ch++) {
      // The voice's first note, if its row has no effect mapped to the grid: an effect (arpeggio,
      // vibrato, ADSR settings) changes what the replayer makes of the note, which a key cannot say.
      let n = null as { note: number; ins: number } | null;
      let done = false;
      for (const pi of song.songPositions) {
        for (const c of song.patterns[pi].channels[ch].rows) {
          if (done || c.note <= 0) continue;
          done = true;
          // grid note 1 is the clamp for every period index below C-0 (the byte is in a carrier), not a pitch
          if (c.instrument > 0 && !c.effTyp && !c.eff && c.note > 1) n = { note: c.note, ins: c.instrument };
        }
        if (done) break;
      }
      if (!n) continue;
      const a = await startWorklet('deltamusic1', 'DeltaMusic1', emscriptenTransform);
      await a.send({ type: 'loadModule', moduleData: ab.slice(0) });
      await a.send({ type: 'setChannelMask', mask: 1 << ch });
      await a.send({ type: 'play' });
      const out = renderTicks(a.proc, 3000, ch === 1 || ch === 2 ? 1 : 0);
      const on = rmsPerTick(out, 3000).findIndex((v) => v >= 0.02);
      if (on < 0) continue;
      const ticks = 6;   // a row is at least the song's speed (6 ticks) long
      const b = await startWorklet('deltamusic1', 'DeltaMusic1', emscriptenTransform);
      await b.send({ type: 'loadModule', moduleData: ab.slice(0) });
      await b.send({ type: 'previewLoad', buffer: ab.slice(0) });
      await b.send({ type: 'noteOn', instrument: n.ins - 1, note: dm1NoteForKey(n.note + 11) });
      const pr = renderTicks(b.proc, ticks + 12, 0);
      const pOn = rmsPerTick(pr, ticks + 12).findIndex((v) => v >= 0.02);
      expect(pOn, `${name} voice ${ch}: the key sounds`).toBeGreaterThanOrEqual(0);
      expectSameVoice(`${name} voice ${ch}`, fromOnset(out, on, ticks, 1e-3), fromOnset(pr, pOn, ticks, 1e-3), ticks);
      measured++;
    }
    expect(measured, 'the song has a voice to measure').toBeGreaterThan(0);
  });
});

describe('Delta Music 1: a key never starts the song, and key release silences the voice', () => {
  it('triplex1.dm: silent before a key, sounds on a key, silent after release', async () => {
    const ab = corpus('delta-music/triplex1.dm');
    const b = await startWorklet('deltamusic1', 'DeltaMusic1', emscriptenTransform);
    await b.send({ type: 'loadModule', moduleData: ab.slice(0) });
    await b.send({ type: 'previewLoad', buffer: ab.slice(0) });
    expect(totalRms(rmsPerTick(renderTicks(b.proc, 10, 0), 10)), 'silent before a key').toBe(0);
    await b.send({ type: 'noteOn', instrument: 0, note: 40 });
    const peak = Math.max(...rmsPerTick(renderTicks(b.proc, 10, 0), 10));
    expect(peak, 'a key sounds').toBeGreaterThan(0.01);
    await b.send({ type: 'noteOff' });
    // the instrument's own release runs (the voice is not cut): quiet within 5 s
    const after = rmsPerTick(renderTicks(b.proc, 250, 0), 250);
    expect(after[249], 'quiet 5 s after release').toBeLessThan(peak * 0.1);
  });
});

describe.each(['formats/anthrox_intro.dm2', 'delta-music-2/asperity megademo 3.dm2'])('Delta Music 2 %s: a typed note is the replayer voice, as the song plays it', (name) => {
  it('the first note of each voice has the song\'s pitch, level and envelope', async () => {
    const ab = corpus(name);
    const song = parseDeltaMusic2File(new Uint8Array(ab), name) as unknown as GridSong;
    let measured = 0;
    for (let ch = 0; ch < 4; ch++) {
      // The voice's first note, if its row has no effect mapped to the grid: an effect (arpeggio,
      // bend, volume) changes what the replayer makes of the note, which a key cannot say.
      let n = null as { note: number; ins: number; tick: number } | null;
      let done = false, rowsBefore = 0;
      for (const pi of song.songPositions) {
        song.patterns[pi].channels[ch].rows.forEach((c, row) => {
          if (done || c.note <= 0) return;
          done = true;
          if (c.instrument > 0 && !c.effTyp && !c.eff) n = { note: c.note, ins: c.instrument, tick: (rowsBefore + row) * song.initialSpeed };
        });
        if (done) break;
        rowsBefore += song.patterns[pi].length;
      }
      if (!n) continue;
      const a = await startWorklet('deltamusic2', 'DeltaMusic2', emscriptenTransform);
      await a.send({ type: 'loadModule', moduleData: ab.slice(0) });
      await a.send({ type: 'setChannelMask', mask: 1 << ch });
      await a.send({ type: 'play' });
      const out = renderTicks(a.proc, 3000, ch === 1 || ch === 2 ? 1 : 0);
      const on = rmsPerTick(out, 3000).findIndex((v) => v >= 0.02);
      // the note must sound when its row plays; if the voice is silent then, the song voice is not this note
      if (on < 0 || Math.abs(on - n.tick) > song.initialSpeed) continue;
      const ticks = 5;
      const b = await startWorklet('deltamusic2', 'DeltaMusic2', emscriptenTransform);
      await b.send({ type: 'loadModule', moduleData: ab.slice(0) });
      await b.send({ type: 'previewLoad', buffer: ab.slice(0) });
      await b.send({ type: 'noteOn', instrument: n.ins - 1, note: dm2NoteForKey(n.note + 11) });
      const pr = renderTicks(b.proc, ticks + 12, 0);
      const pOn = rmsPerTick(pr, ticks + 12).findIndex((v) => v >= 0.02);
      expect(pOn, `${name} voice ${ch}: the key sounds`).toBeGreaterThanOrEqual(0);
      expectSameVoice(`${name} voice ${ch}`, fromOnset(out, on, ticks, 1e-3), fromOnset(pr, pOn, ticks, 1e-3), ticks);
      measured++;
    }
    expect(measured, 'the song has a voice to measure').toBeGreaterThan(0);
  });
});

describe('Delta Music 2: a key never starts the song, and key release silences the voice', () => {
  it('anthrox_intro.dm2: silent before a key, sounds on a key, silent after release', async () => {
    const ab = corpus('formats/anthrox_intro.dm2');
    const b = await startWorklet('deltamusic2', 'DeltaMusic2', emscriptenTransform);
    await b.send({ type: 'loadModule', moduleData: ab.slice(0) });
    await b.send({ type: 'previewLoad', buffer: ab.slice(0) });
    expect(totalRms(rmsPerTick(renderTicks(b.proc, 10, 0), 10)), 'silent before a key').toBe(0);
    await b.send({ type: 'noteOn', instrument: 0, note: 40 });
    const peak = Math.max(...rmsPerTick(renderTicks(b.proc, 10, 0), 10));
    expect(peak, 'a key sounds').toBeGreaterThan(0.01);
    await b.send({ type: 'noteOff' });
    // the instrument's own release runs (the voice is not cut): quiet within 5 s
    const after = rmsPerTick(renderTicks(b.proc, 250, 0), 250);
    expect(after[249], 'quiet 5 s after release').toBeLessThan(peak * 0.1);
  });
});

describe.each(['instereo!/fantasi8.is'])('InStereo! 1.0 %s: a typed note is the replayer voice, as the song plays it', (name) => {
  it('the first note of each voice has the song\'s pitch, level and envelope', async () => {
    const ab = corpus(name);
    const song = parseInStereo1File(new Uint8Array(ab), name) as unknown as GridSong;
    let measured = 0;
    for (let ch = 0; ch < 4; ch++) {
      // The voice's first note, if its row has no effect mapped to the grid: an effect changes what the
      // replayer makes of the note, which a key cannot say.
      let n = null as { note: number; ins: number; tick: number } | null;
      let done = false, rowsBefore = 0;
      for (const pi of song.songPositions) {
        song.patterns[pi].channels[ch].rows.forEach((c, row) => {
          if (done || c.note <= 0 || c.note >= 97) return;
          done = true;
          if (c.instrument > 0 && !c.effTyp && !c.eff) n = { note: c.note, ins: c.instrument, tick: (rowsBefore + row) * song.initialSpeed };
        });
        if (done) break;
        rowsBefore += song.patterns[pi].length;
      }
      if (!n) continue;
      const a = await startWorklet('instereo1', 'InStereo1', emscriptenTransform);
      await a.send({ type: 'loadModule', moduleData: ab.slice(0) });
      await a.send({ type: 'setChannelMask', mask: 1 << ch });
      await a.send({ type: 'play' });
      const out = renderTicks(a.proc, 3000, ch === 1 || ch === 2 ? 1 : 0);
      const on = rmsPerTick(out, 3000).findIndex((v) => v >= 0.02);
      // the note must sound when its row plays; if the voice is silent then, the song voice is not this note
      if (on < 0 || Math.abs(on - n.tick) > song.initialSpeed) continue;
      const ticks = Math.max(4, Math.min(8, song.initialSpeed - 1));
      const b = await startWorklet('instereo1', 'InStereo1', emscriptenTransform);
      await b.send({ type: 'loadModule', moduleData: ab.slice(0) });
      await b.send({ type: 'previewLoad', buffer: ab.slice(0) });
      await b.send({ type: 'noteOn', instrument: n.ins, note: saNoteForKey(n.note + 11) });
      const pr = renderTicks(b.proc, ticks + 12, 0);
      const pOn = rmsPerTick(pr, ticks + 12).findIndex((v) => v >= 0.02);
      expect(pOn, `${name} voice ${ch}: the key sounds`).toBeGreaterThanOrEqual(0);
      expectSameVoice(`${name} voice ${ch}`, fromOnset(out, on, ticks, 1e-3), fromOnset(pr, pOn, ticks, 1e-3), ticks);
      measured++;
    }
    expect(measured, 'the song has a voice to measure').toBeGreaterThan(0);
  });
});

describe('InStereo! 1.0: a key never starts the song, and key release silences the voice', () => {
  it('fantasi8.is: silent before a key, sounds on a key, silent after release', async () => {
    const ab = corpus('instereo!/fantasi8.is');
    const b = await startWorklet('instereo1', 'InStereo1', emscriptenTransform);
    await b.send({ type: 'loadModule', moduleData: ab.slice(0) });
    await b.send({ type: 'previewLoad', buffer: ab.slice(0) });
    expect(totalRms(rmsPerTick(renderTicks(b.proc, 10, 0), 10)), 'silent before a key').toBe(0);
    await b.send({ type: 'noteOn', instrument: 1, note: 49 });
    expect(totalRms(rmsPerTick(renderTicks(b.proc, 10, 0), 10)), 'a key sounds').toBeGreaterThan(0.01);
    await b.send({ type: 'noteOff' });
    expect(totalRms(rmsPerTick(renderTicks(b.proc, 10, 0), 10)), 'silent after release').toBe(0);
  });
});

describe.each(['instereo!-2.0/spaceflight.is20', 'formats/stereo_feeling.is20'])('InStereo! 2.0 %s: a typed note is the replayer voice, as the song plays it', (name) => {
  it('the first synth note of each voice has the song\'s pitch, level and envelope', async () => {
    const ab = corpus(name);
    const song = parseInStereo2File(new Uint8Array(ab), name) as unknown as GridSong;
    const numberOf = new Map(song.instruments.map((i) => [i.id, i.inStereo2?.instrumentNumber ?? 0]));
    let measured = 0;
    for (let ch = 0; ch < 4; ch++) {
      // The voice's first note, if it is a synth instrument with no effect mapped to the grid: an effect
      // changes what the replayer makes of the note, which a key cannot say.
      let n = null as { note: number; ins: number; tick: number } | null;
      let done = false, rowsBefore = 0;
      for (const pi of song.songPositions) {
        song.patterns[pi].channels[ch].rows.forEach((c, row) => {
          if (done || c.note <= 0 || c.note >= 97) return;
          done = true;
          if (numberOf.get(c.instrument) && !c.effTyp && !c.eff) n = { note: c.note, ins: c.instrument, tick: (rowsBefore + row) * song.initialSpeed };
        });
        if (done) break;
        rowsBefore += song.patterns[pi].length;
      }
      if (!n) continue;
      const a = await startWorklet('instereo2', 'InStereo2', emscriptenTransform);
      await a.send({ type: 'loadModule', moduleData: ab.slice(0) });
      await a.send({ type: 'setChannelMask', mask: 1 << ch });
      await a.send({ type: 'play' });
      const out = renderTicks(a.proc, 3000, ch === 1 || ch === 2 ? 1 : 0);
      const on = rmsPerTick(out, 3000).findIndex((v) => v >= 0.02);
      // the note must sound when its row plays; if the voice is silent then, the song voice is not this note
      if (on < 0 || Math.abs(on - n.tick) > song.initialSpeed) continue;
      const ticks = Math.max(4, Math.min(8, song.initialSpeed - 1));
      const b = await startWorklet('instereo2', 'InStereo2', emscriptenTransform);
      await b.send({ type: 'loadModule', moduleData: ab.slice(0) });
      await b.send({ type: 'previewLoad', buffer: ab.slice(0) });
      await b.send({ type: 'noteOn', instrument: numberOf.get(n.ins), note: saNoteForKey(n.note + 11) });
      const pr = renderTicks(b.proc, ticks + 12, 0);
      const pOn = rmsPerTick(pr, ticks + 12).findIndex((v) => v >= 0.02);
      expect(pOn, `${name} voice ${ch}: the key sounds`).toBeGreaterThanOrEqual(0);
      expectSameVoice(`${name} voice ${ch}`, fromOnset(out, on, ticks, 1e-3), fromOnset(pr, pOn, ticks, 1e-3), ticks);
      measured++;
    }
    expect(measured, 'the song has a voice to measure').toBeGreaterThan(0);
  });
});

describe('InStereo! 2.0: a key never starts the song, and key release silences the voice', () => {
  it('spaceflight.is20: silent before a key, sounds on a key, silent after release', async () => {
    const ab = corpus('instereo!-2.0/spaceflight.is20');
    const b = await startWorklet('instereo2', 'InStereo2', emscriptenTransform);
    await b.send({ type: 'loadModule', moduleData: ab.slice(0) });
    await b.send({ type: 'previewLoad', buffer: ab.slice(0) });
    expect(totalRms(rmsPerTick(renderTicks(b.proc, 10, 0), 10)), 'silent before a key').toBe(0);
    await b.send({ type: 'noteOn', instrument: 1, note: 49 });
    expect(totalRms(rmsPerTick(renderTicks(b.proc, 10, 0), 10)), 'a key sounds').toBeGreaterThan(0.01);
    await b.send({ type: 'noteOff' });
    expect(totalRms(rmsPerTick(renderTicks(b.proc, 10, 0), 10)), 'silent after release').toBe(0);
  });
});

describe('TFMX Professional tfmx/mdat.hbtitle: a typed note is the module\'s own replayer voice', () => {
  // Oracle: the module's own decoder with its sequencer running, every voice muted but one, and the
  // macro started on that voice by the replayer's note command (tfmx_module_preview_macro, the macro
  // editor's audition). The key plays the same note command on a second decoder whose sequencer is
  // off. They must sound the same: the key adds nothing and drops nothing, and never starts the song.
  // Every macro that starts a sample itself (SetBegin and DMA on). The others are modulation macros
  // (envelope, vibrato) another macro or the voice's previous note feeds: on their own they start nothing,
  // in the song or from a key.
  const macroTable = (parseTFMXFile(corpus('tfmx/mdat.hbtitle'), 'mdat.hbtitle') as unknown as { tfmxNative: { macros: Array<{ index: number; commands: Array<{ opcode: number }> }> } }).tfmxNative.macros;
  const macros = macroTable.filter((m) => m.commands.some((c) => c.opcode === 2) && m.commands.some((c) => c.opcode === 1)).map((m) => m.index);
  it('the module has macros that start a sample', () => { expect(macros.length).toBeGreaterThan(3); });
  it('a key stands for the grid note it is typed as: grid note = TFMX note + 13, key = grid note + 11', () => {
    for (let note = 0; note < 64; note++) expect(tfmxNoteForKey(note + 13 + 11), `note ${note}`).toBe(note);
  });
  for (const macro of macros) {
    it(`macro ${macro}: pitch, level and envelope equal the module decoder's own audition`, async () => {
      const mdat = corpus('tfmx/mdat.hbtitle'), smpl = corpus('tfmx/smpl.hbtitle');
      const note = tfmxNoteForKey(48 + 11);   // grid note 48 (+13 base): key 59
      const voice = 0;   // hbtitle plays four voices; the song's own first notes on voice 0 come later than the six ticks compared
      const a = await startWorklet('tfmx', 'TFMX', emscriptenTransform);
      await a.send({ type: 'loadModule', mdatBuffer: mdat.slice(0), smplBuffer: smpl.slice(0), subsong: 0 });
      for (let v = 0; v < 7; v++) if (v !== voice) await a.send({ type: 'moduleMuteVoice', voice: v, mute: true });
      await a.send({ type: 'modulePlay' });
      await a.send({ type: 'modulePreviewMacro', macroIdx: macro, note, volume: 15, channel: voice });
      const out = renderTicks(a.proc, 24, voice % 4 === 1 || voice % 4 === 2 ? 1 : 0);
      const b = await startWorklet('tfmx', 'TFMX', emscriptenTransform);
      await b.send({ type: 'keyLoad', mdatBuffer: mdat.slice(0), smplBuffer: smpl.slice(0) });
      await b.send({ type: 'keyNote', macroIdx: macro, note, volume: 15, channel: 0 });
      const pr = renderTicks(b.proc, 24, 0);
      const so = rmsPerTick(out, 24).findIndex((v) => v >= 0.001), po = rmsPerTick(pr, 24).findIndex((v) => v >= 0.001);
      expect(so, `macro ${macro}: the module decoder sounds the macro`).toBeGreaterThanOrEqual(0);
      expect(po, `macro ${macro}: the key sounds`).toBeGreaterThanOrEqual(0);
      expectSameVoice(`hbtitle macro ${macro}`, fromOnset(out, so, 6, 1e-4), fromOnset(pr, po, 6, 1e-4), 6);
    });
  }

  it('a key never starts the song, and key release silences the voice', async () => {
    const mdat = corpus('tfmx/mdat.hbtitle'), smpl = corpus('tfmx/smpl.hbtitle');
    const b = await startWorklet('tfmx', 'TFMX', emscriptenTransform);
    await b.send({ type: 'keyLoad', mdatBuffer: mdat.slice(0), smplBuffer: smpl.slice(0) });
    expect(totalRms(rmsPerTick(renderTicks(b.proc, 300, 0), 300)), 'silent before a key: the song does not play').toBe(0);
    await b.send({ type: 'keyNote', macroIdx: 0, note: 36, volume: 15, channel: 0 });
    expect(totalRms(rmsPerTick(renderTicks(b.proc, 30, 0), 30)), 'a key sounds').toBeGreaterThan(0.005);
    await b.send({ type: 'keyOff' });
    renderTicks(b.proc, 2, 0);
    expect(totalRms(rmsPerTick(renderTicks(b.proc, 30, 0), 30)), 'silent after release').toBeLessThan(1e-4);
  });
});

describe.each(['formats/anthrox_intro.dm2', 'delta-music-2/asperity megademo 3.dm2'])('Delta Music 2 %s: instrument numbers show only on notes', (name) => {
  it('the replayer reads a row\'s instrument only with a note, so no cell shows one without', () => {
    const song = parseDeltaMusic2File(new Uint8Array(corpus(name)), name) as unknown as GridSong;
    let withNote = 0;
    for (const pi of song.songPositions) for (const ch of song.patterns[pi].channels) for (const c of ch.rows) {
      if (c.instrument > 0) expect(c.note > 0, 'an instrument number on a row without a note').toBe(true);
      if (c.note > 0 && c.instrument > 0) withNote++;
    }
    expect(withNote, 'notes keep their instruments').toBeGreaterThan(50);
  });
});

describe('InStereo! 1.0 fantasi8.is: every instrument slot of the file is kept, named as the file names it, and every instrument the song plays sounds on a key', () => {
  it('instrument slots are never dropped or renumbered; a synth instrument has no stored name; a sample slot keeps the file\'s name', () => {
    const raw = new Uint8Array(corpus('instereo!/fantasi8.is'));
    const song = parseInStereo1File(raw, 'fantasi8.is') as unknown as GridSong;
    expect(song.instruments.map((i) => i.id), 'contiguous slots 1..N').toEqual(Array.from({ length: raw[18] }, (_, k) => k + 1));
    for (const i of song.instruments) {
      if (i.synthType === 'InStereo1Synth') expect(i.name, `synth instrument ${i.id}: the format stores no name`).toBe('');
      expect(i.name, `instrument ${i.id} is not an invented name`).not.toMatch(/^(Synth|Sample) \d+$/);
    }
    expect(song.instruments.find((i) => i.id === 1)!.name, 'a sample keeps the name the file stores').toBe('BD 3');
  });

  it('every synth instrument the song plays sounds on a key (an EGC instrument sets its sample on a channel that is already running)', async () => {
    const ab = corpus('instereo!/fantasi8.is');
    const song = parseInStereo1File(new Uint8Array(ab), 'fantasi8.is') as unknown as GridSong & { instruments: Array<{ id: number; synthType?: string }> };
    const synthIds = new Set(song.instruments.filter((i) => i.synthType === 'InStereo1Synth').map((i) => i.id));
    const played = new Set<number>();
    for (const pi of song.songPositions) for (const ch of song.patterns[pi].channels) for (const c of ch.rows) if (c.note > 0 && c.note < 97 && synthIds.has(c.instrument)) played.add(c.instrument);
    // Instrument 14 is silent in the song itself (the voices it is played on stay at 0 for its notes at tick 0):
    // a key rightly makes no sound either, an empty slot the author used as a rest.
    played.delete(14);
    expect(played.size, 'the song plays synth instruments').toBeGreaterThan(3);
    const b = await startWorklet('instereo1', 'InStereo1', emscriptenTransform);
    await b.send({ type: 'previewLoad', buffer: ab.slice(0) });
    for (const ins of [...played].sort((x, y) => x - y)) {
      await b.send({ type: 'noteOn', instrument: ins, note: 61 });
      expect(Math.max(...rmsPerTick(renderTicks(b.proc, 40, 0), 40)), `instrument ${ins} sounds`).toBeGreaterThan(0.01);
    }
  });
});

// K8: Steve Turner. The import reaches SteveTurnerParser (the Jason Page .jpo branch used to take the file), the
// key is the replayer's own preview voice (st_note_on / st_preview_tick) on a paused copy of the module.
describe.each(['steve-turner/paradroid90.jpo', 'steve-turner/rainbow islands.jpo'])('Steve Turner %s: a typed note is the replayer voice, as the song plays it', (name) => {
  const stTransform = (c: string) => c.replace(/import\.meta\.url/g, "'.'").replace(/export\s+default\s+\w+;?/g, '');
  it('the first note of each voice that starts a sample instrument has the song\'s pitch and level; a key never starts the song; key-up releases', async () => {
    const ab = corpus(name);
    const g = await parseSteveTurnerFile(ab, name.split('/')[1]) as unknown as GridSong;
    let measured = 0;
    for (let ch = 0; ch < 4; ch++) {
      // The voice's FIRST note event: the song sounds it first, so a later one cannot be matched to the onset.
      // Grid note 96 is the clamp of every index above the table, not a note a key can name: that voice is not compared.
      let n: { note: number; ins: number } | null = null, first = false;
      for (const pi of g.songPositions) {
        if (first) break;
        for (const c of g.patterns[pi].channels[ch].rows) if (c.note > 0 && c.instrument > 0) { first = true; if (c.note < 96) n = { note: c.note, ins: c.instrument }; break; }
      }
      if (!n) continue;
      const a = await startWorklet('steveturner', 'SteveTurner', stTransform);
      await a.send({ type: 'loadModule', moduleData: ab.slice(0) });
      await a.send({ type: 'setMuteMask', mask: 1 << ch });
      const out = renderTicks(a.proc, 400, ch === 1 || ch === 2 ? 1 : 0);
      const on = rmsPerTick(out, 400).findIndex((v) => v >= 0.03);
      if (on < 0) continue;
      // up to 8 ticks, ended where the song retriggers the voice (a sudden fall to under a third of the level so far)
      const lvl = rmsPerTick(out.subarray(on * FPT), 8);
      let ticks = 8;
      for (let t = 4; t < 8; t++) if (lvl[t] < Math.max(...lvl.slice(0, t)) / 3) { ticks = t; break; }
      const b = await startWorklet('steveturner', 'SteveTurner', stTransform);
      await b.send({ type: 'loadModule', moduleData: ab.slice(0) });
      await b.send({ type: 'pause' });
      expect(totalRms(rmsPerTick(renderTicks(b.proc, 20, 0), 20)), 'a paused module is silent: a key never starts the song').toBe(0);
      await b.send({ type: 'noteOn', instrument: n.ins - 1, note: n.note - 13, velocity: 127 });
      const pr = renderTicks(b.proc, ticks + 12, 0);
      const pOn = rmsPerTick(pr, ticks + 12).findIndex((v) => v >= 0.03);
      if (pOn < 0) continue; // synth-waveform instruments play nothing in the player either (lbC000C5E is a bare RTS)
      const sv = fromOnset(out, on, 3), pv = fromOnset(pr, pOn, 3);
      // Same replayer code: the first three ticks are usually the very samples; otherwise pitch, level and envelope are compared.
      let maxDiff = 0, peak = 0;
      for (let i = 0; i < sv.length; i++) { maxDiff = Math.max(maxDiff, Math.abs(sv[i] - pv[i])); peak = Math.max(peak, Math.abs(sv[i])); }
      const sw = out.subarray(on * FPT, (on + ticks) * FPT), pw = pr.subarray(pOn * FPT, (pOn + ticks) * FPT);
      if (maxDiff < 0.02 * peak) { /* the very samples */ }
      else if (!(fundamentalHz(sw, 30, 4000) > 0)) {
        // A sample with no fundamental (noise): only the level and envelope are comparable.
        expect(Math.abs(db(totalRms(rmsPerTick(pw, ticks)), totalRms(rmsPerTick(sw, ticks)))), `${name} voice ${ch}: overall level, dB`).toBeLessThan(2);
      } else expectSameVoice(`${name} voice ${ch} instrument ${n.ins}`, sw, pw, ticks);
      measured++;
    }
    expect(measured, 'the song has a sample voice to measure').toBeGreaterThan(0);
  });
});
