/**
 * Keyboard preview of Rob Hubbard, Hippel CoSo and OctaMED instruments sounds
 * like the same instrument in the song (owner, 2026-10-06 audit after Fred:
 * "check every format that may share the issue").
 *
 * Oracle: UADE running the format's own eagleplayer on a corpus song with every
 * Paula channel but one muted, plus that channel's Paula period / volume
 * registers per 50 Hz tick (uadeVoice.ts). The preview is the per-note WASM
 * voice (what the keyboard plays) fed the same instrument and the key the grid
 * cell of that note stands for (grid note n = MIDI n + 11, xmConversions
 * noteToMidi). Compared on what is heard: pitch (Paula period -> Hz, in cents),
 * level (RMS per 20 ms tick, dB) and envelope (per tick), and on key release.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, stereoOutputs } from './workletHarness';
import { uadeVoice } from './uadeVoice';
import { chainedHeapTransform, db, fromOnset, previewRender, previewVoice, renderTicks, risingEdges, rmsPerTick, totalRms, FPT } from './keyboardPreviewHarness';
import { parseRobHubbardFile } from '@/lib/import/formats/RobHubbardParser';
import { serializeRobHubbardConfig } from '@/engine/robhubbard/RobHubbardSynth';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { parseMEDFile } from '@/lib/import/formats/MEDParser';
import { OctaMEDSynth } from '@/engine/octamed/OctaMEDSynth';
import { startWorklet } from './workletHarness';
import { noteToMidi } from '@/utils/audio-context';
import { buildMedSynthModule, type MedSynthFixture } from './medSynthFixture';
import { parseHippelCoSoFile } from '@/lib/import/formats/HippelCoSoParser';
import { serializeHippelCoSoConfig } from '@/engine/hippelcoso/HippelCoSoSynth';
import type { HippelCoSoConfig } from '@/types/instrument';
import type { OctaMEDConfig } from '@/types/instrument';

const PAULA_CLOCK = 3546895;
const cents = (a: number, b: number) => 1200 * Math.log2(a / b);
const songFile = (p: string) => new Uint8Array(readFileSync(resolve(ROOT, 'public/data/songs', p)));
const buf = (u: Uint8Array) => u.slice().buffer as ArrayBuffer;
/** Hz of a looped single-cycle preview by rising edges over `ticks`. */
const hzOf = (x: Float32Array, ticks: number) => risingEdges(x.subarray(0, ticks * FPT)) / (ticks / 50);

