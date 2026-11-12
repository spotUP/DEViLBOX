/**
 * Paul Robotham (.dat): the grid is read from the four voice command streams (paulRobothamGrid.ts).
 * Unedited export is byte-identical to the module; one edited note moves exactly that note's byte.
 * Fixture: public/data/songs/paul-robotham/dawnpatrol-sad.dat (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parsePaulRobothamFile } from '../PaulRobothamParser';
import { exportPaulRobotham } from '@/lib/export/PaulRobothamExporter';
import { encodeVariableBlock } from '@/engine/uade/UADEPatternEncoder';
import { PR_NOTE_BASE } from '../paulRobothamGrid';

const FIXTURE = join(process.cwd(), 'public/data/songs/paul-robotham/dawnpatrol-sad.dat');

function load() {
  const b = readFileSync(FIXTURE);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  return { raw: new Uint8Array(ab), song: parsePaulRobothamFile(ab, 'dawnpatrol-sad.dat') };
}

describe('Paul Robotham command-stream grid', () => {
  it('re-encodes every voice stream byte-exact and exports the module unchanged', async () => {
    const { raw, song } = load();
    const l = song.uadeVariableLayout!;
    expect(l.formatId).toBe('paulRobotham');
    expect(l.filePatternAddrs).toEqual([0x554, 0x5a1, 0x676, 0x73b]);
    l.filePatternAddrs.forEach((addr, fp) => {
      const re = encodeVariableBlock(l, fp, l.blockRows![fp], fp);
      expect(Array.from(re)).toEqual(Array.from(raw.subarray(addr, addr + l.filePatternSizes[fp])));
    });
    expect(l.filePatternSizes.reduce((a, b) => a + b, 0)).toBe(raw.length - 0x554);
    const out = await exportPaulRobotham(song);
    expect(out.warnings).toEqual([]);
    expect(Array.from(out.data)).toEqual(Array.from(raw));
  });

  it('one changed note changes only that note byte', async () => {
    const { raw, song } = load();
    const n = song.uadeVariableLayout!.noteBytes!.find(x => raw[x.offset] > 1 && raw[x.offset] < 58)!;
    expect(n).toBeTruthy();
    const cell = song.patterns[n.pattern].channels[n.channel].rows[n.row];
    expect(cell.note).toBe(n.note);
    cell.note = n.note + 2;
    const out = await exportPaulRobotham(song);
    expect(out.warnings).toEqual([]);
    const diff: number[] = [];
    out.data.forEach((v, i) => { if (v !== raw[i]) diff.push(i); });
    expect(diff).toEqual([n.offset]);
    expect(out.data[n.offset]).toBe(n.note + 2 - PR_NOTE_BASE);
  });
});
