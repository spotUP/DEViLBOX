/**
 * SymphonieProExporter.ts — Export TrackerSong to Symphonie Pro (.symmod) format.
 *
 * Strategy: Re-read the original file's chunk structure, replacing only the
 * PatternEvents chunk (-13) with newly encoded data from the TrackerSong.
 * All other chunks (instruments, samples, sequences, positions) are preserved
 * verbatim from the original file.
 *
 * Cell reverse mapping:
 *   Parser:  xmNote = symNote + 25 + transpose
 *   Encoder: symNote = xmNote - 25 - transpose
 *   (transpose is baked in at parse time, so we export with transpose=0)
 *
 * SymEvent (4 bytes): command(u8), note(s8), param(u8), inst(u8)
 *
 * RLE packing format: "PACK\xFF\xFF" + uint32BE unpackedLength + RLE payload
 *   type 0: uint8 count + count raw bytes
 *   type 1: uint8 count + uint32 dword → repeat dword count times
 *   type 2: uint32 dword → write dword twice
 *   type 3: uint8 count → write count zero bytes
 *   type -1: end of stream
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { TrackerCell } from '@/types';

// ── SymEvent command constants (same as parser) ────────────────────────────

const CMD_KEYON         = 0;
const CMD_VOLSLIDE_UP   = 1;
const CMD_VOLSLIDE_DOWN = 2;
const CMD_PITCH_UP      = 3;
const CMD_PITCH_DOWN    = 4;
const CMD_SET_SPEED     = 9;
const CMD_VIBRATO       = 13;
const CMD_RETRIG        = 16;

// ── RLE packer ─────────────────────────────────────────────────────────────

/**
 * Pack data using Symphonie's RLE format.
 * Returns the packed block including "PACK\xFF\xFF" header + unpackedLength.
 */
function packSymBlock(data: Uint8Array): Uint8Array {
  const out: number[] = [];

  // Header: "PACK\xFF\xFF"
  out.push(0x50, 0x41, 0x43, 0x4B, 0xFF, 0xFF);

  // Unpacked length (uint32BE)
  out.push((data.length >> 24) & 0xFF);
  out.push((data.length >> 16) & 0xFF);
  out.push((data.length >> 8) & 0xFF);
  out.push(data.length & 0xFF);

  let pos = 0;

  while (pos < data.length) {
    // Try zero-byte run (type 3)
    if (data[pos] === 0) {
      let zeroLen = 0;
      while (pos + zeroLen < data.length && data[pos + zeroLen] === 0 && zeroLen < 255) {
        zeroLen++;
      }
      if (zeroLen >= 4) {
        out.push(3, zeroLen);
        pos += zeroLen;
        continue;
      }
    }

    // Try dword repeat (type 1 or 2) — only if aligned to 4 bytes of remaining data
    if (pos + 8 <= data.length) {
      const d0 = data[pos], d1 = data[pos + 1], d2 = data[pos + 2], d3 = data[pos + 3];
      let repeatCount = 1;
      let p = pos + 4;
      while (p + 4 <= data.length && repeatCount < 255) {
        if (data[p] === d0 && data[p + 1] === d1 && data[p + 2] === d2 && data[p + 3] === d3) {
          repeatCount++;
          p += 4;
        } else {
          break;
        }
      }

      if (repeatCount === 2) {
        // Type 2: write dword twice
        out.push(2, d0, d1, d2, d3);
        pos += 8;
        continue;
      } else if (repeatCount >= 3) {
        // Type 1: repeat dword N times
        out.push(1, repeatCount, d0, d1, d2, d3);
        pos += repeatCount * 4;
        continue;
      }
    }

    // Fallback: raw bytes (type 0)
    let rawLen = 0;
    const rawStart = pos;
    while (pos + rawLen < data.length && rawLen < 255) {
      // Stop if we see a good compression opportunity ahead
      if (rawLen > 0) {
        // Check for zero run
        if (data[pos + rawLen] === 0 && pos + rawLen + 4 <= data.length) {
          let zc = 0;
          for (let z = 0; z < 4 && pos + rawLen + z < data.length; z++) {
            if (data[pos + rawLen + z] === 0) zc++;
          }
          if (zc >= 4) break;
        }
        // Check for dword repeat
        if (pos + rawLen + 8 <= data.length) {
          const a = pos + rawLen;
          if (data[a] === data[a + 4] && data[a + 1] === data[a + 5] &&
              data[a + 2] === data[a + 6] && data[a + 3] === data[a + 7]) {
            break;
          }
        }
      }
      rawLen++;
    }

    if (rawLen > 0) {
      out.push(0, rawLen);
      for (let i = 0; i < rawLen; i++) {
        out.push(data[rawStart + i]);
      }
      pos += rawLen;
    } else {
      // Safety: emit at least one raw byte
      out.push(0, 1, data[pos]);
      pos++;
    }
  }

  // End of stream
  out.push(0xFF); // -1 as signed int8

  return new Uint8Array(out);
}

