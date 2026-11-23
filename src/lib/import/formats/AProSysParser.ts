/**
 * AProSysParser.ts - AProSys (Petter A. Urkedal, 1989-90). Layout from nuade players/aprosys (aprosys_module.c, aprosys.c).
 *
 * File: "ADRVPACK" then 9 sections, each a u32 BE length and its data (not packed despite the name):
 * order, steps, tracks, arpeggios, instruments, envelopes, sample records, sample data, one unused.
 *   order: 2-byte commands, b0&0xe0 = command, b0&0x1f = count, b1 = param. 0x20 = play `count` steps from step `param`,
 *          0x60 = jump order_pos += (signed) param, 0x80 = octave (period base), 0xa0 = speed, 0x00 = end.
 *   steps: 26 bytes: duration, rows, then 4 voice cells of 6 bytes [note, instrument, volume, arpeggio, track u16 BE].
 *          Voice note 0x3f = voice silent for the step. Voice v reads tracks + (track + row) * 4 on each row.
 *   tracks: 4-byte entries, the grid cells (AProSysEncoder.ts).
 * Grid: one pattern per step (step.rows rows, 4 channels); song positions walk the order list. Each cell is the track
 * entry its voice reads at that row, so a track shared by several steps or voices is one stored cell (propagateSharedCells).
 * Grid note = stored note + the step cell's note + the octave in force when the step first plays (noteOffset).
 * Playback stays UADE; edits reach the module in place through getCellFileOffset (fixed 4-byte cells, byte-exact).
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern, TrackerCell } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { decodeAProSysCell, encodeAProSysCell } from '@/engine/uade/encoders/AProSysEncoder';

const MAGIC = 'ADRVPACK';
const STEP_SIZE = 26;
const INSTRUMENT_SIZE = 26;
const NUM_CH = 4;
const NO_NOTE = 0x3f;

export function isAProSysFormat(_buffer: ArrayBuffer | Uint8Array, filename?: string): boolean {
  if (filename) {
    const base = (filename.split('/').pop() ?? '').toLowerCase();
    if (base.startsWith('aps.') || base.endsWith('.aps')) return true;
  }
  return false;
}

interface Section { at: number; len: number }

function readSections(buf: Uint8Array): Section[] | null {
  if (buf.length < 8 || String.fromCharCode(...buf.subarray(0, 8)) !== MAGIC) return null;
  const out: Section[] = [];
  let p = 8;
  for (let i = 0; i < 9; i++) {
    if (p + 4 > buf.length) return null;
    const len = ((buf[p] << 24) | (buf[p + 1] << 16) | (buf[p + 2] << 8) | buf[p + 3]) >>> 0;
    if (p + 4 + len > buf.length) return null;
    out.push({ at: p + 4, len });
    p += 4 + len;
  }
  return out;
}

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

export function parseAProSysFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  const sections = readSections(buf);
  if (!sections) throw new Error('AProSys: not an ADRVPACK module');
  const [order, steps, tracks, , instr] = sections;
  const numSteps = Math.floor(steps.len / STEP_SIZE);
  if (numSteps === 0) throw new Error('AProSys: module has no steps');

  const stepAt = (s: number) => steps.at + s * STEP_SIZE;
  const voiceCell = (s: number, v: number) => stepAt(s) + 2 + v * 6;
  const rowsOf = (s: number) => Math.max(1, buf[stepAt(s) + 1]);

  // Walk the order list as fetch_order does, recording the octave each step is first played with.
  const positions: number[] = [];
  const stepOctave = new Map<number, number>();
  let octave = 0;
  let speed = 6;
  const orderEntries = order.len >> 1;
  for (let pos = 0, guard = 0; pos >= 0 && pos < orderEntries && guard < 1024; guard++) {
    const b0 = buf[order.at + pos * 2];
    const b1 = buf[order.at + pos * 2 + 1];
    const cmd = b0 & 0xe0;
    if (cmd === 0x00) break;
    if (cmd === 0x20) {
      for (let i = 0; i < (b0 & 0x1f); i++) {
        const s = b1 + i;
        if (s >= numSteps) continue;
        positions.push(s);
        if (!stepOctave.has(s)) stepOctave.set(s, octave);
      }
    } else if (cmd === 0x60) {
      const rel = b1 >= 0x80 ? b1 - 0x100 : b1;
      if (rel <= 0) break; // backward jump = the song loops
      pos += rel;
      continue;
    } else if (cmd === 0x80) octave = b1 & 0x3f;
    else if (cmd === 0xa0 && b1 > 0) speed = b1;
    pos++;
  }

  const cellOffset = (p: number, r: number, ch: number): number => {
    if (p < 0 || p >= numSteps || ch < 0 || ch >= NUM_CH || r < 0 || r >= rowsOf(p)) return -1;
    const vc = voiceCell(p, ch);
    if ((buf[vc] & 0x3f) === NO_NOTE) return -1; // voice silent for this step: it reads no track
    const off = tracks.at + (((buf[vc + 4] << 8) | buf[vc + 5]) + r) * 4;
    return off + 4 <= tracks.at + tracks.len ? off : -1;
  };
  const noteOffset = (p: number, _r: number, ch: number): number | null => {
    if (p < 0 || p >= numSteps) return null;
    const n = buf[voiceCell(p, ch)] & 0x3f;
    return n === NO_NOTE ? null : n + (stepOctave.get(p) ?? 0);
  };

  const patterns: Pattern[] = Array.from({ length: numSteps }, (_, p) => ({
    id: `pattern-${p}`,
    name: `Step ${p}`,
    length: rowsOf(p),
    channels: Array.from({ length: NUM_CH }, (_, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false, solo: false, collapsed: false, volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50, instrumentId: null, color: null,
      rows: Array.from({ length: rowsOf(p) }, (_, r) => {
        const off = cellOffset(p, r, ch);
        if (off < 0) return emptyCell();
        const cell = decodeAProSysCell(buf.subarray(off, off + 4));
        const shift = noteOffset(p, r, ch);
        if (cell.note > 0 && shift !== null) cell.note += shift;
        return cell;
      }),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile: filename, importedAt: new Date().toISOString(),
      originalChannelCount: NUM_CH, originalPatternCount: numSteps, originalInstrumentCount: 0,
    },
  }));

  const numInstruments = Math.floor(instr.len / INSTRUMENT_SIZE);
  const instruments: InstrumentConfig[] = Array.from({ length: Math.max(1, numInstruments) }, (_, i) => ({
    id: i + 1, name: `Instrument ${i + 1}`,
    type: 'synth' as const, synthType: 'Synth' as const,
    effects: [], volume: 0, pan: 0,
  } as InstrumentConfig));

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^aps\./i, '').replace(/\.aps$/i, '') || baseName;
  return {
    name: `${moduleName} [AProSys]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions: positions.length ? positions : [0],
    songLength: positions.length || 1,
    restartPosition: 0,
    numChannels: NUM_CH,
    initialSpeed: speed,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'aProSys',
      patternDataFileOffset: tracks.at,
      bytesPerCell: 4,
      rowsPerPattern: rowsOf(0),
      numChannels: NUM_CH,
      numPatterns: numSteps,
      moduleSize: buffer.byteLength,
      encodeCell: encodeAProSysCell,
      encodeOverStored: true,
      decodeCell: decodeAProSysCell,
      getCellFileOffset: cellOffset,
      propagateSharedCells: true,
      noteOffset,
    } satisfies UADEPatternLayout,
  };
}
