/**
 * The DX7 curve models against MEASURED output of the real engine: the VDX7 firmware + EGS + OPS in public/dx7/DX7.wasm,
 * run headless through its real worklet with the stock v1.8 ROM (src/engine/dx7/__tests__/dx7Harness.ts).
 * Every model number below is compared with what the firmware wrote to the EGS registers or rendered.
 */
import { describe as baseDescribe, it, expect, beforeAll } from 'vitest';
import { HAS_DX7_ROM, startDX7, initVoice, type DX7Rig } from '@/engine/dx7/__tests__/dx7Harness';
import {
  ALGO_ROM, DX7_SAMPLE_RATE, Dx7Envelope, dx7Algorithm, dx7EnvelopeRun, dx7VoiceSpectrum, egParams, lfoPeakRegister, lfoRateHz,
  levelRegister, operatorOutputRegister, outputRegister, pitchEgRun, rateRegister, rateScalingDelta, readOp, scaleOutLevel, voicePitchRegister,
  EG_SILENT, engineLevelScaling, engineNoteHz, type Dx7Voice,
} from '../dx7CurveModels';

let rig: DX7Rig;
// The firmware ROM is not in the repo: without it these tests skip (they run on a machine that has it).
const describe = HAS_DX7_ROM ? baseDescribe : baseDescribe.skip;
beforeAll(async () => { if (HAS_DX7_ROM) rig = await startDX7(); }, 60000);

/** The sounding voice index right after a note-on. */
const keyedVoice = (): number => rig.envelopeState().findIndex((v) => v.some((e) => !e.keyoff));

describe('VCED -> EGS register maps are the firmware\'s (all 100 values, exact)', () => {
  it('EG rates, EG levels', async () => {
    const rateRegs: number[] = []; const levelRegs: number[] = [];
    for (let base = 0; base < 100; base += 24) {
      const v = initVoice();
      const sent: Array<[number, number, number]> = [];
      for (let op = 0; op < 6; op++) for (let st = 0; st < 4; st++) {
        const val = Math.min(99, base + op * 4 + st);
        v[op * 21 + st] = val; v[op * 21 + 4 + st] = val; sent.push([op, st, val]);
      }
      await rig.loadVoice(v);
      const regs = rig.egsRegisters();
      for (const [op, st, val] of sent) { rateRegs[val] = regs[0x40 + op * 4 + st]; levelRegs[val] = regs[0x60 + op * 4 + st]; }
    }
    for (let r = 0; r < 100; r++) {
      expect(rateRegister(r), `rate ${r}`).toBe(rateRegs[r]);
      expect(levelRegister(r), `level ${r}`).toBe(levelRegs[r]);
    }
  }, 60000);

  it('operator output level', async () => {
    const measured: number[] = [];
    for (let base = 0; base < 100; base += 6) {
      const v = initVoice();
      for (let op = 0; op < 6; op++) v[op * 21 + 16] = Math.min(99, base + op);
      await rig.loadVoice(v);
      await rig.send({ type: 'noteOn', note: 60, velocity: 127 }); rig.run(40);
      const regs = rig.egsRegisters(); const voice = keyedVoice();
      for (let op = 0; op < 6; op++) measured[Math.min(99, base + op)] = regs[0x80 + op * 16 + voice];
      await rig.send({ type: 'allNotesOff' }); rig.run(300);
    }
    for (let ol = 0; ol < 100; ol++) expect(outputRegister(scaleOutLevel(ol)), `output level ${ol}`).toBe(measured[ol]);
  }, 120000);
});

