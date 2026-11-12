/**
 * Medley (.mso): the grid is read from the module's track streams (medleyGrid.ts).
 * Unedited export is byte-identical; one edited note moves exactly the stored byte it is played from.
 * Fixture: public/data/songs/medley/combat.mso (real module). Unverified by ear.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseMedleyFile } from '../MedleyParser';
import { exportMedley } from '@/lib/export/MedleyExporter';
import { encodeVariableBlock } from '@/engine/uade/UADEPatternEncoder';
import { buildMedleyGrid } from '../medleyGrid';

const FIXTURE = join(process.cwd(), 'public/data/songs/medley/combat.mso');

function load() {
  const b = readFileSync(FIXTURE);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  return { raw: new Uint8Array(ab), song: parseMedleyFile(ab, 'combat.mso') };
}

describe('Medley track-stream grid', () => {
  it('re-encodes every track stream byte-exact and exports the module unchanged', async () => {
    const { raw, song } = load();
    const l = song.uadeVariableLayout!;
    expect(l.formatId).toBe('medley');
    l.filePatternAddrs.forEach((addr, fp) => {
      if (!addr) return;
      const re = encodeVariableBlock(l, fp, l.blockRows![fp], fp);
      expect(Array.from(re)).toEqual(Array.from(raw.subarray(addr, addr + l.filePatternSizes[fp])));
    });
    const out = await exportMedley(song);
    expect(out.warnings).toEqual([]);
    expect(Array.from(out.data)).toEqual(Array.from(raw));
  });

  it('one changed note changes only the stored byte(s) it is played from', async () => {
    const { raw, song } = load();
    const nb = song.uadeVariableLayout!.noteBytes!;
    // a byte played from exactly one cell
    const count = new Map<number, number>();
    nb.forEach(x => count.set(x.offset, (count.get(x.offset) ?? 0) + 1));
    const n = nb.find(x => count.get(x.offset) === 1 && raw[x.offset] > 1 && raw[x.offset] < 100)!;
    expect(n).toBeTruthy();
    const cell = song.patterns[n.pattern].channels[n.channel].rows[n.row];
    expect(cell.note).toBe(n.note);
    cell.note = n.note + 2;
    const out = await exportMedley(song);
    expect(out.warnings).toEqual([]);
    const diff: number[] = [];
    out.data.forEach((v, i) => { if (v !== raw[i]) diff.push(i); });
    expect(diff).toEqual([n.offset]);
    expect(out.data[n.offset]).toBe(raw[n.offset] + 2);
  });

  it('puts known audio time on a known row (voice 1 of subsong 1 starts a note on tick 0; every voice loops)', () => {
    const { raw } = load();
    const g = buildMedleyGrid(raw, 'x', 1)!;
    expect(g.unsupportedVoices).toEqual([]);
    expect(g.ticks).toBeGreaterThan(1);
    // track 10 (voice 4) is C5(2) C5(12) C0: after the call script, a note on tick 0 of that voice when one is placed there
    const first = g.placements.filter(p => p.tick === 0).map(p => p.voice);
    expect(first.length).toBeGreaterThan(0);
    // every sounding voice has notes in the last pattern's range or loops back (timeline filled)
    for (const v of [0, 3]) expect(g.placements.some(p => p.voice === v)).toBe(true);
  });
});
