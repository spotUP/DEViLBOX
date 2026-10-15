/**
 * The FM marker mappings (pure): a voice report in, an x on the curve out. Round-trips through the real models: a report
 * taken from a point of the modelled curve must land back on that point.
 */
import { describe, it, expect } from 'vitest';
import {
  dx7EnvelopeRun, egParams, lfoWaveform, pitchEgRun, readOp, EG_SILENT,
} from '../dx7CurveModels';
import { oplEnvelopeCurve, oplFnumBlock, type OplSlotParams } from '../opl3CurveModels';
import {
  dx7EnvelopeMarkerX, dx7LfoMarkerX, dx7PitchEgMarkerX, dx7ScalingMarkerX, levelToX, loudestCarrier, oplEnvelopeMarkerX, oplTremoloMarkerX, oplVibratoMarkerX,
} from '../fmCurveMarkers';
import { markedVoice, reportOp, type Dx7VoiceReport } from '@/engine/dx7/dx7VoiceStatus';
import { newestOplVoice, type OplVoiceReport } from '@/engine/opl3/oplVoiceStatus';

const op1 = (rates: number[], levels: number[], ol = 99) => {
  const v = new Uint8Array(156);
  v.set(rates, 105); v.set(levels, 109); v[105 + 16] = ol; v[105 + 8] = 39;
  return readOp((n) => v[n], 1);
};
const voice = (partial: Partial<Dx7VoiceReport>): Dx7VoiceReport => ({
  voice: 0, note: 60, ops: Array.from({ length: 6 }, () => ({ level: EG_SILENT, stage: 3, released: true })), pitch: 7595, elapsedSeconds: 0, releasedSeconds: null, ...partial,
});

describe('levelToX', () => {
  const pts = [{ x: 0, stage: 0, level: 4000 }, { x: 1, stage: 0, level: 2000 }, { x: 2, stage: 1, level: 2000 }, { x: 4, stage: 1, level: 1000 }];
  it('interpolates inside a stage', () => { expect(levelToX(pts, 0, 3000)).toBeCloseTo(0.5, 6); expect(levelToX(pts, 1, 1500)).toBeCloseTo(3, 6); });
  it('only looks at the reported stage', () => { expect(levelToX(pts, 1, 4000)).toBe(2); });
  it('has no x for a stage the curve lacks', () => { expect(levelToX(pts, 2, 100)).toBeNull(); });
});

describe('DX7 envelope marker', () => {
  const run = dx7EnvelopeRun(egParams(op1([80, 60, 50, 55], [99, 85, 70, 0]), 60));
  it('a report taken from any recorded point of the curve lands on that point', () => {
    let checked = 0;
    for (const p of run.points) {
      if (p.stage === 2 || (p.stage === 3 && p.level >= EG_SILENT - 64)) continue; // the held part is drawn flat and the silent tail has no marker
      const x = dx7EnvelopeMarkerX(run, { level: p.level, stage: p.stage, released: p.stage === 3 });
      expect(x, `stage ${p.stage} level ${p.level}`).not.toBeNull();
      expect(Math.abs(x! - p.x)).toBeLessThan(Math.max(0.03, run.totalSeconds * 0.04));
      checked++;
    }
    expect(checked).toBeGreaterThan(8);
  });
  it('held at the segment-3 level it sits in the middle of the hold', () => {
    const plateau = run.points.find((p) => p.stage === 2 && p.x >= run.sustainReachedSeconds - 1e-9)!;
    const x = dx7EnvelopeMarkerX(run, { level: plateau.level, stage: 2, released: false })!;
    expect(x).toBeCloseTo((run.sustainReachedSeconds + run.releaseAtSeconds) / 2, 6);
    expect(x).toBeGreaterThan(run.sustainReachedSeconds);
  });
  it('a released silent operator has no marker', () => { expect(dx7EnvelopeMarkerX(run, { level: EG_SILENT, stage: 3, released: true })).toBeNull(); });
  it('moves forward through release', () => {
    const rel = run.points.filter((p) => p.stage === 3 && p.level < EG_SILENT - 200);
    const a = dx7EnvelopeMarkerX(run, { level: rel[0].level, stage: 3, released: true })!;
    const b = dx7EnvelopeMarkerX(run, { level: rel[rel.length - 1].level, stage: 3, released: true })!;
    expect(b).toBeGreaterThan(a);
  });
});

describe('DX7 voice selection', () => {
  it('follows the newest held voice, else the newest releasing one', () => {
    const a = voice({ voice: 1, elapsedSeconds: 2 });
    const b = voice({ voice: 2, elapsedSeconds: 0.5 });
    const c = voice({ voice: 3, elapsedSeconds: 3, releasedSeconds: 0.2 });
    expect(markedVoice([a, b, c])?.voice).toBe(2);
    expect(markedVoice([c, voice({ voice: 4, elapsedSeconds: 4, releasedSeconds: 1 })])?.voice).toBe(3);
    expect(markedVoice([])).toBeNull();
  });
  it('maps OP numbers onto the EGS operator order (OP1 is last) and picks the loudest carrier', () => {
    const v = voice({});
    v.ops[5] = { level: 800, stage: 2, released: false }; // OP1
    v.ops[3] = { level: 300, stage: 2, released: false }; // OP3
    expect(reportOp(v, 1)?.level).toBe(800);
    expect(loudestCarrier(v, [1, 3])?.opNum).toBe(3);
  });
});