describe('Rob Hubbard keyboard preview is the instrument as UADE plays it (skateordie.rh)', () => {
  const NAME = 'rob-hubbard/skateordie.rh';
  const load = async () => {
    const file = songFile(NAME);
    const song = await parseRobHubbardFile(buf(file), 'skateordie.rh') as unknown as TrackerSong;
    return { file, song };
  };
  type RH = Parameters<typeof serializeRobHubbardConfig>[0];
  const rhOf = (song: TrackerSong, ins: number) => (song.instruments[ins - 1] as unknown as { robHubbard: RH }).robHubbard;

  it('a key plays the Paula period the song plays for that grid note (all four voices, row 0)', { timeout: 120000 }, async () => {
    const { file, song } = await load();
    const pat = song.patterns[song.songPositions[0]];
    let checked = 0;
    for (let ch = 0; ch < 4; ch++) {
      const cell = pat.channels[ch].rows[0];
      if (!cell.note || cell.note === 97) continue;
      const uv = await uadeVoice(file, 'skateordie.rh', ch, 0.2);
      const songPeriod = uv.period[2];
      // A looped 32-byte saw of the same instrument settings: the preview's playback rate is then its pitch.
      const saw = Array.from({ length: 32 }, (_, i) => Math.round(-120 + (240 * i) / 31));
      const cfg: RH = { ...rhOf(song, cell.instrument), sampleData: saw, sampleLen: 32, loopOffset: 0, sampleVolume: 64, relative: 1024 };
      const p = await previewRender('robhubbard', 'RobHubbard', serializeRobHubbardConfig(cfg), cell.note + 11, 50, 100, chainedHeapTransform);
      const previewPeriod = PAULA_CLOCK / (hzOf(p, 50) * 32);
      expect(Math.abs(cents(previewPeriod, songPeriod)), `ch${ch} grid ${cell.note}: preview period ${previewPeriod.toFixed(1)} song ${songPeriod}`).toBeLessThan(25);
      checked++;
    }
    expect(checked).toBe(4);
  });

  it('level and envelope: the same sample at the same note is as loud as in the song, tick by tick', { timeout: 120000 }, async () => {
    const { file, song } = await load();
    const cell = song.patterns[song.songPositions[0]].channels[2].rows[0]; // ins 4, grid 41: a sustained sample
    const uv = await uadeVoice(file, 'skateordie.rh', 2, 0.6);
    const cfg = rhOf(song, cell.instrument);
    const p = await previewRender('robhubbard', 'RobHubbard', serializeRobHubbardConfig(cfg), cell.note + 11, 24, 100, chainedHeapTransform);
    const s = rmsPerTick(fromOnset(uv.pcm, 1, 20), 20);
    const pr = rmsPerTick(fromOnset(p, 1, 20, 1e-5), 20);
    // The song's player sets its own channel volume (register 47 here); the voice itself is sample x volume / 64.
    const songVol = uv.volume[4] / 64, prevVol = cfg.sampleVolume / 64;
    const sn = s.map((v) => v / songVol), pn = pr.map((v) => v / prevVol);
    expect(Math.abs(db(totalRms(pn.slice(1)), totalRms(sn.slice(1)))), 'overall level at equal volume, dB').toBeLessThan(1.5);
    sn.forEach((v, t) => { if (t >= 1 && v > 0.01) expect(Math.abs(db(pn[t] || 1e-6, v)), `tick ${t}`).toBeLessThan(4); });
  });

  it('key release cuts the voice as a rest does', { timeout: 60000 }, async () => {
    const { song } = await load();
    const v = await previewVoice('robhubbard', 'RobHubbard', serializeRobHubbardConfig(rhOf(song, 4)), 52, 100, chainedHeapTransform);
    renderTicks(v.proc, 5);
    await v.send({ type: 'noteOff', handle: v.handle });
    const after = stereoOutputs(1, 128);
    v.proc.process([], after);
    expect(Math.max(...after[0][0].map(Math.abs))).toBe(0);
  });
});

