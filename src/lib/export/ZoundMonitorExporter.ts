/**
 * ZoundMonitorExporter.ts — Export TrackerSong as ZoundMonitor (.sng) format
 *
 * Reconstructs the binary .sng file from TrackerSong data. Samples are NOT
 * embedded in the .sng file (they are separate files on disk), so this exporter
 * only writes the module structure: header, sample descriptors, table data,
 * and part/pattern data, plus the Amiga device paths at the end.
 *
 * File layout:
 *   [0..4]       Header (5 bytes: maxTable, maxPart, startTab, endTab, speed)
 *   [5..868]     Sample table (16 entries × 54 bytes)
 *   [869..]      Table data ((maxTable+1) × 16 bytes)
 *   [..]         Part data ((maxPart+1) × 128 bytes)
 *   [..]         Load paths (Amiga device paths for format detection)
 *
 * Parts are shared across voices — the table assigns each voice to a part
 * independently. Each table row specifies per-voice: partno, volume, instradd, noteadd.
 *
 * Part data encoding (32-bit BE longwords, 32 rows per part):
 *   Bit 31:      DMA control flag (always 0 on export)
 *   Bits 29-24:  Note number (0=none, 1-36=notes, 63=note-off)
 *   Bits 23-20:  Sample number (0-15)
 *   Bits 19-16:  Control nibble (effect flags)
 *   Bits 15-8:   Volume add (signed byte)
 *   Bits 7-0:    Effect parameter
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

// ── Constants ───────────────────────────────────────────────────────────────

const NUM_SAMPLE_SLOTS = 16;
const ROWS_PER_PART = 32;
const SAMPLE_DESC_SIZE = 54;
const BYTES_PER_TABLE_ENTRY = 16; // 4 voices × 4 bytes
const BYTES_PER_PART = 128;       // 32 rows × 4 bytes

// ── Binary write helpers ────────────────────────────────────────────────────

function writeU8(buf: Uint8Array, off: number, val: number): void {
  buf[off] = val & 0xFF;
}

function writeU16BE(buf: Uint8Array, off: number, val: number): void {
  buf[off] = (val >>> 8) & 0xFF;
  buf[off + 1] = val & 0xFF;
}

function writeU32BE(buf: Uint8Array, off: number, val: number): void {
  buf[off] = (val >>> 24) & 0xFF;
  buf[off + 1] = (val >>> 16) & 0xFF;
  buf[off + 2] = (val >>> 8) & 0xFF;
  buf[off + 3] = val & 0xFF;
}

function writeString(buf: Uint8Array, off: number, str: string, maxLen: number): void {
  for (let i = 0; i < maxLen; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 0xFF : 0;
  }
}

// ── Note mapping ────────────────────────────────────────────────────────────

/**
 * Convert XM note → ZoundMonitor note.
 * Parser: zmNote + 12 = xmNote (zmNote 1=C-1 → XM 13)
 * Reverse: zmNote = xmNote - 12; 97 → 63 (note-off)
 */
function xmNoteToZM(xmNote: number): number {
  if (xmNote === 0) return 0;
  if (xmNote === 97) return 63; // note-off
  const zm = xmNote - 12;
  if (zm < 1 || zm > 36) return 0;
  return zm;
}

// ── Effect mapping ──────────────────────────────────────────────────────────

/**
 * Convert XM effects back to ZoundMonitor control nibble + effect param.
 *
 * XM 0xy (arpeggio)  → control bit 0, param = xy
 * XM 1xx (slide up)  → control bit 1, param = negative (256 - xx)
 * XM 2xx (slide down) → control bit 1, param = xx
 * XM 3xx (portamento) → control bits 0+1, param = xx
 */
function xmEffectToZM(effTyp: number, eff: number): { control: number; param: number } {
  switch (effTyp) {
    case 0x00: // Arpeggio
      if (eff !== 0) return { control: 0x01, param: eff };
      return { control: 0, param: 0 };
    case 0x01: // Portamento up → slide with negative param
      return { control: 0x02, param: (256 - Math.min(eff, 255)) & 0xFF };
    case 0x02: // Portamento down → slide with positive param
      return { control: 0x02, param: Math.min(eff, 255) };
    case 0x03: // Tone portamento → ultra-slide
      return { control: 0x03, param: eff };
    default:
      return { control: 0, param: 0 };
  }
}

// ── Main exporter ───────────────────────────────────────────────────────────

