/**
 * Furnace Tracker Song (.fur) Exporter
 *
 * Exports DEViLBOX songs to Furnace format for roundtrip workflow.
 * Based on Furnace format specification: https://github.com/tildearrow/furnace/blob/master/papers/format.md
 *
 * Supports:
 * - Modern format (version 228+)
 * - New pattern format (PATN)
 * - New sample format (SMP2)
 * - All instrument types with macros
 * - Wavetables and samples
 */

import { BinaryWriter } from '../../utils/BinaryWriter';
import pako from 'pako';
import type { TrackerCell, ParsedInstrument } from '../../types/tracker';
import type { InstrumentConfig, FurnaceConfig } from '../../types/instrument';
import { cellToFile, trackerArpStopAt, type FileCell, type FurnaceModuleSong } from './FurnaceModuleExporter';
import { effectNotationOf } from '../tracker/effectNotation';
import {
  encodeInstrumentAsINS2,
  type FurnaceInstrument as FileInstrument,
  type FurnaceMacro as FileMacro,
} from '../import/formats/furnace/FurnaceInstrumentParser';
import { DIV_INS_AY } from './FurnaceInstrumentEncoder';

// Format constants
const DIV_ENGINE_VERSION = 228;
const FILE_MAGIC = '-Furnace module-';
const INFO_MAGIC = 'INFO';
const PATN_MAGIC = 'PATN';


/**
 * Export a single instrument to Furnace .fui format
 */
export function exportInstrumentToFurnace(inst: ParsedInstrument): Uint8Array {
  const writer = new BinaryWriter(64 * 1024); // 64KB initial

  // File magic for instrument
  writer.writeMagic('INST');

  // Format version
  writer.writeUint16(DIV_ENGINE_VERSION);

  // Instrument type
  const furType = inst.furnace?.chipType ?? 0;
  writer.writeUint8(furType);

  // Reserved
  writer.writeUint8(0);

  // Instrument name
  writer.writeNullTerminatedString(inst.name || 'Untitled');

  // Write instrument data based on type
  // ... (similar to writeInstrumentData in FurnaceExporter)

  return writer.getBuffer();
}

// =============================================================================
// Furnace AY-3-8910 (Scramble) target
// =============================================================================
//
// Writes a song on AY-3-8910 voices as a version-228 .fur in the old INFO layout, the
// layout Furnace 0.6.x (engine 232) reads, for the BossGame Z80 player (Konami Scramble
// hardware: one AY-3-8910 at 1.789772 MHz, sound tick 58.3 Hz). Every block follows the
// reader in third-party/furnace-master/src/engine/fileOps/fur.cpp (old INFO path,
// version < 240): header with info pointer, INFO with pointer tables, FLAG, ADIR x3,
// INS2, PATN (new pattern format, version >= 157).
//
// Contract of the BossGame player (thoughts/spot/2026-11-13_ay-scramble-export.md,
// widened by the BossGame music brief): one AY-3-8910 system (0x80) per 3 channels, so
// one system for 1-3 channels and two for 4-6, tick 58.3 Hz, one loop point, no release.
// Sequence macros volume / arpeggio / duty (noise period) / wave (mixer bits; bit 2 is
// the hardware envelope) plus the envelope macros. Effects 01 02 03 04 0A 0B 0D 0F FF,
// plus the features beyond the first player: 00, EC, ED and the envelope effects. Those
// stay in the file and are named in the warnings; anything the player will never run
// (07, Cx, F0, FC, E7, samples ...) is left out and named too.
//
// Hardware envelope, as Furnace 0.6.x stores it (platform/ay.cpp, doc/7-systems/ay8910.md):
//   - wave macro (code 3) bit 2 (value & 4) turns the envelope on for the channel;
//   - envelope shape = register 0x0D, 0-15, from macro EX2 (code 6) or effect 22xy
//     (x = shape, y = 1 routes the envelope to this channel);
//   - envelope period = macro EX5 (code 16), or effects 23xx (low byte) / 24xx (high byte),
//     slid by 25xx (up) / 26xx (down);
//   - auto envelope (period follows the note) = macros EX3 (code 7, numerator) and ALG
//     (code 8, denominator), or effect 29xy (x numerator, y denominator).

