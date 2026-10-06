/**
 * A Fred Editor instrument played on the keyboard sounds like the same
 * instrument in the song (owner, 2026-10-06: "plays at a too low octave",
 * "a very long decay", "a lot louder than the song").
 *
 * Oracle: the song engine (FredReplayer2, the NostalgicPlayer port that UADE
 * agrees with on bomb jack) rendered with every voice but one muted, at the
 * first PWM note of the song. The preview is Fred.wasm (FredSynth's voice) fed
 * the same instrument record and the key the grid cell of that note stands for
 * (grid note n = MIDI n + 11, the app's xmConversions.noteToMidi). Compared on
 * what is heard: rising edges per second (pitch), RMS per 20 ms tick (level and
 * envelope), over the ticks before the song's next line cuts the voice.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startWorklet, stereoOutputs, ROOT } from './workletHarness';
import { decodeFredModule } from '@/lib/import/formats/FredEditorModule';
import { walkFredSong } from '@/lib/import/formats/fredEditorGrid';
import { parseFredEditorFile, fredPcmRate, FRED_PCM_BASE_NOTE } from '@/lib/import/formats/FredEditorParser';
import { serializeFredConfig } from '@/engine/fred/FredSynth';
import { fredReplayerTransform } from '@/engine/fred-replayer/FredReplayerEngine';
import { noteToMidi } from '@/lib/xmConversions';

const FPT = 960; // frames per 50 Hz tick at 48 kHz

function risingEdges(x: Float32Array): number {
  let n = 0;
  for (let i = 1; i < x.length; i++) if (x[i - 1] <= 0 && x[i] > 0) n++;
  return n;
}
function rmsPerTick(x: Float32Array, ticks: number): number[] {
  return Array.from({ length: ticks }, (_, t) => {
    let s = 0;
    for (let i = t * FPT; i < (t + 1) * FPT && i < x.length; i++) s += x[i] * x[i];
    return Math.sqrt(s / FPT);
  });
}
const db = (a: number, b: number) => 20 * Math.log10(a / b);

/** The first PWM note of any voice: its row start tick, voice, instrument, note byte, ticks until the voice's next line. */
function firstPwmNote(file: Uint8Array) {
  const m = decodeFredModule(file);
  const w = walkFredSong(m);
  let tempo = m.tempos[0];
  const dur = [1, 1, 1, 1], r = [0, 0, 0, 0], ins = [-1, -1, -1, -1];
  for (let t = 1; t < 3000; t++) for (let v = 0; v < 4; v++) {
    if (--dur[v] > 0) continue;
    const ref = w.voices[v][r[v]];
    if (!ref) { dur[v] = 1e9; continue; }
    const l = m.patterns[ref.pattern].lines[ref.line];
    if (l.tempo !== undefined) tempo = l.tempo;
    if (l.instrument !== undefined) ins[v] = l.instrument;
    if (l.note !== undefined && ins[v] >= 0 && m.instruments[ins[v]][39] === 1) {
      // lines until the voice's next line that is not a hold
      let n = 1;
      while (true) {
        const nr = w.voices[v][r[v] + n];
        const nl = nr ? m.patterns[nr.pattern].lines[nr.line] : undefined;
        if (!nl || nl.note !== undefined || nl.pause || nl.instrument !== undefined || nl.tempo !== undefined) break;
        n++;
      }
      return { m, tick: t, voice: v, ins: ins[v], note: l.note, ticks: n * tempo - 1 };
    }
    dur[v] = tempo; r[v]++;
  }
  throw new Error('no PWM note');
}

async function songVoice(file: Uint8Array, voice: number, from: number, ticks: number): Promise<Float32Array> {
  const { proc, send } = await startWorklet('fred-replayer', 'FredReplayer', fredReplayerTransform);
  await send({ type: 'loadModule', moduleData: file.slice().buffer });
  await send({ type: 'setChannelMask', mask: 1 << voice });
  await send({ type: 'play' });
  const out = new Float32Array(Math.ceil(((from + ticks + 4) * FPT) / 128) * 128);
  const side = voice === 0 || voice === 3 ? 0 : 1;
  for (let f = 0; f < out.length; f += 128) {
    const o = stereoOutputs(1);
    proc.process([], o);
    out.set(o[0][side], f);
  }
  // From the note's first sound: the replayer's mixer starts a note one tick after its line.
  let on = (from - 1) * FPT;
  while (on < out.length && Math.abs(out[on]) < 1e-4) on++;
  return out.subarray(on, on + ticks * FPT);
}

async function preview(config: Parameters<typeof serializeFredConfig>[0], key: number, ticks: number): Promise<Float32Array> {
  const { proc, send, posted } = await startWorklet('fred', 'Fred');
  await send({ type: 'createPlayer' });
  const handle = (posted.find((p) => (p as { type?: string }).type === 'playerCreated') as unknown as { handle: number }).handle;
  await send({ type: 'loadInstrument', handle, buffer: serializeFredConfig(config) });
  await send({ type: 'noteOn', handle, note: key, velocity: 100 });
  const out = new Float32Array(Math.ceil((ticks * FPT) / 128) * 128);
  for (let f = 0; f < out.length; f += 128) {
    const o = stereoOutputs(1);
    proc.process([], o);
    out.set(o[0][0], f);
  }
  return out;
}

