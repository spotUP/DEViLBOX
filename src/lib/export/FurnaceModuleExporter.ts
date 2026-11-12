/**
 * Furnace module (.fur) writer for a Neo Geo (YM2610 / OPNB) song composed in the tracker.
 *
 * Writes the current module layout (format version 240, INF2 / SNG2 / INS2 / PATN blocks,
 * zlib-compressed), the one Furnace 0.6.8 and later read. Layout reference:
 * third-party/furnace-master/papers/format.md and src/engine/fileOps/fur.cpp. The pattern
 * channel is ONE byte in a PATN header, as fur.cpp writes it (format.md says two).
 *
 * The instrument blocks come from `encodeInstrumentAsINS2` (the importer's own INS2 writer);
 * the note, volume and effect mappings invert `furnaceEditorCells.ts`, so import and export
 * cannot drift apart.
 *
 * Nothing is dropped silently: content the module cannot hold makes `exportFurnaceModule`
 * throw (a refusal), and content that is left out on purpose is listed in `warnings`.
 */
import pako from 'pako';
import type { InstrumentConfig, FurnaceConfig, FurnaceMacro } from '@/types/instrument';
import type { Pattern, TrackerCell } from '@/types/tracker';
import { effectNotationOf, type EffectNotation } from '@/lib/tracker/effectNotation';
import {
  encodeInstrumentAsINS2,
  type FurnaceInstrument,
  type FurnaceMacro as FileMacro,
} from '@/lib/import/formats/furnace/FurnaceInstrumentParser';
import { resolveInsType, DIV_INS_ADPCMA, DIV_INS_ADPCMB } from './FurnaceInstrumentEncoder';
import { editorEffectToFurnace, xmVolToFurnace, xmNoteToFurnace } from '@/lib/import/furnaceEditorCells';

/** Furnace format version written: the first with INF2 / SNG2 blocks. */
export const FUR_EXPORT_VERSION = 240;
/** System id of the YM2610 (Neo Geo): FM 1-4, SSG 1-3, ADPCM-A 1-6, ADPCM-B. */
export const FUR_SYSTEM_YM2610 = 0xa5;
export const FUR_NEO_GEO_CHANNELS = 14;
/** The synth type of a Neo Geo instrument in the tracker. */
export const NEO_GEO_SYNTH_TYPE = 'FurnaceOPNB';

const FILE_NOTE_OFF = 180;
const MAX_FX_COLUMNS = 8;

export interface FurnaceModuleSong {
  name: string;
  patterns: Pattern[];
  instruments: InstrumentConfig[];
  /** Pattern order: indices into `patterns`. */
  songPositions: number[];
  initialSpeed: number;
  initialBPM: number;
  hz?: number;
  virtualTempoN?: number;
  virtualTempoD?: number;
}

export interface FurnaceModuleResult {
  bytes: Uint8Array;
  /** Things left out on purpose; the caller shows them to the user. */
  warnings: string[];
}

/** Is this instrument a Neo Geo voice the module can hold? */
export function isNeoGeoInstrument(inst: InstrumentConfig): boolean {
  return inst.synthType === NEO_GEO_SYNTH_TYPE && !!inst.furnace;
}

/** Is a Furnace module export on offer for these instruments (at least one Neo Geo voice, no other kind)? */
export function furnaceModuleExportAvailable(instruments: InstrumentConfig[]): boolean {
  return instruments.length > 0 && instruments.some(isNeoGeoInstrument);
}

// -- Byte writer ----------------------------------------------------------------

class Bytes {
  private chunks: number[] = [];
  private scratch = new DataView(new ArrayBuffer(4));
  get length(): number { return this.chunks.length; }
  u8(v: number): this { this.chunks.push(v & 0xff); return this; }
  u16(v: number): this { return this.u8(v).u8(v >> 8); }
  u32(v: number): this { return this.u16(v).u16(v >>> 16); }
  f32(v: number): this {
    this.scratch.setFloat32(0, v, true);
    for (let i = 0; i < 4; i++) this.u8(this.scratch.getUint8(i));
    return this;
  }
  ascii(s: string): this { for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i)); return this; }
  /** Null-terminated UTF-8 string. */
  str(s: string): this {
    for (const b of new TextEncoder().encode(s)) this.u8(b);
    return this.u8(0);
  }
  bytes(b: ArrayLike<number>): this { for (let i = 0; i < b.length; i++) this.u8(b[i]); return this; }
  toUint8Array(): Uint8Array { return Uint8Array.from(this.chunks); }
}

/** A block: 4-char tag, u32 size, body. */
function block(tag: string, body: Bytes): Uint8Array {
  return new Bytes().ascii(tag).u32(body.length).bytes(body.toUint8Array()).toUint8Array();
}

