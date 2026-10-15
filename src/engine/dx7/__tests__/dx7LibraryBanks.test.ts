/**
 * dx7LibraryBanks.test.ts - every shipped DX7 library bank parses and is attributed.
 *
 * Reads public/data/sysex/dx7 straight from disk (the same bytes the app fetches) and
 * runs them through the parser the editor uses (inspectDX7Sysex).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  inspectDX7Sysex, vcedRangeErrors, toBulkSysex, dx7Checksum, VCED_MAX,
} from '../dx7sysex';
import { parseDX7LibraryValue, dx7LibraryValue, type DX7LibraryManifest } from '../dx7Library';

const DIR = resolve(__dirname, '../../../../public/data/sysex/dx7');
const ATTRIBUTION = resolve(DIR, '../ATTRIBUTION.md');
const manifest = JSON.parse(readFileSync(resolve(DIR, 'manifest.json'), 'utf8')) as DX7LibraryManifest;

describe('DX7 library manifest', () => {
  it('lists exactly the .syx files that ship, each with author, source URL and licence', () => {
    const onDisk = readdirSync(DIR).filter(f => f.endsWith('.syx')).sort();
    expect(manifest.banks.map(b => b.file).sort()).toEqual(onDisk);
    expect(onDisk.length).toBeGreaterThan(0);
    const credits = readFileSync(ATTRIBUTION, 'utf8');
    for (const b of manifest.banks) {
      expect(b.author.trim(), b.file).not.toBe('');
      expect(b.licence.trim(), b.file).not.toBe('');
      expect(b.source, b.file).toMatch(/^https:\/\//);
      expect(b.voiceCount).toBe(32);
      expect(credits, b.file).toContain(b.file);
    }
  });
});

describe('every shipped DX7 bank', () => {
  for (const bank of manifest.banks) {
    it(`${bank.file}: valid checksum, 32 printable voices, parameters in VCED range`, () => {
      const found = inspectDX7Sysex(new Uint8Array(readFileSync(resolve(DIR, bank.file))));
      expect(found.kind).toBe('bulk32');
      expect(found.checksumOk).toBe(true);
      expect(found.repairs).toBe(0);
      expect(found.patches).toHaveLength(32);
      found.patches.forEach((p, i) => {
        for (let c = 145; c < 155; c++) {
          expect(p.data[c] >= 32 && p.data[c] < 127, `${bank.file} voice ${i + 1} name byte ${c - 145}`).toBe(true);
        }
        expect(vcedRangeErrors(p.data), `${bank.file} voice ${i + 1} ${p.name}`).toEqual([]);
        expect(p.name, `${bank.file} voice ${i + 1}`).toBe(bank.voices[i]);
      });
    });
  }
});

describe('DX7 sysex import (user-supplied files)', () => {
  const bank = new Uint8Array(readFileSync(resolve(DIR, manifest.banks[0].file)));

  it('repairs a bulk dump with a wrong checksum instead of loading it as is', () => {
    const bad = bank.slice();
    bad[4102] = (bad[4102] + 1) & 0x7F;
    const found = inspectDX7Sysex(bad);
    expect(found.checksumOk).toBe(false);
    expect(found.bulkSysex![4102]).toBe(dx7Checksum(bank.subarray(6, 4102)));
  });

  it('clamps an out-of-range parameter and a non-printable name byte on import', () => {
    const dirty = bank.slice();
    dirty[6 + 16] = 127; // operator 6 fine frequency (packed byte 16), legal max 99
    dirty[6 + 118] = 0x07; // first name character
    dirty[4102] = dx7Checksum(dirty.subarray(6, 4102));
    const found = inspectDX7Sysex(dirty);
    expect(found.repairs).toBe(2);
    expect(found.patches[0].data[19]).toBe(99);
    expect(found.patches[0].data[145]).toBe(32);
    const again = inspectDX7Sysex(found.bulkSysex!);
    expect(again.repairs).toBe(0);
    expect(again.checksumOk).toBe(true);
  });

  it('frames a raw 4096-byte bank and accepts it', () => {
    const found = inspectDX7Sysex(bank.subarray(6, 4102));
    expect(found.kind).toBe('bulk32');
    expect(found.bulkSysex).toEqual(toBulkSysex(bank.subarray(6, 4102)));
  });

  it('reads a framed single-voice dump and rejects other sizes', () => {
    const vced = inspectDX7Sysex(bank).patches[3].data.subarray(0, 155);
    const single = new Uint8Array(163);
    single.set([0xF0, 0x43, 0x00, 0x00, 0x01, 0x1B], 0);
    single.set(vced, 6);
    single[161] = dx7Checksum(vced);
    single[162] = 0xF7;
    const found = inspectDX7Sysex(single);
    expect(found.kind).toBe('single');
    expect(found.checksumOk).toBe(true);
    expect(found.vced).toEqual(vced);
    expect(inspectDX7Sysex(new Uint8Array(100)).kind).toBe('unknown');
    expect(VCED_MAX).toHaveLength(155);
  });

  it('round-trips library select values', () => {
    expect(parseDX7LibraryValue(dx7LibraryValue('a-01.syx', 7))).toEqual({ file: 'a-01.syx', index: 7 });
    expect(parseDX7LibraryValue('a-01.syx#32')).toBeNull();
    expect(parseDX7LibraryValue('nonsense')).toBeNull();
  });
});