const bytes = (n: string) => new Uint8Array(readFileSync(resolve(ROOT, 'public/data/songs/formats', n)));

describe('Fred Editor keyboard preview is the instrument as the song plays it', () => {
  for (const name of ['bomb jack.fred', 'fuzzball-title.fred']) {
    it(`${name}: a PWM note typed as the grid's note has the song's pitch, level and envelope`, async () => {
      const file = bytes(name);
      const n = firstPwmNote(file);
      const song = await parseFredEditorFile(file.slice().buffer as ArrayBuffer, name);
      const cfg = (song.instruments[n.ins] as unknown as { fred: Parameters<typeof serializeFredConfig>[0] }).fred;
      // The key the grid shows for this note byte: grid note = byte - 11, MIDI = grid note + 11.
      const key = noteToMidi(n.note - 11);
      expect(key).toBe(n.note);
      const ticks = Math.min(n.ticks, 24);
      const s = await songVoice(file, n.voice, n.tick, ticks);
      const p = await preview(cfg, key, ticks);
      if (process.env.FRED_DEBUG) console.log(name, JSON.stringify(n.ins), n.note, n.ticks, 'song', Array.from({length: ticks}, (_, t) => risingEdges(s.subarray(t*FPT,(t+1)*FPT))).join(','), 'prev', Array.from({length: ticks}, (_, t) => risingEdges(p.subarray(t*FPT,(t+1)*FPT))).join(','), 'rms', rmsPerTick(s,ticks).map(x=>x.toFixed(3)).join(','), '|', rmsPerTick(p,ticks).map(x=>x.toFixed(3)).join(','));
      const sPitch = risingEdges(s), pPitch = risingEdges(p);
      expect(sPitch).toBeGreaterThan(3);
      expect(Math.abs(pPitch / sPitch - 1), `rising edges preview ${pPitch} song ${sPitch}`).toBeLessThan(0.06);
      const sr = rmsPerTick(s, ticks), pr = rmsPerTick(p, ticks);
      const total = (a: number[]) => Math.sqrt(a.reduce((x, y) => x + y * y, 0) / a.length);
      expect(Math.abs(db(total(pr), total(sr))), 'overall level, dB').toBeLessThan(1.5);
      // The envelope tick by tick (skip ticks where the song is silent).
      sr.forEach((v, t) => { if (v > 0.002) expect(Math.abs(db(pr[t] || 1e-6, v)), `tick ${t}`).toBeLessThan(3); });
    });

    it(`${name}: the keyboard note is cut on key release as the player cuts a pause`, async () => {
      const file = bytes(name);
      const n = firstPwmNote(file);
      const song = await parseFredEditorFile(file.slice().buffer as ArrayBuffer, name);
      const cfg = (song.instruments[n.ins] as unknown as { fred: Parameters<typeof serializeFredConfig>[0] }).fred;
      const { proc, send, posted } = await startWorklet('fred', 'Fred');
      await send({ type: 'createPlayer' });
      const handle = (posted.find((p) => (p as { type?: string }).type === 'playerCreated') as unknown as { handle: number }).handle;
      await send({ type: 'loadInstrument', handle, buffer: serializeFredConfig(cfg) });
      await send({ type: 'noteOn', handle, note: n.note, velocity: 100 });
      const o = stereoOutputs(1, 128);
      for (let i = 0; i < 40; i++) proc.process([], o);
      await send({ type: 'noteOff', handle });
      const after = stereoOutputs(1, 128);
      proc.process([], after);
      expect(Math.max(...after[0][0].map(Math.abs))).toBe(0);
    });
  }

  it('PCM instruments: the sampler plays a typed note at the rate the song plays that grid note', async () => {
    for (const name of ['bomb jack.fred', 'fuzzball-title.fred']) {
      const file = bytes(name);
      const m = decodeFredModule(file);
      const song = await parseFredEditorFile(file.slice().buffer as ArrayBuffer, name);
      let checked = 0;
      song.instruments.forEach((inst, i) => {
        if (inst.synthType !== 'Sampler' || !inst.sample) return;
        const insPer = (m.instruments[i][8] << 8) | m.instruments[i][9];
        // Byte 36 = keyboard C-2 plays PeriodTable[36] * insPer >> 10 = insPer: 3546895 / insPer Hz at the buffer's own rate.
        expect(inst.sample.baseNote).toBe(FRED_PCM_BASE_NOTE);
        expect(noteToMidi('C-2')).toBe(36);
        expect(inst.sample.sampleRate).toBe(fredPcmRate(insPer));
        expect(Math.abs(inst.sample.sampleRate! * insPer / 3546895 - 1)).toBeLessThan(0.002);
        checked++;
      });
      expect(checked, name).toBeGreaterThan(0);
    }
  });
});
