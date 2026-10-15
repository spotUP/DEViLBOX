/**
 * The OPL operator level convention: config level 63 = loud, the chip's TL register 0 = loud, crossed only through
 * engine/opl3/oplLevel.ts. Importers (RAD) and exporters used the register value as the config level, so a song's
 * loud carriers (TL 0) became level 0 = silent in the synth.
 */
import { describe, it, expect } from 'vitest';
import { levelToTotalLevel, totalLevelToLevel } from '../oplLevel';
import { parseAdPlugFile } from '@/lib/import/formats/AdPlugParser';
import { exportToRAD } from '@/lib/export/AdPlugExporter';
import { DEFAULT_OPL3 } from '@/types/instrument/defaults';
import { SynthRegistry } from '@/engine/registry/SynthRegistry';
import { OPL3_LAYOUT } from '@/constants/synthLayouts/opl3';
import '@/engine/registry/builtin/opl3';

/** A RAD v1 file with the given 11-byte instruments (numbered from 1) and one empty pattern. */
function radFile(patches: number[][]): ArrayBuffer {
  const bytes: number[] = [...'RAD by REALiTY!!'].map((c) => c.charCodeAt(0));
  bytes.push(0x10, 0x00, 6); // version 1.0, flags, speed
  patches.forEach((p, i) => bytes.push(i + 1, ...p));
  bytes.push(0);             // end of instruments
  bytes.push(0, 0xff);       // order: pattern 0, end
  bytes.push(2, 0);          // pattern 0 offset (right after this table)
  bytes.push(0x80 | 0, 0);   // empty pattern rows
  return new Uint8Array(bytes).buffer;
}

describe('OPL level convention', () => {
  it('level and total level are each other\'s inverse over the whole range', () => {
    for (let v = 0; v <= 63; v++) expect(totalLevelToLevel(levelToTotalLevel(v))).toBe(v);
    expect(levelToTotalLevel(63)).toBe(0);
    expect(levelToTotalLevel(0)).toBe(63);
  });

  it('a RAD instrument with a loud carrier (TL 0) imports as level 63, not 0 (silent)', () => {
    const song = parseAdPlugFile(radFile([[0x01, 0x11, 0x4f, 0x00, 0xf1, 0xd2, 0x53, 0x74, 0, 0, 0x06]]), 'x.rad');
    const o = song.instruments[0].opl3!;
    expect(o.op2Level).toBe(63);
    expect(o.op1Level).toBe(63 - 0x0f);
  });

  it('export writes the chip\'s total level again: the exported instrument bytes carry the TL of the register file', () => {
    const regs = [0x01, 0x11, 0x4f, 0x10, 0xf1, 0xd2, 0x53, 0x74, 0, 0, 0x06];
    const song = parseAdPlugFile(radFile([regs]), 'x.rad');
    const out = new Uint8Array(exportToRAD(song));
    // 16-byte signature, version, null-terminated description, speed, instrument count, then [number, 11 register bytes]
    const at = 17 + new TextEncoder().encode(song.name).length + 1 + 1 + 1 + 1;
    expect(out[at - 1]).toBe(1);
    expect(out[at + 2] & 0x3f).toBe(regs[2] & 0x3f);
    expect(out[at + 3] & 0x3f).toBe(regs[3] & 0x3f);
  });

  it('the registry parameter defaults and the layout knob defaults are the config defaults (one patch, three tables)', () => {
    const reg = SynthRegistry.get('OPL3')!;
    for (const p of reg.parameters ?? []) {
      expect(p.default, `registry default of ${p.key}`).toBe((DEFAULT_OPL3 as Record<string, number>)[p.key]);
    }
    for (const tab of OPL3_LAYOUT.tabs ?? []) for (const sec of tab.sections) for (const c of sec.controls) {
      if (c.type === 'knob') expect(c.defaultValue ?? 0, `layout default of ${c.key}`).toBe((DEFAULT_OPL3 as Record<string, number>)[c.key] ?? 0);
    }
  });
});
