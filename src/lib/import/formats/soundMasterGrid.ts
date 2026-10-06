/**
 * soundMasterGrid.ts - the Sound Master song as the player walks it, the row
 * <-> grid cell codec, and grid edits written back into the module.
 *
 * The walk (the player's advance routine): the song starts at position
 * `start`; a position plays blocks first..last (the block number is a byte:
 * it counts up until it equals `last`); a block gives each voice a pattern and
 * that pattern's transpose; every voice reads row r of its pattern on the same
 * tick, so the four voices are in step and a block is one grid pattern of
 * patternLength/2 rows. A row lasts `speed` play calls (50 Hz). After the last
 * block of the position `end - 1` the song goes back to `start`.
 * Sound Master II v1 ('fixed') also has a speed row (note byte $FD, info =
 * ticks) and a break row ($FE: the block ends after this row).
 *
 * A row is two bytes [note, info]:
 *   note 0         no note: the voice's envelope falls to its sustain level
 *   note $FF       hold: no note, the envelope keeps attacking (info ignored)
 *   note 1..$FE    a note: bits 0-5 the note, bit 6 portamento to it (info &
 *                  $7F = speed), bit 7 legato (pitch only, no sample restart)
 *   info bit 6     (no portamento) volume = info & $3F, instrument unchanged
 *   info bit 7     the note is not transposed
 *   info otherwise the instrument; the voice's position offset is added
 * The pitch: note + block transpose + position transpose + the instrument's
 * finetune byte (record byte 13), modulo 64, is the player's period table
 * index (Sound Master 1.x / II v3 subtract 18 and take the first of 46
 * periods when the result is past the end). Grid notes are ProTracker named
 * from that index (index 24 = period 856 = C-1 = 13).
 *
 * A cell's bytes depend on where it sits (the transposes, the instrument
 * offset, the instrument the voice holds), so grid edits are written through
 * the layout's writeCell with that context; a pattern that several blocks
 * play is one set of bytes.
 *
 * Research: thoughts/shared/research/2026-10-06_sound-master-format.md
 */

import type { TrackerCell } from '@/types';
import {
  decodeSoundMasterModule, encodeSoundMasterModule, soundMasterAddresses,
  type SmAddresses, type SoundMasterModule,
} from './SoundMasterModule';
import { SM_FX } from './soundMasterEffectGlyphs';

/** XM effect ids the codec uses. */
const FX_PORTA = 0x03;
const FX_BREAK = 0x0d;
const FX_SPEED = 0x0f;

/** A voice's state before a row: what the row's bytes are read against. */
export interface SmVoiceCtx {
  /** Block transpose + position transpose (byte). */
  transpose: number;
  /** The position's instrument offset for this voice (byte). */
  offset: number;
  /** The instrument byte the voice holds (the last note's info byte that named one). */
  sticky: number;
  /** The finetune byte of the instrument the voice last started. */
  fine: number;
}

export interface SmStep {
  position: number;
  block: number;
  /** Rows played (a break row ends the block early). */
  rows: number;
  /** Per voice: the pattern and the context of each played row. */
  voices: Array<{ pattern: number; ctx: SmVoiceCtx[] }>;
}

const MAX_STEPS = 4096;

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

type EffKey = ['effTyp', 'eff'] | ['effTyp2', 'eff2'] | ['effTyp3', 'eff3'];
const EFFECT_SLOTS: EffKey[] = [['effTyp', 'eff'], ['effTyp2', 'eff2'], ['effTyp3', 'eff3']];

function addEffect(cell: TrackerCell, typ: number, val: number): void {
  for (const [kt, kv] of EFFECT_SLOTS) {
    if (!cell[kt]) { (cell as unknown as Record<string, number>)[kt] = typ; (cell as unknown as Record<string, number>)[kv] = val & 0xff; return; }
  }
  throw new Error('Sound Master: a row needs more than three effect columns');
}

function effects(cell: TrackerCell): Map<number, number> {
  const out = new Map<number, number>();
  const c = cell as unknown as Record<string, number | undefined>;
  for (const [kt, kv] of [['effTyp', 'eff'], ['effTyp2', 'eff2'], ['effTyp3', 'eff3'], ['effTyp4', 'eff4'], ['effTyp5', 'eff5']]) {
    const t = c[kt] ?? 0;
    if (t) out.set(t, (c[kv] ?? 0) & 0xff);
  }
  return out;
}