/**
 * Write a packed block with uint32BE length prefix.
 * Returns the complete chunk payload (length + packed data).
 */
function writePackedChunk(data: Uint8Array): Uint8Array {
  const packed = packSymBlock(data);
  const result = new Uint8Array(4 + packed.length);
  const view = new DataView(result.buffer);
  view.setUint32(0, packed.length, false);
  result.set(packed, 4);
  return result;
}

// ── Cell encoder ───────────────────────────────────────────────────────────

/**
 * Convert a TrackerCell back to a SymEvent (4 bytes: command, note, param, inst).
 *
 * Reverse of _convertEvent() in the parser.
 */
function encodeSymEvent(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;
  const instrument = cell.instrument ?? 0;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;
  const volume = cell.volume ?? 0;

  // Default: key-on if we have note or instrument
  if (note > 0 || instrument > 0 || volume > 0) {
    out[0] = CMD_KEYON;

    // Reverse note: parser did xmNote = symNote + 25 + transpose
    // We export with transpose=0: symNote = xmNote - 25
    if (note > 0) {
      const symNote = Math.max(0, Math.min(84, note - 25));
      out[1] = symNote; // note (int8, but 0-84 fits in unsigned)
    }

    // Volume: parser scaled param 1-100 → vol * 0.64 → 0-64
    // Reverse: sym param = round(volume / 0.64) = round(volume * 100/64)
    if (volume > 0) {
      out[2] = Math.min(100, Math.round(volume * 100 / 64));
    }

    // Instrument: parser did cell.instrument = ev.inst + 1
    // Reverse: ev.inst = cell.instrument - 1
    if (instrument > 0) {
      out[3] = Math.max(0, instrument - 1);
    }
  }

  // Effect overrides (if present, may change command type)
  if (effTyp !== 0) {
    switch (effTyp) {
      case 0x0F: // Set speed
        out[0] = CMD_SET_SPEED;
        out[1] = 0;
        out[2] = eff > 0 ? eff : 4;
        out[3] = 0;
        break;
      case 0x0A: // Volume slide
        if ((eff & 0xF0) !== 0) {
          out[0] = CMD_VOLSLIDE_UP;
          out[2] = (eff >> 4) & 0x0F;
        } else {
          out[0] = CMD_VOLSLIDE_DOWN;
          out[2] = eff & 0x0F;
        }
        break;
      case 0x01: // Portamento up
        out[0] = CMD_PITCH_UP;
        out[2] = eff;
        break;
      case 0x02: // Portamento down
        out[0] = CMD_PITCH_DOWN;
        out[2] = eff;
        break;
      case 0x04: // Vibrato
        out[0] = CMD_VIBRATO;
        out[2] = eff & 0x0F;
        out[3] = ((eff >> 4) & 0x0F) << 3;
        break;
      case 0x1B: // Retrigger
        out[0] = CMD_RETRIG;
        out[3] = Math.max(0, (eff & 0x0F) - 1);
        break;
      default:
        // Unknown effect — keep as key-on with note/instrument only
        break;
    }
  }

  return out;
}

// ── Chunk reader (mirrors parser's chunk walk) ─────────────────────────────

interface OriginalChunk {
  chunkType: number;
  rawBytes: Uint8Array; // Everything AFTER the int32BE chunkType
}

