/**
 * SteveTurnerExporter.ts — Export TrackerSong as Steve Turner (.jpo) format
 *
 * Steve Turner modules are compiled 68k Amiga executables. The parser stores
 * the original binary in `steveTurnerFileData` and decodes the variable-length
 * pattern blocks into standard TrackerSong patterns.
 *
 * Export strategy:
 *   1. If `steveTurnerFileData` exists: that module with each edited grid note
 *      written into the note byte ($00-$7F, XM note = byte + 13) that played it
 *      (the layout's `noteBytes`). Same length, byte-exact where nothing was
 *      edited. A note where no note byte plays (an empty row, an instrument
 *      trigger $B0-$CF), a removed note, an instrument change and two different
 *      edits of one shared byte (a block played more than once) are warnings,
 *      not written: they need the block stream to grow.
 *   2. If no original binary is available, encode pattern data using the
 *      Steve Turner variable-length encoder as a best-effort fallback.
 *
 * Reference: SteveTurnerParser.ts (import), SteveTurnerEncoder.ts (cell encoding)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { encodeSteveTurnerPattern } from '@/engine/uade/encoders/SteveTurnerEncoder';
import { editedCells } from '@/lib/song/gridBaseline';
import type { TrackerCell } from '@/types/tracker';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';

type BlockEntry = NonNullable<UADEVariablePatternLayout['steveTurnerBlocks']>['entries'][number];

/**
 * One block's bytes with its edited cells written, walked as the player walks it (steveturner.c parse_data_stream) with the
 * parser's row clock (a note byte or $B0-$CF trigger takes `duration` rows). A pitch on a note byte rewrites that byte; a pitch
 * on a $B0+i trigger (the instrument's own pitch) becomes $D0+i, the note byte, and $D0 back to the player's instrument; a note
 * on a held row cuts the hold there with duration bytes and inserts the note byte, then restores the duration. Unedited bytes
 * are copied as they are, so a block without a size change keeps its place.
 */
function rebuildBlock(src: Uint8Array, entry: BlockEntry, edits: Map<number, TrackerCell>, rows: number, where: string, warnings: string[]): { bytes: number[]; size: number } {
  const o: number[] = [];
  let dur = entry.durIn;
  let inst = entry.instIn;
  let row = 0;
  let p = entry.start;
  const used = new Set<number>();
  const shown = new Map(entry.triggerNotes);
  const noteByte = (cell: TrackerCell, r: number): number | null => {
    const nb = cell.note - 13;
    if (nb >= 0 && nb <= 0x7f) return nb;
    warnings.push(`${where} row ${r}: note ${cell.note} has no note byte ($00-$7F); not written`);
    return null;
  };
  // A note byte plays the player's instrument: select the cell's for it and select the player's back after.
  const pitched = (nb: number, want: number): number[] => (want === inst ? [nb] : [0xd0 + want, nb, 0xd0 + inst]);
  while (p < src.length) {
    const b = src[p++];
    if (b >= 0xf9 && b !== 0xfe) { o.push(b); break; }
    if (b >= 0x80 && b <= 0xaf) { dur = b - 0x7f; o.push(b); continue; }
    if (b >= 0xd0 && b <= 0xef) { inst = b - 0xd0; o.push(b); continue; }
    if (b > 0xcf) { o.push(b); continue; } // $F0-$F8 pitch effect, $FE loop point
    const r = row;
    const cell = r < rows ? edits.get(r) : undefined;
    if (cell) used.add(r);
    // The held rows this event covers that take a new note.
    const held: number[] = [];
    for (let q = r + 1; q < r + dur && q < rows; q++) { const c = edits.get(q); if (c && c.note > 0 && noteByte(c, q) !== null) held.push(q); }
    if (held.length > 0) o.push(0x7f + (held[0] - r));
    const isTrigger = b >= 0xb0;
    if (cell && cell.note === 0) warnings.push(`${where} row ${r}: a removed note is not written`);
    // A trigger keeps its byte unless its pitch changed (an instrument-only edit is not written).
    const nb = cell && cell.note > 0 && !(isTrigger && shown.get(r) === cell.note) ? noteByte(cell, r) : null;
    if (nb === null) o.push(b);
    else if (isTrigger) o.push(...pitched(nb, cell!.instrument > 0 ? cell!.instrument - 1 : b - 0xb0));
    else o.push(nb); // shortcut: an instrument change on a note byte is not written, only the pitch
    held.forEach((q, i) => {
      used.add(q);
      const c = edits.get(q)!;
      const next = held[i + 1] ?? r + dur;
      o.push(0x7f + (next - q), ...pitched(c.note - 13, c.instrument > 0 ? c.instrument - 1 : inst));
    });
    if (held.length > 0) o.push(0x7f + dur);
    row += dur;
  }
  for (const [r, c] of edits) if (!used.has(r) && c.note !== 0) warnings.push(`${where} row ${r}: a note where the player runs no event is not written`);
  return { bytes: o, size: p - entry.start };
}

// ── Result type ─────────────────────────────────────────────────────────────

export interface SteveTurnerExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeName(name: string): string {
  return name
    .replace(/\s*\[Steve Turner\].*$/i, '')
    .replace(/[^\w\s.-]/g, '')
    .trim() || 'untitled';
}

