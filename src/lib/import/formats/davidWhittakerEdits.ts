/**
 * davidWhittakerEdits.ts - write the tick grid's edits back into the David Whittaker module.
 *
 * The grid (davidWhittakerGrid.ts) is the replayer's own walk: every cell is made of walk events,
 * and every event names the file byte of the command that ran (block + pos). An edited cell is
 * therefore a byte patch, in place, never a re-pack:
 *   - note: the note byte of the command that played it (track byte = note - 25);
 *   - instrument: the sample-change command that was in force for that note (its byte is
 *     sampleBase + index, the base read off the module's own byte and the replayer's index);
 *   - an effect column: the argument byte(s) of the command that ran, or the index inside an
 *     envelope / arpeggio select byte.
 * A command is shared by every tick that replays its block, so an edit shows wherever the block
 * plays: that is the module's structure, not a copy. Edits that would change a block's length
 * (a note where the replayer ran none, a different command, a note removed) cannot be written in
 * place and come back as warnings, never as a half-edit.
 */
import type { Pattern } from '@/types';
import { DW_FX } from './davidWhittakerEffectGlyphs';
import { DW_WALK, type DwWalk, type DwWalkEvent } from './DavidWhittakerWasmExtractor';
import { buildDWGridFromWalk, dwEventEffects } from './davidWhittakerGrid';

const ROWS_PER_PATTERN = 64;
const NO_BLOCK = 0xffffffff;
const SLOTS = [['effTyp', 'eff'], ['effTyp2', 'eff2'], ['effTyp3', 'eff3'], ['effTyp4', 'eff4'], ['effTyp5', 'eff5']] as const;

export interface DwEditResult {
  data: Uint8Array;
  /** Bytes changed in the module. */
  patched: number;
  warnings: string[];
}

type CellRec = Record<string, number | undefined>;

/** Where in the command (relative to its command byte) the argument an effect id edits lives; null: not editable in place. */
function argOffset(typ: number): number | null {
  switch (typ) {
    case DW_FX.slideSpeed: case DW_FX.vibratoSpeed: return 1;
    case DW_FX.slideDelay: case DW_FX.vibratoDepth: return 2;
    case DW_FX.globalTranspose: case DW_FX.channelTranspose: case DW_FX.volumeFade:
    case DW_FX.globalVolumeFade: case DW_FX.globalVolume: case DW_FX.speed: case DW_FX.delaySpeed:
    case DW_FX.soundEffect:
      return 1;
    default: return null;
  }
}

/**
 * Apply the differences between `edited` (the grid as it is now) and the grid the module's own walk
 * draws to the module bytes. `walk` is the walk of `source`.
 */
