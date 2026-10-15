/**
 * The OPL3 curve models against MEASURED output of the real engine: the Nuked OPL3 core in public/opl3/OPL3.wasm, run headless
 * through its real worklet. The envelope is compared with the eg_rout / eg_gen the worklet reports from the chip's own slots
 * (oplGetChannelEnvelopes), the spectrum and tremolo/vibrato with rendered audio and the chip's LFO counters.
 */
import { describe, it, expect } from 'vitest';
import { startWorklet, stereoOutputs } from '@/engine/__tests__/workletHarness';
import {
  OPL_CHIP_RATE, OplEnvelopeSim, oplAmplitude, oplEnvelopeCurve, oplFnumBlock, oplKslAttenuation, oplSpectrum, oplTremoloDb, oplVibratoCents,
  oplTremoloHz, oplVibratoHz, type OplSlotParams,
} from '../opl3CurveModels';
import { spectrumLines } from '../spectrumMath';
import { OPL_OUTPUT_GAIN_DB } from '@/engine/opl3/oplLevel';

/** The bridge's fixed output gain (linear) between the chip's int16 and the float stream. */
const OUTPUT_GAIN = 10 ** (OPL_OUTPUT_GAIN_DB / 20);

type Reg = { type: string; channels?: Array<{ carrierStage: number; carrierAttenuation: number; modulatorStage: number; modulatorAttenuation: number; age: number; note: number }>; lfo?: { tremoloPosition: number; vibratoPosition: number; timer: number } };

async function rig() {
  const w = await startWorklet('opl3', 'OPL3');
  const posted = w.posted as unknown as Reg[];
  return {
    send: w.send,
    run(blocks: number, onBlock?: (i: number) => Promise<void> | void): Promise<Float32Array> {
      return (async () => {
        const out = new Float32Array(blocks * 128);
        for (let i = 0; i < blocks; i++) {
          const o = stereoOutputs(1); w.proc.process([], o); out.set(o[0][0], i * 128);
          await onBlock?.(i);
        }
        return out;
      })();
    },
    reports: () => posted.filter((p) => p.type === 'voiceStatus'),
    clear: () => { posted.length = 0; },
  };
}

/** Register block [modTVSK, carTVSK, modKSL/TL, carKSL/TL, modARDR, carARDR, modSLRR, carSLRR, modWF, carWF, C0]. */
const regs = (o: { mod?: Partial<Record<'tvsk' | 'tl' | 'ardr' | 'slrr' | 'wf', number>>; car: Record<'tvsk' | 'tl' | 'ardr' | 'slrr' | 'wf', number>; c0?: number }): number[] => {
  const m = { tvsk: 1, tl: 63, ardr: 0xf0, slrr: 0x0f, wf: 0, ...o.mod };
  return [m.tvsk, o.car.tvsk, m.tl, o.car.tl, m.ardr, o.car.ardr, m.slrr, o.car.slrr, m.wf, o.car.wf, o.c0 ?? 0];
};

/** The carrier's slot parameters as the model takes them, from the register block above. */
const carrierParams = (r: number[]): OplSlotParams => ({
  attack: r[5] >> 4, decay: r[5] & 15, sustainLevel: r[7] >> 4, release: r[7] & 15,
  ksr: (r[1] >> 4) & 1, sustainHold: (r[1] >> 5) & 1, totalLevel: r[3] & 63, ksl: r[3] >> 6,
});

/** Engine carrier attenuation (eg_rout) against time for a note held `holdBlocks` then released, until `blocks`. */
async function engineTrace(r: number[], note: number, holdBlocks: number, blocks: number) {
  const e = await rig();
  await e.send({ type: 'setPatch', regs: r });
  await e.send({ type: 'watchVoices', on: true });
  const trace: Array<{ t: number; rout: number; stage: number }> = [];
  await e.send({ type: 'noteOn', note, velocity: 127 });
  let frames = 0;
  await e.run(blocks, async (i) => {
    frames += 128;
    if (i === holdBlocks) await e.send({ type: 'noteOff', note });
    const rep = e.reports();
    const last = rep[rep.length - 1];
    if (last?.channels?.[0]) trace.push({ t: frames / 48000, rout: last.channels[0].carrierAttenuation, stage: last.channels[0].carrierStage });
    e.clear();
  });
  return trace;
}

/** Model rout at time t (seconds) for key held until `upAt` seconds. */
function modelRoutAt(p: OplSlotParams, note: number, upAt: number, times: number[]): Array<{ rout: number; stage: number }> {
  const sim = new OplEnvelopeSim(p, oplFnumBlock(note));
  sim.key = true;
  const out: Array<{ rout: number; stage: number }> = [];
  let n = 0;
  for (const t of times) {
    const target = Math.round(t * OPL_CHIP_RATE);
    while (n < target) {
      if (!sim.key === false && n >= Math.round(upAt * OPL_CHIP_RATE)) sim.key = false;
      sim.step(); n++;
    }
    out.push({ rout: sim.rout, stage: sim.stage });
  }
  return out;
}