describe('key level scaling and rate scaling', () => {
  it('level scaling: the output register the firmware computes for six notes (36..94) and four curve shapes', async () => {
    const mismatches: string[] = [];
    for (const [leftCurve, rightCurve] of [[0, 3], [1, 2], [3, 0], [2, 1]]) {
      const v = initVoice();
      const b = 5 * 21; // OP1
      v[b + 16] = 80; v[b + 8] = 39; v[b + 9] = 60; v[b + 10] = 80; v[b + 11] = leftCurve; v[b + 12] = rightCurve;
      await rig.loadVoice(v);
      for (const note of [36, 48, 60, 72, 84, 94]) {
        await rig.send({ type: 'noteOn', note, velocity: 127 }); rig.run(40);
        const reg = rig.egsRegisters()[0x80 + 5 * 16 + keyedVoice()];
        const want = operatorOutputRegister(readOp((n) => v[n], 1), note);
        if (reg !== want) mismatches.push(`curve ${leftCurve}/${rightCurve} note ${note}: firmware ${reg}, model ${want}`);
        await rig.send({ type: 'allNotesOff' }); rig.run(300);
      }
    }
    console.log('[dx7 level scaling]', mismatches.length === 0 ? 'exact on 24 note/curve cases' : mismatches.join('; '));
    expect(mismatches.length).toBeLessThanOrEqual(0);
  }, 120000);

  it('voice pitch register: 7424 at middle C, 1024 per octave', async () => {
    await rig.loadVoice(initVoice());
    for (const note of [36, 48, 60, 72, 84]) {
      await rig.send({ type: 'noteOn', note, velocity: 127 }); rig.run(40);
      const v = keyedVoice(); const r = rig.egsRegisters();
      expect(((r[2 * v] << 8) | r[2 * v + 1]) >> 2, `note ${note}`).toBe(voicePitchRegister(note));
      await rig.send({ type: 'allNotesOff' }); rig.run(300);
    }
  }, 60000);
});

/** Level of the sounding voice's OP1 against time for `blocks` blocks of 128 host frames, key up at block `upAt`. */
async function traceOp1(upAt: number, blocks: number, note = 60): Promise<Array<{ t: number; level: number; stage: number }>> {
  await rig.send({ type: 'noteOn', note, velocity: 127 });
  const out: Array<{ t: number; level: number; stage: number }> = [];
  let frames = 0; let voice = -1;
  for (let i = 0; i < blocks; i++) {
    rig.run(1); frames += 128;
    if (i === upAt) await rig.send({ type: 'noteOff', note });
    const env = rig.envelopeState();
    if (voice < 0) voice = env.findIndex((o) => o.some((x) => !x.keyoff));
    if (voice >= 0) out.push({ t: frames / 48000, level: env[voice][5].level, stage: env[voice][5].stage });
  }
  await rig.send({ type: 'allNotesOff' }); rig.run(400);
  return out;
}

/** Time at which a monotone series first crosses `level` (linear between samples). */
function crossing(series: ReadonlyArray<{ x: number; level: number }>, level: number): number | null {
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1]; const b = series[i];
    if ((a.level - level) * (b.level - level) <= 0 && a.level !== b.level) return a.x + ((level - a.level) / (b.level - a.level)) * (b.x - a.x);
  }
  return null;
}

