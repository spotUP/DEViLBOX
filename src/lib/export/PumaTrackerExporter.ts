/**
 * PumaTrackerExporter.ts — Export TrackerSong to PumaTracker (.puma) format.
 *
 * Rebuilds the .puma file from TrackerSong pattern data while preserving
 * the original instrument scripts and PCM sample data from the stored
 * pumaTrackerFileData.
 *
 * File layout:
 *   Header (80 bytes): songName[12], lastOrder(u16BE), numPatterns(u16BE),
 *     numInstruments(u16BE), unknown(u16BE=0), sampleOffset[10](u32BE),
 *     sampleLength[10](u16BE, words)
 *   Order list: numOrders × 14 bytes (4×{pattern, instrTranspose, noteTranspose} + speed + zero)
 *   Pattern data: numPatterns × ("patt" + RLE groups) + "patt" terminator
 *   Instrument data: numInstruments × ("inst" + vol script + "insf" + pitch script) + "inst"
 *   PCM samples: at absolute file offsets
 *
 * Cell format (per row, before RLE):
 *   noteX2(u8): note * 2 (0 = empty, must be even)
 *   instrEffect(u8): bits 4-0 = instrument (1-31), bits 7-5 = effect type (0-3)
 *   param(u8): effect parameter
 *
 * Note reverse mapping:
 *   Parser: cell.note = 12 + (noteX2 + noteTranspose) / 2
 *   Encoder: noteX2 = (cell.note - 12) * 2  (we export with noteTranspose=0)
 */

import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { editedCells } from '@/lib/song/gridBaseline';
import type { Pattern } from '@/types';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { TrackerCell } from '@/types';

const HEADER_SIZE = 80;
const ORDER_ENTRY_SIZE = 14;
const NUM_ROWS = 32;

// ── RLE encoder ─────────────────────────────────────────────────────────────

interface RawRow {
  noteX2: number;
  instrEffect: number;
  param: number;
}

function encodeCell(cell: TrackerCell): RawRow {
  const row: RawRow = { noteX2: 0, instrEffect: 0, param: 0 };

  // Note: reverse of parser's mapping
  // Parser: cell.note = 12 + (noteX2 + noteTranspose) / 2
  // Since we export with noteTranspose=0: noteX2 = (cell.note - 12) * 2
  const note = cell.note ?? 0;
  if (note > 0) {
    row.noteX2 = Math.max(0, (note - 12) * 2);
    // Must be even (and > 0 to signify a note)
    if (row.noteX2 <= 0) row.noteX2 = 2; // clamp to minimum valid note
    if (row.noteX2 > 254) row.noteX2 = 254; // max even byte
  }

  // Instrument: bits 4-0 (1-31), with 0 transpose
  const instr = (cell.instrument ?? 0) & 0x1F;

  // Effect: decode from XM effTyp/eff back to PumaTracker format
  let effType = 0;
  let param = 0;

  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;

  switch (effTyp) {
    case 0x0C: // Set volume
      effType = 1;
      param = Math.min(eff, 64);
      break;
    case 0x02: // Portamento down
      effType = 2;
      param = eff;
      break;
    case 0x01: // Portamento up
      effType = 3;
      param = eff;
      break;
    case 0x0F: // Set speed (only stored on channel 0, row 0)
      // Speed is in the order entry, not in pattern data
      // We'll handle it separately when building the order list
      break;
  }

  row.instrEffect = (instr & 0x1F) | ((effType & 0x07) << 5);
  row.param = param;

  return row;
}

function rowsEqual(a: RawRow, b: RawRow): boolean {
  return a.noteX2 === b.noteX2 && a.instrEffect === b.instrEffect && a.param === b.param;
}

/**
 * RLE-encode a single-channel pattern (32 rows) to a byte sequence.
 * Each RLE group: [noteX2, instrEffect, param, runLen]
 */
function rleEncodePattern(rows: RawRow[]): Uint8Array {
  const out: number[] = [];
  let i = 0;

  while (i < rows.length) {
    const current = rows[i];
    let runLen = 1;

    while (i + runLen < rows.length && runLen < NUM_ROWS - i && rowsEqual(current, rows[i + runLen])) {
      runLen++;
    }

    out.push(current.noteX2, current.instrEffect, current.param, runLen);
    i += runLen;
  }

  return new Uint8Array(out);
}

// ── Extract original instrument + sample data from pumaTrackerFileData ──────

