/**
 * DigitalSymphonyExporter.ts — Export TrackerSong to Digital Symphony (.dsym) format.
 *
 * File layout (from DigitalSymphonyParser.ts):
 *   Header (17 bytes): magic[8] + version(u8) + numChannels(u8) + numOrders(u16LE) + numTracks(u16LE) + infoLen(u24LE)
 *   Sample name lengths: 63 × u8
 *   Sample length entries: for non-virtual samples, 3 bytes (u24LE, value >>1 = byte length)
 *   Song name: u8 length-prefixed string
 *   Allowed commands: 8 bytes
 *   Sequence chunk: packingType(1) + [LZW or raw] numOrders × numChannels × u16LE track indices
 *   Track data chunks: packingType(1) + [LZW or raw] chunks of up to 2000 tracks × 256 bytes
 *   Samples: for each non-virtual: name string + loopStart(u24LE) + loopLen(u24LE) + vol(u8) + finetune(u8) + packType(u8) + data
 *
 * Cell encoding (4 bytes, bit-packed):
 *   d0 = (note & 0x3F) | ((instr & 0x03) << 6)
 *   d1 = ((instr >> 2) & 0x0F) | ((command & 0x03) << 6)
 *   d2 = ((command >> 2) & 0x0F) | ((param & 0x0F) << 4)
 *   d3 = (param >> 4) & 0xFF
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { TrackerCell } from '@/types';
import { compressDSymLZW } from '@/lib/compression/DSymLZW';

// ── Constants ────────────────────────────────────────────────────────────────

const DSYM_MAGIC = new Uint8Array([0x02, 0x01, 0x13, 0x13, 0x14, 0x12, 0x01, 0x0B]);
const ROWS_PER_TRACK = 64;
const BYTES_PER_ROW = 4;
const BYTES_PER_TRACK = ROWS_PER_TRACK * BYTES_PER_ROW; // 256
const MAX_SAMPLES = 63;

// ── Reverse effect mapping (XM effTyp/eff → DSym command/param) ─────────────

function reverseEffect(cell: TrackerCell): { command: number; param: number } {
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;

  if (effTyp === 0 && eff === 0) return { command: 0, param: 0 };

  // Standard MOD effects 0x00-0x0F → DSym commands
  switch (effTyp) {
    case 0x00: return { command: 0x00, param: eff }; // Arpeggio
    case 0x01: return { command: 0x01, param: eff }; // Slide up
    case 0x02: return { command: 0x02, param: eff }; // Slide down
    case 0x03: return { command: 0x03, param: eff }; // Tone portamento
    case 0x04: return { command: 0x04, param: eff }; // Vibrato
    case 0x05: return { command: 0x05, param: eff }; // Tone porta + vol slide
    case 0x06: return { command: 0x06, param: eff }; // Vibrato + vol slide
    case 0x07: return { command: 0x07, param: eff }; // Tremolo
    case 0x09: return { command: 0x09, param: (eff << 1) & 0xFFF }; // Sample offset
    case 0x0A: return { command: 0x0A, param: eff }; // Volume slide
    case 0x0B: return { command: 0x0B, param: eff }; // Position jump
    case 0x0C: return { command: 0x0C, param: eff }; // Set volume
    case 0x0D: return { command: 0x0D, param: eff }; // Pattern break
    case 0x0F: return { command: 0x0F, param: eff }; // Set speed

    // Extended effects (E-commands)
    case 0x0E: {
      const subCmd = (eff >> 4) & 0x0F;
      const subParam = eff & 0x0F;
      switch (subCmd) {
        case 0x0: return { command: 0x10, param: subParam }; // Filter
        case 0x1: return { command: 0x11, param: subParam }; // Fine slide up
        case 0x2: return { command: 0x12, param: subParam }; // Fine slide down
        case 0x3: return { command: 0x13, param: subParam }; // Glissando
        case 0x4: return { command: 0x14, param: subParam }; // Vibrato waveform
        case 0x5: return { command: 0x15, param: subParam }; // Fine tune
        case 0x6: return { command: 0x16, param: subParam }; // Jump to loop
        case 0x7: return { command: 0x17, param: subParam }; // Tremolo waveform
        case 0x9: return { command: 0x19, param: subParam }; // Retrig
        case 0xA: return { command: 0x11, param: (subParam << 8) }; // Fine vol slide up
        case 0xB: return { command: 0x1A, param: (subParam << 8) }; // Fine vol slide down
        case 0xC: return { command: 0x1C, param: subParam }; // Note cut
        case 0xD: return { command: 0x1D, param: subParam }; // Note delay
        case 0xE: return { command: 0x1E, param: subParam }; // Pattern delay
        case 0xF: return { command: 0x1F, param: subParam }; // Invert loop
      }
      break;
    }
  }

  return { command: 0, param: 0 };
}

// ── Cell encoder ────────────────────────────────────────────────────────────

function encodeDSymCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);

  // Note: XM note → DSym raw note (reverse: rawNote + 48 = xmNote)
  const xmNote = cell.note ?? 0;
  let rawNote = 0;
  if (xmNote > 0 && xmNote <= 96) {
    rawNote = xmNote - 48;
    if (rawNote < 0) rawNote = 0;
    if (rawNote > 63) rawNote = 63;
  }

  const instr = (cell.instrument ?? 0) & 0x3F;
  const { command, param } = reverseEffect(cell);

  // Bit packing (reverse of parser decode):
  //   rawNote = d0 & 0x3F
  //   instr   = (d0 >> 6) | ((d1 & 0x0F) << 2)
  //   command = (d1 >> 6) | ((d2 & 0x0F) << 2)
  //   param   = (d2 >> 4) | (d3 << 4)
  out[0] = (rawNote & 0x3F) | ((instr & 0x03) << 6);
  out[1] = ((instr >> 2) & 0x0F) | ((command & 0x03) << 6);
  out[2] = ((command >> 2) & 0x0F) | ((param & 0x0F) << 4);
  out[3] = (param >> 4) & 0xFF;

  return out;
}

// ── Track deduplication ─────────────────────────────────────────────────────

function trackHash(trackData: Uint8Array, offset: number): string {
  // Simple hash of 256 bytes
  let h = '';
  for (let i = 0; i < BYTES_PER_TRACK; i++) {
    h += String.fromCharCode(trackData[offset + i]);
  }
  return h;
}

// ── Main exporter ───────────────────────────────────────────────────────────

/**
 * Export a TrackerSong to Digital Symphony (.dsym) format.
 * Returns the binary data as an ArrayBuffer.
 */