describe('operator envelope: the Envelope port against the EGS levels the firmware reports', () => {
  const cases: Array<{ name: string; rates: number[]; levels: number[]; rateScaling?: number; note?: number }> = [
    { name: 'pluck 90/70/50/60', rates: [90, 70, 50, 60], levels: [99, 80, 60, 0] },
    { name: 'pad 55/45/40/45', rates: [55, 45, 40, 45], levels: [99, 90, 75, 0] },
    { name: 'rate scaling 5 at note 84', rates: [70, 60, 50, 50], levels: [99, 85, 70, 0], rateScaling: 5, note: 84 },
  ];
  for (const c of cases) {
    it(c.name, async () => {
      const note = c.note ?? 60;
      const v = initVoice();
      v.set(c.rates, 5 * 21); v.set(c.levels, 5 * 21 + 4); v[5 * 21 + 13] = c.rateScaling ?? 0;
      await rig.loadVoice(v);
      const upBlock = 700;
      const trace = await traceOp1(upBlock, 1500, note);
      const t0 = trace.find((p) => p.level < EG_SILENT - 8)!.t; // first block the key took effect
      const model = dx7EnvelopeRun(egParams(readOp((n) => v[n], 1), note), upBlock * 128 / 48000);
      const modelSeries = model.points.map((p) => ({ x: p.x, level: p.level, stage: p.stage }));
      const engineSeries = trace.map((p) => ({ x: p.t - t0, level: p.level, stage: p.stage }));
      // compare the time at which fixed levels are reached in the held part (falling) and the release (rising)
      const errors: string[] = [];
      const holdEngine = engineSeries.filter((p) => p.stage === 2);
      const holdModel = modelSeries.filter((p) => p.stage === 2);
      const lo = Math.min(...holdEngine.map((p) => p.level)); const hi = Math.max(...holdEngine.map((p) => p.level));
      for (const frac of [0.5]) {
        const lvl = hi + (lo - hi) * frac; // between the first and last level of segment 3
        const te = crossing(holdEngine.map((p) => ({ x: p.x, level: p.level })), lvl);
        const tm = crossing(holdModel.map((p) => ({ x: p.x, level: p.level })), lvl);
        if (te !== null && tm !== null && te > 0.05) errors.push(`seg3 ${lvl.toFixed(0)}: engine ${te.toFixed(3)}s model ${tm.toFixed(3)}s rel ${(Math.abs(te - tm) / te * 100).toFixed(1)}%`);
        if (te !== null && tm !== null && te > 0.05) expect(Math.abs(te - tm) / te).toBeLessThan(0.05);
      }
      const relEngine = engineSeries.filter((p) => p.stage === 3);
      const relModel = modelSeries.filter((p) => p.stage === 3);
      const upLevel = relEngine[0].level;
      const target = Math.min(3600, upLevel + (EG_SILENT - upLevel) * 0.6);
      const re = crossing(relEngine.map((p) => ({ x: p.x, level: p.level })), target);
      const rm = crossing(relModel.map((p) => ({ x: p.x, level: p.level })), target);
      expect(re).not.toBeNull(); expect(rm).not.toBeNull();
      const relErr = Math.abs((re! - rm!)) / (re! - upBlock * 128 / 48000 + t0);
      errors.push(`release ${target.toFixed(0)}: engine ${re!.toFixed(3)}s model ${rm!.toFixed(3)}s`);
      console.log('[dx7 envelope]', c.name, errors.join(' | '), 'rel(release start->crossing)', (relErr * 100).toFixed(1) + '%');
      // hold level and release time within 5 %
      expect(Math.abs((re! - rm!)) / Math.max(0.05, rm! - upBlock * 128 / 48000)).toBeLessThan(0.05);
      // the sustain level is the model's
      expect(Math.abs(holdEngine[holdEngine.length - 1].level - holdModel[holdModel.length - 1].level)).toBeLessThanOrEqual(2);
    }, 120000);
  }
});

/** Dexed's algorithm table (third-party/dexed/Source/msfa/fm_core.cc): output bus of op i is (flags & 3); carriers are the ops on bus 0. */
const DEXED_FLAGS = [
  [0xc1,0x11,0x11,0x14,0x01,0x14],[0x01,0x11,0x11,0x14,0xc1,0x14],[0xc1,0x11,0x14,0x01,0x11,0x14],[0xc1,0x11,0x94,0x01,0x11,0x14],
  [0xc1,0x14,0x01,0x14,0x01,0x14],[0xc1,0x94,0x01,0x14,0x01,0x14],[0xc1,0x11,0x05,0x14,0x01,0x14],[0x01,0x11,0xc5,0x14,0x01,0x14],
  [0x01,0x11,0x05,0x14,0xc1,0x14],[0x01,0x05,0x14,0xc1,0x11,0x14],[0xc1,0x05,0x14,0x01,0x11,0x14],[0x01,0x05,0x05,0x14,0xc1,0x14],
  [0xc1,0x05,0x05,0x14,0x01,0x14],[0xc1,0x05,0x11,0x14,0x01,0x14],[0x01,0x05,0x11,0x14,0xc1,0x14],[0xc1,0x11,0x02,0x25,0x05,0x14],
  [0x01,0x11,0x02,0x25,0xc5,0x14],[0x01,0x11,0x11,0xc5,0x05,0x14],[0xc1,0x14,0x14,0x01,0x11,0x14],[0x01,0x05,0x14,0xc1,0x14,0x14],
  [0x01,0x14,0x14,0xc1,0x14,0x14],[0xc1,0x14,0x14,0x14,0x01,0x14],[0xc1,0x14,0x14,0x01,0x14,0x04],[0xc1,0x14,0x14,0x14,0x04,0x04],
  [0xc1,0x14,0x14,0x04,0x04,0x04],[0xc1,0x05,0x14,0x01,0x14,0x04],[0x01,0x05,0x14,0xc1,0x14,0x04],[0x04,0xc1,0x11,0x14,0x01,0x14],
  [0xc1,0x14,0x01,0x14,0x04,0x04],[0x04,0xc1,0x11,0x14,0x04,0x04],[0xc1,0x14,0x04,0x04,0x04,0x04],[0xc4,0x04,0x04,0x04,0x04,0x04],
];
/** Carrier operator numbers (OP1..OP6) of algorithm i per Dexed: hardware index h = OP6 first, so OP = 6 - h. */
const dexedCarriers = (i: number): number[] => DEXED_FLAGS[i].map((f, h) => ((f & 3) === 0 ? 6 - h : 0)).filter(Boolean).sort((a, b) => a - b);

