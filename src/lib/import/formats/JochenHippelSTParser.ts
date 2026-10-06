/**
 * JochenHippelSTParser.ts - Jochen Hippel's Atari ST songs (.hst, .sog, .soc;
 * hst.* / mdst.*): the grid the player plays, decoded from the song itself.
 *
 * The song (raw TFMX/MMME, or packed COSO, behind the original replay code
 * in a .hst) is read by JochenHippelSTModule.ts, reversed from the Wanted
 * Team "Jochen Hippel ST" eagleplayer. The grid is the player's own walk of
 * it (runHstSequencer): one pattern per step, three channels (the YM2149's
 * voices), a row per player row, each cell the note event the voice reads on
 * that row. UADE plays the song (its ST player), from a playback image whose
 * patterns hold one event per row so a grid edit is a write of that row
 * (JochenHippelSTSong.ts). Research: thoughts/shared/research/2026-10-05_hippel-st-replayer.md
 *
 * Also here: the detection the Amiga "Jochen Hippel" player (SOG./MCMD.,
 * Jochen Hippel_v1.asm) uses, which .hip / .mcmd files still route by.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern, TrackerCell } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import {
  decodeHstModule, hstHeader, hstStep, hstStepCount, hstSubsongRange, hstSubsongs, locateHstSong,
  hstU16, hstU32, type HstModule,
} from './JochenHippelSTModule';
import { HstSongEdit, hstGrid } from './JochenHippelSTSong';

const MIN_FILE_SIZE = 20;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

// ── Atari ST song detection (the ST player's Check) ───────────────────────

/**
 * The first sound sequences' $E2 commands (Check lbC0002B6): an ST song
 * follows $E2 with a negative byte at least as often as with a positive one
 * (Amiga TFMX names a sample there).
 */
function stSoundSequencesLookST(m: HstModule): boolean {
  const s = m.song;
  const n = hstU16(hstHeader(m), 4) + 1;
  let pos = 0;
  let neg = 0;
  for (let i = 0; i < n; i++) {
    let seq: Uint8Array;
    if (s.kind === 'raw') seq = s.sndSeqs[i];
    else {
      const off = s.longPointers ? hstU32(s.sndRegion, i * 4) : hstU16(s.sndRegion, i * 2);
      seq = s.sndRegion.subarray(off - 64);
    }
    if (seq[0] === 0xe2) { if (seq[1] & 0x80) neg++; else pos++; }
  }
  return neg >= pos;
}

/**
 * An Atari ST Hippel song as the ST player's Check accepts it: TFMX/MMME at
 * offset 0 or behind a `lea` of the replay code, or COSO; a TFMX header with
 * subsongs; sound sequences that read as ST; and every section inside the
 * file (decodeHstModule).
 */
export function isJochenHippelSTFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 64) return false;
  const loc = locateHstSong(buf);
  if (!loc) return false;
  const h = loc.magic === 'COSO' ? loc.offset + 32 : loc.offset;
  if (loc.magic === 'COSO') {
    const inner = String.fromCharCode(buf[h], buf[h + 1], buf[h + 2], buf[h + 3]);
    if (inner !== 'TFMX' && inner !== 'MMME') return false;
    if (u32BE(buf, loc.offset + 24) === 0) return false;
  } else if (u16BE(buf, h + 4) >= 0x200) return false;
  if (u16BE(buf, h + 16) === 0) return false;
  try {
    const m = decodeHstModule(buf);
    return String.fromCharCode(...hstHeader(m).subarray(0, 4)) === 'MMME' || stSoundSequencesLookST(m);
  } catch {
    return false;
  }
}

// ── The grid ──────────────────────────────────────────────────────────────

const NUM_CHANNELS = 3;
const CHANNEL_PAN = [-50, 0, 50];

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

