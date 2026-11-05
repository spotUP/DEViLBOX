/**
 * soundFactoryEdits.ts - write edited Sound Factory effect cells back into the song bytes.
 *
 * The effect cells (soundFactoryEffects.ts) are decoded from the stream with the file offset of every operand
 * byte (parseSoundFactoryWithEffects). An edit that changes the VALUE of an operand is written over that byte:
 * same length, nothing moves (the style of the note write-back and of Ben Daglish's delay2 edit). An edit that
 * would change the stream length - an enable byte switched between zero and non-zero (the operand bytes that
 * follow appear or vanish), a new effect where the song has no opcode, a removed effect, a presence-only command
 * (one shot, looping) - is NOT re-packed: it is named in `warnings`, like the David Whittaker edit layer.
 */
import type { Pattern, TrackerCell } from '@/types';
import { parseSoundFactoryWithEffects } from './SoundFactoryParser';
import { SF_FX_ROW_OFFSET, SF_MAX_EFFECT_SLOTS } from './soundFactoryGrid';
import { SF_FX } from './soundFactoryEffectGlyphs';
import { sfOpcodeStartingWith, sfPresenceEffect, SF_OPCODE } from './soundFactoryEffects';

const ROWS_PER_PATTERN = 64; // the parser's pattern length

const SLOT_TYP = ['effTyp', 'effTyp2', 'effTyp3', 'effTyp4', 'effTyp5', 'effTyp6', 'effTyp7', 'effTyp8'] as const;
const SLOT_VAL = ['eff', 'eff2', 'eff3', 'eff4', 'eff5', 'eff6', 'eff7', 'eff8'] as const;

export interface SfEditResult {
  data: Uint8Array;
  /** Operand bytes written. */
  patched: number;
  /** Cells whose note, instrument or second note column changed (this layer does not write them). */
  otherEdits: number;
  warnings: string[];
}

/** True when changing operand `id` between `a` and `b` adds or removes the bytes that follow it. */
function changesLength(id: number, a: number, b: number): boolean {
  if ((a === 0) === (b === 0)) return false;
  if (id === SF_FX.release) return true;
  const op = sfOpcodeStartingWith(id);
  return op >= 0 && op !== SF_OPCODE.SetAdsr && op !== SF_OPCODE.SetVolume && op !== SF_OPCODE.SetFineTune
    && op !== SF_OPCODE.FadeOut && op !== SF_OPCODE.FadeIn && op !== SF_OPCODE.Led && op !== SF_OPCODE.SetTranspose;
}

function slotOf(cell: TrackerCell, k: number): { typ: number; val: number } {
  const c = cell as unknown as Record<string, number | undefined>;
  return { typ: c[SLOT_TYP[k]] ?? 0, val: c[SLOT_VAL[k]] ?? 0 };
}

const OTHER_KEYS = ['note', 'instrument', 'note2', 'instrument2'] as const;

/** Patch `source` (the loaded .psf bytes) with the effect operands `edited` changed against a fresh decode of it. */
export function applySfEffectEdits(source: Uint8Array, edited: readonly Pattern[]): SfEditResult {
  const out = new Uint8Array(source);
  const warnings: string[] = [];
  const res: SfEditResult = { data: out, patched: 0, otherEdits: 0, warnings };
  const parse = parseSoundFactoryWithEffects(source, 'edit.psf');
  if (!parse) { warnings.push('source is not a Sound Factory module; nothing patched'); return res; }
  const base = parse.song.patterns;

  edited.forEach((pat, p) => {
    pat.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
      const was = base[p]?.channels[c]?.rows[r];
      if (!was) return;
      const a = cell as unknown as Record<string, number | undefined>;
      const b = was as unknown as Record<string, number | undefined>;
      if (OTHER_KEYS.some((k) => (a[k] ?? 0) !== (b[k] ?? 0))) res.otherEdits++;
      const offs = parse.effectOffsets[c]?.get(p * ROWS_PER_PATTERN + r);
      const where = `Ch${c + 1} row ${p * ROWS_PER_PATTERN + r}`;
      for (let k = 0; k < SF_MAX_EFFECT_SLOTS; k++) {
        const now = slotOf(cell, k), old = slotOf(was, k);
        if (now.typ === old.typ && now.val === old.val) continue;
        if (old.typ === SF_FX_ROW_OFFSET || now.typ === SF_FX_ROW_OFFSET) continue; // the delay is a note-layer field
        const at = offs?.[k] ?? -1;
        if (old.typ === 0 || now.typ !== old.typ || at < 0) {
          warnings.push(`${where} slot ${k + 1}: would ${old.typ === 0 ? 'insert' : now.typ === 0 ? 'remove' : 'replace'} a command; the stream is not re-packed, not written`);
          continue;
        }
        if (sfPresenceEffect(sfOpcodeStartingWith(old.typ)) !== undefined || changesLength(old.typ, old.val, now.val)) {
          warnings.push(`${where} slot ${k + 1}: the value change would resize the command; not written`);
          continue;
        }
        out[at] = now.val & 0xff;
        res.patched++;
      }
    }));
  });
  return res;
}