describe('algorithms: the carrier set the OPS ROM walk finds', () => {
  it('has 32 algorithms and agrees with Dexed\'s independent table on every carrier set', () => {
    expect(ALGO_ROM).toHaveLength(32);
    for (let i = 0; i < 32; i++) expect(dx7Algorithm(i).carriers, `algorithm ${i + 1}`).toEqual(dexedCarriers(i));
  });

  it('matches the engine: solo operator k is audible exactly when it is a carrier (32 algorithms x 6 operators, firmware audio)', async () => {
    const wrong: string[] = []; let checked = 0;
    for (let op = 1; op <= 6; op++) {
      const bank: Uint8Array[] = [];
      for (let alg = 0; alg < 32; alg++) {
        const v = initVoice();
        for (let o = 1; o <= 6; o++) v[(6 - o) * 21 + 16] = o === op ? 99 : 0;
        v[134] = alg; v[135] = 0;
        bank.push(v);
      }
      await rig.loadBank(bank);
      for (let alg = 0; alg < 32; alg++) {
        await rig.program(alg);
        await rig.send({ type: 'noteOn', note: 60, velocity: 127 });
        const audio = rig.run(30);
        await rig.send({ type: 'allNotesOff' }); rig.run(300);
        let peak = 0; for (const x of audio) peak = Math.max(peak, Math.abs(x));
        const audible = peak > 0.01;
        const isCarrier = dx7Algorithm(alg).carriers.includes(op);
        checked++;
        if (audible !== isCarrier) wrong.push(`algorithm ${alg + 1} OP${op}: peak ${peak.toFixed(3)}, model carrier ${isCarrier}`);
      }
    }
    console.log(`[dx7 algorithms] ${checked} (algorithm, operator) pairs checked against firmware audio, ${wrong.length} wrong`);
    expect(wrong).toEqual([]);
  }, 280000);
});

describe('pitch: the engine sounds MIDI notes at engineNoteHz (equal temperament; see also dx7Pitch.test.ts)', () => {
  it('MIDI 48, 60, 69 and 72 render at engineNoteHz', async () => {
    await rig.loadVoice(initVoice());
    const { spectrumLines } = await import('../spectrumMath');
    for (const note of [48, 60, 69, 72]) {
      await rig.send({ type: 'noteOn', note, velocity: 127 }); rig.run(100);
      const a = Array.from(rig.run(64)).slice(0, 8192);
      await rig.send({ type: 'allNotesOff' }); rig.run(300);
      const top = spectrumLines(a, 48000, 1, -50, 3000).sort((x, y) => y.db - x.db)[0];
      expect(Math.abs(top.hz - engineNoteHz(note)) / engineNoteHz(note), `note ${note}`).toBeLessThan(0.02);
    }
  }, 60000);
});