/** A step command $Fx attenuates the voice by x (of 15) for the step: shown as row 0's volume. */
function attenuationVolume(command: number): number {
  if ((command & 0xf0) !== 0xf0) return 0;
  return 0x10 + Math.round(((15 - (command & 0x0f)) * 64) / 15);
}

/** The XM speed effect. */
const EFFECT_SPEED = 0x0f;

/**
 * Parse an Atari ST Hippel song into the grid the player plays. `subsong` is
 * UADE's number (the player counts from 1; 0 is the first).
 */
export function parseJochenHippelSTFile(buffer: ArrayBuffer, filename: string, subsong = 0): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isJochenHippelSTFormat(buf)) throw new Error('Not a Jochen Hippel ST song');
  const edit = new HstSongEdit(buf.slice());
  const m = edit.module;

  const baseName = filename.split('/').pop() ?? filename;
  const stem = baseName.replace(/^(hst|mdst)\./i, '').replace(/\.(hst|sog|soc)$/i, '') || baseName;

  const subs = hstSubsongs(m);
  const count = Math.max(1, subs.length);
  const index = Math.min(count - 1, Math.max(0, subsong - 1));
  const orderOf = (i: number): number[] => {
    const r = hstSubsongRange(m, i);
    return Array.from({ length: r.last - r.first + 1 }, (_, k) => r.first + k).filter((s) => edit.stepRows[s] !== null);
  };
  const songPositions = orderOf(index);
  if (songPositions.length === 0) throw new Error(`Hippel ST: subsong ${index + 1} plays nothing`);

  const grid = hstGrid(edit);
  const nSteps = hstStepCount(m);
  const patterns: Pattern[] = Array.from({ length: nSteps }, (_, step) => {
    const rowsN = edit.stepRows[step] ?? 32;
    const cells = grid[step];
    return {
      id: `pattern-${step}`,
      name: `Step ${step}`,
      length: rowsN,
      channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => {
        const sv = hstStep(m, step, ch);
        const rows = cells ? cells[ch].map((c) => ({ ...c })) : Array.from({ length: rowsN }, emptyCell);
        if (rows.length > 0) rows[0].volume = attenuationVolume(sv.command);
        // $Ex: the speed changes from the step's second row (the first runs
        // on the counter reloaded before the voice read the step).
        if ((sv.command & 0xf0) === 0xe0 && rows.length > 0) {
          const at = rows.length > 1 ? 1 : 0;
          rows[at].effTyp = EFFECT_SPEED;
          rows[at].eff = sv.command & 0x0f;
        }
        return {
          id: `channel-${ch}`, name: `Voice ${String.fromCharCode(65 + ch)}`, muted: false,
          solo: false, collapsed: false, volume: 100, pan: CHANNEL_PAN[ch],
          instrumentId: null, color: null, rows,
        };
      }),
      importMetadata: {
        sourceFormat: 'MOD' as const, sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: NUM_CHANNELS, originalPatternCount: nSteps,
        originalInstrumentCount: edit.volSeqs,
      },
    };
  });

  const instruments: InstrumentConfig[] = Array.from({ length: edit.volSeqs }, (_, i) => ({
    id: i + 1, name: `Volume sequence ${i}`, type: 'synth' as const,
    synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig));

  const speedOf = (i: number) => hstSubsongRange(m, i).speed;
  const firstSlot = edit.cellOffset(songPositions[0], 0, 0);
  const layout: UADEPatternLayout = {
    formatId: 'jochenHippelST',
    patternDataFileOffset: Math.max(0, firstSlot),
    bytesPerCell: 2,
    rowsPerPattern: Math.max(...patterns.map((p) => p.length)),
    numChannels: NUM_CHANNELS,
    numPatterns: nSteps,
    moduleSize: edit.image.length,
    encodeCell: () => { throw new Error('Hippel ST cells are written through writeCell (their bytes depend on the step)'); },
    getCellFileOffset: (p, row, ch) => edit.cellOffset(p, row, ch),
    writeCell: (p, row, ch, cell) => edit.edit(p, row, ch, cell) ?? [],
  };

  return {
    name: `${stem} [Jochen Hippel ST]`, format: 'MOD' as TrackerFormat,
    patterns, instruments,
    songPositions, songLength: songPositions.length, restartPosition: 0, numChannels: NUM_CHANNELS,
    initialSpeed: speedOf(index), initialBPM: 125, linearPeriods: false,
    // UADE's ST player plays the playback image (named .hst: the `sog` and
    // `soc` names reach the Amiga Hippel players).
    uadeEditableFileData: edit.image.buffer.slice(edit.image.byteOffset, edit.image.byteOffset + edit.image.byteLength) as ArrayBuffer,
    uadeEditableFileName: `${stem}.hst`,
    // Rows are `speed` player interrupts from the first one (proven against
    // the player's voice state, jochenHippelSTGridMatchesPlayer.test.ts).
    uadePlayerTickGrid: true,
    uadeEditableSubsongs: count > 1 ? {
      count,
      speeds: Array.from({ length: count }, (_, i) => speedOf(i)),
      orders: Array.from({ length: count }, (_, i) => orderOf(i)),
      start: index,
      first: 1,
    } : undefined,
    uadePatternLayout: layout,
  };
}