// -- Cells ------------------------------------------------------------------------

interface FileCell {
  note: number; // file note, -1 none
  ins: number; // -1 none
  vol: number; // -1 none
  fx: Array<{ type: number; val: number }>; // length 8, -1 = empty
}

function cellEffects(cell: TrackerCell): Array<[number, number]> {
  const c = cell as unknown as Record<string, number | undefined>;
  const out: Array<[number, number]> = [[cell.effTyp ?? 0, cell.eff ?? 0], [cell.effTyp2 ?? 0, cell.eff2 ?? 0]];
  for (let i = 3; i <= MAX_FX_COLUMNS; i++) out.push([c[`effTyp${i}`] ?? 0, c[`eff${i}`] ?? 0]);
  return out;
}

/**
 * Tracker-notation Cxx (effect type 0x0C, 0-64) is "set volume". Furnace's own 0Cxx is a different
 * command, so a verbatim copy would change what the song plays. Move it to the volume column
 * (the same 0-64 to 0-127 scale as the volume column). Furnace-notation channels keep their codes.
 */
function cellToFile(
  cell: TrackerCell,
  insIndexById: Map<number, number>,
  where: string,
  problems: string[],
  notation: EffectNotation = 'tracker',
  warnings: string[] = [],
): FileCell {
  let note = -1;
  if (cell.note > 0) {
    const n = xmNoteToFurnace(cell.note);
    note = n === 253 ? FILE_NOTE_OFF : n + 60; // native C-0 = 0, file C-0 = 60
  }
  let ins = -1;
  if (cell.instrument > 0) {
    const idx = insIndexById.get(cell.instrument);
    if (idx === undefined) problems.push(`${where}: instrument ${cell.instrument} is not a Neo Geo instrument`);
    else ins = idx;
  }
  let vol = cell.volume ? xmVolToFurnace(cell.volume) : -1;
  const fx = cellEffects(cell).map(([t, v]) => {
    if (notation === 'tracker' && t === 0x0c) {
      if (vol < 0) vol = xmVolToFurnace(0x10 + Math.min(64, v));
      else warnings.push(`${where}: Cxx dropped because the volume column is already set`);
      return { type: -1, val: -1 };
    }
    const e = editorEffectToFurnace(t, v);
    return { type: e.cmd, val: e.val };
  });
  return { note, ins, vol, fx };
}

function isEmptyCell(c: FileCell): boolean {
  return c.note < 0 && c.ins < 0 && c.vol < 0 && c.fx.every((f) => f.type < 0 && f.val < 0);
}

/** Row data of one pattern, fur.cpp's PATN row coding. */
function encodeRows(rows: FileCell[]): Bytes {
  const out = new Bytes();
  let i = 0;
  while (i < rows.length) {
    const c = rows[i];
    if (isEmptyCell(c)) {
      let n = 1;
      while (i + n < rows.length && n < 129 && isEmptyCell(rows[i + n])) n++;
      out.u8(n >= 2 ? 128 | (n - 2) : 0);
      i += n;
      continue;
    }
    let mask = 0;
    let effectMask = 0;
    if (c.note >= 0) mask |= 1;
    if (c.ins >= 0) mask |= 2;
    if (c.vol >= 0) mask |= 4;
    if (c.fx[0].type >= 0) mask |= 8;
    if (c.fx[0].val >= 0) mask |= 16;
    for (let k = 1; k < MAX_FX_COLUMNS; k++) {
      if (c.fx[k].type >= 0) effectMask |= 1 << (2 * k);
      if (c.fx[k].val >= 0) effectMask |= 1 << (2 * k + 1);
    }
    if (effectMask & 0x00ff) mask |= 32;
    if (effectMask & 0xff00) mask |= 64;
    out.u8(mask);
    if (mask & 32) out.u8(effectMask & 0xff);
    if (mask & 64) out.u8(effectMask >> 8);
    if (c.note >= 0) out.u8(c.note);
    if (c.ins >= 0) out.u8(c.ins);
    if (c.vol >= 0) out.u8(c.vol);
    if (c.fx[0].type >= 0) out.u8(c.fx[0].type);
    if (c.fx[0].val >= 0) out.u8(c.fx[0].val);
    for (let k = 1; k < MAX_FX_COLUMNS; k++) {
      if (c.fx[k].type >= 0) out.u8(c.fx[k].type);
      if (c.fx[k].val >= 0) out.u8(c.fx[k].val);
    }
    i++;
  }
  return out.u8(0xff);
}

// -- Instruments ------------------------------------------------------------------

