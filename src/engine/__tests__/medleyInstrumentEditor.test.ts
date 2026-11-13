/**
 * Medley instrument editor write-back (combat.mso).
 *
 * The editor writes instrument fields into the song's module bytes (useFormatStore.nuadeFileData) at the offsets the
 * medley replayer reads (third-party/nuade/players/medley/mdl_module.c). These tests check the offsets against the
 * replayer's own reading of the record (the keyboard voice runs the vendored C on the edited bytes): an edit made
 * through the editor's store path changes what the replayer plays.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NuadeHeadless } from '../nuade/nuadeHeadless';
import { cstr, heapBytes } from '../nuade/nuadeModule';
import { medleyInstrumentList, medleyInstrumentType, medleySoundingForGridNote, medleyTables } from '@/lib/import/formats/medleyGrid';
import {
  readMedleyInstrument, medleyInstrumentWrite, medleyModulatorWrite, medleyWaveList, medleyEnvelopeCurve,
  medleyModulatorCurve, applyMedleyWrite, MEDLEY_INSTRUMENT_FIELD,
} from '@/lib/import/formats/medleyInstrument';
import { applyMedleyInstrumentWrites, medleyEditableModule } from '@/engine/medley/medleyInstrumentEdit';
import { useFormatStore } from '@/stores/useFormatStore';

const ROOT = join(__dirname, '../../..');
const FILE = 'combat.mso';
const original = new Uint8Array(readFileSync(join(ROOT, 'public/data/songs/medley', FILE)));
const RATE = 48000;

async function keyRms(bytes: Uint8Array, instrument: number): Promise<number> {
  const nu = await NuadeHeadless.create(RATE);
  const m = nu.m;
  expect(m._nw_key_open(heapBytes(m, bytes), bytes.length, cstr(m, FILE), cstr(m, 'medley'), 0)).toBe(0);
  const sounding = medleySoundingForGridNote(bytes, medleyTables(bytes)!, instrument, 25);
  expect(m._nw_key_on(instrument, sounding!)).toBe(1);
  const block = 1024;
  const ptr = m._malloc(block * 2 * 4);
  let sum = 0, count = 0;
  for (let done = 0; done < RATE / 4; done += block) {
    const n = m._nw_key_render(ptr, block);
    for (const v of m.HEAPF32.subarray(ptr >> 2, (ptr >> 2) + n * 2)) { sum += v * v; count++; }
  }
  m._free(ptr);
  m._nw_key_close();
  return Math.sqrt(sum / count);
}

describe('Medley instrument editor (combat.mso)', () => {
  const list = medleyInstrumentList(original);
  const dorgan = list.find((i) => i.name === 'dorgan')!.number;

  beforeEach(() => {
    useFormatStore.setState({ nuadePlayerId: 'medley', nuadeFileData: original.slice().buffer });
  });

  it('reads the record the replayer reads', () => {
    const tables = medleyTables(original)!;
    const names = { 0: 'Sample', 1: 'Looped', 2: 'Synth', 3: 'OneShot' } as Record<number, string>;
    for (const { number, name } of list) {
      const ins = readMedleyInstrument(original, number)!;
      expect(ins.name).toBe(name);
      expect(names[ins.type]).toBe(medleyInstrumentType(original, tables, number));
      expect(ins.modulators).toHaveLength(4);
      expect(ins.waves).toHaveLength(8);
    }
    const waves = medleyWaveList(original);
    expect(waves.length).toBeGreaterThan(20);
    for (const w of waves) {
      expect(w.length).toBeGreaterThan(0);
      expect(w.offset + 0x18 + w.length).toBeLessThanOrEqual(original.length);
    }
  });

  it('writes each field at its offset, words big-endian', () => {
    const buf = original.slice();
    const rec = readMedleyInstrument(buf, dorgan)!.offset;
    expect(applyMedleyWrite(buf, medleyInstrumentWrite(rec, 'attack', 0x1234))).toBe(true);
    expect([buf[rec + MEDLEY_INSTRUMENT_FIELD.attack], buf[rec + MEDLEY_INSTRUMENT_FIELD.attack + 1]]).toEqual([0x12, 0x34]);
    expect(applyMedleyWrite(buf, medleyInstrumentWrite(rec, 'transpose', -3 & 0xff))).toBe(true);
    expect(applyMedleyWrite(buf, medleyModulatorWrite(rec, 2, 'rise', 77))).toBe(true);
    expect(applyMedleyWrite(buf, medleyModulatorWrite(rec, 2, 'invert', true))).toBe(true);
    const ins = readMedleyInstrument(buf, dorgan)!;
    expect(ins.attack).toBe(0x1234);
    expect(ins.transpose).toBe(-3);
    expect(ins.modulators[2].rise).toBe(77);
    expect(ins.modulators[2].invert).toBe(true);
    // Every other byte of the file stays.
    let diff = 0;
    for (let i = 0; i < buf.length; i++) if (buf[i] !== original[i]) diff++;
    expect(diff).toBe(5);
  });

  it('draws the envelope and modulators per tick', () => {
    const env = medleyEnvelopeCurve({ maxLevel: 1000, sustainLevel: 400, attack: 250, decay: 100, release: 200 }, 20);
    expect(env.slice(0, 4)).toEqual([250, 500, 750, 1000]);
    expect(env[19]).toBe(400);
    expect(env[env.length - 1]).toBe(0);
    const mod = medleyModulatorCurve({ kind: 2, gate: false, freeRunning: false, oneShot: false, invert: false, delay: 0,
      topStart: 0, halfStart: 0, level: 100, rise: 50, fall: 25 }, 8);
    expect(mod).toEqual([50, 100, 75, 50, 25, 0, 50, 100]);
  });

  it('an edit through the editor path changes what the keyboard voice plays', async () => {
    const before = await keyRms(medleyEditableModule()!, dorgan);
    expect(before).toBeGreaterThan(1e-4);
    const rec = readMedleyInstrument(medleyEditableModule()!, dorgan)!.offset;
    expect(applyMedleyInstrumentWrites([
      medleyInstrumentWrite(rec, 'maxLevel', 0), medleyInstrumentWrite(rec, 'sustainLevel', 0),
    ])).toBe(true);
    // The store's own bytes carry the edit (save, export and the next play read them).
    const stored = new Uint8Array(useFormatStore.getState().nuadeFileData!);
    expect(readMedleyInstrument(stored, dorgan)!.maxLevel).toBe(0);
    expect(await keyRms(stored, dorgan)).toBe(0);
    // The unedited song still sounds: the change is the edit, not the harness.
    expect(await keyRms(original, dorgan)).toBeCloseTo(before, 6);
  });

  it('writes nothing with no Medley song on nuade', () => {
    useFormatStore.setState({ nuadePlayerId: 'soundmon' });
    expect(medleyEditableModule()).toBeNull();
    expect(applyMedleyInstrumentWrites([{ offset: 100, size: 1, value: 1 }])).toBe(false);
  });
});
