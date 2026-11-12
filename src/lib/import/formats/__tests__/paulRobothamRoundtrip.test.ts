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
import { PR_NOTE_BASE, buildPRGrid } from '../paulRobothamGrid';
import { PR_FX } from '../commandStreamEffectGlyphs';

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

  it('shows the stream commands in the effect columns (dawnpatrol-sad)', () => {
    const { raw, song } = load();
    const cell = (p: number, c: number, r: number) => song.patterns[p].channels[c].rows[r];
    // voice 1 frame 0: tempo 160, pitch envelope 0, flags 0, vibrato 0, volume 13 (the five columns)
    const c0 = cell(0, 0, 0);
    expect([[c0.effTyp, c0.eff], [c0.effTyp2, c0.eff2], [c0.effTyp3, c0.eff3], [c0.effTyp4, c0.eff4], [c0.effTyp5, c0.eff5]]).toEqual([
      [PR_FX.tempo, 160], [PR_FX.pitchEnvelope, 0], [PR_FX.flags, 0], [PR_FX.vibrato, 0], [PR_FX.volume, 13],
    ]);
    // a note drawn with the command 24 operand 4 that ran just before it
    const n = cell(0, 0, 45);
    expect(n.note).toBe(28);
    expect([n.effTyp, n.eff]).toEqual([PR_FX.command24, 4]);
    // every effect-bearing command is drawn or counted as dropped (dawnpatrol-sad: 156 commands, three on a full frame)
    const grid = buildPRGrid(raw, 'x', 10)!;
    expect(grid.droppedEffects).toBe(3);
    const shown = song.patterns.reduce((n2, p) => n2 + p.channels.reduce((n3, ch) => n3 + ch.rows.reduce((n4, r) =>
      n4 + [r.effTyp, r.effTyp2, r.effTyp3, r.effTyp4, r.effTyp5].filter(t => (t ?? 0) >= PR_FX.loopCount).length, 0), 0), 0);
    expect(shown + grid.droppedEffects).toBe(156);
  });
});