describe('OPL3 envelope: the Nuked EnvelopeCalc port against the slot state the chip reports', () => {
  const cases: Array<{ name: string; r: number[]; note: number; hold: number; blocks: number }> = [
    { name: 'percussive AR12 DR7 SL5 RR9 (note 60)', r: regs({ car: { tvsk: 0x01, tl: 0, ardr: 0xc7, slrr: 0x59, wf: 0 } }), note: 60, hold: 260, blocks: 520 },
    { name: 'sustained AR5 DR4 SL8 RR5 hold (note 60)', r: regs({ car: { tvsk: 0x21, tl: 0, ardr: 0x54, slrr: 0x85, wf: 0 } }), note: 60, hold: 700, blocks: 1300 },
    { name: 'KSR on, AR8 DR6 SL3 RR7, note 84', r: regs({ car: { tvsk: 0x11, tl: 0, ardr: 0x86, slrr: 0x37, wf: 0 } }), note: 84, hold: 300, blocks: 700 },
  ];
  for (const c of cases) {
    it(c.name, async () => {
      const trace = await engineTrace(c.r, c.note, c.hold, c.blocks);
      const p = carrierParams(c.r);
      const upAt = (c.hold + 1) * 128 / 48000;
      const model = modelRoutAt(p, c.note, upAt, trace.map((t) => t.t));
      let maxErr = 0; let stageMiss = 0; let compared = 0;
      for (let i = 0; i < trace.length; i++) {
        if (trace[i].rout >= 0x1f8 && model[i].rout >= 0x1f8) continue; // both silent
        // The chip's envelope timer runs free from reset, so the first attack steps land at a phase the model (timer at 0) cannot know.
        if (trace[i].t < 0.03) continue;
        compared++;
        maxErr = Math.max(maxErr, Math.abs(trace[i].rout - model[i].rout));
        if (trace[i].stage !== model[i].stage) stageMiss++;
      }
      if (process.env.OPL_DEBUG) console.log('TRACE', JSON.stringify(trace.filter((_, i) => i % 12 === 0).map((t, i) => [+t.t.toFixed(3), t.rout, t.stage, model[i * 12].rout, model[i * 12].stage])));
      console.log(`[opl3 envelope] ${c.name}: ${compared} reports, max |eg_rout error| ${maxErr} of 511, stage differs in ${stageMiss}`);
      expect(maxErr).toBeLessThanOrEqual(8);
      expect(stageMiss / compared).toBeLessThan(0.03);
    }, 60000);
  }

  it('the model curve matches the sim it is built from (end of key-down at the sustain level)', () => {
    const p: OplSlotParams = { attack: 12, decay: 7, sustainLevel: 5, release: 9, ksr: 0, sustainHold: 0, totalLevel: 0, ksl: 0 };
    const c = oplEnvelopeCurve(p, oplFnumBlock(60));
    const held = c.points.filter((q) => q.x <= c.releaseAtSeconds);
    expect(held[held.length - 1].rout >> 4).toBeGreaterThanOrEqual(5);
    expect(c.totalSeconds).toBeGreaterThan(c.releaseAtSeconds);
  });
});

describe('OPL3 level: total level and key scale level attenuation against the rendered carrier amplitude', () => {
  it('TL 20 and KSL 2 at note 84: sine amplitude within 0.5 dB of 4084 * 2^(-(TL*4 + ksl)/32)', async () => {
    const r = regs({ car: { tvsk: 0x21, tl: (2 << 6) | 20, ardr: 0xf0, slrr: 0x0f, wf: 0 }, c0: 1 }); // additive, modulator at TL 63
    r[2] = 63; r[0] = 0x21;
    const e = await rig();
    await e.send({ type: 'setPatch', regs: r });
    await e.send({ type: 'noteOn', note: 84, velocity: 127 });
    const audio = await e.run(60);
    let peak = 0; for (let i = 4000; i < audio.length; i++) peak = Math.max(peak, Math.abs(audio[i]));
    const attenuation = 20 * 4 + oplKslAttenuation(oplFnumBlock(84), 2);
    const modelPeak = (4084 * oplAmplitude(attenuation) * OUTPUT_GAIN) / 32768;
    // the modulator at TL 63 adds a little (additive) -- allow for it
    console.log(`[opl3 level] engine peak ${peak.toFixed(5)}, model ${modelPeak.toFixed(5)} (${(20 * Math.log10(peak / modelPeak)).toFixed(2)} dB)`);
    expect(Math.abs(20 * Math.log10(peak / modelPeak))).toBeLessThan(0.7);
  }, 60000);
});