export function exportDigitalSymphony(song: TrackerSong): ArrayBuffer {
  const numChannels = song.numChannels;
  const numOrders = song.songLength;

  // ── Build track data and sequence table ────────────────────────────────
  // Each unique (channel, pattern) combination becomes a track.
  // Deduplicate identical tracks.
  const allTrackData: Uint8Array[] = [];
  const trackMap = new Map<string, number>(); // hash → track index
  const sequence = new Uint16Array(numOrders * numChannels);

  for (let ord = 0; ord < numOrders; ord++) {
    const patIdx = song.songPositions[ord] ?? 0;
    const pat = song.patterns[patIdx];
    if (!pat) continue;

    for (let chn = 0; chn < numChannels; chn++) {
      const channelData = pat.channels[chn];
      const track = new Uint8Array(BYTES_PER_TRACK);

      for (let row = 0; row < ROWS_PER_TRACK; row++) {
        const cell = channelData?.rows[row] ?? { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 };
        const encoded = encodeDSymCell(cell);
        track.set(encoded, row * BYTES_PER_ROW);
      }

      const hash = trackHash(track, 0);
      let trackIdx = trackMap.get(hash);
      if (trackIdx === undefined) {
        trackIdx = allTrackData.length;
        trackMap.set(hash, trackIdx);
        allTrackData.push(track);
      }
      sequence[ord * numChannels + chn] = trackIdx;
    }
  }

  const numTracks = allTrackData.length;

  // ── Encode song name ──────────────────────────────────────────────────
  const songNameBytes = encodeString(song.name || 'Untitled', 255);

  // ── Build allowed commands bitmask (enable all) ───────────────────────
  const allowedCommands = new Uint8Array(8);
  allowedCommands.fill(0xFF); // Enable all commands

  // ── Compress sequence chunk ───────────────────────────────────────────
  const sequenceRaw = new Uint8Array(sequence.buffer, sequence.byteOffset, sequence.byteLength);
  const sequenceCompressed = compressDSymLZW(sequenceRaw);
  const useCompressedSeq = sequenceCompressed.length < sequenceRaw.length;

  // ── Compress track data (in 2000-track chunks) ────────────────────────
  const trackChunks: { compressed: Uint8Array; useCompression: boolean }[] = [];
  for (let chunkStart = 0; chunkStart < numTracks; chunkStart += 2000) {
    const chunkTracks = Math.min(numTracks - chunkStart, 2000);
    const chunkSize = chunkTracks * BYTES_PER_TRACK;
    const chunkData = new Uint8Array(chunkSize);
    for (let t = 0; t < chunkTracks; t++) {
      chunkData.set(allTrackData[chunkStart + t], t * BYTES_PER_TRACK);
    }
    const compressed = compressDSymLZW(chunkData);
    trackChunks.push({
      compressed,
      useCompression: compressed.length < chunkData.length,
    });
  }

  // ── Build sample data ─────────────────────────────────────────────────
  // For export, we write samples as raw 8-bit signed PCM (packing type 2)
  const sampleEntries: {
    name: string;
    isVirtual: boolean;
    length: number; // in bytes
    loopStart: number;
    loopLength: number;
    volume: number;
    fineTune: number;
    pcm8: Uint8Array | null;
  }[] = [];

  for (let smp = 0; smp < MAX_SAMPLES; smp++) {
    const instr = song.instruments[smp];
    if (!instr || !instr.sample?.audioBuffer) {
      sampleEntries.push({
        name: instr?.name || `Sample ${smp + 1}`,
        isVirtual: true,
        length: 0,
        loopStart: 0,
        loopLength: 0,
        volume: 64,
        fineTune: 0,
        pcm8: null,
      });
      continue;
    }

    const cfg = instr.sample;
    // Extract PCM from WAV audioBuffer
    const pcm8 = extractPCM8FromWAV(cfg.audioBuffer!);
    const nLength = pcm8 ? pcm8.length : 0;

    const loopEnabled = cfg.loop && cfg.loopType !== 'off';
    const loopStart = loopEnabled ? Math.round((cfg.loopStart ?? 0) * nLength) : 0;
    const loopEnd = loopEnabled ? Math.round((cfg.loopEnd ?? 0) * nLength) : 0;
    const loopLength = loopEnabled ? Math.max(loopEnd - loopStart, 0) : 0;

    // Volume: instrument volume is in dB (-60..0) → 0..64
    const volDb = instr.volume ?? 0;
    const volLin = Math.round(((volDb + 60) / 60) * 64);
    const volume = Math.max(0, Math.min(64, volLin));

    sampleEntries.push({
      name: instr.name || `Sample ${smp + 1}`,
      isVirtual: false,
      length: nLength,
      loopStart,
      loopLength,
      volume,
      fineTune: 0,
      pcm8,
    });
  }

  // ── Calculate total file size ─────────────────────────────────────────
  let totalSize = 17; // header

  // Sample name length array
  totalSize += 63;

  // Sample length entries (3 bytes each for non-virtual)
  for (const s of sampleEntries) {
    if (!s.isVirtual) totalSize += 3;
  }

  // Song name
  totalSize += 1 + songNameBytes.length;

  // Allowed commands
  totalSize += 8;

  // Sequence chunk
  totalSize += 1; // packing type
  if (useCompressedSeq) {
    totalSize += sequenceCompressed.length;
  } else {
    totalSize += sequenceRaw.length;
  }

  // Track data chunks
  for (let chunkStart = 0; chunkStart < numTracks; chunkStart += 2000) {
    const chunkTracks = Math.min(numTracks - chunkStart, 2000);
    const chunkIdx = Math.floor(chunkStart / 2000);
    totalSize += 1; // packing type
    if (trackChunks[chunkIdx].useCompression) {
      totalSize += trackChunks[chunkIdx].compressed.length;
    } else {
      totalSize += chunkTracks * BYTES_PER_TRACK;
    }
  }

  // Sample data
  for (const s of sampleEntries) {
    const nameLen = Math.min(s.name.length, 63);
    totalSize += nameLen; // name string
    if (!s.isVirtual) {
      totalSize += 3 + 3 + 1 + 1; // loopStart + loopLen + vol + finetune
      totalSize += 1; // packing type
      totalSize += s.length; // raw PCM data
    }
  }

  // ── Write file ────────────────────────────────────────────────────────
  const buf = new ArrayBuffer(totalSize);
  const u8 = new Uint8Array(buf);
  const view = new DataView(buf);
  let pos = 0;

  // Magic
  u8.set(DSYM_MAGIC, 0);
  pos = 8;

  // Version
  u8[pos++] = 1; // version 1

  // numChannels
  u8[pos++] = numChannels;

  // numOrders (u16LE)
  view.setUint16(pos, numOrders, true);
  pos += 2;

  // numTracks (u16LE)
  view.setUint16(pos, numTracks, true);
  pos += 2;

  // infoLen (u24LE) - 0 (no info chunk)
  u8[pos++] = 0;
  u8[pos++] = 0;
  u8[pos++] = 0;

  // Sample name length array (63 bytes)
  for (let smp = 0; smp < MAX_SAMPLES; smp++) {
    const s = sampleEntries[smp];
    const nameLen = Math.min(s.name.length, 63) & 0x3F;
    u8[pos++] = s.isVirtual ? (nameLen | 0x80) : nameLen;
  }

  // Sample length entries (3 bytes each for non-virtual)
  for (const s of sampleEntries) {
    if (!s.isVirtual) {
      const len24 = s.length >> 1; // stored as half-length
      u8[pos++] = len24 & 0xFF;
      u8[pos++] = (len24 >> 8) & 0xFF;
      u8[pos++] = (len24 >> 16) & 0xFF;
    }
  }

  // Song name (u8 length-prefixed)
  u8[pos++] = songNameBytes.length;
  u8.set(songNameBytes, pos);
  pos += songNameBytes.length;

  // Allowed commands
  u8.set(allowedCommands, pos);
  pos += 8;

  // Sequence chunk
  if (useCompressedSeq) {
    u8[pos++] = 1; // LZW compressed
    u8.set(sequenceCompressed, pos);
    pos += sequenceCompressed.length;
  } else {
    u8[pos++] = 0; // raw
    u8.set(sequenceRaw, pos);
    pos += sequenceRaw.length;
  }

  // Track data chunks
  for (let chunkStart = 0; chunkStart < numTracks; chunkStart += 2000) {
    const chunkTracks = Math.min(numTracks - chunkStart, 2000);
    const chunkIdx = Math.floor(chunkStart / 2000);
    const chunk = trackChunks[chunkIdx];

    if (chunk.useCompression) {
      u8[pos++] = 1; // LZW compressed
      u8.set(chunk.compressed, pos);
      pos += chunk.compressed.length;
    } else {
      u8[pos++] = 0; // raw
      for (let t = 0; t < chunkTracks; t++) {
        u8.set(allTrackData[chunkStart + t], pos);
        pos += BYTES_PER_TRACK;
      }
    }
  }

  // Sample data
  for (const s of sampleEntries) {
    const nameLen = Math.min(s.name.length, 63);
    const nameBytes = encodeString(s.name, nameLen);
    u8.set(nameBytes, pos);
    pos += nameLen;

    if (!s.isVirtual) {
      // Loop start (u24LE, >>1)
      const ls = s.loopStart >> 1;
      u8[pos++] = ls & 0xFF;
      u8[pos++] = (ls >> 8) & 0xFF;
      u8[pos++] = (ls >> 16) & 0xFF;

      // Loop length (u24LE, >>1)
      const ll = s.loopLength >> 1;
      u8[pos++] = ll & 0xFF;
      u8[pos++] = (ll >> 8) & 0xFF;
      u8[pos++] = (ll >> 16) & 0xFF;

      // Volume
      u8[pos++] = s.volume;

      // Fine tune
      u8[pos++] = s.fineTune;

      // Packing type: 2 = raw 8-bit signed PCM
      u8[pos++] = 2;

      // Sample data
      if (s.pcm8 && s.pcm8.length > 0) {
        u8.set(s.pcm8, pos);
        pos += s.pcm8.length;
      }
    }
  }

  return buf;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function encodeString(s: string, maxLen: number): Uint8Array {
  const len = Math.min(s.length, maxLen);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = s.charCodeAt(i) & 0xFF;
  }
  return out;
}