/**
 * Read all chunks from the original file, preserving raw bytes.
 * Returns the header (16 bytes) and array of chunks.
 */
function readOriginalChunks(original: Uint8Array): {
  header: Uint8Array;
  numChannels: number;
  chunks: OriginalChunk[];
} {
  const view = new DataView(original.buffer, original.byteOffset, original.byteLength);
  const header = original.slice(0, 16);
  const numChannels = view.getUint32(12, false);
  const chunks: OriginalChunk[] = [];
  let pos = 16;

  // Simple inline chunk types
  const INLINE_4BYTE = new Set([-1, -2, -3, -4, -5, -6, -7, 10, 11, 12]);
  // Packed block chunk types (uint32BE length prefix)
  const PACKED_BLOCK = new Set([-10, -11, -13, -14, -15, -16, -17, -18, -19, -20, -21]);
  // No-data chunk types
  const NO_DATA = new Set([-12]);

  while (pos + 4 <= original.length) {
    const chunkType = view.getInt32(pos, false);
    pos += 4;

    if (INLINE_4BYTE.has(chunkType)) {
      if (pos + 4 > original.length) break;
      chunks.push({ chunkType, rawBytes: original.slice(pos, pos + 4) });
      pos += 4;
    } else if (PACKED_BLOCK.has(chunkType)) {
      if (pos + 4 > original.length) break;
      const packedLen = view.getUint32(pos, false);
      const totalLen = 4 + packedLen; // length prefix + data
      if (pos + totalLen > original.length) break;
      chunks.push({ chunkType, rawBytes: original.slice(pos, pos + totalLen) });
      pos += totalLen;
    } else if (NO_DATA.has(chunkType)) {
      chunks.push({ chunkType, rawBytes: new Uint8Array(0) });
    } else {
      // Unknown chunk — stop (same as parser)
      break;
    }
  }

  return { header, numChannels, chunks };
}

// ── Main exporter ──────────────────────────────────────────────────────────

/**
 * Export a TrackerSong to Symphonie Pro (.symmod) format.
 * Requires the original file data stored as symphonieFileData on the song.
 * Pattern events are rebuilt from TrackerSong; everything else is preserved.
 */