function extractOriginalData(originalData: ArrayBuffer): {
  instrData: Uint8Array; // Everything from first "inst" to final "inst" + 4
  sampleEntries: Array<{ offset: number; length: number; data: Uint8Array }>;
  numInstruments: number;
} {
  const view = new DataView(originalData);
  const bytes = new Uint8Array(originalData);

  const numInstruments = view.getUint16(16, false);

  // Sample metadata
  const sampleEntries: Array<{ offset: number; length: number; data: Uint8Array }> = [];
  for (let i = 0; i < 10; i++) {
    const offset = view.getUint32(20 + i * 4, false);
    const length = view.getUint16(60 + i * 2, false) * 2; // words → bytes
    if (offset > 0 && length > 0 && offset < bytes.length) {
      const avail = Math.min(length, bytes.length - offset);
      sampleEntries.push({ offset, length, data: bytes.slice(offset, offset + avail) });
    } else {
      sampleEntries.push({ offset: 0, length: 0, data: new Uint8Array(0) });
    }
  }

  // Find instrument data region
  // Skip header + orders + patterns to find "inst" markers
  const numOrders = view.getUint16(12, false) + 1;
  const numPatterns = view.getUint16(14, false);

  let pos = HEADER_SIZE + numOrders * ORDER_ENTRY_SIZE;

  // Skip pattern data (each pattern: "patt" + RLE groups)
  for (let p = 0; p < numPatterns; p++) {
    // Skip "patt" marker
    pos += 4;
    // Decode RLE to find end of pattern
    let row = 0;
    while (row < NUM_ROWS && pos + 4 <= bytes.length) {
      const runLen = bytes[pos + 3];
      if (!runLen) break;
      row += runLen;
      pos += 4;
    }
  }
  // Skip terminating "patt"
  pos += 4;

  const instrStart = pos;

  // Find end of instrument data (after terminating "inst")
  for (let ins = 0; ins < numInstruments; ins++) {
    pos += 4; // "inst"
    // Skip vol script (terminates on B0 or E0)
    while (pos + 4 <= bytes.length) {
      const cmd = bytes[pos];
      pos += 4;
      if (cmd === 0xB0 || cmd === 0xE0) break;
    }
    pos += 4; // "insf"
    // Skip pitch script
    while (pos + 4 <= bytes.length) {
      const cmd = bytes[pos];
      if (cmd === 0xB0 || cmd === 0xE0) { pos += 4; break; }
      // Check for "inst" marker (next instrument or terminator)
      if (bytes[pos] === 0x69 && bytes[pos+1] === 0x6E && bytes[pos+2] === 0x73 && bytes[pos+3] === 0x74) break;
      pos += 4;
    }
  }
  // Include terminating "inst"
  pos += 4;

  const instrData = bytes.slice(instrStart, Math.min(pos, bytes.length));

  return { instrData, sampleEntries, numInstruments };
}

// ── Main exporter ───────────────────────────────────────────────────────────

/**
 * Export a TrackerSong to PumaTracker (.puma) format.
 * Pattern data is rebuilt from the TrackerSong; instrument scripts and samples
 * are copied from the original file (pumaTrackerFileData). A song that holds no
 * module (a New Song from the system preset) has no instrument scripts or
 * samples to copy: it is written with none, the module's terminating "inst"
 * marker only.
 */
/**
 * The module with each edited grid note stored in its track's RLE entries: the grid note is the stored note plus the order's
 * note transpose (PumaTrackerParser), so the stored byte is the grid note minus it. Instrument and effect edits are not stored
 * (shortcut: they carry the order's instrument transpose and the parser's auto-portamento, upgrade with their inverse).
 * Never null today; kept for the caller's fallback.
 */
