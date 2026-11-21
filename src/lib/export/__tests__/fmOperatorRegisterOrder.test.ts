/**
 * Furnace stores FM operators in register order: op[i] is written at opOffs[i]
 * (fmshared_OPM.h 0x00/0x08/0x10/0x18, fmshared_OPN.h 0x00/0x04/0x08/0x0c).
 * orderedOps {0,2,1,3} only renumbers operators for effects, so exporters that
 * emit raw chip register writes must place op[i] at slot i (no [0,2,1,3] remap).
 */
import { describe, it, expect } from 'vitest';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { exportToMDX } from '../MDXExporter';
import { exportToPMD } from '../PMDExporter';

function song(): TrackerSong {
  return {
    name: 'op order', numChannels: 1, initialBPM: 125, initialSpeed: 6,
    songPositions: [0], songLength: 1,
    patterns: [{ id: 'p0', name: 'p0', length: 1, channels: [{ rows: [{ note: 49, instrument: 1, volume: 0, effTyp: 0, eff: 0 }] }] }],
    instruments: [{ id: 1, name: 'fm', type: 'synth', furnace: { algorithm: 0, feedback: 0, operators: [1, 2, 3, 4].map((mult) => ({ mult })) } }],
  } as unknown as TrackerSong;
}

/** Value written by register-write command `cmd` to register `reg`, or -1. */
function written(bytes: Uint8Array, cmd: number, reg: number): number {
  for (let i = 0; i + 2 < bytes.length; i++) if (bytes[i] === cmd && bytes[i + 1] === reg) return bytes[i + 2];
  return -1;
}

describe('FM exporters write Furnace operators in register order', () => {
  it('MDX: op[i] DT1/MUL lands at 0x40 + i*8', () => {
    const out = exportToMDX(song());
    expect([0, 1, 2, 3].map((i) => written(out, 0xfe, 0x40 + i * 8) & 0x0f)).toEqual([1, 2, 3, 4]);
  });
  it('PMD: op[i] DT/ML lands at 0x30 + i*4', () => {
    const out = new Uint8Array(exportToPMD(song()));
    expect([0, 1, 2, 3].map((i) => written(out, 0xfe, 0x30 + i * 4) & 0x0f)).toEqual([1, 2, 3, 4]);
  });
});