// ── The Amiga "Jochen Hippel" player's SOG./MCMD. detection (.hip, .mcmd) ──

const MAGIC_TFMX = (0x54 << 24 | 0x46 << 16 | 0x4D << 8 | 0x58) >>> 0; // 'TFMX'
const MAGIC_MCMD = (0x4D << 24 | 0x43 << 16 | 0x4D << 8 | 0x44) >>> 0; // 'MCMD'

/**
 * The TFMX song check of the Amiga "Jochen Hippel" player (Jochen Hippel_v1.asm,
 * Check2 Found): 'TFMX', a zero byte, a non-zero word at +12, and the sample
 * table where the header's counts put it.
 */
function checkAmigaTfmxSong(buf: Uint8Array, songOff: number): boolean {
  if (songOff + 20 > buf.length) return false;
  if (u32BE(buf, songOff) !== MAGIC_TFMX) return false;
  if (buf[songOff + 4] !== 0) return false;
  if (u16BE(buf, songOff + 12) === 0) return false;
  let a0 = songOff + 4;
  const w0 = u16BE(buf, a0); a0 += 2;
  const w1 = u16BE(buf, a0); a0 += 2;
  let d1 = ((2 + w0 + w1) << 6) >>> 0;
  const w2 = u16BE(buf, a0); a0 += 2;
  let d2 = (1 + w2) >>> 0;
  const w3 = u16BE(buf, a0); a0 += 2;
  const d3 = Math.imul(1 + w3, 12) >>> 0;
  const w4 = u16BE(buf, a0); a0 += 2;
  d2 = Math.imul(d2, w4) >>> 0;
  d1 = (d1 + d2 + d3) >>> 0;
  a0 += 2;
  const w5 = u16BE(buf, a0); a0 += 2;
  d1 = (d1 + Math.imul(1 + w5, 6) + 32) >>> 0;
  const checkOff = a0 + d1;
  if (checkOff + 34 > buf.length) return false;
  if (u32BE(buf, checkOff) !== 0) return false;
  const d2final = u16BE(buf, checkOff + 4);
  if (d2final === 0) return false;
  return (d2final * 2) >>> 0 === u32BE(buf, checkOff + 30);
}

/**
 * The Amiga "Jochen Hippel" player's module check (Jochen Hippel_v1.asm
 * Check2): a TFMX song at offset 0, an MCMD module, or a SOG module (replay
 * code in front, the song behind its `lea`). .hip / .mcmd route by it.
 */
export function isJochenHippelAmigaSogFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  const first4 = u32BE(buf, 0);
  if (first4 === MAGIC_TFMX) return true;
  if (first4 === 0x48E7FFFE) {
    let off = 4;
    if (buf[off] !== 0x61) return false;
    off += 1;
    const d1 = buf[off]; off += 1;
    if (d1 === 0 || d1 & 1) return false;
    off += d1;
    if (off + 4 > buf.length || u32BE(buf, off) !== 0x2F006100) return false;
    off += 4;
    if (off + 2 > buf.length) return false;
    off += 2 + u16BE(buf, off);
    if (off + 2 > buf.length || u16BE(buf, off) !== 0x41FA) return false;
    off += 18;
    if (off + 2 > buf.length || u16BE(buf, off) !== 0x41FA) return false;
    off += 2;
    if (off + 2 > buf.length) return false;
    off += 2 + u16BE(buf, off);
    return off + 4 <= buf.length && u32BE(buf, off) === MAGIC_MCMD;
  }
  if (buf[0] !== 0x60) return false;
  let off: number;
  const shortBranch = buf[1];
  if (shortBranch === 0) {
    if (6 > buf.length) return false;
    const d1 = u16BE(buf, 2);
    if (d1 & 0x8000 || d1 & 1) return false;
    if (u16BE(buf, 4) !== 0x6000) return false;
    off = 2 + d1;
    if (off + 4 > buf.length || u32BE(buf, off) !== 0x48E7FFFE) return false;
    off += 4;
  } else {
    if (shortBranch & 1) return false;
    off = 2 + shortBranch;
    if (off + 4 > buf.length || u32BE(buf, off) !== 0x48E7FFFE) return false;
    off += 4;
    if (off + 2 > buf.length || u16BE(buf, off) !== 0x6100) return false;
    off += 2;
    if (off + 2 > buf.length) return false;
    off += u16BE(buf, off);
    if (off + 4 > buf.length || u32BE(buf, off) !== 0x2F006100) return false;
    off += 4;
    if (off + 2 > buf.length) return false;
    off += u16BE(buf, off);
    if (off + 2 > buf.length || u16BE(buf, off) !== 0x41FA) return false;
    off += 20;
  }
  if (off + 2 > buf.length) return false;
  if (u16BE(buf, off) === 0x41FA) off += 2;
  else {
    off += 2;
    if (off + 2 > buf.length || u16BE(buf, off) !== 0x41FA) return false;
    off += 2;
  }
  if (off + 2 > buf.length) return false;
  const songOff = off + u16BE(buf, off);
  return checkAmigaTfmxSong(buf, songOff);
}

/**
 * The Amiga SOG./MCMD. module as one empty pattern; its audio is
 * libtfmxaudiodecoder's (hippelFileData). Not decoded: provenance row 'hip'.
 */
export function parseJochenHippelAmigaSogFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isJochenHippelAmigaSogFormat(buf)) throw new Error('Not a Jochen Hippel SOG/MCMD module');
  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^(sog|mcmd)\./i, '').replace(/\.(hip|mcmd)$/i, '') || baseName;
  const emptyRows = Array.from({ length: 64 }, emptyCell);
  return {
    name: `${moduleName} [Jochen Hippel]`, format: 'MOD' as TrackerFormat,
    patterns: [{
      id: 'pattern-0', name: 'Pattern 0', length: 64,
      channels: Array.from({ length: 4 }, (_, ch) => ({
        id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false,
        solo: false, collapsed: false, volume: 100,
        pan: ch === 0 || ch === 3 ? -50 : 50,
        instrumentId: null, color: null, rows: emptyRows.map((c) => ({ ...c })),
      })),
      importMetadata: {
        sourceFormat: 'MOD' as const, sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4, originalPatternCount: 1, originalInstrumentCount: 0,
      },
    }],
    instruments: [{
      id: 1, name: 'Sample 1', type: 'synth' as const,
      synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
    } as InstrumentConfig],
    songPositions: [0], songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    hippelFileData: buffer.slice(0),
  };
}