export function applyDwGridEdits(source: Uint8Array, walk: DwWalk, edited: Pattern[]): DwEditResult {
  const base = buildDWGridFromWalk(walk).patterns;
  const out = new Uint8Array(source);
  const warnings: string[] = [];
  const wanted = new Map<number, { value: number; why: string }>();
  const want = (off: number, value: number, why: string): void => {
    if (off < 0 || off >= out.length) { warnings.push(`${why}: byte ${off} is outside the module`); return; }
    const prev = wanted.get(off);
    if (prev && prev.value !== value) { warnings.push(`${why}: conflicts with ${prev.why} on the same command byte, kept the first`); return; }
    wanted.set(off, { value: value & 0xff, why });
  };

  // events by (channel, tick), in execution order; the sample command in force per note
  const at = new Map<string, DwWalkEvent[]>();
  const lastSample: Array<DwWalkEvent | null> = new Array(Math.max(1, walk.channels)).fill(null);
  const noteSample = new Map<DwWalkEvent, DwWalkEvent | null>();
  for (const e of walk.events) {
    if (e.channel >= walk.channels) continue;
    const key = `${e.channel}:${e.tick}`;
    const list = at.get(key);
    if (list) list.push(e); else at.set(key, [e]);
    if (e.kind === DW_WALK.sample) lastSample[e.channel] = e;
    else if (e.kind === DW_WALK.note) noteSample.set(e, lastSample[e.channel]);
  }
  const cmdOffset = (e: DwWalkEvent): number => (e.block === NO_BLOCK ? -1 : e.block + e.pos);

  for (let p = 0; p < edited.length; p++) {
    if (p >= base.length) { warnings.push(`pattern ${p} is past the end of the module's walk; not written`); continue; }
    const bp = base[p];
    for (let ch = 0; ch < bp.channels.length; ch++) {
      const eRows = edited[p].channels[ch]?.rows;
      if (!eRows) continue;
      for (let row = 0; row < bp.length && row < ROWS_PER_PATTERN; row++) {
        const b = bp.channels[ch].rows[row] as unknown as CellRec;
        const c = eRows[row] as unknown as CellRec | undefined;
        if (!c) continue;
        const events = at.get(`${ch}:${p * ROWS_PER_PATTERN + row}`) ?? [];
        const where = `pattern ${p} voice ${ch + 1} row ${row}`;
        const noteEv = events.find((e) => e.kind === DW_WALK.note);

        if ((c.note ?? 0) !== (b.note ?? 0)) {
          const n = c.note ?? 0;
          if (!noteEv) warnings.push(`${where}: a note where the replayer runs none needs a longer block; not written`);
          else if (n < 1 || n > 96) warnings.push(`${where}: a note removed or turned into a note-off needs a different command; not written`);
          else if (n - 25 < 0 || n - 25 > 0x7f) warnings.push(`${where}: note ${n} is below the replayer's table; not written`);
          else want(cmdOffset(noteEv), n - 25, `${where} note`);
        }
        if ((c.instrument ?? 0) !== (b.instrument ?? 0)) {
          const ins = c.instrument ?? 0;
          const sc = noteEv ? noteSample.get(noteEv) : null;
          if (!noteEv) warnings.push(`${where}: an instrument without a note is not part of the module; not written`);
          else if (!sc) warnings.push(`${where}: no sample-change command is in force for this note (old player or the voice's first sample); not written`);
          else if (ins < 1 || ins > walk.samples) warnings.push(`${where}: instrument ${ins} is not one of the module's ${walk.samples} samples; not written`);
          else {
            const off = cmdOffset(sc);
            const sampleBase = (source[off] ?? 0) - sc.a;
            want(off, sampleBase + ins - 1, `${where} instrument`);
          }
        }
        // effect columns: slot k of the cell is the k-th effect the events of the tick showed
        const fxEvents: Array<{ e: DwWalkEvent; typ: number }> = [];
        for (const e of events) for (const [typ] of dwEventEffects(e)) fxEvents.push({ e, typ });
        for (let s = 0; s < SLOTS.length; s++) {
          const [kt, kv] = SLOTS[s];
          const bt = b[kt] ?? 0, bv = b[kv] ?? 0, ct = c[kt] ?? 0, cv = c[kv] ?? 0;
          if (bt === ct && bv === cv) continue;
          const src = fxEvents[s];
          if (!src || bt !== ct) { warnings.push(`${where}: effect column ${s + 1} changed to another command; not written`); continue; }
          const off = cmdOffset(src.e);
          if (src.typ === DW_FX.envelope || src.typ === DW_FX.arpeggio) {
            const idxBase = (source[off] ?? 0) - src.e.a;
            const nb = idxBase + (cv & 0xff);
            if (nb < idxBase || nb >= 0xe0) warnings.push(`${where}: ${cv} is past the select range; not written`);
            else want(off, nb, `${where} effect ${s + 1}`);
            continue;
          }
          const a = argOffset(src.typ);
          if (a === null) warnings.push(`${where}: this command carries no argument byte; not written`);
          else want(off + a, cv, `${where} effect ${s + 1}`);
        }
      }
    }
  }

  let patched = 0;
  for (const [off, { value }] of wanted) {
    if (out[off] !== value) { out[off] = value; patched++; }
  }
  return { data: out, patched, warnings };
}

