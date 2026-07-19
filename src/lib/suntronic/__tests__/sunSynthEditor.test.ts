/**
 * Regression: SunTronic synth-instrument editor support.
 *
 * Pins the three pure pieces that make SunTronic synth records first-class in
 * the UI — descriptive naming, the signed-byte draw helper, and the config-shape
 * normalization the live editor depends on — plus the parser wiring that renames
 * the decoded synths. Each assertion fails on revert of its fix.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { sunSynthTypeLabel, sunSynthDescriptiveName } from '../synthName';
import { writeSignedByte } from '../waveDraw';
import { resolveSunTronicConfig } from '../config';
import type { SunTronicConfig } from '@typedefs/sunTronicInstrument';
import { parseSunTronicV13Score } from '@/lib/import/formats/SunTronicV13';
import { parseSunTronicFile } from '@/lib/import/formats/SunTronicParser';

const CORPUS = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes');

function baseCfg(overrides: Partial<SunTronicConfig> = {}): SunTronicConfig {
  return {
    sunTronic: 1, synthType: 0, waveWordLen: 32,
    arpLen: 1, arpLoop: 0, volEnvLen: 1, volEnvLoop: 0,
    freqEnvLen: 1, freqEnvLoop: 0, freqEnvSpeed: 0,
    wave1: [], wave2: [], arpTable: [0], volEnv: [64], vibDepth: [0],
    ...overrides,
  };
}

describe('SunTronic synth naming', () => {
  it('labels each synthesis type', () => {
    expect(sunSynthTypeLabel(0)).toBe('Morph');
    expect(sunSynthTypeLabel(1)).toBe('Pulse-Noise');
    expect(sunSynthTypeLabel(2)).toBe('Splice');
    expect(sunSynthTypeLabel(3)).toBe('Resample');
    expect(sunSynthTypeLabel(9)).toBe('Smooth');
  });

  it('is 1-based and never the bare "Synth N" fallback', () => {
    expect(sunSynthDescriptiveName(baseCfg({ synthType: 2 }), 6)).toBe('Splice 7');
  });

  it('flags a moving arp table but not a static one', () => {
    const still = baseCfg({ arpLen: 4, arpTable: [0, 0, 0, 0] });
    const moving = baseCfg({ arpLen: 4, arpTable: [0, 12, 7, 0] });
    expect(sunSynthDescriptiveName(still, 0)).toBe('Morph 1');
    expect(sunSynthDescriptiveName(moving, 0)).toBe('Morph Arp 1');
  });

  it('flags a non-zero vibrato-depth table', () => {
    const cfg = baseCfg({ freqEnvLen: 3, vibDepth: [0, 4, 8] });
    expect(sunSynthDescriptiveName(cfg, 2)).toBe('Morph Vibrato 3');
  });
});

describe('SunTronic signed-byte draw helper', () => {
  it('maps the top of the canvas to positive, bottom to negative', () => {
    const t = [0, 0, 0, 0];
    const top = writeSignedByte(t, 50, 0, 200, 100, -1); // x-> idx 1, y=0 top
    expect(top.idx).toBe(1);
    expect(top.next[1]).toBeGreaterThan(100);
    const bottom = writeSignedByte(t, 150, 100, 200, 100, -1); // idx 3, y=100 bottom
    expect(bottom.next[3]).toBeLessThan(-100);
  });

  it('does not mutate the input table', () => {
    const t = [1, 2, 3, 4];
    writeSignedByte(t, 100, 10, 200, 100, -1);
    expect(t).toEqual([1, 2, 3, 4]);
  });

  it('clamps to the signed-8 range', () => {
    const t = [0];
    const r = writeSignedByte(t, 0, -1000, 100, 100, -1);
    expect(r.next[0]).toBeLessThanOrEqual(127);
    expect(r.next[0]).toBeGreaterThanOrEqual(-128);
  });

  it('interpolates the gap on a fast drag', () => {
    const t = new Array<number>(8).fill(0);
    // First write at idx 0 (top), then jump to idx 7 (bottom) — the cells
    // between must be filled, not left at 0.
    const first = writeSignedByte(t, 0, 0, 200, 100, -1);
    const second = writeSignedByte(first.next, 199, 100, 200, 100, first.idx);
    expect(second.idx).toBe(7);
    expect(second.next[3]).not.toBe(0); // an in-between cell got infill
  });
});

describe('resolveSunTronicConfig — live-editor shape fix', () => {
  it('accepts a bare SunTronicConfig (marker sunTronic === 1)', () => {
    const cfg = baseCfg({ synthType: 3 });
    expect(resolveSunTronicConfig(cfg)).toBe(cfg);
  });

  it('unwraps a full InstrumentConfig (.sunTronic is the config object)', () => {
    const cfg = baseCfg();
    expect(resolveSunTronicConfig({ sunTronic: cfg })).toBe(cfg);
  });

  it('returns null for a non-SunTronic config instead of the number 1', () => {
    expect(resolveSunTronicConfig({ synthType: 'Synth' })).toBeNull();
    expect(resolveSunTronicConfig(null)).toBeNull();
  });
});

describe('SunTronic parser names decoded synths descriptively', () => {
  it('mule.src synth instruments are named from their config, not "Synth N"', () => {
    const bytes = new Uint8Array(readFileSync(join(CORPUS, 'mule.src')));
    const score = parseSunTronicV13Score(bytes);
    expect(score.synthInstrumentCount).toBeGreaterThan(0);

    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const song = parseSunTronicFile(ab, 'mule.src');
    const synths = song.instruments.filter((i) => i.synthType === 'SunTronicSynth');
    expect(synths.length).toBeGreaterThan(0);

    // Every decoded synth carries a descriptive type-derived name; none is left
    // as the bare "Synth N" fallback (the pre-fix behaviour).
    const TYPE_LABELS = /^(Morph|Pulse-Noise|Splice|Resample|Smooth)\b/;
    synths.forEach((inst) => {
      expect(inst.name).not.toMatch(/^Synth \d+$/);
      expect(inst.name).toMatch(TYPE_LABELS);
    });
  });
});