export function exportSymphonieProFile(song: TrackerSong): Uint8Array {
  const originalData = song.symphonieFileData;
  if (!originalData) {
    throw new Error('Symphonie export requires original file data');
  }

  const original = new Uint8Array(originalData);
  const { header, numChannels, chunks } = readOriginalChunks(original);

  // Find trackLength from chunks
  let trackLen = 0;
  for (const chunk of chunks) {
    if (chunk.chunkType === -2) { // CHUNK_TRACK_LENGTH
      const v = new DataView(chunk.rawBytes.buffer, chunk.rawBytes.byteOffset, 4);
      trackLen = v.getUint32(0, false);
      break;
    }
  }
  if (trackLen === 0) throw new Error('No trackLength chunk found');

  const patternSize = numChannels * trackLen;

  // ── Rebuild pattern events from TrackerSong ────────────────────────────

  // We need to reconstruct the FLAT SymEvent array.
  // The parser built patterns from positions/sequences, so we need to figure
  // out the raw pattern → TrackerSong pattern mapping.
  //
  // Read positions and sequences from original chunks to rebuild the mapping.
  let positionsRaw: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  let sequencesRaw: Uint8Array<ArrayBufferLike> = new Uint8Array(0);

  // We need to decode packed blocks for positions and sequences
  // But we stored them as raw chunk bytes (with length prefix).
  // Let's re-decode them using a simple inline decoder.

  for (const chunk of chunks) {
    if (chunk.chunkType === -10 && positionsRaw.length === 0) {
      positionsRaw = decodePackedBlock(chunk.rawBytes);
    } else if (chunk.chunkType === -15 && sequencesRaw.length === 0) {
      sequencesRaw = decodePackedBlock(chunk.rawBytes);
    }
  }

  // Parse positions and sequences
  const positions = parsePositions(positionsRaw);
  const sequences = parseSequences(sequencesRaw);

  // Figure out how many raw patterns we need
  let maxRawPattern = 0;
  for (const pos of positions) {
    if (pos.pattern >= maxRawPattern) maxRawPattern = pos.pattern + 1;
  }

  // Decode the ORIGINAL pattern events to use as a base
  let originalPatternEventsRaw: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  for (const chunk of chunks) {
    if (chunk.chunkType === -13 && originalPatternEventsRaw.length === 0) {
      originalPatternEventsRaw = decodePackedBlock(chunk.rawBytes);
    }
  }

  // Start with original events as the base (preserves events we don't touch)
  const totalEvents = maxRawPattern * patternSize;
  const newEvents = new Uint8Array(Math.max(originalPatternEventsRaw.length, totalEvents * 4));
  newEvents.set(originalPatternEventsRaw);

  // Build the same patternMap the parser uses to map (key → trackerSongPatIdx)
  // Then for each TrackerSong pattern, write its cells back to the raw event array
  const patternMap = new Map<string, number>();
  let trackerPatIdx = 0;

  for (const seq of sequences) {
    if (seq.info === 1) continue;
    if (seq.info === -1) break;

    if (
      seq.start >= positions.length ||
      seq.length === 0 ||
      seq.length > positions.length ||
      positions.length - seq.length < seq.start
    ) continue;

    for (let pi = seq.start; pi < seq.start + seq.length; pi++) {
      const pos = positions[pi];
      if (!pos) continue;

      const effectiveTranspose = pos.transpose + seq.transpose;
      const key = `${pos.pattern}-${pos.start}-${pos.length}-${effectiveTranspose}-${pos.speed}`;

      if (!patternMap.has(key)) {
        patternMap.set(key, trackerPatIdx);

        const trackerPat = song.patterns[trackerPatIdx];
        if (trackerPat) {
          const numRows = pos.length;
          const rowStart = pos.start;

          for (let ch = 0; ch < numChannels; ch++) {
            const channelData = trackerPat.channels[ch];
            for (let row = 0; row < numRows; row++) {
              const cell = channelData?.rows[row];
              if (!cell) continue;

              // Skip the speed command that the parser injected on ch0, row0
              let cellToEncode = cell;
              if (ch === 0 && row === 0 && (cell.effTyp ?? 0) === 0x0F) {
                // The parser baked speed into the pattern on ch0 row0.
                // The speed is already in the position entry, so strip it
                // unless the user changed it (we can't tell, so strip always).
                cellToEncode = { ...cell, effTyp: 0, eff: 0 };
              }

              const encoded = encodeSymEvent(cellToEncode);

              // Write to the flat event array
              const srcRow = rowStart + row;
              const eventIdx = pos.pattern * patternSize + srcRow * numChannels + ch;
              const byteOffset = eventIdx * 4;

              if (byteOffset + 4 <= newEvents.length) {
                newEvents[byteOffset] = encoded[0];
                newEvents[byteOffset + 1] = encoded[1];
                newEvents[byteOffset + 2] = encoded[2];
                newEvents[byteOffset + 3] = encoded[3];
              }
            }
          }
        }

        trackerPatIdx++;
      }
    }
  }

  // Pack the new events
  const packedEvents = writePackedChunk(newEvents.slice(0, totalEvents * 4));

  // ── Reassemble file ────────────────────────────────────────────────────

  // Calculate total size: header + all chunks (replacing PatternEvents)
  let totalSize = header.length;
  for (const chunk of chunks) {
    totalSize += 4; // chunkType int32BE
    if (chunk.chunkType === -13) {
      totalSize += packedEvents.length;
    } else {
      totalSize += chunk.rawBytes.length;
    }
  }

  const output = new Uint8Array(totalSize);
  const outView = new DataView(output.buffer);
  let outPos = 0;

  // Write header
  output.set(header, outPos);
  outPos += header.length;

  // Write chunks
  for (const chunk of chunks) {
    outView.setInt32(outPos, chunk.chunkType, false);
    outPos += 4;

    if (chunk.chunkType === -13) {
      output.set(packedEvents, outPos);
      outPos += packedEvents.length;
    } else {
      output.set(chunk.rawBytes, outPos);
      outPos += chunk.rawBytes.length;
    }
  }

  return output;
}