describe('OctaMED synth keyboard preview is the instrument as UADE\'s OctaMED player plays it', () => {
  // The corpus (public/data/songs, 8 MED files) holds no synth or hybrid instrument,
  // so the oracle module is built around one (medSynthFixture.ts); the preview is
  // fed what MEDParser makes of that same file.
  const saw = (n: number) => Int8Array.from({ length: n }, (_, i) => -120 + Math.round((240 * i) / (n - 1)));
  const flat = (n: number, a: number) => Int8Array.from({ length: n }, (_, i) => (i < n / 2 ? a : -a));

  const config = (fx: MedSynthFixture) => {
    const song = parseMEDFile(buf(buildMedSynthModule(fx)), 'x.mmd0') as unknown as TrackerSong;
    return { cfg: (song.instruments[0] as unknown as { octamed: OctaMEDConfig }).octamed, cell: song.patterns[0].channels[0].rows[0] };
  };
  const octaPreview = async (cfg: OctaMEDConfig, key: number, ticks: number) => {
    const { proc, send, posted } = await startWorklet('octamed', 'OctaMED', chainedHeapTransform);
    await send({ type: 'createPlayer' });
    const handle = (posted.find((p) => (p as { type?: string }).type === 'playerCreated') as unknown as { handle: number }).handle;
    await send({ type: 'setInstrument', handle, buffer: OctaMEDSynth.serializeInstrument(cfg) });
    await send({ type: 'noteOn', handle, note: key, velocity: 100 });
    return { out: renderTicks(proc, ticks, 0), proc, send, handle };
  };

  const pitchCases: { wave: number; rawNote: number }[] = [
    { wave: 64, rawNote: 25 }, { wave: 64, rawNote: 37 }, { wave: 32, rawNote: 26 }, { wave: 128, rawNote: 13 }, { wave: 64, rawNote: 49 },
  ];
  for (const c of pitchCases) {
    it(`pitch: raw note ${c.rawNote} on a ${c.wave}-byte wave plays UADE's Paula period`, { timeout: 60000 }, async () => {
      const fx: MedSynthFixture = { waveforms: [saw(c.wave)], voltbl: [64, 0xff], wftbl: [0, 0xff], volSpeed: 1, wfSpeed: 1, note: c.rawNote };
      const uv = await uadeVoice(buildMedSynthModule(fx), 'x.mmd0', 0, 0.3);
      const { cfg, cell } = config(fx);
      expect(cell.note, 'grid note of the raw note').toBe(c.rawNote + 24);
      const { out } = await octaPreview(cfg, cell.note + 11, 50);
      const previewPeriod = PAULA_CLOCK / (hzOf(out.subarray(FPT), 49) * c.wave);
      expect(Math.abs(cents(previewPeriod, uv.period[4])), `preview period ${previewPeriod.toFixed(1)} UADE ${uv.period[4]}`).toBeLessThan(30);
    });
  }

  type Run = { name: string; fx: Partial<MedSynthFixture> & Pick<MedSynthFixture, 'voltbl' | 'wftbl'>; ticks: number; tol?: number };
  const runs: Run[] = [
    { name: 'volume table values at speed 3', ticks: 20, fx: { voltbl: [64, 48, 32, 16, 8, 0, 0xff], wftbl: [0, 0xff], volSpeed: 3 } },
    { name: 'volume F2 slide down / F3 slide up', ticks: 12, fx: { voltbl: [64, 0xf2, 8, 0xff], wftbl: [0, 0xff], volSpeed: 1 } },
    { name: 'volume F3 slide up', ticks: 10, fx: { voltbl: [10, 0xf3, 8, 0xff], wftbl: [0, 0xff], volSpeed: 1 } },
    { name: 'volume FE jump', ticks: 10, fx: { voltbl: [64, 32, 0xfe, 0], wftbl: [0, 0xff], volSpeed: 1 } },
    { name: 'volume F1 wait', ticks: 8, fx: { voltbl: [64, 0xf1, 3, 32, 0xff], wftbl: [0, 0xff], volSpeed: 1 } },
    { name: 'volume F0 speed applies one step late', ticks: 10, fx: { voltbl: [64, 0xf0, 3, 32, 16, 8, 0xff], wftbl: [0, 0xff], volSpeed: 1 } },
    { name: 'instrument volume scales the table (32)', ticks: 6, fx: { voltbl: [64, 48, 32, 0xff], wftbl: [0, 0xff], volSpeed: 2, volume: 32 } },
    { name: 'waveform table steps at speed 2', ticks: 12, fx: { voltbl: [64, 0xff], wftbl: [0, 1, 2, 0, 0xff], volSpeed: 1, wfSpeed: 2 } },
    { name: 'waveform FE jump (a new wave every tick: the song switches mid-tick at loop ends)', ticks: 10, tol: 4, fx: { voltbl: [64, 0xff], wftbl: [0, 1, 0xfe, 0], volSpeed: 1, wfSpeed: 1 } },
    { name: 'waveform F1 wait', ticks: 8, fx: { voltbl: [64, 0xff], wftbl: [0, 0xf1, 3, 1, 0xff], volSpeed: 1, wfSpeed: 1 } },
  ];
  for (const r of runs) {
    it(`level and envelope: ${r.name}`, { timeout: 60000 }, async () => {
      // Three waveforms of different loudness, so the RMS tells which one plays.
      const fx: MedSynthFixture = { waveforms: [flat(64, 30), flat(64, 100), flat(64, 60)], volSpeed: 1, wfSpeed: 1, note: 25, ...r.fx };
      const uv = await uadeVoice(buildMedSynthModule(fx), 'x.mmd0', 0, (r.ticks + 3) / 50);
      const { cfg, cell } = config(fx);
      const { out } = await octaPreview(cfg, cell.note + 11, r.ticks + 2);
      const s = rmsPerTick(uv.pcm, r.ticks + 2), p = rmsPerTick(out, r.ticks + 2);
      for (let t = 2; t <= r.ticks; t++) {
        if (s[t] < 0.004) { expect(p[t], `tick ${t} silent in the song`).toBeLessThan(0.006); continue; }
        // The step a tick early or late is the player's own jitter (UADE's tick drifts by one around tick 15).
        const best = Math.min(...[t - 1, t, t + 1].map((k) => Math.abs(db(p[k] || 1e-6, s[t]))));
        expect(best, `tick ${t}: song ${s[t].toFixed(3)} preview ${p[t].toFixed(3)} (song ${Array.from(s).map((x) => x.toFixed(2)).join(' ')} | preview ${Array.from(p).map((x) => x.toFixed(2)).join(' ')})`).toBeLessThan(r.tol ?? 3);
      }
    });
  }

  it('wave table F2 slides the period up by n per tick and FC..FD arpeggio steps one semitone entry per tick', { timeout: 60000 }, async () => {
    const fx: MedSynthFixture = { waveforms: [saw(64)], voltbl: [64, 0xff], wftbl: [0, 0xfc, 0, 12, 7, 0xfd, 0xff], volSpeed: 1, wfSpeed: 1, note: 25 };
    const uv = await uadeVoice(buildMedSynthModule(fx), 'x.mmd0', 0, 0.2);
    const { cfg, cell } = config(fx);
    const { out } = await octaPreview(cfg, cell.note + 11, 8);
    // Rising edges per tick of a 64-byte saw: 3546895 / (period * 64) / 50 per tick.
    for (let t = 2; t < 8; t++) {
      const edges = risingEdges(out.subarray(t * FPT, (t + 1) * FPT));
      const expected = PAULA_CLOCK / (uv.period[t] * 64) / 50;
      expect(Math.abs(edges - expected), `tick ${t}: ${edges} edges, UADE period ${uv.period[t]} wants ${expected.toFixed(1)}`).toBeLessThanOrEqual(2);
    }
  });

  it('key release cuts the voice (MED has no release phase: the next note or stop does it)', { timeout: 60000 }, async () => {
    const { cfg, cell } = config({ waveforms: [flat(64, 100)], voltbl: [64, 0xff], wftbl: [0, 0xff], volSpeed: 1, wfSpeed: 1, note: 25 });
    const { proc, send, handle } = await octaPreview(cfg, cell.note + 11, 5);
    await send({ type: 'noteOff', handle });
    const after = stereoOutputs(1, 128);
    proc.process([], after);
    expect(Math.max(...after[0][0].map(Math.abs))).toBe(0);
  });
});