function patchPumaNotes(source: ArrayBuffer, layout: UADEVariablePatternLayout, patterns: readonly Pattern[]): Uint8Array | null {
  const buf = new Uint8Array(source).slice();
  const edits = new Map<number, Map<number, number>>(); // file pattern -> row -> stored noteX2
  for (const { pattern, row, channel, cell } of editedCells(patterns)) {
    const fp = layout.trackMap[pattern]?.[channel];
    if (fp == null || fp < 0) continue;
    const t = (buf[HEADER_SIZE + pattern * ORDER_ENTRY_SIZE + channel * 3 + 2] << 24) >> 24;
    const note = cell.note ?? 0;
    const nx = note < 1 || note > 96 ? 0 : 2 * (note - 12) - t + (t & 1);
    if (nx < 0 || nx > 0xFE || (nx & 1)) continue;
    let rows = edits.get(fp);
    if (!rows) edits.set(fp, (rows = new Map()));
    rows.set(row, nx);
  }
  // A group's run length is its duration (the player applies an effect once per group), so an edited row inside a group splits
  // it into before / edited row / after groups whose run lengths sum to the original; a group with no edit is copied verbatim.
  // The patterns are stored back to back, so a split that grows the data moves everything after it and the header's absolute
  // sample offsets move with it.
  const chunks: Uint8Array[] = [];
  let cursor = 0;
  const order = [...edits.keys()].sort((x, y) => layout.filePatternAddrs[x] - layout.filePatternAddrs[y]);
  for (const fp of order) {
    const rows = edits.get(fp)!;
    const addr = layout.filePatternAddrs[fp], size = layout.filePatternSizes[fp];
    chunks.push(buf.subarray(cursor, addr));
    const out: number[] = [];
    for (let i = addr, row = 0; i < addr + size; row += buf[i + 3], i += 4) {
      const len = buf[i + 3];
      let start = 0;
      for (let k = 0; k < len; k++) {
        const nx = rows.get(row + k);
        if (nx === undefined) continue;
        if (k > start) out.push(buf[i], buf[i + 1], buf[i + 2], k - start);
        out.push(nx, buf[i + 1], buf[i + 2], 1);
        start = k + 1;
      }
      if (start === 0) out.push(buf[i], buf[i + 1], buf[i + 2], len);
      else if (start < len) out.push(buf[i], buf[i + 1], buf[i + 2], len - start);
    }
    chunks.push(Uint8Array.from(out));
    cursor = addr + size;
  }
  chunks.push(buf.subarray(cursor));
  const result = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) { result.set(c, at); at += c.length; }
  const delta = result.length - buf.length;
  if (delta) {
    const dv = new DataView(result.buffer);
    for (let i = 0; i < 10; i++) {
      const off = dv.getUint32(20 + i * 4, false);
      if (off) dv.setUint32(20 + i * 4, off + delta, false);
    }
  }
  return result;
}

