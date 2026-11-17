/**
 * CustomMadeParser.ts — Custom Made Amiga music format (cm.* / rk.* / rkb.*) native parser
 *
 * Custom Made (also known as Ron Klaren) is a 4-channel Amiga tracker format
 * created by Ivo Zoer and composed primarily by Ron Klaren. The module file
 * is a single-file compiled 68k Amiga executable.
 *
 * Detection (from UADE "CustomMade_v1.asm", DTP_Check2 routine):
 *   1. File size > 3000 bytes
 *   2. First word is one of:
 *        0x4EF9 (JMP absolute)
 *        0x4EB9 (JSR absolute)
 *        0x6000 (BRA.W)
 *      If 0x6000, then word at offset 4 must also be 0x6000; otherwise skip to More.
 *      If 0x4EF9 or 0x4EB9, then word at offset 6 must be 0x4EF9 (JMP).
 *   3. Scan bytes 8..407 (lea 8(A0),A1; lea 400(A1),A2) for the signature sequence:
 *        u32BE(off+0) == 0x42280030  (CLR.B $30(A0) — voice clear sequence)
 *        u32BE(off+4) == 0x42280031  (CLR.B $31(A0))
 *        u32BE(off+8) == 0x42280032  (CLR.B $32(A0))
 *      Scan advances 2 bytes at a time until the signature is found or A1 reaches A2.
 *
 * Prefixes: cm, rk, rkb
 * UADE eagleplayer.conf: CustomMade  prefixes=cm,rk,rkb
 *
 * Note: A full Ron Klaren parser with note/pattern decoding exists as RonKlarenParser.ts.
 * This CustomMade parser provides the UADE DTP_Check2 detection covering all three
 * prefixes (cm.*, rk.*, rkb.*) as a lightweight metadata-only stub.
 *
 * UADE handles actual audio playback. This parser extracts metadata only.
 *
 * Reference:
 *   third-party/uade-3.05/amigasrc/players/wanted_team/CustomMade/CustomMade_v1.asm
 * Reference parsers: BenDaglishParser.ts, RonKlarenParser.ts
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { createSamplerInstrument } from './AmigaUtils';
import { periodToGridNote } from '@/lib/amiga/periodNotes';
import type { TrackerCell } from '@/types';

// ── Constants ───────────────────────────────────────────────────────────────

const MIN_FILE_SIZE = 3001; // file size must be > 3000

// Delitracker Custom magic: dword at offset 0 in all .cus / cust. / custom. files
const DELITRACKER_CUSTOM_MAGIC = 0x000003f3;

const DEFAULT_INSTRUMENTS = 8;

// ── Binary helpers ──────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Format detection ────────────────────────────────────────────────────────

/**
 * Return true if the buffer is a Custom Made or Delitracker Custom format file.
 *
 * Two sub-formats are detected:
 *
 * 1. Delitracker Custom (.cus / cust. / custom.):
 *    - dword at offset 0 == 0x000003F3
 *    - file size > 3000 bytes
 *
 * 2. CustomMade (cm.* / rk.* / rkb.*) — 68k executable:
 *    - Passes the DTP_Check2 detection algorithm from CustomMade_v1.asm
 *    - First word is 0x4EF9 (JMP), 0x4EB9 (JSR), or 0x6000 (BRA.W)
 *    - Followed by secondary opcode validation
 *    - Voice-clear signature in bytes 8..407
 *
 * When `filename` is supplied and starts with a known prefix (cm., rk., rkb.)
 * only the CustomMade binary scan is attempted. For .cus / cust. extensions
 * only the Delitracker magic is checked. Without a filename both checks run.
 *
 * @param buffer    Raw file bytes
 * @param filename  Original filename (optional; used for prefix/extension check)
 */
