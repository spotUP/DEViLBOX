/**
 * tonyWilliamsEdits.ts - write grid cell edits back into the Tony Williams stream bytes.
 * Same-length edits patch a note byte, a D0 instrument byte, a duration/volume/envelope command
 * byte, or the one operand byte of transpose/slide/vibrato/envelope-params. Clearing an effect cell
 * deletes its command and filling an empty effect slot inserts duration/volume/arpeggio/transpose
 * before the tick's first command; those length changes go through tonyWilliamsRelocate.ts, which
 * moves the tail and patches every pointer (or refuses, keeping only the same-length edits).
 * An edit that cannot be written comes back as a warning.
 */
import type { Pattern } from '@/types';
import { buildTwGrid, TW_NOTE_BASE, TW_ROWS_PER_PATTERN, type TwSource } from './tonyWilliamsGrid';
import { TW_FX } from './tonyWilliamsEffectGlyphs';
import { twEndsBlock, type TwWalk } from './tonyWilliamsWalk';
import { relocateTonyWilliams, type TwSplice } from './tonyWilliamsRelocate';

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
  const splices: TwSplice[] = [];
  const have = new Set<string>();
  for (const s of grid.sources) {
    have.add(`${s.pattern}/${s.channel}/${s.row}/${s.kind === 'effect' ? s.slot : -1}`);
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
      if ((cell[key[0]] ?? 0) === 0 && (cell[key[1]] ?? 0) === 0) {
        const cmd = walk.events.find((e) => e.cmd.offset === s.offset)?.cmd;
        if (!cmd || cmd.op < 0x80 || cmd.op === 0x85 || cmd.op === 0x86 || twEndsBlock(cmd.op)) warnings.push(`${where}: this command cannot be removed.`);
        else splices.push({ at: cmd.offset, remove: cmd.length, insert: new Uint8Array(0) });
        continue;
      }
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
  // filled effect slots with no stream command: insert before the first command of that voice at that tick
  const first = new Map<string, number>();
  for (const e of walk.events) { const k = `${e.channel}/${e.tick}`; if (!first.has(k)) first.set(k, e.cmd.offset); }
  const ins = new Map<number, number[]>();
  patterns.forEach((pat, p) => pat.channels.forEach((ch, c) => ch.rows.forEach((row, r) => {
    const cell = row as unknown as Cell;
    SLOT.forEach(([tk, vk], slot) => {
      const typ = cell[tk] ?? 0;
      if (typ === 0 || have.has(`${p}/${c}/${r}/${slot}`)) return;
      const v = (cell[vk] ?? 0) & 0xff;
      const where = `pattern ${p} channel ${c + 1} row ${r}`;
      const at = first.get(`${c}/${p * TW_ROWS_PER_PATTERN + r}`);
      let bytes: number[] | null = null;
      if (typ === TW_FX.duration) bytes = v >= 1 && v <= 32 ? [0xdf + v] : null;
      else if (typ === TW_FX.volume) bytes = [0xb0 | (v & 15)];
      else if (typ === TW_FX.arpeggio) bytes = [0xa0 | (v & 15)];
      else if (typ === TW_FX.transpose) bytes = [0x87, v];
      if (at === undefined || !bytes) { warnings.push(`${where}: this effect cannot be added here.`); return; }
      ins.set(at, [...(ins.get(at) ?? []), ...bytes]);
    });
  })));
  for (const [at, bytes] of ins) splices.push({ at, remove: 0, insert: Uint8Array.from(bytes) });

  if (splices.length === 0) return { data, warnings };
  const clash = splices.some((a, i) => splices.some((x, j) => i !== j && x.at >= a.at && x.at < a.at + Math.max(a.remove, 1)));
  if (clash) { warnings.push('Length-changing edits overlap; they were not written.'); return { data, warnings }; }
  const r = relocateTonyWilliams(data, splices);
  if ('error' in r) { warnings.push(`Length-changing edits were not written (${r.error}).`); return { data, warnings }; }
  return { data: r.data, warnings };
}

const SLOT: Array<[string, string]> = [['effTyp', 'eff'], ['effTyp2', 'eff2'], ['effTyp3', 'eff3'], ['effTyp4', 'eff4'], ['effTyp5', 'eff5']];