function toFileMacro(m: FurnaceMacro): FileMacro {
  return {
    code: m.code ?? 0,
    length: Math.min(255, m.data.length),
    loop: m.loop < 0 ? 255 : m.loop,
    release: m.release < 0 ? 255 : m.release,
    mode: m.mode,
    type: m.open ? 1 : 0,
    delay: m.delay ?? 0,
    speed: m.speed ?? 1,
    data: m.data.slice(0, 255),
  };
}

function toFileInstrument(name: string, cfg: FurnaceConfig): FurnaceInstrument {
  const type = resolveInsType(cfg);
  return {
    name,
    type,
    fm: type === 1 ? cfg : undefined,
    macros: cfg.macros.filter((m) => m.data.length > 0).map(toFileMacro),
    samples: [],
    wavetables: [],
    opMacroArrays: cfg.opMacroArrays?.map((a) => a.filter((m) => m.data.length > 0).map(toFileMacro)),
  };
}

function checkInstrument(inst: InstrumentConfig, cfg: FurnaceConfig, problems: string[]): void {
  const type = resolveInsType(cfg);
  const label = `Instrument ${inst.id} "${inst.name}"`;
  if (type === DIV_INS_ADPCMA || type === DIV_INS_ADPCMB) {
    if (cfg.userSample) problems.push(`${label}: ADPCM samples cannot be written to a Furnace module yet`);
  }
  const hasNamedOpMacros = (cfg.opMacros ?? []).some((o) => Object.values(o).some((m) => m && m.data.length > 0));
  const hasRawOpMacros = (cfg.opMacroArrays ?? []).some((a) => a.some((m) => m.data.length > 0));
  if (hasNamedOpMacros && !hasRawOpMacros) problems.push(`${label}: per-operator macros are not in the raw form the writer needs`);
}

// -- Module -----------------------------------------------------------------------