/**
 * Extract 8-bit signed PCM from a WAV ArrayBuffer.
 * The parser stores samples as 16-bit WAV; we downsample to 8-bit for export.
 */
function extractPCM8FromWAV(wavBuf: ArrayBuffer): Uint8Array | null {
  try {
    const view = new DataView(wavBuf);
    const u8 = new Uint8Array(wavBuf);

    // Find 'data' chunk
    let dataOffset = 12;
    let dataSize = 0;
    while (dataOffset < u8.length - 8) {
      const chunkId = String.fromCharCode(u8[dataOffset], u8[dataOffset + 1], u8[dataOffset + 2], u8[dataOffset + 3]);
      const chunkSize = view.getUint32(dataOffset + 4, true);
      if (chunkId === 'data') {
        dataOffset += 8;
        dataSize = chunkSize;
        break;
      }
      dataOffset += 8 + chunkSize;
    }

    if (dataSize === 0) return null;

    // Assume 16-bit PCM (parser writes 16-bit WAV)
    const numSamples = dataSize >> 1;
    const pcm8 = new Uint8Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      const s16 = view.getInt16(dataOffset + i * 2, true);
      // Convert to unsigned 8-bit (DSym type 2 expects signed-ish bytes)
      pcm8[i] = ((s16 >> 8) + 128) & 0xFF;
    }
    return pcm8;
  } catch {
    return null;
  }
}
