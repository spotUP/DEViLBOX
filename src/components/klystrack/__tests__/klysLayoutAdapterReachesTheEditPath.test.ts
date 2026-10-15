/**
 * KIE-4.1 (klystrack instrument editor): the controls are a generated synth layout. Every KLYS_FIELDS field and
 * every user-visible flag bit appears in it exactly once, and every key the panel can report reaches exactly one
 * editKlysField / toggleKlysBit call; nothing else writes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { KlysNativeInstrument } from '@/types/tracker';

const calls = vi.hoisted(() => ({ fields: [] as Array<[number, string, number]>, bits: [] as Array<[number, string, number]> }));
vi.mock('../klysInstrumentEdit', () => ({
  editKlysField: (i: number, key: string, v: number) => calls.fields.push([i, key, v]),
  toggleKlysBit: (i: number, word: string, bit: number) => calls.bits.push([i, word, bit]),
}));

import { applyKlysLayoutChange, klysLayoutValues } from '../klysLayoutAdapter';
import { KLYSTRACK_LAYOUT, buildKlystrackLayout, klysFlagKey } from '@/constants/synthLayouts/klystrack';
import { getSynthLayout } from '@/constants/synthLayouts';
import { KLYS_FIELD_KEYS, KLYS_FLAG_BITS, type KlysFlagWord } from '@/engine/klystrack/klysInstrumentFields';

const inst = (): KlysNativeInstrument => ({
  name: 'Lead', adsr: { a: 1, d: 2, s: 3, r: 4 }, flags: 0x1 | 0x8, cydflags: 0x20 | 0x200, baseNote: 48, finetune: -3, slideSpeed: 0,
  pw: 0, volume: 128, progPeriod: 2, vibratoSpeed: 0, vibratoDepth: 0, pwmSpeed: 0, pwmDepth: 0, cutoff: 100, resonance: 0,
  flttype: 1, ymEnvShape: 0, buzzOffset: 0x0201, fxBus: 3, vibShape: 0, vibDelay: 0, pwmShape: 0, lfsrType: 0, wavetableEntry: 5,
  ringMod: 255, syncSource: 255,
  fm: { flags: 0x1000, modulation: 0, feedback: 0, wave: 0, harmonic: 0x12, adsr: { a: 0, d: 0, s: 0, r: 0 }, attackStart: 0 },
  program: [],
});
const words = Object.keys(KLYS_FLAG_BITS) as KlysFlagWord[];
const allBits = words.flatMap((w) => KLYS_FLAG_BITS[w].map((d) => ({ word: w, bit: d.bit })));

beforeEach(() => { calls.fields.length = 0; calls.bits.length = 0; });

describe('klystrack layout', () => {
  it('is registered for KlysSynth and holds every field and every flag bit exactly once', () => {
    expect(getSynthLayout('KlysSynth')).toBe(KLYSTRACK_LAYOUT);
    const keys = KLYSTRACK_LAYOUT.sections!.flatMap((s) => s.controls.map((c) => c.key));
    expect(new Set(keys).size, 'no key twice').toBe(keys.length);
    expect(keys.length).toBe(KLYS_FIELD_KEYS.length + allBits.length);
    for (const k of KLYS_FIELD_KEYS) expect(keys, `field ${k}`).toContain(k);
    for (const { word, bit } of allBits) expect(keys, `${word} bit ${bit}`).toContain(klysFlagKey(word, bit));
  });

  it('names the wavetable entries in both entry selects and marks empty slots', () => {
    const layout = buildKlystrackLayout([{ name: 'Bass' }, { name: '' }]);
    const selects = layout.sections!.flatMap((s) => s.controls).filter((c) => c.key === 'wavetableEntry' || c.key === 'fmWave');
    expect(selects.length).toBe(2);
    for (const s of selects) {
      if (s.type !== 'select') throw new Error('entry control is not a select');
      expect(s.options.slice(0, 3).map((o) => o.label)).toEqual(['00 Bass', '01 (empty)', '02 (empty)']);
      expect(s.options.length).toBe(128);
    }
  });
});

describe('klystrack layout adapter', () => {
  it('reads every field and bit of the instrument', () => {
    const v = klysLayoutValues(inst());
    expect(v.cutoff).toBe(100);
    expect(v.buzzSemitones, 'packed byte').toBe(2);
    expect(v.filterType, 'select values are strings').toBe('1');
    expect(v[klysFlagKey('flags', 8)]).toBe(true);
    expect(v[klysFlagKey('flags', 2)]).toBe(false);
    expect(v[klysFlagKey('fmFlags', 4096)]).toBe(true);
    expect(Object.keys(v).length).toBe(KLYS_FIELD_KEYS.length + allBits.length);
  });

  it('every changed key reaches exactly one edit call, and an unchanged record none', () => {
    const before = klysLayoutValues(inst());
    applyKlysLayoutChange(1, before, { ...before });
    expect(calls.fields.length + calls.bits.length).toBe(0);

    for (const key of KLYS_FIELD_KEYS) {
      calls.fields.length = 0; calls.bits.length = 0;
      const was = before[key];
      const next = typeof was === 'string' ? String(Number(was) + 1) : Number(was) + 1;
      applyKlysLayoutChange(1, before, { ...before, [key]: next });
      expect(calls.bits, `${key} toggles no bit`).toEqual([]);
      expect(calls.fields, `field ${key}`).toEqual([[1, key, Number(next)]]);
    }
    for (const { word, bit } of allBits) {
      calls.fields.length = 0; calls.bits.length = 0;
      const key = klysFlagKey(word, bit);
      applyKlysLayoutChange(1, before, { ...before, [key]: !before[key] });
      expect(calls.fields, `${key} edits no field`).toEqual([]);
      expect(calls.bits, `bit ${key}`).toEqual([[1, word, bit]]);
    }
  });

  it('sends two changed keys as two calls and ignores keys it does not know', () => {
    const before = klysLayoutValues(inst());
    applyKlysLayoutChange(0, before, { ...before, cutoff: 200, [klysFlagKey('cydflags', 512)]: false, mystery: 4 });
    expect(calls.fields).toEqual([[0, 'cutoff', 200]]);
    expect(calls.bits).toEqual([[0, 'cydflags', 512]]);
  });
});