function deriveFilename(baseName: string, originalFilename?: string): string {
  if (originalFilename) {
    const name = originalFilename.split('/').pop() ?? originalFilename;
    if (name.length > 0) return name;
  }
  return baseName.startsWith('jpo.') ? baseName : `jpo.${baseName}`;
}

// ── Main export function ────────────────────────────────────────────────────

export async function exportSteveTurner(
  song: TrackerSong,
): Promise<SteveTurnerExportResult> {
  const warnings: string[] = [];

  // ── Path 1: Original binary available — the module with the grid edits written ──
  const fileData = song.steveTurnerFileData;
  if (fileData && fileData.byteLength > 0) {
    const baseName = sanitizeName(song.name);
    const src = new Uint8Array(fileData.slice(0));
    const blocks = song.uadeVariableLayout?.steveTurnerBlocks;
    const byCell = new Map<string, Map<number, TrackerCell>>();
    for (const { pattern, row, channel, cell } of editedCells(song.patterns)) {
      const k = `${pattern}:${channel}`;
      if (!byCell.has(k)) byCell.set(k, new Map());
      byCell.get(k)!.set(row, cell);
    }
    const tail: number[] = [];
    const out = new Uint8Array(src);
    const done = new Map<number, string>(); // block start -> the bytes written for it
    for (const [k, edits] of byCell) {
      const [pattern, channel] = k.split(':').map(Number);
      const where = `pattern ${pattern} voice ${channel + 1}`;
      const entry = blocks?.entries.find((e) => e.pattern === pattern && e.channel === channel);
      if (!blocks || !entry) { warnings.push(`${where}: no block plays here; edits not written`); continue; }
      const rows = song.patterns[pattern]?.channels[channel]?.rows.length ?? 0;
      const { bytes, size } = rebuildBlock(src, entry, edits, rows, where, warnings);
      const key = bytes.join(',');
      const prior = done.get(entry.start);
      if (prior !== undefined) {
        if (prior !== key) warnings.push(`${where}: shares its block with an earlier edit (a block played more than once); not written`);
        continue;
      }
      done.set(entry.start, key);
      if (bytes.length === size) { out.set(bytes, entry.start); continue; }
      // The block grew: it moves to the file end and its OFFTBL word is repointed (signed 16-bit from the table).
      const at = src.length + tail.length;
      const rel = at - blocks.base;
      if (rel > 0x7fff) { warnings.push(`${where}: the grown block is out of the offset table's reach; not written`); continue; }
      tail.push(...bytes);
      out[entry.refAt] = (rel >> 8) & 0xff;
      out[entry.refAt + 1] = rel & 0xff;
    }
    const data = new Uint8Array(out.length + tail.length);
    data.set(out);
    data.set(tail, out.length);
    return {
      data: new Blob([data], { type: 'application/octet-stream' }),
      filename: deriveFilename(baseName),
      warnings,
    };
  }

  // ── Path 2: No original binary — build from pattern data ────────────────
  warnings.push(
    'No original Steve Turner binary available. Exporting pattern data only — ' +
    'the resulting file will not contain a valid 68k player.'
  );

  const NUM_CHANNELS = 4;

  if (song.numChannels > NUM_CHANNELS) {
    warnings.push(
      `Steve Turner supports 4 channels but song has ${song.numChannels}. Extra channels truncated.`
    );
  }

  // Build the Steve Turner signature header (0x2E = 46 bytes)
  // Four MOVE.L #imm,D(An) at 0,8,16,24 + MOVE.W #$00FF,D0 at 0x20 +
  // MOVE.W D0,D1; JSR at 0x24 + RTS at 0x2C
  const HEADER_SIZE = 0x2E;

  // Encode each channel's pattern data using the variable-length encoder
  const channelBlobs: Uint8Array[] = [];
  for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    // Concatenate all patterns for this channel
    const allRows = song.patterns.flatMap(pat => {
      if (!pat || ch >= pat.channels.length) return [];
      return pat.channels[ch].rows;
    });

    if (allRows.length > 0) {
      channelBlobs.push(encodeSteveTurnerPattern(allRows, ch));
    } else {
      channelBlobs.push(new Uint8Array([0xFF])); // empty: end marker only
    }
  }

  const totalPatternBytes = channelBlobs.reduce((a, b) => a + b.length, 0);
  const totalSize = HEADER_SIZE + totalPatternBytes;
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);

  // Write detection signature
  view.setUint16(0x00, 0x2B7C, false);
  view.setUint16(0x08, 0x2B7C, false);
  view.setUint16(0x10, 0x2B7C, false);
  view.setUint16(0x18, 0x2B7C, false);
  view.setUint32(0x20, 0x303C00FF, false);
  view.setUint32(0x24, 0x32004EB9, false);
  view.setUint16(0x2C, 0x4E75, false);

  // Write channel pattern data after header
  let offset = HEADER_SIZE;
  for (const blob of channelBlobs) {
    output.set(blob, offset);
    offset += blob.length;
  }

  const baseName = sanitizeName(song.name);
  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename: deriveFilename(baseName),
    warnings,
  };
}