/** Effect columns a cell uses (the channel shows at least 2). */
export function smCellEffectColumns(cell: TrackerCell): number {
  return cell.effTyp3 ? 3 : 2;
}

/** The decoded song plus the reads the codec needs. */
export class SmSong {
  readonly module: SoundMasterModule;
  readonly addrs: SmAddresses;
  /** The module bytes (edits are written here). */
  readonly image: Uint8Array;
  steps: SmStep[];

  constructor(bytes: Uint8Array) {
    this.image = bytes.slice();
    this.module = decodeSoundMasterModule(this.image);
    this.addrs = soundMasterAddresses(this.module);
    this.steps = walkSoundMasterSong(this);
  }

  get fixed(): boolean { return this.module.layout === 'fixed'; }

  /** The finetune byte of instrument record `i` (0..63), read where the player reads it. */
  fineOf(i: number): number {
    const size = this.fixed ? 14 : 16;
    return this.image[this.addrs.instruments + i * size + 13] ?? 0;
  }

  /** File offset of row `row` of pattern `pattern`. */
  rowOffset(pattern: number, row: number): number {
    return this.addrs.patterns + pattern * this.module.patternLength + row * 2;
  }

  /** The two bytes of a row. */
  rowBytes(pattern: number, row: number): [number, number] {
    const o = this.rowOffset(pattern, row);
    return [this.image[o], this.image[o + 1]];
  }

  /** The period table index a note byte plays at, or -1 when the grid cannot name it. */
  private pitchIndex(n: number, info: number, ctx: SmVoiceCtx, fine: number): number {
    const tr = info & 0x80 ? 0 : ctx.transpose;
    if (this.fixed) return (n + tr + fine) & 63;
    const i = (n + tr + fine - 18) & 63;
    return i >= 46 ? -1 : i + 18;
  }

  /** The state a row leaves the voice in. */
  nextCtx(n: number, info: number, ctx: SmVoiceCtx): SmVoiceCtx {
    if (n === 0 || n === 0xff || (this.fixed && (n === 0xfd || n === 0xfe))) return ctx;
    const legato = (n & 0x80) !== 0;
    let sticky = ctx.sticky;
    // The instrument lookup runs for every note in 1.x / II v3, only for a started note in II v1.
    if ((!this.fixed || !legato) && !(n & 0x40) && !(info & 0x40)) sticky = info;
    const fine = legato ? ctx.fine : this.fineOf((sticky + ctx.offset) & 63);
    return { ...ctx, sticky, fine };
  }

  /** A row as a grid cell. */
  decodeRow(n: number, info: number, ctx: SmVoiceCtx): TrackerCell {
    const cell = emptyCell();
    const noteless = (): void => {
      if (info & 0x40) {
        cell.volume = 0x10 + (info & 0x3f);
        if (info & 0x80) addEffect(cell, SM_FX.fixed, 0);
      } else if (info === 0x80) addEffect(cell, SM_FX.fixed, 0);
      else if (info !== 0) addEffect(cell, SM_FX.inert, info);
    };
    if (this.fixed && n === 0xfd) { addEffect(cell, FX_SPEED, info); return cell; }
    if (this.fixed && n === 0xfe) { addEffect(cell, FX_BREAK, 0); noteless(); return cell; }
    if (n === 0xff) { addEffect(cell, SM_FX.hold, info); return cell; }
    if (n === 0) { noteless(); return cell; }

    const legato = (n & 0x80) !== 0;
    const porta = (n & 0x40) !== 0;
    const next = this.nextCtx(n, info, ctx);
    const idx = this.pitchIndex(n, info, ctx, next.fine);
    const note = idx - 11;
    if (idx < 0 || note < 1) addEffect(cell, SM_FX.rawNote, n);
    else {
      cell.note = note;
      cell.period = this.addrs.periods[idx - this.addrs.periodBase];
    }
    if (porta) addEffect(cell, FX_PORTA, info & 0x7f);
    else if (info & 0x40) cell.volume = 0x10 + (info & 0x3f);
    else cell.instrument = ((info + ctx.offset) & 63) + 1;
    if (legato && cell.note) addEffect(cell, SM_FX.legato, 0);
    if (info & 0x80) addEffect(cell, SM_FX.fixed, 0);
    return cell;
  }