describe('DX7 pitch EG marker', () => {
  const curve = pitchEgRun([70, 60, 50, 60], [20, 90, 50, 30], 0.4);
  it('tracks elapsed time while held, clamps at the end of the hold', () => {
    expect(dx7PitchEgMarkerX(curve, voice({ elapsedSeconds: 0.3 }))).toBeCloseTo(0.3, 9);
    expect(dx7PitchEgMarkerX(curve, voice({ elapsedSeconds: 99 }))).toBeCloseTo(curve[4].x, 9);
  });
  it('after key-up moves on from the end of the hold, clamped at the end of segment 4', () => {
    expect(dx7PitchEgMarkerX(curve, voice({ elapsedSeconds: 5, releasedSeconds: 0.1 }))).toBeCloseTo(curve[4].x + 0.1, 9);
    expect(dx7PitchEgMarkerX(curve, voice({ elapsedSeconds: 50, releasedSeconds: 50 }))).toBeCloseTo(curve[5].x, 9);
  });
});

describe('DX7 LFO marker (phase from the modulation register and its slope)', () => {
  const peak = 16129;
  it.each([[0, 'triangle'], [4, 'sine'], [1, 'saw down'], [2, 'saw up']])('wave %i (%s): recovers the phase of a rising and a falling sample', (wave) => {
    for (const p of [0.1, 0.3, 0.45, 0.6, 0.8, 0.95]) {
      const reg = (ph: number) => peak * (2 * lfoWaveform(wave, ph) - 1);
      const prev = reg(p - 0.005);
      const x = dx7LfoMarkerX(wave, reg(p), prev, peak);
      expect(x, `wave ${wave} phase ${p}`).not.toBeNull();
      expect(Math.abs(x! - p)).toBeLessThan(0.03);
    }
  });
  it('no marker when the LFO does not move the pitch', () => { expect(dx7LfoMarkerX(0, 0, 0, 0)).toBeNull(); });
});

describe('DX7 scaling marker', () => {
  it('is the voice note, absent when unknown', () => { expect(dx7ScalingMarkerX(voice({ note: 72 }))).toBe(72); expect(dx7ScalingMarkerX(voice({ note: -1 }))).toBeNull(); });
});

describe('OPL3 envelope marker', () => {
  const p: OplSlotParams = { attack: 9, decay: 6, sustainLevel: 4, release: 6, ksr: 0, sustainHold: 0, totalLevel: 0, ksl: 0 };
  const curve = oplEnvelopeCurve(p, oplFnumBlock(60));
  it('a chip report taken from a point of the curve lands on that point', () => {
    let checked = 0;
    for (const q of curve.points) {
      if (q.stage === 2 || q.rout >= 0x1f8) continue;
      const x = oplEnvelopeMarkerX(curve, q.stage, q.rout);
      expect(x, `stage ${q.stage} rout ${q.rout}`).not.toBeNull();
      expect(Math.abs(x! - q.x)).toBeLessThan(Math.max(0.03, curve.totalSeconds * 0.04));
      checked++;
    }
    expect(checked).toBeGreaterThan(8);
  });
  it('a silent released slot has no marker', () => { expect(oplEnvelopeMarkerX(curve, 3, 0x1ff)).toBeNull(); });
  it('a held sustain (sustain-hold bit) sits in the middle of the hold', () => {
    const hold = oplEnvelopeCurve({ ...p, sustainHold: 1 }, oplFnumBlock(60));
    const plateau = hold.points.filter((q) => q.stage === 2 && q.x <= hold.releaseAtSeconds);
    expect(plateau.length).toBeGreaterThan(1);
    const x = oplEnvelopeMarkerX(hold, 2, plateau[0].rout)!;
    expect(x).toBeCloseTo((plateau[0].x + hold.releaseAtSeconds) / 2, 6);
  });
});

describe('OPL3 voice selection and LFO markers', () => {
  const ch = (channel: number, age: number, carrierStage: 0 | 1 | 2 | 3, carrierAttenuation: number): OplVoiceReport =>
    ({ channel, note: 60, modulatorStage: 2, carrierStage, modulatorAttenuation: 0, carrierAttenuation, age });
  it('the newest voice that is not silent wins', () => {
    expect(newestOplVoice([ch(0, 1, 2, 10), ch(1, 5, 2, 10), ch(2, 9, 3, 0x1ff)])?.channel).toBe(1);
    expect(newestOplVoice([ch(2, 9, 3, 0x1ff)])).toBeNull();
  });
  it('tremolo and vibrato markers are fractions of their periods', () => {
    expect(oplTremoloMarkerX(105)).toBeCloseTo(0.5, 9);
    expect(oplVibratoMarkerX(2, 512)).toBeCloseTo((2 + 0.5) / 8, 9);
  });
});
