/**
 * Furnace module (.fur) writer for a Neo Geo (YM2610 / OPNB) song composed in the tracker.
 *
 * Writes the current module layout (format version 245, INF2 / SNG2 / INS2 / PATN blocks,
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
import type { FurnaceUserSample } from '@/types/instrument/furnace';
import type { Pattern, TrackerCell } from '@/types/tracker';
import { effectNotationOf, type EffectNotation } from '@/lib/tracker/effectNotation';
import {
  encodeInstrumentAsINS2,
  type FurnaceInstrument,
  type FurnaceMacro as FileMacro,
} from '@/lib/import/formats/furnace/FurnaceInstrumentParser';
import { resolveInsType, DIV_INS_ADPCMA, DIV_INS_ADPCMB } from './FurnaceInstrumentEncoder';
import { editorEffectToFurnace, xmVolToFurnace, xmNoteToFurnace } from '@/lib/import/furnaceEditorCells';

/**
 * Furnace format version written: DIV_ENGINE_VERSION of the vendored Furnace (engine.h, 245), the
 * engine that plays the song here. INF2 / SNG2 blocks start at 240 in Furnace itself, but ngdevkit's
 * furtool.py reads `version <= 240` with the old INFO reader, and Furnace converts ADSR / LFO macros
 * of instruments below 245 (convertOldADSRLFO), which would change macros written with 245 meaning.
 */
export const FUR_EXPORT_VERSION = 245;
/** System id of the YM2610 (Neo Geo): FM 1-4, SSG 1-3, ADPCM-A 1-6, ADPCM-B. */
export const FUR_SYSTEM_YM2610 = 0xa5;
export const FUR_NEO_GEO_CHANNELS = 14;
/**
 * Chip flags of the exported YM2610: SSG volume 256 (full chip level, fmVol stays at its default
 * 256). This is the only setting where the level the composer hears matches the Neo Geo ROM.
 * ngdevkit's furtool (check_chip_flags, HALF_SSG_VOL) reads ssgVol=128 (Furnace's default,
 * ym2610shared.h) as "Furnace halved the SSG" and lowers every SSG volume macro step by one
 * (-2.7 dB on the ymfm SSG table) instead of -6 dB, and nsstool does not touch volume-column
 * values at all. At 128 the ROM therefore played SSG about 3.3 dB louder against FM than
 * DEViLBOX/Furnace, and macro tails at 1 vanished. At 256 furtool keeps the macros as written and
 * prints no warning (measured on the composer trial song, NG-GAME-3, 2026-11-13).
 * History: 2acbbcf47 set 128 after the owner heard "the arps are very loud compared to the
 * rest"; that listen coincided with the sticky-arp bug fixed in 07c12dd3b, and the owner later
 * reported 128 "sounds the same as before". The song is played here from the same module, so
 * screen and export agree.
 */
export const FUR_NEO_GEO_CHIP_FLAGS = 'ssgVol=256\n';
/** The synth type of a Neo Geo instrument in the tracker. */
export const NEO_GEO_SYNTH_TYPE = 'FurnaceOPNB';

export const FILE_NOTE_OFF = 180;
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
  /** Second speed of the speed pattern (Furnace alternates speed 1 and speed 2 per row). */
  speed2?: number;
  /** Compat flags of a loaded module (Furnace key names); absent = Furnace defaults. */
  compatFlags?: Record<string, unknown>;
  /** Groove patterns of a loaded module, 16 entries each, unused entries 0. */
  grooves?: number[][];
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

/** CFLG body (song.cpp DivCompatFlags::putData): key=value lines, zero-terminated; Furnace reads missing keys as defaults. */
function compatFlagsText(flags: Record<string, unknown>): string {
  let out = '';
  for (const [k, v] of Object.entries(flags)) {
    if (typeof v === 'boolean') out += `${k}=${v ? 'true' : 'false'}\n`;
    else if (typeof v === 'number' && Number.isFinite(v)) out += `${k}=${Math.round(v)}\n`;
  }
  return out;
}

/** GROV body (DivGroovePattern::putData): length byte, 16 x u16. Length = the leading non-zero entries. */
function grooveBody(val: number[]): Bytes {
  let len = 0;
  while (len < 16 && (val[len] ?? 0) > 0) len++;
  const b = new Bytes().u8(len);
  for (let i = 0; i < 16; i++) b.u16(Math.max(0, Math.min(65535, val[i] ?? 0)));
  return b;
}