// ── Helper: decode a packed block from raw chunk bytes ──────────────────────

function decodePackedBlock(raw: Uint8Array): Uint8Array {
  if (raw.length < 4) return new Uint8Array(0);
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const packedLength = view.getUint32(0, false);
  if (packedLength === 0 || packedLength + 4 > raw.length) return new Uint8Array(0);

  const data = raw.slice(4, 4 + packedLength);

  // Check for PACK\xFF\xFF header
  if (data.length >= 10 && data[0] === 0x50 && data[1] === 0x41 &&
      data[2] === 0x43 && data[3] === 0x4B && data[4] === 0xFF && data[5] === 0xFF) {
    const unpackedLen = (data[6] << 24) | (data[7] << 16) | (data[8] << 8) | data[9];
    const maxLen = Math.min(unpackedLen, packedLength * 170);
    const out = new Uint8Array(maxLen);
    let offset = 0;
    let remain = maxLen;
    let pos = 10;
    let done = false;

    while (!done && pos < data.length && remain > 0) {
      const type = data[pos] >= 128 ? data[pos] - 256 : data[pos];
      pos++;

      switch (type) {
        case 0: {
          if (pos >= data.length) { done = true; break; }
          const len = data[pos++];
          if (remain < len || pos + len > data.length) { done = true; break; }
          for (let i = 0; i < len; i++) out[offset++] = data[pos++];
          remain -= len;
          break;
        }
        case 1: {
          if (pos >= data.length) { done = true; break; }
          const len = data[pos++];
          if (remain < len * 4 || pos + 4 > data.length) { done = true; break; }
          const b0 = data[pos++], b1 = data[pos++], b2 = data[pos++], b3 = data[pos++];
          for (let i = 0; i < len && remain >= 4; i++) {
            out[offset++] = b0; out[offset++] = b1;
            out[offset++] = b2; out[offset++] = b3;
            remain -= 4;
          }
          break;
        }
        case 2: {
          if (remain < 8 || pos + 4 > data.length) { done = true; break; }
          const b0 = data[pos++], b1 = data[pos++], b2 = data[pos++], b3 = data[pos++];
          out[offset++] = b0; out[offset++] = b1; out[offset++] = b2; out[offset++] = b3;
          out[offset++] = b0; out[offset++] = b1; out[offset++] = b2; out[offset++] = b3;
          remain -= 8;
          break;
        }
        case 3: {
          if (pos >= data.length) { done = true; break; }
          const len = data[pos++];
          if (remain < len) { done = true; break; }
          offset += len;
          remain -= len;
          break;
        }
        case -1:
          done = true;
          break;
        default:
          done = true;
          break;
      }
    }

    return out.slice(0, offset);
  }

  // Not packed — return raw
  return data;
}

// ── Helper: parse positions/sequences from decoded bytes ───────────────────

interface ExportPosition {
  pattern: number;
  start: number;
  length: number;
  speed: number;
  transpose: number;
  loopNum: number;
}

function parsePositions(data: Uint8Array): ExportPosition[] {
  const count = Math.floor(data.length / 32);
  const positions: ExportPosition[] = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i < count; i++) {
    const base = i * 32;
    positions.push({
      loopNum:  view.getUint16(base + 4, false),
      pattern:  view.getUint16(base + 8, false),
      start:    view.getUint16(base + 10, false),
      length:   view.getUint16(base + 12, false),
      speed:    view.getUint16(base + 14, false),
      transpose: view.getInt16(base + 16, false),
    });
  }
  return positions;
}

interface ExportSequence {
  start: number;
  length: number;
  loop: number;
  info: number;
  transpose: number;
}

function parseSequences(data: Uint8Array): ExportSequence[] {
  const count = Math.floor(data.length / 16);
  const seqs: ExportSequence[] = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i < count; i++) {
    const base = i * 16;
    seqs.push({
      start:     view.getUint16(base, false),
      length:    view.getUint16(base + 2, false),
      loop:      view.getUint16(base + 4, false),
      info:      view.getInt16(base + 6, false),
      transpose: view.getInt16(base + 8, false),
    });
  }
  return seqs;
}