export const FUR_AY_SCRAMBLE_VERSION = 228;
export const FUR_AY_SCRAMBLE_TICK_HZ = 58.3;
/** Channels of one AY-3-8910 system; a song with 4-6 channels writes two systems. */
export const FUR_AY_SCRAMBLE_CHANNELS = 3;
/** Most AY systems (chips) a song may use. */
export const FUR_AY_SCRAMBLE_MAX_SYSTEMS = 2;
const FUR_SYSTEM_AY8910 = 0x80;
/** ay.cpp setFlags: clockSel 0 = COLOR_NTSC / 2 = 1789772.5 Hz; chipType 0 = AY-3-8910. */
export const FUR_AY_SCRAMBLE_CHIP_FLAGS = 'clockSel=0\nchipType=0\n';
/** Effects the first BossGame player runs. */
export const AY_SCRAMBLE_EFFECTS: ReadonlySet<number> = new Set([0x01, 0x02, 0x03, 0x04, 0x0a, 0x0b, 0x0d, 0x0f, 0xff]);
/** Effects written but beyond the first player: 00, note cut EC, note delay ED, AY envelope shape/period/slide/auto. */
export const AY_SCRAMBLE_EXTRA_EFFECTS: ReadonlyMap<number, string> = new Map([
  [0x00, '00'], [0xec, 'EC (note cut)'], [0xed, 'ED (note delay)'], [0xe5, 'E5xx (fine pitch)'],
  [0x22, '22xy (envelope shape)'], [0x23, '23xx (envelope period low)'], [0x24, '24xx (envelope period high)'],
  [0x25, '25xx (envelope slide up)'], [0x26, '26xx (envelope slide down)'], [0x29, '29xy (auto envelope)'],
]);
/** Macro codes the first BossGame player runs: volume, arpeggio, duty (noise period), wave (mixer bits). */
const AY_SCRAMBLE_MACRO_NAMES: Record<number, string> = { 0: 'volume', 1: 'arpeggio', 2: 'duty', 3: 'wave' };
/** Envelope macros: EX2 shape, EX3 auto-envelope numerator, ALG auto-envelope denominator, EX5 period. */
const AY_SCRAMBLE_ENVELOPE_MACRO_NAMES: Record<number, string> = { 6: 'envelope shape', 7: 'auto envelope numerator', 8: 'auto envelope denominator', 16: 'envelope period' };
/** Wave macro bit 2 turns the AY hardware envelope on. */
const AY_WAVE_ENVELOPE_BIT = 4;
const AY_FX_COLUMNS = 8;

export interface FurnaceAyScrambleResult {
  bytes: Uint8Array;
  /** Things left out or changed to fit the contract; the caller shows them to the user. */
  warnings: string[];
}

export function isAyInstrument(inst: InstrumentConfig): boolean {
  return inst.synthType === 'FurnaceAY' && !!inst.furnace;
}

/** Is the Scramble target on offer (at least one AY-3-8910 voice)? */
export function furnaceAyScrambleExportAvailable(instruments: InstrumentConfig[]): boolean {
  return instruments.some(isAyInstrument);
}

/** BPM at which a DEViLBOX song ticks at the game's 58.3 Hz (tick Hz = BPM * 2 / 5). */
export const FUR_AY_SCRAMBLE_BPM = FUR_AY_SCRAMBLE_TICK_HZ * 5 / 2;

/** Warning when the song's BPM does not give the game's tick rate; null when it does. */
export function ayScrambleTempoWarning(bpm: number): string | null {
  if (Math.abs(bpm * 2 / 5 - FUR_AY_SCRAMBLE_TICK_HZ) < 0.005) return null;
  return `The game plays at ${FUR_AY_SCRAMBLE_TICK_HZ} Hz ticks; this song ticks at ${(bpm * 2 / 5).toFixed(2)} Hz (BPM ${bpm}), so the tempo will differ in the game. Set the BPM to ${FUR_AY_SCRAMBLE_BPM} to match.`;
}

