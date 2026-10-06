/**
 * JesperOlsenParser.ts - Jesper Olsen game music (.jo / JO.*)
 *
 * Detection is the Wanted Team EaglePlayer's DTP_Check2 (Jesper Olsen_v1.asm),
 * which knows three kinds of file:
 *
 * - offset-table songs (Format -1, `st`): the LollyPop (L) and Georg Glaxo (G)
 *   songs; the replay routine is the companion WantedTeam.bin. Word 0 in
 *   4..$200, even; every list offset > 0, even, with $7FFF just before it.
 *   The grid is DECODED: JesperOlsenModule.ts (structures, codec, the driver),
 *   jesperOlsenGrid.ts (row reads on the driver's row clock, cell codec).
 * - Format 1: a $6000 BRA chain and the H routine (Harald Hardtand) in the
 *   file, then `4A40 6B00 / 0006 41FA` and a song whose word 4 is `0001 7FFF`.
 * - Format 0 (`clr.b`): a $6000 BRA chain and an older routine in the file
 *   (guldkornsexpressen); `C0FC`, or `0280 0000` then `00FF C0FC`, then the
 *   table `6AE0 64E0` 800..1700 bytes on.
 *
 * Formats 0 and 1 have no decoded grid here; the parser throws and the route
 * takes UADE's.
 * Research: thoughts/shared/research/2026-10-06_jesper-olsen-format.md
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { createSamplerInstrument } from './AmigaUtils';
import { decodeJoModule, isJoOffsetTableSong, joSubsongCount, type JoInstrument, type JoModule } from './JesperOlsenModule';
import { buildJoGrid, joCell, joCellEffectColumns, joWriteCell } from './jesperOlsenGrid';

const MIN_FILE_SIZE = 20;
const ROWS_PER_PATTERN = 64;
const NUM_CHANNELS = 4;
/** Paula's C-2 rate (period 428); a cell's note is the driver's own period index. */
const SAMPLE_RATE = 8287;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

/**
 * Detect a Jesper Olsen module.
 *
 * Mirrors DTP_Check2 from Jesper Olsen_v1.asm exactly:
 *
 * Branch A — new format (word[0] != 0x6000):
 *   D1 = word[0]; must be 4 <= D1 <= 0x200 and even.
 *   Loop (D1/2 - 1) + 1 times: read word at buf[2 + i*2].
 *     Each must be > 0, even, and buf[word - 2] == 0x7FFF.
 *
 * Branch B — old format (word[0] == 0x6000):
 *   Three consecutive 0x6000+positive-even-offset pairs required.
 *   Then check for 0x4A406B00/0x000641FA marker or 0xC0FC/0x02800000/0x6AE064E0 markers.
 */
export function isJesperOlsenFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  const w0 = u16BE(buf, 0);

  // ── Branch A: new format ───────────────────────────────────────────────
  if (w0 !== 0x6000) {
    // D1 = word[0]; 4 <= D1 <= 0x200 and even
    const d1 = w0;
    if (d1 < 4 || d1 > 0x200) return false;
    if (d1 & 1) return false;

    const count = (d1 >>> 1) - 1; // loop count (dbf: count+1 iterations)
    for (let i = 0; i <= count; i++) {
      const off = 2 + i * 2;
      if (off + 2 > buf.length) return false;
      const d2 = u16BE(buf, off);
      if (d2 === 0 || d2 & 0x8000) return false; // beq / bmi → fault
      if (d2 & 1) return false;                   // btst #0 → fault
      // check buf[d2 - 2] == 0x7FFF
      const chkOff = d2 - 2;
      if (chkOff < 0 || chkOff + 2 > buf.length) return false;
      if (u16BE(buf, chkOff) !== 0x7FFF) return false;
    }
    return true; // st (A3) — format = 0xFF = new format
  }

  // ── Branch B: old format (word[0] == 0x6000) ──────────────────────────
  // Three consecutive 0x6000 + positive-even offset pairs
  let a1 = 0; // A1 = A0
  for (let iter = 0; iter <= 2; iter++) {
    if (a1 + 4 > buf.length) return false;
    if (u16BE(buf, a1) !== 0x6000) return false;
    const d2 = u16BE(buf, a1 + 2);
    if (d2 === 0 || d2 & 0x8000) return false; // beq / bmi → fault
    if (d2 & 1) return false;
    a1 += 4;
  }

  // Navigate: A0+6, add word, then check for 0x4A406B00 marker
  let a0b = 6;
  if (a0b + 2 > buf.length) return false;
  const jumpOff = u16BE(buf, a0b);
  a0b += jumpOff; // add.w (A0),A0
  if (a0b + 8 > buf.length) return false;

  const marker1 = u32BE(buf, a0b);
  if (marker1 === 0x4A406B00) {
    const marker2 = u32BE(buf, a0b + 4);
    if (marker2 !== 0x000641FA) return false;
    // add.w (A0),A0 → skip 2 bytes
    a0b += 8;
    if (a0b + 2 > buf.length) return false;
    const disp = u16BE(buf, a0b);
    a0b += disp; // add.w (A0),A0
    // check word[4] == 0x017FFF i.e. words: 0x0001 0x7FFF
    if (a0b + 6 > buf.length) return false;
    const chk = u32BE(buf, a0b + 4);
    return chk === 0x00017FFF;
  }

  // CheckOlder path:
  // subq.l #4,A0 → we're back at a0b (we didn't advance from the jump yet,
  // but the asm does subq.l #4 to undo marker1 read peek).
  // In practice a0b here is the position after the jump.
  let pos = a0b;

  // Check for 0xC0FC at pos
  if (pos + 2 <= buf.length && u16BE(buf, pos) === 0xC0FC) {
    pos += 2;
    // lea 800(A0),A0; lea 900(A0),A1: scan [pos+800, pos+1700) for 0x6AE064E0
    const scanStart = pos + 800;
    const scanEnd = pos + 1700;
    for (let s = scanStart; s < scanEnd && s + 4 <= buf.length; s += 2) {
      if (u32BE(buf, s) === 0x6AE064E0) return true;
    }
    return false;
  }

  // Scan up to 16 words for 0x02800000
  let found0280 = -1;
  for (let i = 0; i <= 15 && pos + 4 <= buf.length; i++, pos += 2) {
    if (u32BE(buf, pos) === 0x02800000) {
      found0280 = pos;
      break;
    }
  }
  if (found0280 < 0) return false;

  // Late path: addq.l #4,A0; check 0x00FFC0FC
  pos = found0280 + 4;
  if (pos + 4 > buf.length) return false;
  if (u32BE(buf, pos) !== 0x00FFC0FC) return false;
  pos += 4;

  // Older path: lea 800(A0),A0; lea 900(A0),A1 - scan [pos+800, pos+1700)
  const scanStart = pos + 800;
  const scanEnd = pos + 1700;
  for (let s = scanStart; s < scanEnd && s + 4 <= buf.length; s += 2) {
    if (u32BE(buf, s) === 0x6AE064E0) return true;
  }
  return false;
}