export function exportPumaTrackerFile(song: TrackerSong): Uint8Array {
  const originalData = song.pumaTrackerFileData;
  // A loaded module: its bytes with each edited track re-encoded over its slot (byte-exact when unedited). A track that outgrows
  // its slot needs the pointers moved, which the rebuild below does.
  const layout = song.uadeVariableLayout;
  if (originalData && layout?.formatId === 'pumaTracker') {
    const patched = patchPumaNotes(originalData, layout, song.patterns);
    if (patched) return patched;
  }
  const { instrData, sampleEntries, numInstruments } = originalData
    ? extractOriginalData(originalData)
    : {
        // One silent instrument (the format needs at least one): "inst" + volume
        // script ending B0, "insf" + pitch script ending B0, then the terminating "inst".
        instrData: new Uint8Array([
          0x69, 0x6E, 0x73, 0x74, 0xB0, 0x00, 0x00, 0x00,
          0x69, 0x6E, 0x73, 0x66, 0xB0, 0x00, 0x00, 0x00,
          0x69, 0x6E, 0x73, 0x74,
        ]),
        sampleEntries: Array.from({ length: 10 }, () => ({ offset: 0, length: 0, data: new Uint8Array(0) })),
        numInstruments: 1,
      };

  const numOrders = song.songLength;

  // ── Build raw patterns (one per channel per order) ────────────────────
  // Each TrackerSong pattern becomes 4 raw single-channel patterns
  const rawPatterns: RawRow[][] = [];
  const rawPatternMap = new Map<string, number>(); // hash → index for deduplication

  // Order list entries
  const orderEntries: Array<{
    patternIndices: number[];
    speed: number;
  }> = [];

  for (let ord = 0; ord < numOrders; ord++) {
    const patIdx = song.songPositions[ord] ?? 0;
    const pat = song.patterns[patIdx];
    const patternIndices: number[] = [];

    // Extract speed from the channel-0 row-0 set-speed effect. The parser injects
    // F<speed> at ch0/row0 ONLY when the order entry's speed byte is > 0 (speed 0 =
    // "no change, keep the previous order's speed"; PumaTrackerParser.ts:495). So a
    // pattern whose ch0/row0 carries no 0x0F effect must write speed 0, not a default
    // of 6 — defaulting to 6 injected a spurious F06 into every such pattern on reload.
    let speed = 0;
    if (pat) {
      const ch0Row0 = pat.channels[0]?.rows[0];
      if (ch0Row0 && (ch0Row0.effTyp ?? 0) === 0x0F) {
        speed = ch0Row0.eff ?? 0;
      }
    }

    for (let ch = 0; ch < 4; ch++) {
      const channelData = pat?.channels[ch];
      const rows: RawRow[] = [];

      for (let row = 0; row < NUM_ROWS; row++) {
        const cell = channelData?.rows[row] ?? { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 };

        // Skip speed effect when encoding (it goes in order entry)
        const cellForEncode = (ch === 0 && row === 0 && (cell.effTyp ?? 0) === 0x0F)
          ? { ...cell, effTyp: 0, eff: 0 }
          : cell;

        rows.push(encodeCell(cellForEncode));
      }

      // Deduplicate raw patterns
      const hash = rows.map(r => `${r.noteX2}:${r.instrEffect}:${r.param}`).join(',');
      let rawIdx = rawPatternMap.get(hash);
      if (rawIdx === undefined) {
        rawIdx = rawPatterns.length;
        rawPatternMap.set(hash, rawIdx);
        rawPatterns.push(rows);
      }
      patternIndices.push(rawIdx);
    }

    orderEntries.push({ patternIndices, speed });
  }

  const numPatterns = rawPatterns.length;

  // ── RLE encode all raw patterns ───────────────────────────────────────
  const encodedPatterns = rawPatterns.map(rleEncodePattern);

  // ── Calculate sample offsets ──────────────────────────────────────────
  // Pattern data size
  let patternDataSize = 0;
  for (const ep of encodedPatterns) {
    patternDataSize += 4 + ep.length; // "patt" + RLE data
  }
  patternDataSize += 4; // terminating "patt"

  const dataBeforeSamples = HEADER_SIZE
    + numOrders * ORDER_ENTRY_SIZE
    + patternDataSize
    + instrData.length;

  // Recalculate sample offsets
  const newSampleOffsets: number[] = [];
  let samplePos = dataBeforeSamples;
  for (let i = 0; i < 10; i++) {
    if (sampleEntries[i].length > 0) {
      newSampleOffsets.push(samplePos);
      samplePos += sampleEntries[i].data.length;
    } else {
      newSampleOffsets.push(0);
    }
  }

  const totalSize = samplePos;

  // ── Write file ────────────────────────────────────────────────────────
  const buf = new Uint8Array(totalSize);
  const view = new DataView(buf.buffer);
  let pos = 0;

  // Song name (12 bytes, from original or song.name)
  const nameStr = (song.name || '').slice(0, 12);
  for (let i = 0; i < 12; i++) {
    buf[pos++] = i < nameStr.length ? nameStr.charCodeAt(i) & 0xFF : 0;
  }

  // lastOrder (u16BE)
  view.setUint16(pos, numOrders - 1, false); pos += 2;

  // numPatterns (u16BE)
  view.setUint16(pos, numPatterns, false); pos += 2;

  // numInstruments (u16BE)
  view.setUint16(pos, numInstruments, false); pos += 2;

  // unknown = 0 (u16BE)
  view.setUint16(pos, 0, false); pos += 2;

  // sampleOffset[10] (u32BE)
  for (let i = 0; i < 10; i++) {
    view.setUint32(pos, newSampleOffsets[i], false); pos += 4;
  }

  // sampleLength[10] (u16BE, in words)
  for (let i = 0; i < 10; i++) {
    view.setUint16(pos, Math.floor(sampleEntries[i].length / 2), false); pos += 2;
  }

  // ── Order list ────────────────────────────────────────────────────────
  for (let ord = 0; ord < numOrders; ord++) {
    const entry = orderEntries[ord];
    for (let ch = 0; ch < 4; ch++) {
      buf[pos++] = entry.patternIndices[ch]; // pattern index
      buf[pos++] = 0; // instrTranspose = 0 (already applied in cell data)
      buf[pos++] = 0; // noteTranspose = 0 (already applied in note encoding)
    }
    buf[pos++] = entry.speed;
    buf[pos++] = 0; // zero padding
  }

  // ── Pattern data ──────────────────────────────────────────────────────
  for (let p = 0; p < numPatterns; p++) {
    // "patt" marker
    buf[pos++] = 0x70; buf[pos++] = 0x61; buf[pos++] = 0x74; buf[pos++] = 0x74;
    // RLE data
    buf.set(encodedPatterns[p], pos);
    pos += encodedPatterns[p].length;
  }
  // Terminating "patt"
  buf[pos++] = 0x70; buf[pos++] = 0x61; buf[pos++] = 0x74; buf[pos++] = 0x74;

  // ── Instrument data (copied from original) ────────────────────────────
  buf.set(instrData, pos);
  pos += instrData.length;

  // ── Sample data ───────────────────────────────────────────────────────
  for (let i = 0; i < 10; i++) {
    if (sampleEntries[i].data.length > 0) {
      buf.set(sampleEntries[i].data, pos);
      pos += sampleEntries[i].data.length;
    }
  }

  return buf;
}