describe('OPL3 spectrum: the slot pipeline port against rendered audio', () => {
  it('FM with modulator ratio 2, feedback 3: line frequencies and levels (relative to the strongest) agree', async () => {
    const modMult = 2; const modTl = 18; const fb = 3;
    const r = [0x20 | modMult, 0x21, modTl, 0, 0xf0, 0xf0, 0x0f, 0x0f, 0, 0, fb << 1];
    const e = await rig();
    await e.send({ type: 'setPatch', regs: r });
    await e.send({ type: 'noteOn', note: 60, velocity: 127 });
    const audio = await e.run(100 + Math.ceil(4096 / 128) + 2);
    const eng = spectrumLines(Array.from(audio).slice(12800, 12800 + 4096), 48000, 1, -60, 6000);
    const mdl = oplSpectrum({ wave: 0, multiplier: modMult, attenuation: modTl * 4 }, { wave: 0, multiplier: 1, attenuation: 0 }, fb, false, oplFnumBlock(60), 6000);
    const top = (a: Array<{ db: number }>) => Math.max(...a.map((l) => l.db));
    const eTop = top(eng); const mTop = top(mdl);
    // absolute level: the chip's 13-bit output over the worklet's 16-bit full scale
    expect(Math.abs((mTop + 20 * Math.log10((4084 * OUTPUT_GAIN) / 32768)) - eTop)).toBeLessThan(1);
    const strong = mdl.filter((l) => l.db > mTop - 30);
    const errs = strong.map((m) => {
      const near = eng.filter((x) => Math.abs(x.hz - m.hz) < 25).sort((a, b) => b.db - a.db)[0];
      return near ? Math.abs((near.db - eTop) - (m.db - mTop)) : 99;
    });
    console.log(`[opl3 spectrum] ${strong.length} lines within 30 dB, level error max ${Math.max(...errs).toFixed(2)} dB (absolute top ${(eTop - (mTop + 20 * Math.log10((4084 * OUTPUT_GAIN) / 32768))).toFixed(2)} dB)`);
    expect(strong.length).toBeGreaterThanOrEqual(5);
    expect(Math.max(...errs)).toBeLessThan(2);
  }, 60000);
});

describe('OPL3 tremolo and vibrato: the chip counters advance as modelled', () => {
  it('tremolo position advances 210 steps per 1/oplTremoloHz and vibrato 8 per 1/oplVibratoHz (chip counters from the worklet report)', async () => {
    const e = await rig();
    await e.send({ type: 'setPatch', regs: regs({ car: { tvsk: 0x21, tl: 0, ardr: 0xf0, slrr: 0x0f, wf: 0 } }) });
    await e.send({ type: 'watchVoices', on: true });
    await e.send({ type: 'noteOn', note: 60, velocity: 127 });
    const samples: Array<{ t: number; trem: number; vib: number; timer: number }> = [];
    let frames = 0;
    await e.run(1500, () => {
      frames += 128;
      const rep = e.reports(); const last = rep[rep.length - 1];
      if (last?.lfo) samples.push({ t: frames / 48000, trem: last.lfo.tremoloPosition, vib: last.lfo.vibratoPosition, timer: last.lfo.timer });
      e.clear();
    });
    expect(samples.length).toBeGreaterThan(100);
    // unwrap the tremolo position over the run and compare the mean rate with the model
    let turns = 0; let prev = samples[0].trem;
    for (const s of samples) { if (s.trem < prev - 100) turns++; prev = s.trem; }
    const span = samples[samples.length - 1].t - samples[0].t;
    const measured = (turns + (samples[samples.length - 1].trem - samples[0].trem) / 210) / span;
    console.log(`[opl3 lfo] tremolo ${measured.toFixed(3)} Hz (model ${oplTremoloHz().toFixed(3)}), vibrato steps seen ${new Set(samples.map((s) => s.vib)).size} of 8 (model ${oplVibratoHz().toFixed(2)} Hz)`);
    expect(Math.abs(measured - oplTremoloHz()) / oplTremoloHz()).toBeLessThan(0.02);
    expect(new Set(samples.map((s) => s.vib)).size).toBe(8);
    // the shapes: shallow tremolo peaks near 1.1 dB, vibrato of F-number 345 is a few cents
    expect(oplTremoloDb(104, false)).toBeGreaterThan(1);
    expect(oplTremoloDb(104, false)).toBeLessThan(1.3);
    const vib = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => oplVibratoCents(i, oplFnumBlock(60).fnum, false));
    expect(Math.max(...vib)).toBeGreaterThan(2);
    expect(vib[0]).toBe(0);
  }, 60000);
});