describe('spectrum: the OPS pipeline port against the firmware\'s rendered audio', () => {
  /** Render `v` on the firmware and compare the model's lines (within 30 dB of its top) with the engine's: frequency and relative level. */
  async function compare(label: string, v: Uint8Array, minLines: number): Promise<number> {
    await rig.loadVoice(v);
    await rig.send({ type: 'noteOn', note: 60, velocity: 127 });
    rig.run(150); // let the envelope settle
    const audio = rig.run(Math.ceil(((4096 / DX7_SAMPLE_RATE) * 48000) / 128) + 2);
    await rig.send({ type: 'allNotesOff' }); rig.run(300);
    const { spectrumLines } = await import('../spectrumMath');
    const eng = spectrumLines(Array.from(audio).slice(0, 4096), 48000, 1, -60, 6000);
    const voice: Dx7Voice = { ops: [1, 2, 3, 4, 5, 6].map((n) => readOp((i) => v[i], n)), algorithm: v[134], feedback: v[135] };
    const mdl = dx7VoiceSpectrum(voice, 60, 6000);
    const top = (a: Array<{ db: number }>) => Math.max(...a.map((l) => l.db));
    const eTop = top(eng); const mTop = top(mdl);
    const strong = mdl.filter((l) => l.db > mTop - 30);
    const errs: Array<{ hz: number; rel: number; err: number }> = [];
    for (const m of strong) {
      const near = eng.filter((e) => Math.abs(e.hz - m.hz) < 30).sort((a, b) => b.db - a.db)[0];
      if (!near) { errs.push({ hz: m.hz, rel: m.db - mTop, err: Infinity }); continue; }
      errs.push({ hz: m.hz, rel: m.db - mTop, err: Math.abs((near.db - eTop) - (m.db - mTop)) });
    }
    // the audible lines (within 18 dB of the top) must agree; the weak ones sit near Bessel nulls and the engine's resampler adds images
    const loud = errs.filter((e) => e.rel > -18);
    const loudMax = Math.max(...loud.map((e) => e.err));
    const mean = errs.reduce((a, b) => a + (Number.isFinite(b.err) ? b.err : 6), 0) / errs.length;
    console.log(`[dx7 spectrum] ${label}: ${strong.length} model lines within 30 dB of the top (${loud.length} within 18 dB): level error max ${loudMax.toFixed(2)} dB over the loud ones, mean ${mean.toFixed(2)} dB over all`);
    expect(strong.length).toBeGreaterThanOrEqual(minLines);
    expect(mean).toBeLessThan(2.5);
    return loudMax;
  }
  const setOp = (v: Uint8Array, opNum: number, ol: number, coarse: number, fine = 0) => { const b = (6 - opNum) * 21; v[b + 16] = ol; v[b + 18] = coarse; v[b + 19] = fine; };

  it('algorithm 1, OP2 (ratio 2) modulating OP1 hard: at least 5 lines, loud lines within 3 dB', async () => {
    const v = initVoice(); v[134] = 0; v[135] = 0; v[136] = 1; // oscillator key sync: every operator starts at phase 0, as the model does
    for (let o = 1; o <= 6; o++) setOp(v, o, 0, 1);
    setOp(v, 1, 99, 1); setOp(v, 2, 88, 2);
    expect(await compare('FM 1:2', v, 5)).toBeLessThan(3);
  }, 60000);

  it('algorithm 32 with OP6 on feedback 6 (a lone carrier): the feedback sawtooth series, loud lines within 3 dB', async () => {
    const v = initVoice(); v[134] = 31; v[135] = 6; v[136] = 1;
    for (let o = 1; o <= 6; o++) setOp(v, o, 0, 1);
    setOp(v, 6, 99, 1);
    expect(await compare('feedback 6', v, 6)).toBeLessThan(3);
  }, 60000);
});