  /** The row bytes a grid cell is, at `ctx`; null when the cell cannot be written there. */
  encodeRow(cell: TrackerCell, ctx: SmVoiceCtx): [number, number] | null {
    const fx = effects(cell);
    const fixedPitch = fx.has(SM_FX.fixed) ? 0x80 : 0;
    const vol = cell.volume >= 0x10 && cell.volume <= 0x4f ? cell.volume - 0x10 : -1;
    const notelessInfo = (): number => {
      if (fx.has(SM_FX.inert)) return fx.get(SM_FX.inert)!;
      return (vol >= 0 ? 0x40 | vol : 0) | fixedPitch;
    };
    if (this.fixed && fx.has(FX_SPEED)) return [0xfd, fx.get(FX_SPEED)!];
    if (fx.has(SM_FX.hold)) return [0xff, fx.get(SM_FX.hold)!];
    if (this.fixed && fx.has(FX_BREAK)) return [0xfe, notelessInfo()];
    const raw = fx.get(SM_FX.rawNote);
    const note = cell.note > 0 && cell.note <= 96 ? cell.note : 0;
    if (!note && raw === undefined) return [0, notelessInfo()];

    const porta = fx.has(FX_PORTA);
    const legato = fx.has(SM_FX.legato);
    let info: number;
    if (porta) info = (fx.get(FX_PORTA)! & 0x7f) | fixedPitch;
    else if (vol >= 0) info = 0x40 | vol | fixedPitch;
    else if (cell.instrument > 0) info = ((cell.instrument - 1 - ctx.offset) & 63) | fixedPitch;
    else info = (ctx.sticky & 0x3f) | fixedPitch;
    if (raw !== undefined) return [raw, info];

    const flags = (legato ? 0x80 : 0) | (porta ? 0x40 : 0);
    // The finetune the note is played with: what nextCtx gives for these bytes.
    const fine = this.nextCtx(flags | 1, info, ctx).fine;
    const idx = note + 11;
    const tr = fixedPitch ? 0 : ctx.transpose;
    if (idx > 63 || (!this.fixed && idx < 18)) return null;
    const n = ((idx - tr - fine) & 63) | flags;
    if (n === 0 || n === 0xff || (this.fixed && (n === 0xfd || n === 0xfe))) return null;
    return [n, info];
  }

  /** The step's cell for voice `ch`, row `row` (null outside the step). */
  cell(step: number, row: number, ch: number): TrackerCell | null {
    const s = this.steps[step];
    if (!s || row < 0 || row >= s.rows || ch < 0 || ch > 3) return null;
    const v = s.voices[ch];
    const [n, info] = this.rowBytes(v.pattern, row);
    return this.decodeRow(n, info, v.ctx[row]);
  }

  /** File offset of the step's row of voice `ch`; -1 outside the step. */
  cellOffset(step: number, row: number, ch: number): number {
    const s = this.steps[step];
    if (!s || row < 0 || row >= s.rows || ch < 0 || ch > 3) return -1;
    return this.rowOffset(s.voices[ch].pattern, row);
  }

  /**
   * Write a grid cell into the module: the byte runs changed (file offsets),
   * [] when nothing changes, null when the cell cannot be written there.
   */
  edit(step: number, row: number, ch: number, cell: TrackerCell): Array<{ offset: number; bytes: Uint8Array }> | null {
    const s = this.steps[step];
    if (!s || row < 0 || row >= s.rows || ch < 0 || ch > 3) return null;
    const v = s.voices[ch];
    const bytes = this.encodeRow(cell, v.ctx[row]);
    if (!bytes) return null;
    const o = this.rowOffset(v.pattern, row);
    if (this.image[o] === bytes[0] && this.image[o + 1] === bytes[1]) return [];
    this.image[o] = bytes[0];
    this.image[o + 1] = bytes[1];
    this.module.patterns[v.pattern].set(bytes, row * 2);
    // The voices' instruments (and a break row) after it follow the new bytes.
    this.steps = walkSoundMasterSong(this);
    return [{ offset: o, bytes: Uint8Array.from(bytes) }];
  }