function ayFileInstrument(inst: InstrumentConfig, warnings: string[], keepAll = false): FileInstrument {
  const cfg = inst.furnace as FurnaceConfig;
  const label = `Instrument ${inst.id} "${inst.name}"`;
  const macros: FileMacro[] = [];
  for (const m of cfg.macros) {
    if (m.data.length === 0) continue;
    const code = m.code ?? 0;
    const envelopeName = AY_SCRAMBLE_ENVELOPE_MACRO_NAMES[code];
    const name = AY_SCRAMBLE_MACRO_NAMES[code] ?? envelopeName ?? (keepAll ? `code ${code}` : undefined);
    if (!name) { warnings.push(`${label}: macro ${code} left out, the player runs volume, arpeggio, duty and wave macros only`); continue; }
    if (keepAll && (!AY_SCRAMBLE_MACRO_NAMES[code] && !envelopeName || m.mode !== 0 || m.release >= 0)) {
      warnings.push(`${label}: ${name} macro kept with its mode and release, outside the player contract`);
    }
    if (!keepAll && m.mode !== 0) { warnings.push(`${label}: ${name} macro left out, it is an ADSR or LFO macro, not a sequence`); continue; }
    if (!keepAll && m.release >= 0) warnings.push(`${label}: ${name} macro release point removed, the player has no release`);
    let data = m.data.slice(0, 255);
    if (code === 0 && data.some((v) => v < 0 || v > 15)) {
      warnings.push(`${label}: volume macro values clamped to 0-15`);
      data = data.map((v) => Math.max(0, Math.min(15, v)));
    }
    if (code === 3 && data.some((v) => (v & AY_WAVE_ENVELOPE_BIT) !== 0)) {
      warnings.push(`${label}: wave macro keeps the hardware envelope bit, outside the old player contract, BossGame compiler must support it`);
    }
    if (envelopeName) warnings.push(`${label}: ${envelopeName} macro kept, outside the old player contract, BossGame compiler must support it`);
    macros.push({
      code, length: data.length, loop: m.loop < 0 || m.loop >= data.length ? 255 : m.loop,
      release: keepAll && m.release >= 0 && m.release < data.length ? m.release : 255,
      mode: keepAll ? m.mode : 0, type: 0, delay: m.delay ?? 0, speed: m.speed ?? 1, data,
    });
  }
  if (cfg.opMacroArrays?.some((a) => a.some((m) => m.data.length > 0))) warnings.push(`${label}: per-operator macros left out`);
  return { name: inst.name, type: DIV_INS_AY, macros, samples: [], wavetables: [] };
}

function ayIsEmptyCell(c: FileCell): boolean {
  return c.note < 0 && c.ins < 0 && c.vol < 0 && c.fx.every((f) => f.type < 0 && f.val < 0);
}