describe('LFO and pitch EG', () => {
  const lfoVoice = (speed: number, pms: number, pmd: number, wave: number) => {
    const v = initVoice(); v[137] = speed; v[138] = 0; v[139] = pmd; v[140] = 0; v[141] = 0; v[142] = wave; v[143] = pms; return v;
  };
  const readPitchMod = (): number => { const r = rig.egsRegisters(); return ((r[0xf2] << 8) | r[0xf3]) << 16 >> 16; };

  it('LFO rate table: speeds 60, 50 and 40 measure within 2 % of the model Hz', async () => {
    for (const speed of [60, 50, 40]) {
      await rig.loadVoice(lfoVoice(speed, 7, 99, 0));
      await rig.send({ type: 'noteOn', note: 60, velocity: 127 });
      const vals: number[] = [];
      for (let i = 0; i < 3000; i++) { rig.run(1); vals.push(readPitchMod()); }
      await rig.send({ type: 'allNotesOff' }); rig.run(300);
      const crossings: number[] = [];
      for (let i = 1; i < vals.length; i++) if (vals[i - 1] < 0 && vals[i] >= 0) crossings.push(i);
      const periods = crossings.slice(1).map((c, i) => ((c - crossings[i]) * 128) / 48000);
      const measuredHz = 1 / (periods.reduce((a, b) => a + b, 0) / periods.length);
      console.log(`[dx7 lfo] speed ${speed}: engine ${measuredHz.toFixed(3)} Hz, model ${lfoRateHz(speed).toFixed(3)} Hz`);
      expect(Math.abs(measuredHz - lfoRateHz(speed)) / lfoRateHz(speed)).toBeLessThan(0.02);
    }
  }, 120000);

  it('LFO depth: peak pitch-modulation register for PMS 1..7 and PMD 99 / 50 within 4 % (PMS 1: 8 %)', async () => {
    const cases: Array<[number, number]> = [[1, 99], [3, 99], [5, 99], [7, 99], [7, 50]];
    const report: string[] = [];
    for (const [pms, pmd] of cases) {
      await rig.loadVoice(lfoVoice(99, pms, pmd, 0));
      await rig.send({ type: 'noteOn', note: 60, velocity: 127 });
      let peak = 0;
      for (let i = 0; i < 1200; i++) { rig.run(1); peak = Math.max(peak, Math.abs(readPitchMod())); }
      await rig.send({ type: 'allNotesOff' }); rig.run(300);
      const model = lfoPeakRegister(pmd, pms);
      const rel = Math.abs(peak - model) / peak;
      report.push(`PMS ${pms} PMD ${pmd}: engine ${peak} model ${model.toFixed(0)} (${(rel * 100).toFixed(1)}%)`);
      expect(rel).toBeLessThan(pms === 1 ? 0.08 : 0.04);
    }
    console.log('[dx7 lfo depth]', report.join(' | '));
  }, 120000);

  it('pitch EG: the voice pitch register follows the model in semitones (rates 60/70/80/50, levels 20/90/50/30)', async () => {
    const R = [60, 70, 80, 50]; const L = [20, 90, 50, 30];
    const v = initVoice(); v.set(R, 126); v.set(L, 130);
    await rig.loadVoice(v);
    await rig.send({ type: 'noteOn', note: 60, velocity: 127 });
    const upBlock = 700;
    const trace: Array<{ t: number; st: number }> = [];
    let frames = 0; let voice = -1;
    for (let i = 0; i < 1400; i++) {
      rig.run(1); frames += 128;
      if (i === upBlock) await rig.send({ type: 'noteOff', note: 60 });
      if (voice < 0) voice = keyedVoice();
      if (voice >= 0) { const r = rig.egsRegisters(); trace.push({ t: frames / 48000, st: ((((r[2 * voice] << 8) | r[2 * voice + 1]) >> 2) - voicePitchRegister(60)) * 12 / 1024 }); }
    }
    await rig.send({ type: 'allNotesOff' }); rig.run(300);
    const upT = (upBlock + 1) * 128 / 48000;
    // model with the same hold: held until key-up
    const hold = upT - trace[0].t;
    const pts = pitchEgRun(R, L, 0);
    // time at which segment 1 + 2 + 3 end, plus the same key-up
    const seg3End = pts[3].x;
    expect(seg3End).toBeLessThan(upT);
    const modelAt = (t: number): number => {
      const run = pitchEgRun(R, L, hold - seg3End);
      for (let i = 1; i < run.length; i++) if (t <= run[i].x) { const a = run[i - 1]; const b = run[i]; return a.semitones + ((t - a.x) / (b.x - a.x || 1)) * (b.semitones - a.semitones); }
      return run[run.length - 1].semitones;
    };
    let worst = 0;
    for (const p of trace) { if (p.t - trace[0].t > 1.6 && p.t < upT) continue; worst = Math.max(worst, Math.abs(modelAt(p.t - trace[0].t) - p.st)); }
    console.log(`[dx7 pitch EG] worst deviation ${worst.toFixed(2)} semitones over the trace (range ${Math.min(...pts.map((p) => p.semitones)).toFixed(1)}..${Math.max(...pts.map((p) => p.semitones)).toFixed(1)} st)`);
    expect(worst).toBeLessThan(1.6);
  }, 120000);
});

