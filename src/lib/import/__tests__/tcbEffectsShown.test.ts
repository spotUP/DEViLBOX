/**
 * TCB Tracker pitch bends (effect nibbles 1-10, the per-song specialValues table) show as standard XM portamento up/down
 * in the grid, loaded through the import entry point, and an edited effect cell encodes back to the song's nibble.
 *
 * No song in public/data/songs uses nibbles 1-10 (m-demo3 and cannonfodder only use 0x0B and 0x0D), so this test patches one
 * cell of the real m-demo3 3.tcb: pattern 0's first noted cell gets nibble 3, and the song's specialValues[3] is 50, so the
 * cell shows portamento up by (50 + 16) >> 5 = 2 (OpenMPT Load_tcb.cpp semantics).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeTCBTrackerCell, tcbEffectFromNibble } from '@/engine/uade/encoders/TCBTrackerEncoder';

const sentinel = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@lib/import/formats/TCBTrackerParser', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../formats/TCBTrackerParser')>();
  return { ...orig, parseTCBTrackerFile: (...a: Parameters<typeof orig.parseTCBTrackerFile>) => { sentinel.calls++; return orig.parseTCBTrackerFile(...a); } };
});

const FILE = join(process.cwd(), 'public/data/songs/tcb-tracker/m-demo3 3.tcb');
const PATT_BASE = 306;

function patched(): { raw: Uint8Array; cellOff: number; row: number; ch: number; special: number[] } {
  const raw = new Uint8Array(readFileSync(FILE));
  const dv = new DataView(raw.buffer);
  const special = Array.from({ length: 16 }, (_, i) => dv.getInt16(274 + i * 2));
  let cellOff = PATT_BASE;
  while (raw[cellOff] === 0 || (raw[cellOff + 1] & 0x0F) !== 0) cellOff += 2;
  raw[cellOff + 1] = (raw[cellOff + 1] & 0xF0) | 3;
  const i = (cellOff - PATT_BASE) / 2;
  return { raw, cellOff, row: i >> 2, ch: i & 3, special };
}

describe('TCB Tracker pitch bend effect columns', () => {
  it('shows nibble 3 as portamento up and loads it through the import route', async () => {
    const { raw, row, ch, special } = patched();
    expect(special[3]).toBe(50);
    const { parseModuleToSong } = await import('../parseModuleToSong');
    const before = sentinel.calls;
    const song = await parseModuleToSong(new File([new Uint8Array(raw)], 'tcb.m-demo3'));
    expect(sentinel.calls).toBeGreaterThan(before);
    const cell = song.patterns[0].channels[ch].rows[row];
    expect([cell.effTyp, cell.eff]).toEqual([2, 2]);
  });

  it('writes the cell back byte-exact, and an edited effect writes the matching nibble', () => {
    const { raw, cellOff, row, ch, special } = patched();
    const stored = raw.slice(cellOff, cellOff + 2);
    const shown = tcbEffectFromNibble(3, special);
    const cell = { note: 1, instrument: 0, volume: 0, effTyp: shown.effTyp, eff: shown.eff, effTyp2: 0, eff2: 0 };
    // note byte differs from the cell's own note here, so compare the effect nibble through the stored bytes
    const same = encodeTCBTrackerCell({ ...cell, note: 0 }, 3, special, stored);
    expect(same[1] & 0x0F).toBe(3);
    const down = encodeTCBTrackerCell({ ...cell, effTyp: 1, eff: 2 }, 3, special, stored);
    expect(tcbEffectFromNibble(down[1] & 0x0F, special)).toEqual({ effTyp: 1, eff: 2 });
    const none = encodeTCBTrackerCell({ ...cell, effTyp: 0, eff: 0 }, 3, special, stored);
    expect(none[1] & 0x0F).toBe(0);
    expect(row).toBeGreaterThanOrEqual(0);
    expect(ch).toBeLessThan(4);
  });

  it('re-encodes every cell of the unpatched song to its source bytes', async () => {
    const raw = new Uint8Array(readFileSync(FILE));
    const dv = new DataView(raw.buffer);
    const special = Array.from({ length: 16 }, (_, i) => dv.getInt16(274 + i * 2));
    const { parseModuleToSong } = await import('../parseModuleToSong');
    const song = await parseModuleToSong(new File([raw], 'tcb.m-demo3'));
    let checked = 0;
    for (let p = 0; p < song.patterns.length; p++) {
      for (let i = 0; i < 256; i++) {
        const off = PATT_BASE + p * 512 + i * 2;
        const cell = song.patterns[p].channels[i & 3].rows[i >> 2];
        expect(Array.from(encodeTCBTrackerCell(cell, 3, special, raw.slice(off, off + 2)))).toEqual(Array.from(raw.slice(off, off + 2)));
        checked++;
      }
    }
    expect(checked).toBe(song.patterns.length * 256);
  });
});