export function isCustomMadeFormat(buffer: ArrayBuffer, filename?: string): boolean {
  const buf = new Uint8Array(buffer);

  if (buf.length <= MIN_FILE_SIZE - 1) return false;

  // ── Delitracker Custom check ──────────────────────────────────────────────
  // Files with .cus / .cust / custom. prefix use the Delitracker custom player.
  // They all share the magic value 0x000003F3 at offset 0.
  if (buf.length >= 4 && u32BE(buf, 0) === DELITRACKER_CUSTOM_MAGIC) {
    return true;
  }

  // ── CustomMade (cm./rk./rkb.) binary scan ────────────────────────────────
  if (filename !== undefined) {
    const base = (filename.split('/').pop() ?? filename).toLowerCase();
    const named = ['cm', 'rk', 'rkb'].some((x) => base.startsWith(`${x}.`) || base.endsWith(`.${x}`));
    if (!named) return false;
  }

  // Need at least 8 bytes for the header checks
  if (buf.length < 8) return false;

  const word0 = u16BE(buf, 0);

  // Entry point opcode must be JMP, JSR, or BRA.W
  let scanStart = 8;

  if (word0 === 0x4ef9 || word0 === 0x4eb9) {
    // JMP or JSR: word at offset 6 must be 0x4EF9 (JMP)
    if (u16BE(buf, 6) !== 0x4ef9) return false;
    // scanStart already set to 8
  } else if (word0 === 0x6000) {
    // BRA.W: word at offset 4 must also be 0x6000
    if (buf.length < 6) return false;
    if (u16BE(buf, 4) !== 0x6000) return false;
    // scanStart already set to 8
  } else {
    return false;
  }

  // Scan [scanStart .. scanStart+400) for the voice-clear signature
  // Signature: CLR.B $30(A0), CLR.B $31(A0), CLR.B $32(A0)
  // Encoded as: 0x42280030, 0x42280031, 0x42280032
  const scanEnd = scanStart + 400;
  if (buf.length < scanStart + 12) return false;

  const end = Math.min(scanEnd, buf.length - 12);
  for (let off = scanStart; off <= end; off += 2) {
    if (
      u32BE(buf, off + 0) === 0x42280030 &&
      u32BE(buf, off + 4) === 0x42280031 &&
      u32BE(buf, off + 8) === 0x42280032
    ) {
      return true;
    }
  }

  return false;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Custom Made module file into a TrackerSong.
 *
 * The format is a compiled 68k Amiga executable. This parser creates a
 * metadata-only TrackerSong with placeholder instruments. Actual audio
 * playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive module name)
 */