/** The PCM an instrument starts with, and its repeat part as the loop (description §6.9). */
function instrumentSample(m: JoModule, buf: Uint8Array, ins: JoInstrument): { pcm: Uint8Array; loopStart: number; loopEnd: number } {
  const clip = (o: number, len: number) => buf.slice(Math.max(0, Math.min(o, buf.length)), Math.max(0, Math.min(o + len, buf.length)));
  if (m.driver === 'L' && (ins.sample & 0x80000000)) {
    // IFF 8SVX: one-shot and repeat lengths (low words) 82 and 78 bytes before the BODY data.
    const o = ins.sample & 0x7fffffff;
    const oneShot = u16BE(buf, o - 82), repeat = u16BE(buf, o - 78);
    const pcm = clip(o, oneShot + repeat);
    return { pcm, loopStart: repeat > 2 ? oneShot : 0, loopEnd: repeat > 2 ? Math.min(pcm.length, oneShot + repeat) : 0 };
  }
  const start = clip(ins.sample, 2 * ins.length);
  if (ins.repeatLength <= 1) return { pcm: start, loopStart: 0, loopEnd: 0 };
  const rel = ins.repeat - ins.sample;
  if (rel >= 0 && rel + 2 * ins.repeatLength <= start.length) {
    return { pcm: start, loopStart: rel, loopEnd: rel + 2 * ins.repeatLength };
  }
  const rep = clip(ins.repeat, 2 * ins.repeatLength);
  const pcm = new Uint8Array(start.length + rep.length);
  pcm.set(start); pcm.set(rep, start.length);
  return { pcm, loopStart: start.length, loopEnd: pcm.length };
}

/** The name an IFF sample carries (NAME chunk), if any. */
function iffName(buf: Uint8Array, ins: JoInstrument): string {
  if (!(ins.sample & 0x80000000)) return '';
  const o = ins.sample & 0x7fffffff;
  for (let p = Math.max(0, o - 104); p + 8 <= o; p += 2) {
    if (u32BE(buf, p) === 0x4e414d45) { // 'NAME'
      const len = Math.min(u32BE(buf, p + 4), 32, o - p - 8);
      return String.fromCharCode(...Array.from(buf.subarray(p + 8, p + 8 + Math.max(0, len)))).replace(/\0/g, '').trim();
    }
  }
  return '';
}

/**
 * Parse a Jesper Olsen song into the grid its driver plays. `subsong` is
 * 0-based (UADE's subsong `subsong + 1`, start list `subsong + 1`). Throws for
 * a file with no decoded grid (Formats 0 and 1) and for a subsong out of range.
 */