export async function exportZoundMonitor(
  song: TrackerSong,
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const warnings: string[] = [];
  const numChannels = Math.min(song.numChannels ?? 4, 4);

  if (numChannels < 4) {
    warnings.push(`Song has ${numChannels} channels; padding to 4 for ZoundMonitor.`);
  }

  // ── Determine song positions (table entries) ────────────────────────────

  const songPositions = song.songPositions.length > 0
    ? song.songPositions
    : song.patterns.map((_, i) => i);

  // ZoundMonitor uses ALL table entries from 0 to maxTable.
  // We need to include all patterns referenced by songPositions,
  // plus any patterns between them.
  const maxPatternIdx = Math.max(0, ...songPositions);
  const numPatterns = Math.min(256, maxPatternIdx + 1);

  // In ZoundMonitor, each pattern maps directly to one table entry,
  // and each channel within that table entry references a "part."
  // Since our TrackerSong has unified patterns (all 4 channels in one pattern),
  // we create one part per (pattern, channel) pair.

  const numParts = numPatterns * 4;
  if (numParts > 256) {
    warnings.push(`Too many parts (${numParts}); capping at 256.`);
  }
  const clampedNumParts = Math.min(256, numParts);

  // ── Determine start/end table positions ─────────────────────────────────

  const startTab = songPositions.length > 0 ? songPositions[0] : 0;
  const endTab = songPositions.length > 0
    ? songPositions[songPositions.length - 1] + 1
    : numPatterns;

  // ── Build the file ──────────────────────────────────────────────────────

  // Amiga device path for format detection (must match isZoundMonitorFormat)
  // We write "df0:" at the load paths offset
  const loadPathStr = 'df0:Samples\0';
  const loadPathBytes = new TextEncoder().encode(loadPathStr);

  const headerSize = 5;
  const sampleTableSize = NUM_SAMPLE_SLOTS * SAMPLE_DESC_SIZE;
  const tableDataSize = numPatterns * BYTES_PER_TABLE_ENTRY;
  const partDataSize = clampedNumParts * BYTES_PER_PART;
  const totalSize = headerSize + sampleTableSize + tableDataSize + partDataSize + loadPathBytes.length;

  const output = new Uint8Array(totalSize);

  // ── Header (5 bytes) ────────────────────────────────────────────────────

  writeU8(output, 0, numPatterns - 1);                      // maxTable
  writeU8(output, 1, clampedNumParts - 1);                  // maxPart
  writeU8(output, 2, Math.min(startTab, 255));              // startTab
  writeU8(output, 3, Math.min(endTab, 255));                // endTab
  writeU8(output, 4, Math.max(1, song.initialSpeed ?? 6));  // speed

  // ── Sample table (16 × 54 bytes at offset 5) ───────────────────────────

  for (let i = 0; i < NUM_SAMPLE_SLOTS; i++) {
    const off = 5 + i * SAMPLE_DESC_SIZE;
    const inst = i < song.instruments.length ? song.instruments[i] : null;

    if (inst) {
      // 4-byte runtime pointer (zero on disk)
      writeU32BE(output, off, 0);

      // 40-byte filename
      const name = inst.name || `Sample ${i + 1}`;
      writeString(output, off + 4, name, 40);

      // Volume (byte at offset 44)
      const defaultVol = inst.metadata?.modPlayback?.defaultVolume ?? 64;
      writeU8(output, off + 44, Math.min(defaultVol, 64));

      // Padding byte at offset 45 (already 0)

      // Sample length in words (u16BE at offset 46)
      const sampleLen = inst.sample?.audioBuffer
        ? Math.floor(new DataView(inst.sample.audioBuffer).getUint32(40, true) / 4) // bytes/2 for 16-bit, then /2 for words... actually: PCM frames / 2 for words
        : 0;
      // For Amiga formats, length is already stored in metadata if available
      const lenWords = inst.metadata?.modPlayback
        ? Math.floor((inst.sample?.loopEnd ?? 0) / 2) || sampleLen
        : sampleLen;
      writeU16BE(output, off + 46, lenWords & 0xFFFF);

      // Repeat length in words (u16BE at offset 48)
      const loopStart = inst.sample?.loopStart ?? 0;
      const loopEnd = inst.sample?.loopEnd ?? 0;
      const replen = loopEnd > loopStart ? Math.floor((loopEnd - loopStart) / 2) : 1;
      writeU16BE(output, off + 48, replen & 0xFFFF);

      // Restart (loop start) in words (u16BE at offset 50)
      writeU16BE(output, off + 50, Math.floor(loopStart / 2) & 0xFFFF);

      // Preset byte at offset 52 (unused, 0)
      // Padding byte at offset 53 (already 0)
    }
    // Else: slot is all zeros (no sample)
  }

  // ── Table data ((numPatterns) × 16 bytes at offset 869) ─────────────────

  const tableDataStart = 5 + NUM_SAMPLE_SLOTS * SAMPLE_DESC_SIZE; // = 869

  for (let t = 0; t < numPatterns; t++) {
    for (let v = 0; v < 4; v++) {
      const off = tableDataStart + t * BYTES_PER_TABLE_ENTRY + v * 4;
      // Part number: each pattern × channel gets its own part
      const partIdx = Math.min(t * 4 + v, clampedNumParts - 1);
      writeU8(output, off, partIdx);     // partno
      writeU8(output, off + 1, 0);       // volume (signed, 0 = no adjustment)
      writeU8(output, off + 2, 0);       // instradd (0 = no transposition)
      writeU8(output, off + 3, 0);       // noteadd (0 = no transposition)
    }
  }

  // ── Part data ((clampedNumParts) × 128 bytes) ───────────────────────────

  const partDataStart = tableDataStart + numPatterns * BYTES_PER_TABLE_ENTRY;

  for (let t = 0; t < numPatterns; t++) {
    const pat = t < song.patterns.length ? song.patterns[t] : null;

    for (let ch = 0; ch < 4; ch++) {
      const partIdx = t * 4 + ch;
      if (partIdx >= clampedNumParts) break;

      const channel = pat?.channels[ch];

      for (let row = 0; row < ROWS_PER_PART; row++) {
        const off = partDataStart + partIdx * BYTES_PER_PART + row * 4;

        if (!channel || row >= (channel.rows?.length ?? 0)) {
          // Empty row
          writeU32BE(output, off, 0);
          continue;
        }

        const cell = channel.rows[row];
        const note = cell?.note ?? 0;
        const instr = cell?.instrument ?? 0;
        const effTyp = cell?.effTyp ?? 0;
        const eff = cell?.eff ?? 0;
        const vol = cell?.volume ?? 0;

        // Convert note
        const zmNote = xmNoteToZM(note);

        // Convert effects
        const { control, param } = xmEffectToZM(effTyp, eff);

        // Convert volume column back to volAdd
        // Parser: volCol = 0x10 + effectiveVol where effectiveVol = 64 + volAdd + tableVolume
        // Since tableVolume is 0 on export: volAdd = (vol - 0x10) - 64
        let volAdd = 0;
        if (vol >= 0x10 && vol <= 0x50) {
          volAdd = (vol - 0x10) - 64;
        }
        const volAddByte = volAdd < 0 ? (256 + volAdd) & 0xFF : volAdd & 0xFF;

        // Sample number (0-15, 0 = keep previous)
        const sampleNum = instr & 0x0F;

        // Pack as u32BE
        const word = ((zmNote & 0x3F) << 24)
          | ((sampleNum & 0x0F) << 20)
          | ((control & 0x0F) << 16)
          | ((volAddByte & 0xFF) << 8)
          | (param & 0xFF);

        writeU32BE(output, off, word);
      }
    }
  }

  // ── Load paths (Amiga device path for format detection) ─────────────────

  output.set(loadPathBytes, partDataStart + clampedNumParts * BYTES_PER_PART);

  // ── Verify detection offset ─────────────────────────────────────────────
  // isZoundMonitorFormat checks: offset = (buf[0]+1)*16 + (buf[1]+1)*128 + 869
  // buf[0] = maxTable = numPatterns-1, buf[1] = maxPart = clampedNumParts-1
  // offset should point to the start of the load paths section
  const expectedOffset = numPatterns * 16 + clampedNumParts * 128 + 869;
  const loadPathsOffset = partDataStart + clampedNumParts * BYTES_PER_PART;
  if (expectedOffset !== loadPathsOffset) {
    warnings.push(
      `Detection offset mismatch: expected ${expectedOffset}, got ${loadPathsOffset}. ` +
      `File may not pass isZoundMonitorFormat check.`,
    );
  }

  // ── Build result ────────────────────────────────────────────────────────

  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_.-]/g, '_');
  const filename = baseName.toLowerCase().endsWith('.sng')
    ? baseName
    : `${baseName}.sng`;

  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename,
    warnings,
  };
}