describe('OctaMED sampler instruments: a typed key plays the Paula period UADE plays for that grid note', () => {
  for (const [name, ch] of [['formats/funky nightmare.mmd1', 1], ['formats/universal monsters - dracula.mmd0', 1]] as const) {
    it(`${name}: voice ${ch}, first note`, { timeout: 60000 }, async () => {
      const file = songFile(name);
      const song = parseMEDFile(buf(file), name) as unknown as TrackerSong;
      const cell = song.patterns[song.songPositions[0]].channels[ch].rows.find((r) => r.note > 0 && r.note < 97)!;
      const inst = song.instruments[cell.instrument - 1];
      expect(inst.synthType).toBe('Sampler');
      const uv = await uadeVoice(file, name.split('/').pop()!, ch, 0.2);
      const songRate = PAULA_CLOCK / uv.period[3];
      // ToneEngine's keyboard path: playbackRate = f(key) / f(baseNote), on a buffer of the sample's own rate.
      const key = cell.note + 11;
      const previewRate = inst.sample!.sampleRate! * 2 ** ((key - noteToMidi(inst.sample!.baseNote)) / 12);
      expect(Math.abs(cents(previewRate, songRate)), `preview ${previewRate.toFixed(0)} Hz, UADE ${songRate.toFixed(0)} Hz`).toBeLessThan(30);
    });
  }
});