// -- Cells ------------------------------------------------------------------------

export interface FileCell {
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

// -- Tracker arpeggio lifetime ----------------------------------------------------
//
// Tracker 0xy (ProTracker pt2_replayer.c arpeggio(), FastTracker 2 ft2_replayer.c arpeggio() and
// getNewNote "arpeggio running, set period back") plays only on the row that carries it: the next
// row without 0xy is back on the base note. Furnace 00xy stays on until 00 00
// (FurnaceSequencer.cpp ch.arp = effectVal; playback.cpp the same). So a tracker-notation row
// without an arp right after a row with one gets Furnace 0000. Both step one arp note per tick:
// PT tick % 3, FT2 arpeggioTab, Furnace arpLen 1 (written in SNG2, the sequencer's g_arpLen = 1).

/** The cell carries a tracker arpeggio (effect 0 with a non-zero parameter) in any effect column. */
export function cellHasTrackerArp(cell: TrackerCell | undefined): boolean {
  if (!cell) return false;
  return cellEffects(cell).some(([t, v]) => t === 0 && v !== 0);
}

/** Patterns that play right before / after pattern `pi` in the order list (the song loops to position 0). */
function orderNeighbours(positions: readonly number[], pi: number, dir: -1 | 1): number[] {
  const n = positions.length;
  const out = new Set<number>();
  positions.forEach((p, i) => { if (p === pi) out.add(positions[(i + dir + n) % n]); });
  return [...out];
}

/**
 * Whether row `r` of pattern `pi`, channel `ch` must stop a tracker arpeggio (Furnace 0000): the row
 * is tracker notation, carries no arp, and the row that plays before it does. Row 0 looks at the last
 * row of every pattern that precedes `pi` somewhere in the order list: one predecessor ending on an
 * arp is enough (an extra 0000 after a predecessor without arp changes nothing).
 */
export function trackerArpStopAt(
  patterns: readonly Pattern[], positions: readonly number[], pi: number, ch: number, r: number,
): boolean {
  const chan = patterns[pi]?.channels[ch];
  if (!chan || effectNotationOf(chan.channelMeta) !== 'tracker' || cellHasTrackerArp(chan.rows[r])) return false;
  if (r > 0) return cellHasTrackerArp(chan.rows[r - 1]);
  return orderNeighbours(positions, pi, -1).some((q) => {
    const prev = patterns[q]?.channels[ch];
    return !!prev && effectNotationOf(prev.channelMeta) === 'tracker' && cellHasTrackerArp(prev.rows[patterns[q].length - 1]);
  });
}

/** Cells whose arp stop depends on cell (pi, ch, r): the row after it, or row 0 of every pattern that follows pi. */
export function trackerArpDependents(
  patterns: readonly Pattern[], positions: readonly number[], pi: number, r: number,
): Array<{ pat: number; row: number }> {
  const len = patterns[pi]?.length ?? 0;
  if (r + 1 < len) return [{ pat: pi, row: r + 1 }];
  return orderNeighbours(positions, pi, 1).map((pat) => ({ pat, row: 0 }));
}

/**
 * Tracker-notation Cxx (effect type 0x0C, 0-64) is "set volume". Furnace's own 0Cxx is a different
 * command, so a verbatim copy would change what the song plays. Move it to the volume column
 * (the same 0-64 to 0-127 scale as the volume column). Furnace-notation channels keep their codes.
 */
export function cellToFile(
  cell: TrackerCell,
  insIndexById: Map<number, number>,
  where: string,
  problems: string[],
  notation: EffectNotation = 'tracker',
  warnings: string[] = [],
  /** trackerArpStopAt for this cell: write Furnace 0000 to end the arp of the row before. */
  arpStop = false,
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
  if (cell.volume && vol < 0) warnings.push(`${where}: volume column 0x${cell.volume.toString(16)} dropped, it is not a set-volume value (0x10-0x50)`);
  const fx = cellEffects(cell).map(([t, v]) => {
    if (notation === 'tracker' && t === 0x0c) {
      if (vol < 0) vol = xmVolToFurnace(0x10 + Math.min(64, v));
      else warnings.push(`${where}: Cxx dropped because the volume column is already set`);
      return { type: -1, val: -1 };
    }
    if (notation === 'tracker' && t === 0x0f) {
      // Store meaning: 01-1F speed, 20-FF BPM, 00 stops. Furnace 0Fxx is speed only, F0xx is tempo
      // (tick rate = value * 2 / 5 Hz, the same as a tracker BPM), FF00 stops the song.
      if (v >= 0x20) return { type: 0xf0, val: v };
      if (v === 0) return { type: 0xff, val: 0 };
    }
    const e = editorEffectToFurnace(t, v);
    return { type: e.cmd, val: e.val };
  });
  if (arpStop && notation === 'tracker') {
    const free = fx.find((f) => f.type < 0 && f.val < 0);
    if (free) { free.type = 0; free.val = 0; }
    else warnings.push(`${where}: no free effect column for the 0000 that ends the arpeggio of the row before`);
  }
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

/** True for an ADPCM-A / ADPCM-B voice that carries its own sample (the rule the live synth uses). */
function hasUserSample(cfg: FurnaceConfig): cfg is FurnaceConfig & { userSample: FurnaceUserSample } {
  const type = resolveInsType(cfg);
  return (type === DIV_INS_ADPCMA || type === DIV_INS_ADPCMB) && !!cfg.userSample;
}

/** One module sample: the PCM data and the ADPCM voice type that plays it. */
interface ModuleSample {
  sample: FurnaceUserSample;
  insType: number;
}

/** Index of the module sample an ADPCM voice plays, -1 for a voice without a sample of its own. */
function moduleSampleIndex(cfg: FurnaceConfig, samples: ModuleSample[]): number {
  if (!hasUserSample(cfg)) return -1;
  const insType = resolveInsType(cfg);
  return samples.findIndex((s) => s.sample.data === cfg.userSample.data && s.insType === insType);
}

/**
 * The module sample list: every user sample of an ADPCM voice, in instrument order, once per
 * sample buffer and voice type. Two instruments of one type that share a sample buffer share one
 * module sample (same rule as `placeUserSample` in the live synth, which compares the `data`
 * buffer). An ADPCM-A and an ADPCM-B instrument on one buffer get a module sample each: ngdevkit
 * furtool converts a PCM module sample to the codec of the first instrument that names it, so a
 * sample shared across the two types would reach one of them in the wrong codec.
 */
function collectUserSamples(configs: FurnaceConfig[]): ModuleSample[] {
  const list: ModuleSample[] = [];
  for (const cfg of configs) {
    if (hasUserSample(cfg) && moduleSampleIndex(cfg, list) < 0) list.push({ sample: cfg.userSample, insType: resolveInsType(cfg) });
  }
  return list;
}

/**
 * One SMP2 block, in the layout of Furnace `DivSample::putSampleData` (sample.cpp): 16-bit PCM,
 * no loop, rendered on every chip. Furnace converts it to ADPCM-A / ADPCM-B itself.
 */
function encodeSmp2(sample: FurnaceUserSample): Uint8Array {
  const rate = Math.round(sample.rate);
  const b = new Bytes()
    .str(sample.name)
    .u32(sample.data.length)
    .u32(rate).u32(rate)          // centerRate, and the legacy copy of it
    .u8(16)                       // depth: 16-bit
    .u8(0)                        // loop mode
    .u8(0)                        // BRR emphasis
    .u8(0)                        // flags (dither, BRR no filter)
    .u32(0xffffffff).u32(0xffffffff); // loop start / end: -1 = no loop
  for (let i = 0; i < 4; i++) b.u32(0xffffffff); // render on every chip, for each sample memory type
  for (let i = 0; i < sample.data.length; i++) b.u16(sample.data[i] & 0xffff);
  return block('SMP2', b);
}

function toFileInstrument(name: string, cfg: FurnaceConfig, samples: ModuleSample[]): FurnaceInstrument {
  const type = resolveInsType(cfg);
  const sampleIndex = moduleSampleIndex(cfg, samples);
  return {
    name,
    type,
    fm: type === 1 ? cfg : undefined,
    macros: cfg.macros.filter((m) => m.data.length > 0).map(toFileMacro),
    samples: [],
    wavetables: [],
    opMacroArrays: cfg.opMacroArrays?.map((a) => a.filter((m) => m.data.length > 0).map(toFileMacro)),
    // The instrument points at its sample by module index, as the live synth does.
    // One sample for every note: a note map would name samples the module does not hold.
    ...(sampleIndex >= 0
      ? { amiga: { initSample: sampleIndex, useNoteMap: false, useSample: true, useWave: false, waveLen: cfg.amiga?.waveLen ?? 32 } }
      : {}),
  };
}

function checkInstrument(inst: InstrumentConfig, cfg: FurnaceConfig, problems: string[]): void {
  const label = `Instrument ${inst.id} "${inst.name}"`;
  if (hasUserSample(cfg)) {
    if (!(cfg.userSample.data instanceof Int16Array) || cfg.userSample.data.length === 0) problems.push(`${label}: the sample has no 16-bit data`);
    if (!(cfg.userSample.rate > 0)) problems.push(`${label}: the sample has no rate`);
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
  // Furnace writes every pattern the order list names, an empty one too (fur.cpp, patsToWrite).
  // ngdevkit nsstool looks each ordered pattern up in the file and stops on a missing one.
  const orderedPatterns = new Set(song.songPositions);
  const patnBlocks: Uint8Array[] = [];
  for (let ch = 0; ch < FUR_NEO_GEO_CHANNELS; ch++) {
    for (const [pi, p] of song.patterns.entries()) {
      const src = p.channels[ch];
      if (!src && !orderedPatterns.has(pi)) continue;
      const rows: FileCell[] = [];
      for (let r = 0; r < patLen; r++) {
        const cell = src?.rows[r];
        rows.push(cell && src
          ? cellToFile(cell, insIndexById, `Pattern ${pi} channel ${ch + 1} row ${r}`, problems, effectNotationOf(src.channelMeta), warnings,
            trackerArpStopAt(song.patterns, song.songPositions, pi, ch, r))
          : { note: -1, ins: -1, vol: -1, fx: Array.from({ length: MAX_FX_COLUMNS }, () => ({ type: -1, val: -1 })) });
      }
      if (rows.every(isEmptyCell) && !orderedPatterns.has(pi)) continue;
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
    .u16(vN).u16(vD);
  // Speed pattern (song.cpp DivSubSong::readData): length byte, 16 x u16. Two entries = Furnace alternates them per row.
  const speed1 = Math.max(1, song.initialSpeed);
  const speed2 = song.speed2 && song.speed2 > 0 && song.speed2 !== speed1 ? Math.min(65535, song.speed2) : 0;
  sng.u8(speed2 ? 2 : 1);
  for (let i = 0; i < 16; i++) sng.u16(i === 0 ? speed1 : i === 1 ? speed2 : 0);
  sng.str(song.name).str('');
  for (let ch = 0; ch < FUR_NEO_GEO_CHANNELS; ch++) for (const pos of song.songPositions) sng.u8(pos);
  for (let ch = 0; ch < FUR_NEO_GEO_CHANNELS; ch++) sng.u8(fxColumns[ch]);
  // Furnace song.cpp DivSubSong::putData: bit 0 = channel shown in the pattern view, bit 1 = shown in the
  // channel oscilloscope. 0 opens the module with every channel hidden.
  for (let ch = 0; ch < FUR_NEO_GEO_CHANNELS; ch++) sng.u8(3);
  for (let ch = 0; ch < FUR_NEO_GEO_CHANNELS; ch++) sng.u8(0); // collapsed
  for (let ch = 0; ch < FUR_NEO_GEO_CHANNELS; ch++) sng.str('');
  for (let ch = 0; ch < FUR_NEO_GEO_CHANNELS; ch++) sng.str('');
  for (let ch = 0; ch < FUR_NEO_GEO_CHANNELS; ch++) sng.u32(0);
  const sng2 = block('SNG2', sng);

  const userSamples = collectUserSamples(neo.map((inst) => inst.furnace as FurnaceConfig));
  const ins2 = neo.map((inst) => encodeInstrumentAsINS2(toFileInstrument(inst.name, inst.furnace as FurnaceConfig, userSamples), FUR_EXPORT_VERSION));
  const smp2 = userSamples.map((s) => encodeSmp2(s.sample));

  // Chip flags of the YM2610 (fur.cpp, "CHIP FLAGS": key=value lines, zero-terminated). Furnace
  // loads a module without this block at SSG volume 128, half the level of the chip, which
  // furtool then compensates in the wrong amount (see FUR_NEO_GEO_CHIP_FLAGS).
  const flag = block('FLAG', new Bytes().str(FUR_NEO_GEO_CHIP_FLAGS));

  // Compat flags and grooves of a loaded module (CFLG / GROV); a new song omits both and Furnace uses defaults.
  const cflgText = song.compatFlags ? compatFlagsText(song.compatFlags) : '';
  const cflg = cflgText ? block('CFLG', new Bytes().str(cflgText)) : null;
  const grov = (song.grooves ?? []).slice(0, 255).map((g) => block('GROV', grooveBody(g)));

  // Layout: header, INF2, SNG2, FLAG, CFLG, GROV..., INS2..., SMP2..., PATN...
  const buildInf2 = (sngPtr: number, flagPtr: number, cflgPtr: number, grovPtrs: number[], insPtrs: number[], smpPtrs: number[], patPtrs: number[]): Uint8Array => {
    const b = new Bytes()
      .str(song.name).str('').str('Neo Geo MVS').str('')
      .str('').str('').str('').str('')
      .f32(440).u8(1)
      .f32(1).u16(FUR_NEO_GEO_CHANNELS).u16(1)
      .u16(FUR_SYSTEM_YM2610).u16(FUR_NEO_GEO_CHANNELS).f32(1).f32(0).f32(0)
      .u32(0).u8(1); // patchbay: no connections, automatic
    b.u8(0x01).u32(1).u32(sngPtr);
    b.u8(0x02).u32(1).u32(flagPtr);
    if (cflg) b.u8(0x08).u32(1).u32(cflgPtr);
    if (grovPtrs.length > 0) { b.u8(0x0a).u32(grovPtrs.length); grovPtrs.forEach((p) => b.u32(p)); }
    if (insPtrs.length > 0) { b.u8(0x04).u32(insPtrs.length); insPtrs.forEach((p) => b.u32(p)); }
    if (smpPtrs.length > 0) { b.u8(0x06).u32(smpPtrs.length); smpPtrs.forEach((p) => b.u32(p)); }
    if (patPtrs.length > 0) { b.u8(0x07).u32(patPtrs.length); patPtrs.forEach((p) => b.u32(p)); }
    b.u8(0x00);
    return block('INF2', b);
  };
  const inf2Len = buildInf2(0, 0, 0, grov.map(() => 0), ins2.map(() => 0), smp2.map(() => 0), patnBlocks.map(() => 0)).length;
  let cursor = 32 + inf2Len;
  const sngPtr = cursor;
  cursor += sng2.length;
  const flagPtr = cursor;
  cursor += flag.length;
  const cflgPtr = cursor;
  if (cflg) cursor += cflg.length;
  const grovPtrs = grov.map((b) => { const p = cursor; cursor += b.length; return p; });
  const insPtrs = ins2.map((b) => { const p = cursor; cursor += b.length; return p; });
  const smpPtrs = smp2.map((b) => { const p = cursor; cursor += b.length; return p; });
  const patPtrs = patnBlocks.map((b) => { const p = cursor; cursor += b.length; return p; });
  const inf2 = buildInf2(sngPtr, flagPtr, cflgPtr, grovPtrs, insPtrs, smpPtrs, patPtrs);

  const file = new Bytes().ascii('-Furnace module-').u16(FUR_EXPORT_VERSION).u16(0).u32(32);
  for (let i = 0; i < 8; i++) file.u8(0);
  for (const part of [inf2, sng2, flag, ...(cflg ? [cflg] : []), ...grov, ...ins2, ...smp2, ...patnBlocks]) file.bytes(part);

  // An ADPCM voice with no sample of its own names no sample in the module.
  const bare = neo.filter((i) => {
    const t = resolveInsType(i.furnace as FurnaceConfig);
    return (t === DIV_INS_ADPCMA || t === DIV_INS_ADPCMB) && !(i.furnace as FurnaceConfig).userSample;
  });
  if (bare.length > 0) {
    warnings.push(`ADPCM instruments without a sample of their own are written without a sample: ${bare.map((i) => `${i.id} "${i.name}"`).join(', ')}`);
  }
  return { bytes: pako.deflate(file.toUint8Array()), warnings };
}