export function exportFurnaceModule(song: FurnaceModuleSong): FurnaceModuleResult {
  const problems: string[] = [];
  const warnings: string[] = [];

  // Instruments: Neo Geo voices in song order; the cells' ids map to file indices.
  const neo = song.instruments.filter(isNeoGeoInstrument);
  const insIndexById = new Map<number, number>();
  neo.forEach((inst, i) => insIndexById.set(inst.id, i));
  const skipped = song.instruments.filter((i) => !isNeoGeoInstrument(i));
  if (skipped.length > 0) {
    warnings.push(`Left out ${skipped.length} instrument(s) that are not Neo Geo voices: ${skipped.map((i) => `${i.id} "${i.name}"`).join(', ')}`);
  }
  for (const inst of neo) checkInstrument(inst, inst.furnace as FurnaceConfig, problems);

  // Patterns
  if (song.patterns.length === 0) problems.push('The song has no patterns');
  if (song.patterns.length > 256) problems.push('A Furnace order table holds at most 256 patterns');
  const patLen = Math.max(1, ...song.patterns.map((p) => p.length));
  if (patLen > 1024) problems.push(`Pattern length ${patLen} is over the 1024 rows Furnace allows`);
  for (const [pi, p] of song.patterns.entries()) {
    if (p.length !== patLen) problems.push(`Pattern ${pi} has ${p.length} rows but pattern 0 has ${patLen}: a Furnace song has one pattern length`);
    p.channels.slice(FUR_NEO_GEO_CHANNELS).forEach((ch, k) => {
      if (ch.rows.some((c) => !isEmptyCell(cellToFile(c, insIndexById, '', [], effectNotationOf(ch.channelMeta))))) {
        problems.push(`Pattern ${pi} channel ${FUR_NEO_GEO_CHANNELS + k + 1} has notes but a Neo Geo song has ${FUR_NEO_GEO_CHANNELS} channels`);
      }
    });
  }
  for (const pos of song.songPositions) {
    if (!song.patterns[pos]) problems.push(`The order list points at pattern ${pos}, which does not exist`);
  }
  if (song.songPositions.length === 0) problems.push('The order list is empty');
  if (song.songPositions.length > 256) problems.push('A Furnace order table holds at most 256 entries');

  // Cells per channel and pattern
  const fxColumns = new Array<number>(FUR_NEO_GEO_CHANNELS).fill(1);
  const patnBlocks: Uint8Array[] = [];
  for (let ch = 0; ch < FUR_NEO_GEO_CHANNELS; ch++) {
    for (const [pi, p] of song.patterns.entries()) {
      const src = p.channels[ch];
      if (!src) continue;
      const rows: FileCell[] = [];
      for (let r = 0; r < patLen; r++) {
        const cell = src.rows[r];
        rows.push(cell
          ? cellToFile(cell, insIndexById, `Pattern ${pi} channel ${ch + 1} row ${r}`, problems, effectNotationOf(src.channelMeta), warnings)
          : { note: -1, ins: -1, vol: -1, fx: Array.from({ length: MAX_FX_COLUMNS }, () => ({ type: -1, val: -1 })) });
      }
      if (rows.every(isEmptyCell)) continue; // Furnace creates an empty pattern for a missing block
      for (const row of rows) {
        row.fx.forEach((f, k) => { if (f.type >= 0 || f.val >= 0) fxColumns[ch] = Math.max(fxColumns[ch], k + 1); });
      }
      const body = new Bytes().u8(0).u8(ch).u16(pi).str('').bytes(encodeRows(rows).toUint8Array());
      patnBlocks.push(block('PATN', body));
    }
  }

  if (problems.length > 0) {
    const shown = problems.slice(0, 8).join('; ');
    throw new Error(`Cannot export a Furnace module: ${shown}${problems.length > 8 ? `; and ${problems.length - 8} more` : ''}`);
  }

  // SNG2
  const hz = song.hz ?? 60;
  const vN = song.virtualTempoN ?? Math.max(1, Math.min(65535, Math.round(song.initialBPM)));
  const vD = song.virtualTempoD ?? 150;
  const sng = new Bytes()
    .f32(hz).u8(1).u8(1)
    .u16(patLen).u16(song.songPositions.length)
    .u8(4).u8(16)
    .u16(vN).u16(vD)
    .u8(1);
  for (let i = 0; i < 16; i++) sng.u16(i === 0 ? Math.max(1, song.initialSpeed) : 0);
  sng.str(song.name).str('');
  for (let ch = 0; ch < FUR_NEO_GEO_CHANNELS; ch++) for (const pos of song.songPositions) sng.u8(pos);
  for (let ch = 0; ch < FUR_NEO_GEO_CHANNELS; ch++) sng.u8(fxColumns[ch]);
  for (let ch = 0; ch < FUR_NEO_GEO_CHANNELS; ch++) sng.u8(0); // hidden
  for (let ch = 0; ch < FUR_NEO_GEO_CHANNELS; ch++) sng.u8(0); // collapsed
  for (let ch = 0; ch < FUR_NEO_GEO_CHANNELS; ch++) sng.str('');
  for (let ch = 0; ch < FUR_NEO_GEO_CHANNELS; ch++) sng.str('');
  for (let ch = 0; ch < FUR_NEO_GEO_CHANNELS; ch++) sng.u32(0);
  const sng2 = block('SNG2', sng);

  const ins2 = neo.map((inst) => encodeInstrumentAsINS2(toFileInstrument(inst.name, inst.furnace as FurnaceConfig), FUR_EXPORT_VERSION));

  // Layout: header, INF2, SNG2, INS2..., PATN...
  const buildInf2 = (sngPtr: number, insPtrs: number[], patPtrs: number[]): Uint8Array => {
    const b = new Bytes()
      .str(song.name).str('').str('Neo Geo').str('')
      .str('').str('').str('').str('')
      .f32(440).u8(1)
      .f32(1).u16(FUR_NEO_GEO_CHANNELS).u16(1)
      .u16(FUR_SYSTEM_YM2610).u16(FUR_NEO_GEO_CHANNELS).f32(1).f32(0).f32(0)
      .u32(0).u8(1); // patchbay: no connections, automatic
    b.u8(0x01).u32(1).u32(sngPtr);
    if (insPtrs.length > 0) { b.u8(0x04).u32(insPtrs.length); insPtrs.forEach((p) => b.u32(p)); }
    if (patPtrs.length > 0) { b.u8(0x07).u32(patPtrs.length); patPtrs.forEach((p) => b.u32(p)); }
    b.u8(0x00);
    return block('INF2', b);
  };
  const inf2Len = buildInf2(0, ins2.map(() => 0), patnBlocks.map(() => 0)).length;
  let cursor = 32 + inf2Len;
  const sngPtr = cursor;
  cursor += sng2.length;
  const insPtrs = ins2.map((b) => { const p = cursor; cursor += b.length; return p; });
  const patPtrs = patnBlocks.map((b) => { const p = cursor; cursor += b.length; return p; });
  const inf2 = buildInf2(sngPtr, insPtrs, patPtrs);

  const file = new Bytes().ascii('-Furnace module-').u16(FUR_EXPORT_VERSION).u16(0).u32(32);
  for (let i = 0; i < 8; i++) file.u8(0);
  for (const part of [inf2, sng2, ...ins2, ...patnBlocks]) file.bytes(part);

  if (neo.every((i) => resolveInsType(i.furnace as FurnaceConfig) !== DIV_INS_ADPCMA && resolveInsType(i.furnace as FurnaceConfig) !== DIV_INS_ADPCMB)) {
    warnings.push('The module has no ADPCM-A or ADPCM-B samples (the song has none)');
  }
  return { bytes: pako.deflate(file.toUint8Array()), warnings };
}