describe('Hippel CoSo keyboard preview is the instrument as the player plays it (prehistoric_tale.hipc)', () => {
  const file = songFile('formats/prehistoric_tale.hipc');
  // (voice, instrument as the player numbers it, grid note, UADE onset tick of that note, UADE period)
  const cases = [
    { ch: 0, ins: 2, grid: 32, onset: 8, period: 285 },
    { ch: 1, ins: 2, grid: 35, onset: 22, period: 240 },
    // The grid shows instrument 1 here: its number leaves out the track table's
    // sound transpose (+5), and the player plays volume sequence 5 = instrument 6.
    { ch: 3, ins: 6, grid: 32, onset: 344, period: 285 },
  ];
  for (const c of cases) {
    it(`voice ${c.ch} instrument ${c.ins}, grid ${c.grid}: the preview has the song's pitch and envelope shape`, { timeout: 120000 }, async () => {
      const song = await parseHippelCoSoFile(buf(file), 'prehistoric_tale.hipc');
      const cfg = (song.instruments[c.ins - 1] as unknown as { hippelCoso: HippelCoSoConfig }).hippelCoso;
      const uv = await uadeVoice(file, 'prehistoric_tale.hipc', c.ch, (c.onset + 40) / 50);
      expect(uv.period[c.onset + 1], 'UADE period of the grid note').toBe(c.period);
      const v = await previewVoice('hippel-coso', 'HippelCoSo', serializeHippelCoSoConfig(cfg), c.grid + 11, 100, chainedHeapTransform);
      const N = 26; // the song retriggers the note 28 ticks after the onset
      const p = renderTicks(v.proc, N + 2, 0);
      const s = uv.pcm.subarray(c.onset * FPT, (c.onset + N + 2) * FPT);
      // Pitch: rising edges of the same sample played at the same period.
      const edges = (x: Float32Array, t: number) => risingEdges(x.subarray(t * FPT, (t + 1) * FPT));
      let se = 0, pe = 0;
      for (let t = 2; t < N; t++) { se += edges(s, t); pe += edges(p, t - 1); }
      expect(Math.abs(pe / se - 1), `rising edges: preview ${pe}, song ${se}`).toBeLessThan(0.04);
      // Envelope: the song mixes the voice at its own track volume, so preview / song
      // is one constant (the volume quotient) on every tick the song's volume register
      // is high enough not to be rounding noise; the spread around it is the shape.
      const sr = rmsPerTick(s, N + 2), pr = rmsPerTick(p, N + 2);
      const dbs: number[] = [];
      for (let t = 2; t < N; t++) if (uv.volume[c.onset + t] >= 4) dbs.push(20 * Math.log10(pr[t - 1] / sr[t]));
      expect(dbs.length).toBeGreaterThan(5);
      const mean = dbs.reduce((a, b) => a + b, 0) / dbs.length;
      dbs.forEach((d, i) => expect(Math.abs(d - mean), `tick ${i + 2}: ${d.toFixed(1)} dB around ${mean.toFixed(1)} dB`).toBeLessThan(2));
      // Level: the constant is 100 / the voice's volume percentage in the song, which
      // is the instrument's own level at 100 (the preview) over the song's mix.
      expect(mean, 'preview is never quieter than the song voice').toBeGreaterThan(-1.5);
    });
  }

  it('key release cuts the voice', { timeout: 60000 }, async () => {
    const song = await parseHippelCoSoFile(buf(file), 'prehistoric_tale.hipc');
    const cfg = (song.instruments[1] as unknown as { hippelCoso: HippelCoSoConfig }).hippelCoso;
    const v = await previewVoice('hippel-coso', 'HippelCoSo', serializeHippelCoSoConfig(cfg), 43, 100, chainedHeapTransform);
    renderTicks(v.proc, 4);
    await v.send({ type: 'noteOff', handle: v.handle });
    const after = stereoOutputs(1, 128);
    v.proc.process([], after);
    expect(Math.max(...after[0][0].map(Math.abs))).toBe(0);
  });
});