  /** The module with the edits, as a file. */
  exportFile(): Uint8Array {
    return encodeSoundMasterModule(this.module);
  }
}

/**
 * The steps the player plays from `start` until it is back at `start`
 * (Sound Master's advance routine): each a block, its rows, and every voice's
 * context per row. Throws when the song names a block or pattern the module
 * does not have.
 */
export function walkSoundMasterSong(song: SmSong): SmStep[] {
  const m = song.module;
  const rowsPer = m.patternLength >> 1;
  const state: SmVoiceCtx[] = [0, 1, 2, 3].map(() => ({ transpose: 0, offset: 0, sticky: 0, fine: 0 }));
  const steps: SmStep[] = [];
  let pos = m.start;
  for (;;) {
    const P = m.positions[pos];
    if (!P) throw new Error(`Sound Master: position ${pos} is not in the module`);
    let blk = P.first;
    for (;;) {
      const B = m.blocks[blk];
      if (!B) throw new Error(`Sound Master: block ${blk} is not in the module`);
      const voices = [0, 1, 2, 3].map((v) => {
        if (B.patterns[v] >= m.patterns.length) throw new Error(`Sound Master: pattern ${B.patterns[v]} is not in the module`);
        state[v] = { ...state[v], transpose: (B.transposes[v] + P.transpose) & 0xff, offset: P.voices[v] };
        return { pattern: B.patterns[v], ctx: [] as SmVoiceCtx[] };
      });
      let rows = 0;
      for (let r = 0; r < rowsPer; r++) {
        let brk = false;
        for (let v = 0; v < 4; v++) {
          const [n, info] = song.rowBytes(voices[v].pattern, r);
          voices[v].ctx.push(state[v]);
          state[v] = song.nextCtx(n, info, state[v]);
          if (song.fixed && n === 0xfe) brk = true;
        }
        rows = r + 1;
        if (brk) break;
      }
      steps.push({ position: pos, block: blk, rows, voices });
      if (steps.length > MAX_STEPS) throw new Error('Sound Master: the song does not come back to its start');
      if (blk === P.last) break;
      blk = (blk + 1) & 0xff;
    }
    pos = (pos + 1) & 0xff;
    if (pos === m.end) break;
  }
  return steps;
}

/** Every step's cells: [step][voice][row]. */
export function soundMasterGrid(song: SmSong): TrackerCell[][][] {
  return song.steps.map((s, i) => [0, 1, 2, 3].map((ch) => Array.from({ length: s.rows }, (_, r) => song.cell(i, r, ch)!)));
}

/**
 * Write every grid cell that differs from the song as decoded into it, in
 * song order; returns the cells that could not be written ("step:row:voice").
 * Only cells that differ from the decode are written, so a pattern row shown
 * by several steps keeps the edit made in any of them.
 */
export function applySmGrid(song: SmSong, patterns: Array<{ channels: Array<{ rows: TrackerCell[] }> }>): string[] {
  const decoded = soundMasterGrid(song);
  const refused: string[] = [];
  for (let p = 0; p < Math.min(decoded.length, patterns.length); p++) {
    for (let ch = 0; ch < 4; ch++) {
      const rows = patterns[p].channels[ch]?.rows ?? [];
      for (let r = 0; r < Math.min(rows.length, decoded[p][ch].length); r++) {
        if (sameCell(decoded[p][ch][r], rows[r])) continue;
        if (song.edit(p, r, ch, rows[r]) === null) refused.push(`${p}:${r}:${ch}`);
      }
    }
  }
  return refused;
}

function sameCell(a: TrackerCell, b: TrackerCell): boolean {
  const ea = effects(a), eb = effects(b);
  if (ea.size !== eb.size) return false;
  for (const [k, v] of ea) if (eb.get(k) !== v) return false;
  return (a.note ?? 0) === (b.note ?? 0) && (a.instrument ?? 0) === (b.instrument ?? 0) && (a.volume ?? 0) === (b.volume ?? 0);
}