describe('Dx7Envelope constants', () => {
  it('starts idle (stage 3, silent) and a key-on moves it to stage 0', () => {
    const e = new Dx7Envelope(egParams(readOp((n) => initVoice()[n], 1), 60));
    expect(e.stage).toBe(3); expect(e.level).toBe(EG_SILENT);
    e.keyOn(); expect(e.stage).toBe(0);
  });
  it('rate scaling 0 adds nothing', () => { expect(rateScalingDelta(84, 0)).toBe(0); expect(rateScalingDelta(84, 7)).toBeGreaterThan(rateScalingDelta(36, 7)); });
  it('the engine scales note n like the msfa formula scales n (the bridge numbers keys from MIDI 36, the DX7 keyboard start)', () => {
    const o = { breakPoint: 39, leftDepth: 60, rightDepth: 80, leftCurve: 0, rightCurve: 3 };
    expect(engineLevelScaling(59, o)).toBe(6);
    expect(engineLevelScaling(56, o)).toBe(0);
  });
});

describe('the worklet voiceStatus report (the source of the DX7 markers)', () => {
  type Status = { type: string; voices: Array<{ voice: number; note: number; ops: Array<{ level: number; stage: number; released: boolean }>; pitch: number; elapsedSeconds: number; releasedSeconds: number | null }>; lfo: { pitchMod: number; ampMod: number } };
  const last = (): Status | undefined => { const r = (rig.posted as unknown as Status[]).filter((p) => p.type === 'voiceStatus'); return r[r.length - 1]; };

  it('reports the keyed voice with its note, per-operator EG segment and level, then its release', async () => {
    const v = initVoice(); v.set([70, 60, 50, 55], 5 * 21); v.set([99, 85, 70, 0], 5 * 21 + 4);
    await rig.loadVoice(v);
    rig.posted.length = 0;
    await rig.send({ type: 'watchVoices', on: true });
    await rig.send({ type: 'noteOn', note: 60, velocity: 127 });
    rig.run(60);
    const held = last()!;
    expect(held, 'a voiceStatus message arrived (sentinel)').toBeDefined();
    expect(held.voices).toHaveLength(1);
    const voice = held.voices[0];
    expect(voice.note).toBe(60);
    expect(voice.releasedSeconds).toBeNull();
    expect(voice.pitch).toBe(voicePitchRegister(60));
    const op1 = voice.ops[5]; // OP1 is last in EGS order
    expect(op1.released).toBe(false);
    expect(op1.stage).toBeGreaterThanOrEqual(1);
    expect(op1.level).toBeLessThan(EG_SILENT);
    // the report is the EGS state itself
    const direct = rig.envelopeState()[voice.voice][5];
    expect(Math.abs(direct.level - op1.level)).toBeLessThan(400);
    await rig.send({ type: 'noteOff', note: 60 });
    rig.run(120);
    const rel = last()!.voices[0];
    expect(rel.releasedSeconds).not.toBeNull();
    expect(rel.ops[5].stage).toBe(3);
    await rig.send({ type: 'watchVoices', on: false });
    rig.posted.length = 0; rig.run(40);
    expect(last(), 'no reports while nobody watches').toBeUndefined();
    await rig.send({ type: 'allNotesOff' }); rig.run(300);
  }, 60000);

  it('lists no voices once the note has died away (the marker disappears)', async () => {
    const v = initVoice(); v.set([99, 99, 99, 90], 5 * 21);
    await rig.loadVoice(v);
    await rig.send({ type: 'watchVoices', on: true });
    await rig.send({ type: 'noteOn', note: 60, velocity: 127 });
    rig.run(20);
    await rig.send({ type: 'noteOff', note: 60 });
    rig.run(600);
    expect(last()!.voices).toHaveLength(0);
    await rig.send({ type: 'watchVoices', on: false });
  }, 60000);
});