export async function parseCustomMadeFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isCustomMadeFormat(buffer, filename)) {
    throw new Error('Not a Custom Made module');
  }

  const buf = new Uint8Array(buffer);

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "cm.", "rk.", or "rkb." prefix (case-insensitive)
  const moduleName = baseName.replace(/^(cm|rk|rkb)\.|\.(cm|rk|rkb)$/i, '') || baseName;

  // ── Detect sub-variant ────────────────────────────────────────────────────

  const isDelitracker = buf.length >= 4 && u32BE(buf, 0) === DELITRACKER_CUSTOM_MAGIC;
  const word0 = u16BE(buf, 0);
  const isBRAVariant = word0 === 0x6000;
  const variantLabel = isDelitracker ? 'Delitracker Custom' : 'Custom Made';

  // ── Sample count extraction ───────────────────────────────────────────────
  //
  // Scan the binary for sample table structures. In the CustomMade format,
  // after the voice-clear signature there is typically a sample table with
  // 6 or 8-byte entries (offset + length per sample).
  //
  // For the Delitracker variant, scan for MOVE.W #n,Dn patterns that set
  // sample count, or count recognizable sample headers.

  let sampleCount = DEFAULT_INSTRUMENTS;
  const instruments: InstrumentConfig[] = [];

  try {
    if (isDelitracker) {
      // Delitracker Custom: scan for u16 sample count in the header area.
      // Look for MOVE.W immediate patterns that set sample counts.
      for (let off = 32; off < Math.min(buf.length - 4, 512); off += 2) {
        const op = u16BE(buf, off);
        // MOVE.W #imm,Dn ($303C = MOVE.W #imm,D0, $323C = MOVE.W #imm,D1, etc.)
        if ((op & 0xF1FF) === 0x303C) {
          const val = u16BE(buf, off + 2);
          if (val >= 1 && val <= 64) {
            sampleCount = val;
            break;
          }
        }
      }
    } else {
      // CustomMade (cm/rk/rkb): look for the voice-clear signature location
      // and then scan after it for sample data
      const scanStart = 8;
      const scanEnd = Math.min(scanStart + 400, buf.length - 12);

      let sigOffset = -1;
      for (let off = scanStart; off <= scanEnd; off += 2) {
        if (
          u32BE(buf, off + 0) === 0x42280030 &&
          u32BE(buf, off + 4) === 0x42280031 &&
          u32BE(buf, off + 8) === 0x42280032
        ) {
          sigOffset = off + 12;
          break;
        }
      }

      // Scan for LEA instructions after the signature to find sample tables
      // and extract inline PCM data: each entry is [u32 len] [u16 period] [len bytes PCM]
      if (sigOffset > 0) {
        for (let off = sigOffset; off < Math.min(sigOffset + 512, buf.length - 4); off += 2) {
          const op = u16BE(buf, off);
          if (op === 0x41FA && off + 4 <= buf.length) {
            const disp = u16BE(buf, off + 2);
            const signedDisp = disp < 0x8000 ? disp : disp - 0x10000;
            const target = off + 2 + signedDisp;
            if (target > 0 && target + 8 <= buf.length) {
              // First pass: count entries to validate
              let count = 0;
              let soff = target;
              for (let i = 0; i < 64 && soff + 6 <= buf.length; i++) {
                const len = u32BE(buf, soff);
                if (len === 0 || len > 0x100000) break;
                const period = u16BE(buf, soff + 4);
                if (period === 0) break;
                count++;
                soff += 6 + len;
              }
              if (count >= 2) {
                sampleCount = count;
                // Second pass: extract PCM samples
                soff = target;
                for (let i = 0; i < count && soff + 6 <= buf.length; i++) {
                  const len = u32BE(buf, soff);
                  const period = u16BE(buf, soff + 4);
                  const pcmStart = soff + 6;
                  const pcmEnd = Math.min(pcmStart + len, buf.length);
                  if (pcmEnd > pcmStart && len > 0) {
                    const pcm = buf.slice(pcmStart, pcmEnd);
                    // Convert period to sample rate: PAL clock / period
                    const sampleRate = period > 0 ? Math.round(3546895 / period) : 8287;
                    instruments.push(createSamplerInstrument(
                      i + 1, `${variantLabel} ${i + 1}`, pcm, 64, sampleRate, 0, 0,
                    ));
                  } else {
                    instruments.push({
                      id: i + 1, name: `${variantLabel} ${i + 1}`,
                      type: 'synth' as const, synthType: 'Synth' as const,
                      effects: [], volume: 0, pan: 0,
                    } as InstrumentConfig);
                  }
                  soff += 6 + len;
                }
                break;
              }
            }
          }
        }
      }
    }
  } catch {
    // Binary scan failed — use defaults
  }

  // ── Build instrument list (fallback if PCM extraction didn't populate) ──

  if (instruments.length === 0) {
    for (let i = 0; i < sampleCount; i++) {
      instruments.push({
        id: i + 1,
        name: '',
        type: 'synth' as const,
        synthType: 'Synth' as const,
        effects: [],
        volume: 0,
        pan: 0,
      } as InstrumentConfig);
    }
  }

  // ── Note grid decoded from the module's own replayer data ─────────────────

  const grid = isDelitracker ? null : decodeCustomMadeGrid(buf);
  const totalRows = grid ? Math.max(64, ...grid.channels.map((c) => c.rows)) : 64;
  const numPatterns = Math.ceil(totalRows / 64);
  const emptyCell = () => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
  const eventAt = (pattern: number, row: number, channel: number) => grid?.channels[channel]?.events.get(pattern * 64 + row);

  const patterns = Array.from({ length: numPatterns }, (_, p) => ({
    id: `pattern-${p}`,
    name: `Pattern ${p}`,
    length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: 64 }, (_, r) => {
        const ev = eventAt(p, r, ch);
        return ev && grid ? { ...emptyCell(), note: grid.gridNote(ev.index), instrument: ev.instrument } : emptyCell();
      }),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4,
      originalPatternCount: numPatterns,
      originalInstrumentCount: sampleCount,
      variant: isDelitracker ? 'delitracker' : isBRAVariant ? 'bra' : 'jmp',
    },
  }));

  return {
    name: `${moduleName} [${variantLabel}]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions: patterns.map((_, i) => i),
    songLength: numPatterns,
    restartPosition: 0,
    numChannels: 4,
    // The replayer runs 4 ticks per grid row (note duration byte * 4 ticks), at the CIA rate the module sets.
    initialSpeed: grid ? 4 : 6,
    initialBPM: grid?.bpm ?? 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'customMade',
      patternDataFileOffset: 0,
      bytesPerCell: 1,
      rowsPerPattern: 64,
      numChannels: 4,
      numPatterns,
      moduleSize: buffer.byteLength,
      // A cell is its note byte in the track; track repeats and reused tracks share it.
      getCellFileOffset: (pattern: number, row: number, channel: number) => eventAt(pattern, row, channel)?.noteOffset ?? -1,
      propagateSharedCells: true,
      encodeOverStored: true,
      encodeCell: (_cell: TrackerCell, stored?: Uint8Array) => stored ?? new Uint8Array(1),
      insertNote: (bytes: Uint8Array, pattern: number, row: number, channel: number, cell: TrackerCell) => insertCustomMadeNote(bytes, channel, pattern * 64 + row, cell.note),
      // shortcut: only the note is written back; the instrument comes from $82 commands shared by many notes and needs a command editor.
      effectPatches: (pattern: number, row: number, channel: number, cell: TrackerCell) => {
        const ev = eventAt(pattern, row, channel);
        if (!grid || !(cell.note > 0)) return { patches: [], noteUnchanged: true };
        if (!ev) return { patches: [], noteUnchanged: false }; // a row inside a held note: layoutPatch hands it to insertNote
        const index = grid.indexOfGridNote(cell.note);
        const value = index - ev.transpose;
        if (index < 0 || value < 0 || value > 0x7F) return { patches: [], noteUnchanged: true };
        return { patches: [[ev.noteOffset, value]], noteUnchanged: true };
      },
    } as UADEPatternLayout,
  };
}

// ── Grid decoder (CustomMade_v1.asm InitPlayer scan + per-voice track walk) ─

interface CustomMadeEvent { noteOffset: number; index: number; transpose: number; instrument: number; durOffset: number; trackStart: number }
export interface CustomMadeGrid {
  channels: Array<{ rows: number; events: Map<number, CustomMadeEvent> }>;
  bpm: number;
  /** Address the module is loaded at minus its file offset 0 (a file offset + base is a track pointer). */
  base: number;
  /** Every voice-list entry: where its track pointer sits in the file and the track it plays. */
  entries: Array<{ at: number; track: number }>;
  gridNote: (index: number) => number;
  indexOfGridNote: (note: number) => number;
}

const MAX_GRID_ROWS = 64 * 256;

function s16(buf: Uint8Array, off: number): number {
  const v = u16BE(buf, off);
  return v < 0x8000 ? v : v - 0x10000;
}

/** Subsong 1 of a cm./rk. module as per-voice note events, or null when the replayer tables are not found. */
export function decodeCustomMadeGrid(buf: Uint8Array): CustomMadeGrid | null {
  const len = buf.length;
  let origin: number | null = null;
  let songsTab = -1;
  let ptoff = 0;
  let timer = 0;
  let a3: number | null = null;
  let a4: number | null = null;
  let periodTab = -1;
  let a0 = 0;
  for (let it = 0; it < 0x800 && a0 + 4 <= len; it++) {
    const l = u32BE(buf, a0);
    if (l === 0x48e7f8fc || l === 0x48e7fffe) {
      if (a3 !== null && origin === null) origin = a3 - a0;
      for (let k = 0; k <= 20 && a0 + 2 <= len; k++) {
        const w = u16BE(buf, a0);
        a0 += 2;
        if (w === 0x41fa) { songsTab = a0 + s16(buf, a0); break; }
      }
    } else if (l === 0xe94847f0) {
      ptoff = s16(buf, a0 + 4);
    } else if (l === 0x00bfd500 && a0 >= 1 && a0 + 34 <= len) {
      timer = (buf[a0 - 1] << 8) | buf[a0 + 7];
      if (u16BE(buf, a0 + 20) !== 0x4e71) {
        if (u16BE(buf, a0 + 28) === 0x21fc) a3 = u32BE(buf, a0 + 30);
        else if (u16BE(buf, a0 + 32) === 0xc000) a3 = u32BE(buf, a0 + 22);
        else a3 = u32BE(buf, a0 + 32);
      }
    } else if ((l === 0xe44843fa || l === 0xe448207b) && a4 !== null) {
      const at = a0 + 4 + s16(buf, a0 + 4);
      if (at >= 0 && at + 4 <= len && origin === null) origin = u32BE(buf, at) - a4;
    } else if (l === 0x48e700f0) {
      a4 = a0 + 6 + s16(buf, a0 + 6);
    }
    a0 += 2;
    if (a0 + 4 <= len && u32BE(buf, a0) === 0x1AC01940) { periodTab = a0; break; }
  }
  if (origin === null || songsTab < 0 || periodTab < 0) return null;
  songsTab += ptoff;
  if (songsTab < 0 || songsTab + 16 > len) return null;
  const base = origin;

  const periods: number[] = [];
  for (let o = periodTab; o + 2 <= len && periods.length < 128; o += 2) {
    const p = u16BE(buf, o);
    if (p === 0 || (periods.length > 0 && p >= periods[periods.length - 1])) break;
    periods.push(p);
  }
  const notes = periods.map((p) => periodToGridNote(p));
  const fileOff = (ptr: number) => ptr - base;

  const entries: CustomMadeGrid['entries'] = [];
  const channels = [0, 1, 2, 3].map((voice) => {
    const events = new Map<number, CustomMadeEvent>();
    const list = fileOff(u32BE(buf, songsTab + voice * 4));
    let tick = 0;
    if (list < 0 || list + 12 > len) return { rows: 0, events };
    let entry = list;
    let instrument = 0;
    // One pass over the voice list: each entry's track played (repeat) times, up to the -1 loop marker or a song-end command.
    walk: while (entry + 12 <= len && u32BE(buf, entry) !== 0xFFFFFFFF) {
      const track = fileOff(u32BE(buf, entry));
      const transpose = s16(buf, entry + 6);
      entries.push({ at: entry, track });
      let repeat = u16BE(buf, entry + 10);
      if (repeat === 0x270F) repeat = 0x3E;
      repeat = Math.max(1, repeat);
      if (track < 0 || track >= len) break;
      for (let rep = 0; rep < repeat; rep++) {
        let p = track;
        for (let guard = 0; guard < 0x10000; guard++) {
          if (tick / 4 >= MAX_GRID_ROWS || p + 1 >= len) break walk;
          let b = buf[p];
          if (b === 0x80) { p += 2; b = buf[p]; }
          if (b === 0x81) {
            events.set(tick / 4, { noteOffset: p + 1, index: buf[p + 1] + transpose, transpose, instrument, durOffset: p + 3, trackStart: track });
            tick += ((buf[p + 3] * 4 - 1) & 0xFF) + 1;
            p += 4;
            continue;
          }
          if (b === 0x82) { instrument = buf[p + 1] + 1; p += 2; b = buf[p]; }
          if (b === 0x83) break walk;
          if (b === 0x84) { p += 2; b = buf[p]; }
          if (b === 0x85) break walk;
          if (b & 0x80) break; // track end
          const dur = buf[p + 1];
          if (dur !== 0) {
            events.set(tick / 4, { noteOffset: p, index: b + transpose, transpose, instrument, durOffset: p + 1, trackStart: track });
            tick += ((dur * 4 - 1) & 0xFF) + 1;
          }
          p += 2;
        }
      }
      entry += 12;
    }
    return { rows: Math.ceil(tick / 4), events };
  });

  return {
    channels,
    bpm: timer > 0 ? Math.round(1773447 / timer) : 125,
    base,
    entries,
    gridNote: (index) => (index >= 0 && index < notes.length ? notes[index] : 0),
    indexOfGridNote: (note) => notes.indexOf(note),
  };
}

/** File offset just past a track's terminator (the same walk as decodeCustomMadeGrid). */
function customMadeTrackEnd(buf: Uint8Array, start: number): number {
  let p = start;
  for (let guard = 0; guard < 0x10000 && p + 1 < buf.length; guard++) {
    let b = buf[p];
    if (b === 0x80) { p += 2; b = buf[p]; }
    if (b === 0x81) { p += 4; continue; }
    if (b === 0x82) { p += 2; b = buf[p]; }
    if (b === 0x83) return Math.min(buf.length, p + 1);
    if (b === 0x84) { p += 2; b = buf[p]; }
    if (b === 0x85 || (b & 0x80)) return Math.min(buf.length, p + 2);
    p += 2;
  }
  return buf.length;
}

/**
 * A note typed on a row inside a held note: the covering event is cut at that row and a new event for the rest of its length is written
 * behind it. The track grows by two bytes, so it is copied to the end of the module (pointers are absolute, nothing behind it moves) and
 * every voice-list entry that played the old track points at the copy. Returns null when the row has no covering event to cut.
 */
export function insertCustomMadeNote(bytes: Uint8Array, channel: number, row: number, note: number): Uint8Array | null {
  const grid = decodeCustomMadeGrid(bytes);
  const ch = grid?.channels[channel];
  if (!grid || !ch || row >= ch.rows) return null;
  let r0 = row;
  while (r0 >= 0 && !ch.events.has(r0)) r0--;
  const ev = ch.events.get(r0);
  const index = grid.indexOfGridNote(note);
  if (!ev || r0 === row) return null;
  const dur = bytes[ev.durOffset];
  const value = index - ev.transpose;
  if (index < 0 || value < 0 || value > 0x7F || dur > 63 || r0 + dur <= row) return null;
  const evEnd = ev.durOffset + 1;
  const trackEnd = customMadeTrackEnd(bytes, ev.trackStart);
  const copy = new Uint8Array(trackEnd - ev.trackStart + 2);
  copy.set(bytes.subarray(ev.trackStart, evEnd));
  copy[ev.durOffset - ev.trackStart] = row - r0;
  copy.set([value, dur - (row - r0)], evEnd - ev.trackStart);
  copy.set(bytes.subarray(evEnd, trackEnd), evEnd - ev.trackStart + 2);
  const at = (bytes.length + 1) & ~1;
  const out = new Uint8Array(at + copy.length);
  out.set(bytes);
  out.set(copy, at);
  const dv = new DataView(out.buffer);
  for (const e of grid.entries) if (e.track === ev.trackStart) dv.setUint32(e.at, at + grid.base);
  return out;
}