/** PATN row data (fur.cpp new pattern format): skip bytes, mask, effect mask, values, 0xff end. */
function ayEncodeRows(rows: FileCell[], w: BinaryWriter): void {
  let i = 0;
  while (i < rows.length) {
    const c = rows[i];
    if (ayIsEmptyCell(c)) {
      let n = 1;
      while (i + n < rows.length && n < 129 && ayIsEmptyCell(rows[i + n])) n++;
      w.writeUint8(n >= 2 ? 128 | (n - 2) : 0);
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
    for (let k = 1; k < AY_FX_COLUMNS; k++) {
      if (c.fx[k].type >= 0) effectMask |= 1 << (2 * k);
      if (c.fx[k].val >= 0) effectMask |= 1 << (2 * k + 1);
    }
    if (effectMask & 0x00ff) mask |= 32;
    if (effectMask & 0xff00) mask |= 64;
    w.writeUint8(mask);
    if (mask & 32) w.writeUint8(effectMask & 0xff);
    if (mask & 64) w.writeUint8(effectMask >> 8);
    if (c.note >= 0) w.writeUint8(c.note);
    if (c.ins >= 0) w.writeUint8(c.ins);
    if (c.vol >= 0) w.writeUint8(c.vol);
    for (let k = 0; k < AY_FX_COLUMNS; k++) {
      if (c.fx[k].type >= 0) w.writeUint8(c.fx[k].type);
      if (c.fx[k].val >= 0) w.writeUint8(c.fx[k].val);
    }
    i++;
  }
  w.writeUint8(0xff);
}

/** Block: 4-byte tag, u32 size patched after the body. */
function ayBlock(w: BinaryWriter, tag: string, body: () => void): number {
  const start = w.getOffset();
  w.writeMagic(tag);
  w.writeUint32(0);
  body();
  const end = w.getOffset();
  w.setOffset(start + 4);
  w.writeUint32(end - start - 8);
  w.setOffset(end);
  return start;
}

function ayPatch(w: BinaryWriter, at: number, value: number): void {
  const here = w.getOffset();
  w.setOffset(at);
  w.writeUint32(value);
  w.setOffset(here);
}

/**
 * Song on AY-3-8910 voices as a Furnace .fur for the BossGame Scramble player.
 * Throws when the song cannot be written at all; contract breaks that can be left out become warnings.
 */
export function exportFurnaceAyScramble(song: FurnaceModuleSong): FurnaceAyScrambleResult {
  const problems: string[] = [];
  const warnings: string[] = [];
  // One system per 3 channels: 1-3 channels write one AY, 4-6 write two (empty channels pad the second).
  const songChannels = Math.max(1, ...song.patterns.map((p) => p.channels.length));
  const nSys = songChannels <= FUR_AY_SCRAMBLE_CHANNELS ? 1 : FUR_AY_SCRAMBLE_MAX_SYSTEMS;
  const nCh = nSys * FUR_AY_SCRAMBLE_CHANNELS;

  const ay = song.instruments.filter(isAyInstrument);
  const insIndexById = new Map<number, number>();
  ay.forEach((inst, i) => insIndexById.set(inst.id, i));
  const skipped = song.instruments.filter((i) => !isAyInstrument(i));
  if (skipped.length > 0) {
    warnings.push(`Left out ${skipped.length} instrument(s) that are not AY-3-8910 voices: ${skipped.map((i) => `${i.id} "${i.name}"`).join(', ')}`);
  }
  if (ay.length === 0) problems.push('The song has no AY-3-8910 instrument');

  if (song.patterns.length === 0) problems.push('The song has no patterns');
  if (song.patterns.length > 256) problems.push('A Furnace order table holds at most 256 patterns');
  if (song.songPositions.length === 0) problems.push('The order list is empty');
  if (song.songPositions.length > 256) problems.push('A Furnace order table holds at most 256 entries');
  for (const pos of song.songPositions) {
    if (!song.patterns[pos]) problems.push(`The order list points at pattern ${pos}, which does not exist`);
  }
  const patLen = Math.max(1, ...song.patterns.map((p) => p.length));
  if (patLen > 256) problems.push(`Pattern length ${patLen} is over the 256 rows of the INFO layout`);

  // Cells: one pattern per channel and pattern index, every ordered pattern written.
  const ordered = new Set(song.songPositions);
  const fxColumns = new Array<number>(nCh).fill(1);
  const dropped = new Map<string, number>();
  const extras = new Map<string, number>();
  const pats: { ch: number; index: number; rows: FileCell[] }[] = [];
  for (const [pi, p] of song.patterns.entries()) {
    if (p.length !== patLen) problems.push(`Pattern ${pi} has ${p.length} rows but the song has ${patLen}: a Furnace song has one pattern length`);
    p.channels.slice(nCh).forEach((chan, k) => {
      if (chan.rows.some((c) => c.note > 0 || c.instrument > 0 || c.volume > 0)) {
        problems.push(`Pattern ${pi} channel ${nCh + k + 1} has notes but the Scramble target holds ${nCh} channels (two AY-3-8910)`);
      }
    });
    for (let ch = 0; ch < nCh; ch++) {
      const src = p.channels[ch];
      const rows: FileCell[] = [];
      for (let r = 0; r < patLen; r++) {
        const cell: TrackerCell | undefined = src?.rows[r];
        if (!cell || !src) {
          rows.push({ note: -1, ins: -1, vol: -1, fx: Array.from({ length: AY_FX_COLUMNS }, () => ({ type: -1, val: -1 })) });
          continue;
        }
        const where = `Pattern ${pi} channel ${ch + 1} row ${r}`;
        if (cell.instrument > 0 && !insIndexById.has(cell.instrument)) problems.push(`${where}: instrument ${cell.instrument} is not an AY-3-8910 instrument`);
        const fc = cellToFile(cell, insIndexById, where, [], effectNotationOf(src.channelMeta), warnings,
          trackerArpStopAt(song.patterns, song.songPositions, pi, ch, r));
        // cellToFile scales the volume column to 0-127; the AY channel volume is 0-15.
        if (fc.vol >= 0) fc.vol = Math.round(fc.vol * 15 / 127);
        for (const f of fc.fx) {
          const extra = f.type >= 0 ? AY_SCRAMBLE_EXTRA_EFFECTS.get(f.type) : undefined;
          if (extra) extras.set(extra, (extras.get(extra) ?? 0) + 1);
          else if (f.type >= 0 && !AY_SCRAMBLE_EFFECTS.has(f.type) && song.keepOutsideContract) {
            const key = f.type.toString(16).toUpperCase().padStart(2, '0');
            extras.set(key, (extras.get(key) ?? 0) + 1);
          } else if (f.type >= 0 && !AY_SCRAMBLE_EFFECTS.has(f.type)) {
            const key = f.type.toString(16).toUpperCase().padStart(2, '0');
            dropped.set(key, (dropped.get(key) ?? 0) + 1);
            f.type = -1; f.val = -1;
          }
        }
        rows.push(fc);
      }
      if (rows.every(ayIsEmptyCell) && !ordered.has(pi)) continue;
      rows.forEach((row) => row.fx.forEach((f, k) => { if (f.type >= 0 || f.val >= 0) fxColumns[ch] = Math.max(fxColumns[ch], k + 1); }));
      pats.push({ ch, index: pi, rows });
    }
  }
  for (const [key, n] of dropped) warnings.push(`Effect ${key} left out ${n} time(s): the Scramble player does not run it`);
  for (const [name, n] of extras) warnings.push(`Effect ${name} kept ${n} time(s), outside the old player contract, BossGame compiler must support it`);

  if (problems.length > 0) {
    const shown = problems.slice(0, 8).join('; ');
    throw new Error(`Cannot export for the AY-3-8910 (Scramble): ${shown}${problems.length > 8 ? `; and ${problems.length - 8} more` : ''}`);
  }

  const instruments = ay.map((inst) => ayFileInstrument(inst, warnings, song.keepOutsideContract));
  const speed = Math.max(1, Math.min(255, song.initialSpeed));
  const w = new BinaryWriter(64 * 1024);

  // Header (fur.cpp: magic, version, reserved, info pointer, 8 reserved bytes)
  w.writeMagic(FILE_MAGIC);
  w.writeUint16(FUR_AY_SCRAMBLE_VERSION);
  w.writeUint16(0);
  w.writeUint32(32);
  w.writeZeros(8);

  const flagPtrAt: number[] = [];
  const insPtrAt: number[] = [];
  const patPtrAt: number[] = [];
  const adirPtrAt: number[] = [];
  ayBlock(w, INFO_MAGIC, () => {
    w.writeUint8(0); // time base
    w.writeUint8(speed);
    w.writeUint8(speed);
    w.writeUint8(1); // arpeggio speed
    w.writeFloat32(FUR_AY_SCRAMBLE_TICK_HZ);
    w.writeUint16(patLen);
    w.writeUint16(song.songPositions.length);
    w.writeUint8(4);
    w.writeUint8(16);
    w.writeUint16(instruments.length);
    w.writeUint16(0); // wavetables
    w.writeUint16(0); // samples
    w.writeUint32(pats.length);
    for (let i = 0; i < 32; i++) w.writeUint8(i < nSys ? FUR_SYSTEM_AY8910 : 0);
    for (let i = 0; i < 32; i++) w.writeInt8(64); // chip volume (64 = 1.0)
    for (let i = 0; i < 32; i++) w.writeInt8(0); // chip panning
    for (let i = 0; i < 32; i++) { if (i < nSys) flagPtrAt.push(w.getOffset()); w.writeUint32(0); }
    w.writeNullTerminatedString(song.name);
    w.writeNullTerminatedString('');
    w.writeFloat32(440);
    // Compat flags, version 37-69 set (Furnace defaults of a new song); fur.cpp reads 20 bytes here at any version.
    // Index 1 is linear pitch (0 off, 1 partial, 2 full); the song's compatFlags.linearPitch overrides the 1.
    const linear = song.compatFlags?.linearPitch;
    for (const v of [0, typeof linear === 'number' ? linear : 1, 2, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1]) w.writeUint8(v);
    for (let i = 0; i < instruments.length; i++) { insPtrAt.push(w.getOffset()); w.writeUint32(0); }
    for (let i = 0; i < pats.length; i++) { patPtrAt.push(w.getOffset()); w.writeUint32(0); }
    for (let ch = 0; ch < nCh; ch++) for (const pos of song.songPositions) w.writeUint8(pos);
    for (let ch = 0; ch < nCh; ch++) w.writeUint8(fxColumns[ch]);
    for (let ch = 0; ch < nCh; ch++) w.writeUint8(1); // shown
    for (let ch = 0; ch < nCh; ch++) w.writeUint8(0); // collapsed
    for (let ch = 0; ch < nCh; ch++) w.writeNullTerminatedString('');
    for (let ch = 0; ch < nCh; ch++) w.writeNullTerminatedString('');
    w.writeNullTerminatedString(''); // song notes
    w.writeFloat32(1); // master volume
    // Compat flags, version 70-130 set: brokenSpeedSel .. oldArpStrategy (with autoSystem at 115).
    for (const v of [0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 4, 0, 0, 1, 1, 0, 0, 0, 0, 2, 0, 1, 0, 0, 0]) w.writeUint8(v);
    w.writeUint16(150); // virtual tempo
    w.writeUint16(150);
    w.writeNullTerminatedString(''); // subsong name
    w.writeNullTerminatedString(''); // subsong notes
    w.writeUint8(0); // additional subsongs
    w.writeZeros(3);
    for (const s of [nSys === 1 ? 'AY-3-8910 (Scramble)' : 'Dual AY-3-8910 (Scramble)', '', '', '', '', '']) w.writeNullTerminatedString(s);
    for (let i = 0; i < nSys; i++) { w.writeFloat32(1); w.writeFloat32(0); w.writeFloat32(0); } // per system: volume, panning, front/rear
    w.writeUint32(0); // patchbay connections
    w.writeUint8(1); // automatic patchbay
    // Compat flags, version 138-200 set: brokenPortaLegato .. oldSampleOffset.
    for (let i = 0; i < 8; i++) w.writeUint8(0);
    w.writeUint8(1); // speed pattern length
    for (let i = 0; i < 16; i++) w.writeUint8(i === 0 ? speed : 0);
    w.writeUint8(0); // grooves
    for (let i = 0; i < 3; i++) { adirPtrAt.push(w.getOffset()); w.writeUint32(0); }
  });

  for (const at of flagPtrAt) ayPatch(w, at, ayBlock(w, 'FLAG', () => w.writeNullTerminatedString(FUR_AY_SCRAMBLE_CHIP_FLAGS)));
  for (const at of adirPtrAt) ayPatch(w, at, ayBlock(w, 'ADIR', () => { w.writeUint32(0); }));
  instruments.forEach((inst, i) => {
    const at = w.getOffset();
    w.writeBytes(encodeInstrumentAsINS2(inst, FUR_AY_SCRAMBLE_VERSION));
    ayPatch(w, insPtrAt[i], at);
  });
  pats.forEach((p, i) => {
    ayPatch(w, patPtrAt[i], ayBlock(w, PATN_MAGIC, () => {
      w.writeUint8(0); // subsong
      w.writeUint8(p.ch);
      w.writeUint16(p.index);
      w.writeNullTerminatedString('');
      ayEncodeRows(p.rows, w);
    }));
  });

  return { bytes: pako.deflate(w.getBuffer()), warnings };
}