export function parseJesperOlsenFile(buffer: ArrayBuffer, filename: string, subsong = 0): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isJesperOlsenFormat(buf)) throw new Error('Not a Jesper Olsen module');
  if (!isJoOffsetTableSong(buf)) throw new Error('Jesper Olsen: the song carries its own replay routine (Format 0/1); no decoded grid');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^jo\./i, '').replace(/\.jo$/i, '') || baseName;
  const m = decodeJoModule(buf);
  const count = joSubsongCount(buf);
  if (subsong < 0 || subsong >= count) throw new Error(`Jesper Olsen: subsong ${subsong} of ${count}`);

  const grid = buildJoGrid(buf, subsong);
  const nRows = grid.rowTicks.length;
  if (nRows === 0) throw new Error(`Jesper Olsen: subsong ${subsong} plays nothing`);
  const nPatterns = Math.ceil(nRows / ROWS_PER_PATTERN);
  const readAt = (p: number, row: number, ch: number) => (ch >= 0 && ch < NUM_CHANNELS ? grid.reads[p * ROWS_PER_PATTERN + row]?.[ch] : undefined);

  const columns = Array.from({ length: NUM_CHANNELS }, (_, ch) => grid.reads.map((r) => joCell(r[ch])));
  const patterns: Pattern[] = Array.from({ length: nPatterns }, (_, p) => {
    const first = p * ROWS_PER_PATTERN;
    const length = Math.min(ROWS_PER_PATTERN, nRows - first);
    return {
      id: `pattern-${p}`,
      name: `Rows ${first}-${first + length - 1}`,
      length,
      channels: columns.map((cells, ch) => {
        const rows = cells.slice(first, first + length);
        const effectCols = Math.max(2, ...rows.map(joCellEffectColumns));
        return {
          id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false,
          solo: false, collapsed: false, volume: 100,
          pan: ch === 0 || ch === 3 ? -50 : 50,
          instrumentId: null, color: null, rows,
          ...(effectCols > 2 ? { channelMeta: { importedFromMOD: false, effectCols } } : {}),
        };
      }),
      importMetadata: {
        sourceFormat: 'MOD' as const, sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: NUM_CHANNELS, originalPatternCount: m.patterns.length,
        originalInstrumentCount: m.instruments.length,
      },
    };
  });

  // The instrument column is an index into the voice's instrument table (one
  // table per start entry; every corpus song has one): table 0's order.
  const table = m.instrumentTables[0]?.entries ?? [];
  const instruments: InstrumentConfig[] = table.map((at, i) => {
    const ins = m.instruments.find((x) => x.at === at)!;
    const { pcm, loopStart, loopEnd } = instrumentSample(m, buf, ins);
    const name = iffName(buf, ins) || `Instrument ${i + 1}`;
    if (pcm.length === 0) {
      return { id: i + 1, name, type: 'synth' as const, synthType: 'Synth' as const, effects: [], volume: 0, pan: 0 } as InstrumentConfig;
    }
    return createSamplerInstrument(i + 1, name, pcm, Math.round((Math.min(ins.volume, 63) * 64) / 63), SAMPLE_RATE, loopStart, loopEnd);
  });

  // Row clock: G rows are evenly spaced (tempo $22: 3 ticks); L rows are not
  // ($5A: 3,3,3,2,...), so the playhead takes the row ticks themselves.
  const gaps = grid.rowTicks.slice(1).map((t, i) => t - grid.rowTicks[i]);
  const even = gaps.length > 0 && gaps.every((g) => g === gaps[0]);
  const ticksPerRow = gaps.length ? (grid.rowTicks[nRows - 1] - grid.rowTicks[0]) / gaps.length : 3;
  const speed = even ? gaps[0] : Math.max(1, Math.round(ticksPerRow));
  // 125 BPM = 50 ticks/s; the TS clock's rows run at the driver's mean row rate.
  const bpm = even ? 125 : Math.round((125 * speed) / ticksPerRow);

  const layout: UADEPatternLayout = {
    formatId: 'jesperOlsen',
    patternDataFileOffset: 0,
    bytesPerCell: 2,
    rowsPerPattern: ROWS_PER_PATTERN,
    numChannels: NUM_CHANNELS,
    numPatterns: nPatterns,
    moduleSize: buffer.byteLength,
    encodeCell: () => { throw new Error('Jesper Olsen cells are written through writeCell (their bytes depend on the voice\'s transpose)'); },
    getCellFileOffset: (p, row, ch) => readAt(p, row, ch)?.noteAt ?? -1,
    writeCell: (p, row, ch, cell) => {
      const read = readAt(p, row, ch);
      return read ? joWriteCell(read, cell) : [];
    },
  };

  return {
    name: `${moduleName} [Jesper Olsen]`, format: 'MOD' as TrackerFormat,
    patterns, instruments,
    songPositions: patterns.map((_, i) => i), songLength: nPatterns, restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: speed, initialBPM: bpm, linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    // G rows are `speed` player interrupts apart from the first one (the voice
    // records in UADE's chip RAM follow the driver model tick for tick); L rows
    // are not evenly spaced, so its playhead needs the row ticks themselves
    // (open: TickGrid row-tick table) and stays on the TS clock meanwhile.
    ...(even ? { uadePlayerTickGrid: true } : {}),
    uadeEditableSubsongs: count > 1 ? {
      count,
      speeds: Array<number>(count).fill(speed),
      start: subsong,
      first: 1,
    } : undefined,
    uadePatternLayout: layout,
  };
}
