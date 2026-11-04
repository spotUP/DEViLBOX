/**
 * tonyWilliamsEdits.ts - write grid cell edits back into the Tony Williams stream bytes.
 * Same-length edits only: a note byte, a D0 instrument byte, a duration/volume/envelope command
 * byte, or the one operand byte of transpose/slide/vibrato/envelope-params. Growth needs the
 * list/record relocation pass (not built); an edit that cannot be written comes back as a warning.
 */
import type { Pattern } from '@/types';
import { buildTwGrid, TW_NOTE_BASE, type TwSource } from './tonyWilliamsGrid';
import { TW_FX } from './tonyWilliamsEffectGlyphs';
import type { TwWalk } from './tonyWilliamsWalk';

type Cell = Record<string, number | undefined>;

function cellOf(patterns: Pattern[], s: TwSource): Cell | null {
  return (patterns[s.pattern]?.channels[s.channel]?.rows[s.row] as unknown as Cell | undefined) ?? null;
}

export function applyTwGridEdits(original: Uint8Array, walk: TwWalk, patterns: Pattern[]): { data: Uint8Array; warnings: string[] } {
  const data = new Uint8Array(original);
  const warnings: string[] = [];
  const grid = buildTwGrid(walk);
  if (patterns.length !== grid.patterns.length) {
    warnings.push(`Pattern count ${patterns.length} differs from the stream (${grid.patterns.length}); structure edits are not written.`);
    return { data, warnings };
  }
  const written = new Map<number, number>();
  const put = (offset: number, value: number, what: string): void => {
    const prev = written.get(offset);
    if (prev !== undefined && prev !== value) warnings.push(`${what}: shared block byte at 0x${offset.toString(16)} edited two ways; last edit kept.`);
    written.set(offset, value);
    data[offset] = value;
  };
  for (const s of grid.sources) {
    const cell = cellOf(patterns, s);
    if (!cell) continue;
    const where = `pattern ${s.pattern} channel ${s.channel + 1} row ${s.row}`;
    if (s.kind === 'note') {
      const n = cell.note ?? 0;
      if (n === s.value) continue;
      const byte = n - TW_NOTE_BASE - s.transpose;
      if (n < TW_NOTE_BASE || byte < 0 || byte > 0x3f) warnings.push(`${where}: note ${n} is outside the player's table.`);
      else put(s.offset, byte, where);
    } else if (s.kind === 'instrument') {
      const i = cell.instrument ?? 0;
      if (i === s.value) continue;
      if (i < 1 || i > 16) warnings.push(`${where}: instrument ${i} is outside 1..16.`);
      else put(s.offset, 0xd0 + i - 1, where);
    } else {
      const key = SLOT[s.slot];
      if (!key) continue;
      if ((cell[key[0]] ?? 0) !== s.effTyp) { warnings.push(`${where}: effect changed kind; not written.`); continue; }
      const v = (cell[key[1]] ?? 0) & 0xff;
      if (v === s.value) continue;
      switch (s.effTyp) {
        case TW_FX.duration:
          if (v < 1 || v > 32) warnings.push(`${where}: duration ${v} is outside 1..32.`); else put(s.offset, 0xdf + v, where);
          break;
        case TW_FX.volume: put(s.offset, 0xb0 | (v & 15), where); break;
        case TW_FX.envelope: put(s.offset, 0xc0 | (v & 15), where); break;
        case TW_FX.arpeggio: put(s.offset, 0xa0 | (v & 15), where); break;
        case TW_FX.envelopeParams: case TW_FX.transpose: case TW_FX.slide: case TW_FX.vibrato:
          put(s.offset + 1, v, where); break;
        default: warnings.push(`${where}: this command is shown read-only.`);
      }
    }
  }
  return { data, warnings };
}

const SLOT: Array<[string, string]> = [['effTyp', 'eff'], ['effTyp2', 'eff2'], ['effTyp3', 'eff3'], ['effTyp4', 'eff4'], ['effTyp5', 'eff5']];
