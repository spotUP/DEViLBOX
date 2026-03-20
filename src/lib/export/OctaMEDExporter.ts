/**
 * OctaMEDExporter.ts — Export TrackerSong as OctaMED MMD1 format
 *
 * Produces a valid MMD1 file supporting up to 64 channels (OctaMED extension
 * of the original 4-channel MED format).
 *
 * File layout (all big-endian):
 *   0x00: Magic "MMD1" (4 bytes)
 *   0x04: modLength (u32)
 *   0x08: songOffset (u32) → MMD0Song struct
 *   0x0C: reserved (u32)
 *   0x10: blockArrOffset (u32) → block pointer array
 *   0x14: reserved (u32)
 *   0x18: sampleArrOffset (u32) → sample pointer array (0 if no samples)
 *   0x1C: reserved (u32)
 *   0x20: expDataOffset (u32) → expansion data (0 if none)
 *   0x24-0x33: reserved (12 bytes)
 *
 * MMD0Song (772 bytes):
 *   63 × 8 bytes: instrument headers (InstrHdr)
 *   2 bytes: numblocks
 *   2 bytes: songlen
 *   256 bytes: playseq
 *   2 bytes: deftempo
 *   1 byte: playtransp
 *   1 byte: flags
 *   1 byte: flags2
 *   1 byte: tempo2 (speed)
 *   16 bytes: trackvol
 *   1 byte: mastervol
 *   1 byte: numsamples
 *
 * MMD1 Block (variable):
 *   2 bytes: numtracks
 *   2 bytes: numlines (lines-1)
 *   4 bytes: blockinfo offset (0)
 *   data: numlines × numtracks × 4 bytes per cell
 *
 * Reference: MEDParser.ts (OctaMED/MED parser), MEDEncoder.ts (cell encoding)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { encodeOctaMEDCell } from '@/engine/uade/encoders/OctaMEDEncoder';

// ── Result type ─────────────────────────────────────────────────────────────

export interface OctaMEDExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function writeU16BE(view: DataView, off: number, val: number): void {
  view.setUint16(off, val, false);
}
function writeU32BE(view: DataView, off: number, val: number): void {
  view.setUint32(off, val, false);
}

// ── Main export function ────────────────────────────────────────────────────

export async function exportOctaMED(
  song: TrackerSong,
): Promise<OctaMEDExportResult> {
  const warnings: string[] = [];

  const nChannels = Math.min(64, Math.max(1, song.numChannels));
  const nBlocks   = Math.max(1, song.patterns.length);
  const nInstrs   = Math.min(63, song.instruments.length);
  const songLen   = Math.min(256, song.songPositions.length);

  if (song.numChannels > 64) {
    warnings.push(`OctaMED supports max 64 channels; ${song.numChannels - 64} will be truncated.`);
  }
  if (song.instruments.length > 63) {
    warnings.push(`OctaMED supports max 63 instruments; ${song.instruments.length - 63} will be dropped.`);
  }

  // ── Collect sample PCMs ─────────────────────────────────────────────────
  const samplePCMs: Uint8Array[] = [];
  for (let i = 0; i < nInstrs; i++) {
    const inst = song.instruments[i];
    if (inst?.sample?.audioBuffer) {
      const wav = new DataView(inst.sample.audioBuffer);
      const dataLen = wav.getUint32(40, true);
      const frames  = Math.floor(dataLen / 2);
      const pcm = new Uint8Array(frames);
      for (let j = 0; j < frames; j++) {
        const s16 = wav.getInt16(44 + j * 2, true);
        pcm[j] = ((s16 >> 8) + 128) & 0xFF;
      }
      samplePCMs.push(pcm);
    } else {
      samplePCMs.push(new Uint8Array(0));
    }
  }

  // ── Calculate offsets ─────────────────────────────────────────────────
  const HEADER_SIZE   = 52;
  const INSTR_SIZE    = 63 * 8;        // 63 InstrHdr × 8 bytes
  const SONG_MISC     = 268;           // numblocks(2) + songlen(2) + playseq(256) + misc(8)
  const SONG_SIZE     = INSTR_SIZE + SONG_MISC;
  const BLOCK_PTRS    = nBlocks * 4;

  // MMD1 blocks: 8-byte header + nChannels × (nLines) × 4 bytes
  const BYTES_PER_CELL = 4;
  const blockSizes = song.patterns.map(p => {
    const lines = p.length;
    return 8 + lines * nChannels * BYTES_PER_CELL;
  });
  const totalBlockBytes = blockSizes.reduce((a, b) => a + b, 0);

  const sampleTotalBytes = samplePCMs.reduce((a, p) => a + ((p.length + 1) & ~1), 0);

  const songOffset    = HEADER_SIZE;
  const blockPtrOff   = songOffset + SONG_SIZE;
  const blockDataOff  = blockPtrOff + BLOCK_PTRS;
  const sampleDataOff = blockDataOff + totalBlockBytes;
  const totalSize     = sampleDataOff + sampleTotalBytes;

  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);

  // ── Write MMD1 header ───────────────────────────────────────────────────
  output[0] = 0x4D; output[1] = 0x4D; output[2] = 0x44; output[3] = 0x31; // "MMD1"
  writeU32BE(view, 4, totalSize);
  writeU32BE(view, 8, songOffset);
  writeU32BE(view, 16, blockPtrOff);

  // ── Write MMD0Song ────────────────────────────────────────────────────
  let so = songOffset;

  // InstrHdr array (63 × 8 bytes)
  for (let i = 0; i < 63; i++) {
    const base = so + i * 8;
    if (i < nInstrs) {
      const pcm = samplePCMs[i];
      writeU32BE(view, base, Math.ceil(pcm.length / 2)); // length in words
      view.setUint8(base + 4, 0);                         // type = 0 (sample)
      const inst = song.instruments[i];
      const vol = inst?.octamed?.volume ?? 64;
      view.setUint8(base + 5, vol & 0xFF);                // volume

      const loopStart = inst?.sample?.loopStart ?? 0;
      writeU16BE(view, base + 6, Math.ceil(loopStart / 2));
    }
  }
  so += INSTR_SIZE;

  // numblocks + songlen + playseq + misc
  writeU16BE(view, so, nBlocks);
  writeU16BE(view, so + 2, songLen);
  for (let i = 0; i < 256; i++) {
    output[so + 4 + i] = i < songLen ? (song.songPositions[i] ?? 0) : 0;
  }
  writeU16BE(view, so + 260, song.initialBPM ?? 125);   // deftempo
  output[so + 262] = 0;                                   // playtransp
  output[so + 263] = 0x20;                                 // flags: BPM mode (bit 5 of flags2 actually)
  output[so + 264] = 0x20;                                 // flags2: BPM mode
  output[so + 265] = song.initialSpeed ?? 6;               // tempo2 (speed)
  // trackvol[16] at so+266
  for (let i = 0; i < 16; i++) {
    output[so + 266 + i] = 64;
  }
  output[so + 282] = 64;                                   // mastervol
  output[so + 283] = nInstrs;                              // numsamples
  so += SONG_MISC;

  // ── Write block pointer array ──────────────────────────────────────────
  let blockOff = blockDataOff;
  for (let i = 0; i < nBlocks; i++) {
    writeU32BE(view, blockPtrOff + i * 4, blockOff);
    blockOff += blockSizes[i];
  }

  // ── Write block data (MMD1 format) ─────────────────────────────────────
  let bpos = blockDataOff;
  for (const pattern of song.patterns) {
    const nLines = pattern.length;
    writeU16BE(view, bpos, nChannels);
    writeU16BE(view, bpos + 2, nLines - 1);  // MED stores numlines - 1
    writeU32BE(view, bpos + 4, 0);            // blockinfo offset (none)
    bpos += 8;

    for (let row = 0; row < nLines; row++) {
      for (let ch = 0; ch < nChannels; ch++) {
        const cell = pattern.channels[ch]?.rows[row];
        if (cell) {
          const encoded = encodeOctaMEDCell(cell);
          output.set(encoded, bpos);
        }
        bpos += BYTES_PER_CELL;
      }
    }
  }

  // ── Write sample data ──────────────────────────────────────────────────
  let spos = sampleDataOff;
  for (const pcm of samplePCMs) {
    output.set(pcm, spos);
    spos += pcm.length;
    if (pcm.length & 1) spos++; // word align
  }

  // ── Build result ───────────────────────────────────────────────────────
  const baseName = (song.name || 'untitled').replace(/[^\w\s.-]/g, '').trim();
  const filename = baseName.endsWith('.med') ? baseName : `${baseName}.med`;

  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename,
    warnings,
  };
}
