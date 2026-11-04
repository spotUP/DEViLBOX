/**
 * JayTrax instrument record: read(write(x)) == x for every field, only the field's own bytes change, and an
 * unedited module is byte-identical. Offsets are written out here from jxs_engine.cpp (instrument record), not
 * taken from jxsInstrument.ts, so a wrong offset in the module fails.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  JXS_RANGES, jxsLayout, readJxsArpeggio, readJxsInstrument, writeJxsInstrument, type JxsScalars, type JxsSlot,
} from '../jxsInstrument';

const dir = path.resolve(__dirname, '../../../../../public/data/songs/formats');
const load = (f: string): Uint8Array => new Uint8Array(fs.readFileSync(path.join(dir, f)));

const SCALAR_AT: Record<keyof JxsScalars, [number, 2 | 4]> = {
  wave: [34, 2], wavelen: [36, 2], volume: [38, 2], volwave: [40, 2], volspeed: [42, 2], volloop: [44, 2],
  finetune: [46, 2], pitchwave: [48, 2], pitchspeed: [50, 2], pitchloop: [52, 2], pitchdelay: [54, 2], arp: [56, 2],
  panwave: [74, 2], panspeed: [76, 2], panloop: [78, 2],
  sharing: [494, 2], loops: [496, 2], bidi: [498, 2], start: [500, 4], loop: [504, 4], end: [508, 4],
};
const SAMPLE_ONLY = ['sharing', 'loops', 'bidi', 'start', 'loop', 'end'];
const SLOT_AT: Record<keyof JxsSlot, [number, 1 | 4]> = {
  dest: [0, 4], src1: [4, 4], src2: [8, 4], osc: [12, 4], var1: [16, 4], var2: [20, 4], speed: [24, 4],
  oscspeed: [28, 4], type: [32, 4], oscflag: [36, 1], reset: [37, 1],
};

const diff = (a: Uint8Array, b: Uint8Array): number[] => {
  const out: number[] = [];
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) out.push(k);
  return out;
};

describe('JXS instrument round trip', () => {
  for (const file of ['popcorn.jxs', 'dreamer.jxs']) {
    const bytes = load(file);
    const lay = jxsLayout(bytes)!;
    const INDEX = 1;
    const q = lay.instrumentOffset[INDEX];

    it(`${file}: an empty edit returns the same bytes`, () => {
      expect(writeJxsInstrument(bytes, INDEX, {})).toBe(bytes);
      const cur = readJxsInstrument(bytes, INDEX)!;
      expect(writeJxsInstrument(bytes, INDEX, { volume: cur.volume, slots: { 0: { type: cur.slots[0].type } } })).toBe(bytes);
    });

    for (const key of Object.keys(SCALAR_AT) as (keyof JxsScalars)[]) {
      if (SAMPLE_ONLY.includes(key) && lay.version !== 3457) continue;
      it(`${file}: ${key} round-trips and touches only its bytes`, () => {
        const [min, max] = JXS_RANGES[key];
        const cur = readJxsInstrument(bytes, INDEX)![key];
        const next = cur === Math.min(max, min + 1) ? min : Math.min(max, min + 1);
        const out = writeJxsInstrument(bytes, INDEX, { [key]: next });
        expect(readJxsInstrument(out, INDEX)![key]).toBe(next);
        const [off, size] = SCALAR_AT[key];
        for (const at of diff(bytes, out)) expect(at >= q + off && at < q + off + size).toBe(true);
      });
    }

    it(`${file}: sample-only scalars are ignored for version 3456`, () => {
      if (lay.version === 3457) return;
      expect(writeJxsInstrument(bytes, INDEX, { loops: 1, start: 5 })).toBe(bytes);
    });

    for (let slot = 0; slot < 4; slot++) {
      for (const key of Object.keys(SLOT_AT) as (keyof JxsSlot)[]) {
        it(`${file}: slot ${slot} ${key} round-trips`, () => {
          const cur = readJxsInstrument(bytes, INDEX)!.slots[slot][key];
          const next = key === 'type' ? (cur === 5 ? 6 : 5) : key === 'oscflag' || key === 'reset' ? (cur ? 0 : 1) : cur === 3 ? 4 : 3;
          const out = writeJxsInstrument(bytes, INDEX, { slots: { [slot]: { [key]: next } } });
          expect(readJxsInstrument(out, INDEX)!.slots[slot][key]).toBe(next);
          const [off, size] = SLOT_AT[key];
          const base = q + 92 + 40 * slot + off;
          for (const at of diff(bytes, out)) expect(at >= base && at < base + size).toBe(true);
        });
      }
    }

    it(`${file}: name, restore flags, waves and arpeggio round-trip`, () => {
      let out = writeJxsInstrument(bytes, INDEX, { name: 'Edited Voice' });
      expect(readJxsInstrument(out, INDEX)!.name).toBe('Edited Voice');
      for (const at of diff(bytes, out)) expect(at >= q + 2 && at < q + 34).toBe(true);

      const flag = readJxsInstrument(bytes, INDEX)!.resetwave[7];
      out = writeJxsInstrument(bytes, INDEX, { resetwave: { 7: flag ? 0 : 1 } });
      expect(readJxsInstrument(out, INDEX)!.resetwave[7]).toBe(flag ? 0 : 1);
      expect(diff(bytes, out)).toEqual([q + 58 + 7]);

      const wave = Int16Array.from({ length: 256 }, (_, k) => (k * 257) - 32768);
      out = writeJxsInstrument(bytes, INDEX, { waves: { 3: wave } });
      expect(Array.from(readJxsInstrument(out, INDEX)!.waves.slice(3 * 256, 4 * 256))).toEqual(Array.from(wave));
      for (const at of diff(bytes, out)) expect(at >= q + 520 + 3 * 512 && at < q + 520 + 4 * 512).toBe(true);

      out = writeJxsInstrument(bytes, INDEX, { arpeggio: { 17: -5, 18: 12 } });
      const arp = readJxsArpeggio(out)!;
      expect([arp[17], arp[18]]).toEqual([-5, 12]);
      for (const at of diff(bytes, out)) expect(at >= lay.arpeggioOffset + 17 && at <= lay.arpeggioOffset + 18).toBe(true);
    });
  }
});
