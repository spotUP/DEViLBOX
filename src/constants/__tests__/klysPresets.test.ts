/**
 * The klystrack preset bank is data the editor writes straight into an instrument: every value must be one the
 * editor itself could have produced (inside KLYS_FIELDS' ranges), every program a legal 32-word program, and the
 * select's list must be generated from the bank (FACTORY_PRESETS).
 */
import { describe, it, expect } from 'vitest';
import { KLYS_PRESETS, KLYS_FACTORY_PRESETS, klysPresetById, klysPresetId, type KlysPresetCategory } from '@constants/klysPresets';
import { FACTORY_PRESETS } from '@constants/factoryPresets';
import { KLYS_FIELDS, KLYS_FIELD_KEYS, KLYS_PROGRAM_LENGTH, KLYS_NAME_LENGTH } from '@/engine/klystrack/klysInstrumentFields';
import { klysCommandOf, klysStepWord } from '@/engine/klystrack/klysProgramCommands';

const REQUIRED: KlysPresetCategory[] = [
  'Kick', 'Snare', 'Hi-Hat', 'Clap', 'Tom', 'Percussion', 'Sub Bass', 'Pluck Bass', 'Acid Bass', 'Buzz Bass',
  'Pulse Lead', 'Saw Lead', 'FM Lead', 'Vibrato Lead', 'Buzz Lead', 'Arpeggio', 'Pad', 'FM Bell', 'Pluck', 'Riser',
];

describe('the klystrack preset bank', () => {
  it('holds at least 40 presets across every required category, with unique plain names', () => {
    expect(KLYS_PRESETS.length).toBeGreaterThanOrEqual(40);
    for (const c of REQUIRED) expect(KLYS_PRESETS.filter((p) => p.category === c).length, c).toBeGreaterThanOrEqual(1);
    const names = KLYS_PRESETS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) {
      expect(n.length, n).toBeLessThanOrEqual(KLYS_NAME_LENGTH);
      expect(n, n).toMatch(/^[A-Za-z][A-Za-z -]*$/);
    }
  });

  it('writes only values the editor accepts: every field inside its range, every program 32 legal words', () => {
    for (const p of KLYS_PRESETS) {
      const inst = p.instrument;
      expect(inst.name).toBe(p.name);
      for (const key of KLYS_FIELD_KEYS) {
        const f = KLYS_FIELDS[key];
        expect(f.get(inst), `${p.name} ${key}`).toBe(f.clamp(f.get(inst)));
      }
      expect(inst.program.length, p.name).toBe(KLYS_PROGRAM_LENGTH);
      for (const word of inst.program) {
        expect(word, p.name).toBeGreaterThanOrEqual(0);
        expect(word, p.name).toBeLessThanOrEqual(0xFFFF);
        if (word !== 0xFFFE) expect(klysCommandOf(word), `${p.name} word ${word.toString(16)}`).not.toBeNull();
      }
      // The program only runs when its period is set.
      const hasProgram = inst.program.some((w) => w !== 0xFFFE);
      if (hasProgram) expect(inst.progPeriod, `${p.name} has a program but progPeriod 0 never runs it`).toBeGreaterThan(0);
      // Nothing outside the bits the editor shows (the gate and YM envelope bits belong to the engine).
      expect(inst.cydflags & (32 | 2048), p.name).toBe(0);
    }
  });

  it('generates the editor select list from the bank (one KlysSynth entry per preset, resolvable by id)', () => {
    expect(KLYS_FACTORY_PRESETS.length).toBe(KLYS_PRESETS.length);
    const inSelect = FACTORY_PRESETS.filter((p) => p.synthType === 'KlysSynth');
    expect(inSelect.length).toBe(KLYS_PRESETS.length);
    for (const entry of inSelect) {
      const preset = klysPresetById(entry.klysPresetId as string);
      expect(preset, entry.name).toBeDefined();
      expect(preset!.name).toBe(entry.name);
      expect(klysPresetId(preset!)).toBe(entry.klysPresetId);
    }
  });
});

describe('klysStepWord', () => {
  it('builds the words the program view reads back, clamps arguments, chains, and refuses what the engine ignores', () => {
    expect(klysStepWord('PrgEnd')).toBe(0xFFFF);
    expect(klysStepWord('Goto', 3)).toBe(0xFF03);
    expect(klysStepWord('PortDn', 0x40)).toBe(0x0240);
    expect(klysStepWord('PortDn', 999)).toBe(0x02FF);
    expect(klysStepWord('Cutoff', 12, true)).toBe(0xA90C);
    expect(klysCommandOf(klysStepWord('PortDn', 7, true))?.mnemonic).toBe('PortDn');
    expect(() => klysStepWord('NoSuchStep')).toThrow();
    expect(() => klysStepWord('Goto', 1, true)).toThrow();
    expect(() => klysStepWord('CutFine', 100, true)).toThrow();
    expect(klysStepWord('CutFine', 100)).toBe(0x6064);
  });
});
