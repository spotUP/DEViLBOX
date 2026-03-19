/**
 * ChuckBiscuitsExporter.ts — Export TrackerSong as Chuck Biscuits / Black Artist (.cba) format
 *
 * Reconstructs the CBA binary from TrackerSong data, reversing the parser logic.
 *
 * Binary layout (all little-endian unless noted):
 *   +0    magic[4]           — 'CBA\xF9' (0x43 0x42 0x41 0xF9)
 *   +4    title[32]          — song title (null-padded)
 *   +36   eof(uint8)         — 0x1A
 *   +37   messageLength(u16le) — song message length (0 if no message)
 *   +39   numChannels(uint8) — number of channels (1-32)
 *   +40   lastPattern(uint8) — last pattern index (numPatterns - 1)
 *   +41   numOrders(uint8)   — number of orders
 *   +42   numSamples(uint8)  — number of samples
 *   +43   speed(uint8)       — initial speed
 *   +44   tempo(uint8)       — initial BPM
 *   +45   panPos[32](uint8)  — per-channel panning (0=left, 128=center, 255=right)
 *   +77   orders[255](uint8) — order list (0xFF-padded)
 *   Header total: 332 bytes
 *
 *   Sample headers: numSamples × 48 bytes
 *     name[32], flags(u8), volume(u8), sampleRate(u16le), length(u32le),
 *     loopStart(u32le), loopEnd(u32le)
 *
 *   Pattern data: numPatterns × 64 rows × numChannels × 5 bytes/cell
 *     Cell: [instr, note, vol, command, param] via encodeCBACell
 *
 *   Sample data: 8-bit delta PCM (signed)
 *
 * Reference: OpenMPT soundlib/Load_cba.cpp, ChuckBiscuitsParser.ts
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { encodeCBACell } from '@/engine/uade/encoders/ChuckBiscuitsEncoder';

// ── Constants ─────────────────────────────────────────────────────────────────

const HEADER_SIZE        = 332;
const SAMPLE_HEADER_SIZE = 48;
const ROWS_PER_PATTERN   = 64;
const BYTES_PER_CELL     = 5;
const MAX_CHANNELS       = 32;
const MAX_ORDERS         = 255;

// ── Binary write helpers ──────────────────────────────────────────────────────

function writeU8(v: DataView, off: number, val: number): void {
  v.setUint8(off, val & 0xFF);
}

function writeU16LE(v: DataView, off: number, val: number): void {
  v.setUint16(off, val & 0xFFFF, true);
}

function writeU32LE(v: DataView, off: number, val: number): void {
  v.setUint32(off, val >>> 0, true);
}

function writeString(out: Uint8Array, off: number, str: string, maxLen: number): void {
  for (let i = 0; i < maxLen; i++) {
    out[off + i] = i < str.length ? str.charCodeAt(i) & 0xFF : 0;
  }
}

// ── Sample extraction ─────────────────────────────────────────────────────────

interface SampleInfo {
  name: string;
  flags: number;
  volume: number;
  sampleRate: number;
  pcmLength: number;
  loopStart: number;
  loopEnd: number;
  pcm: Uint8Array; // raw 8-bit signed PCM (before delta encoding)
}

function extractSample(inst: TrackerSong['instruments'][0]): SampleInfo {
  const name = (inst.name ?? '').slice(0, 32);
  const volume = Math.min(64, Math.max(0, Math.round((inst.volume ?? 100) * 64 / 100)));

  // Try to extract PCM from sample audioBuffer (WAV format)
  if (inst.sample?.audioBuffer) {
    const wav = new DataView(inst.sample.audioBuffer);
    // Standard WAV: data chunk at offset 44, 16-bit samples
    let dataLen = 0;
    try {
      dataLen = wav.getUint32(40, true);
    } catch {
      // Invalid WAV
    }
    const frames = Math.floor(dataLen / 2);
    if (frames > 0) {
      const pcm = new Uint8Array(frames);
      for (let j = 0; j < frames; j++) {
        const s16 = wav.getInt16(44 + j * 2, true);
        // 16-bit signed → 8-bit signed, stored as unsigned byte
        pcm[j] = (s16 >> 8) & 0xFF;
      }

      const loopStart = inst.sample?.loopStart ?? 0;
      const loopEnd = inst.sample?.loopEnd ?? 0;
      const hasLoop = loopEnd > loopStart;
      const sampleRate = inst.sample?.sampleRate ?? 8363;

      return {
        name,
        flags: hasLoop ? 0x08 : 0x00,
        volume,
        sampleRate,
        pcmLength: frames,
        loopStart: hasLoop ? loopStart : 0,
        loopEnd: hasLoop ? Math.min(loopEnd, frames) : 0,
        pcm,
      };
    }
  }

  // No sample data available
  return {
    name,
    flags: 0,
    volume,
    sampleRate: 8363,
    pcmLength: 0,
    loopStart: 0,
    loopEnd: 0,
    pcm: new Uint8Array(0),
  };
}

/**
 * Delta-encode 8-bit PCM: each output byte is the difference from the previous sample.
 * Reverse of the parser's delta PCM decode.
 */
function deltaEncode(pcm: Uint8Array): Uint8Array {
  const out = new Uint8Array(pcm.length);
  let prev = 0;
  for (let i = 0; i < pcm.length; i++) {
    // pcm[i] is unsigned representation of signed byte
    // delta = current - previous (wrapping)
    const delta = (pcm[i] - prev) & 0xFF;
    out[i] = delta;
    prev = pcm[i];
  }
  return out;
}

// ── Exporter ──────────────────────────────────────────────────────────────────

/**
 * Export a TrackerSong as a Chuck Biscuits / Black Artist (.cba) file.
 */
export async function exportChuckBiscuits(
  song: TrackerSong,
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const warnings: string[] = [];

  // ── Determine dimensions ──────────────────────────────────────────────────
  const numChannels = Math.min(MAX_CHANNELS, song.numChannels ?? song.patterns[0]?.channels.length ?? 4);
  const numOrders = Math.min(MAX_ORDERS, song.songPositions.length);
  const speed = Math.max(1, song.initialSpeed ?? 6);
  const tempo = Math.max(32, song.initialBPM ?? 125);
  const title = (song.name ?? '').slice(0, 32);

  if (numChannels > MAX_CHANNELS) {
    warnings.push(`Channel count clamped from ${song.numChannels} to ${MAX_CHANNELS}`);
  }

  // ── Build unique pattern list ─────────────────────────────────────────────
  // song.songPositions maps order → pattern index in song.patterns
  // CBA stores raw pattern data indexed by pattern number.
  // We need to deduplicate: collect unique pattern indices from songPositions.
  const usedPatternIndices = new Set<number>();
  const orderList: number[] = [];

  for (let i = 0; i < numOrders; i++) {
    const patIdx = song.songPositions[i] ?? 0;
    usedPatternIndices.add(patIdx);
    orderList.push(patIdx);
  }

  // Map song pattern indices to sequential CBA pattern indices
  const sortedPatIndices = [...usedPatternIndices].sort((a, b) => a - b);
  const patIdxMap = new Map<number, number>();
  sortedPatIndices.forEach((songIdx, cbaIdx) => patIdxMap.set(songIdx, cbaIdx));

  const numPatterns = sortedPatIndices.length;
  const lastPattern = Math.max(0, numPatterns - 1);

  // Remap order list to CBA pattern indices
  const cbaOrderList = orderList.map(idx => patIdxMap.get(idx) ?? 0);

  // ── Extract samples ───────────────────────────────────────────────────────
  const numSamples = Math.min(255, song.instruments.length);
  const samples: SampleInfo[] = [];

  for (let i = 0; i < numSamples; i++) {
    samples.push(extractSample(song.instruments[i]));
  }

  if (song.instruments.length > 255) {
    warnings.push(`Instrument count clamped from ${song.instruments.length} to 255`);
  }

  // ── Calculate total file size ─────────────────────────────────────────────
  const patternDataSize = numPatterns * ROWS_PER_PATTERN * numChannels * BYTES_PER_CELL;
  const sampleHeadersSize = numSamples * SAMPLE_HEADER_SIZE;
  const totalSamplePCM = samples.reduce((sum, s) => sum + s.pcmLength, 0);
  const totalSize = HEADER_SIZE + sampleHeadersSize + patternDataSize + totalSamplePCM;

  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);

  // ── Write header ──────────────────────────────────────────────────────────

  // Magic: 'CBA\xF9'
  output[0] = 0x43; // 'C'
  output[1] = 0x42; // 'B'
  output[2] = 0x41; // 'A'
  output[3] = 0xF9;

  // Title (32 bytes, null-padded)
  writeString(output, 4, title, 32);

  // EOF marker
  writeU8(view, 36, 0x1A);

  // Message length (0 — we don't export song messages)
  writeU16LE(view, 37, 0);

  // Channels, patterns, orders, samples
  writeU8(view, 39, numChannels);
  writeU8(view, 40, lastPattern);
  writeU8(view, 41, numOrders);
  writeU8(view, 42, numSamples);
  writeU8(view, 43, speed);
  writeU8(view, 44, tempo);

  // Per-channel panning: DEViLBOX -50..+50 → CBA 0..255
  // Parser: panMPT = panPos * 2; pan = round((panMPT - 256) / 256 * 50)
  // Reverse: panPos = round((pan / 50 * 256 + 256) / 2)
  for (let ch = 0; ch < 32; ch++) {
    if (ch < numChannels && song.patterns[0]?.channels[ch]) {
      const pan = song.patterns[0].channels[ch].pan ?? 0;
      const panMPT = Math.round(pan / 50 * 256 + 256); // 0-512
      const panPos = Math.max(0, Math.min(255, Math.round(panMPT / 2)));
      writeU8(view, 45 + ch, panPos);
    } else {
      writeU8(view, 45 + ch, 128); // center
    }
  }

  // Order list (255 bytes, 0xFF-padded)
  for (let i = 0; i < 255; i++) {
    if (i < cbaOrderList.length) {
      writeU8(view, 77 + i, cbaOrderList[i]);
    } else if (i === cbaOrderList.length) {
      writeU8(view, 77 + i, 0xFF); // end marker
    } else {
      writeU8(view, 77 + i, 0xFF);
    }
  }

  // ── Write sample headers ──────────────────────────────────────────────────
  let pos = HEADER_SIZE;

  for (let i = 0; i < numSamples; i++) {
    const s = samples[i];

    // Name (32 bytes)
    writeString(output, pos, s.name, 32);

    // Flags
    writeU8(view, pos + 32, s.flags);

    // Volume
    writeU8(view, pos + 33, s.volume);

    // Sample rate
    writeU16LE(view, pos + 34, s.sampleRate);

    // Length
    writeU32LE(view, pos + 36, s.pcmLength);

    // Loop start
    writeU32LE(view, pos + 40, s.loopStart);

    // Loop end
    writeU32LE(view, pos + 44, s.loopEnd);

    pos += SAMPLE_HEADER_SIZE;
  }

  // ── Write pattern data ────────────────────────────────────────────────────
  // Patterns are stored in order of their CBA index (0..lastPattern).
  // Each pattern: 64 rows × numChannels channels × 5 bytes/cell, row-major.

  for (let cbaPatIdx = 0; cbaPatIdx < numPatterns; cbaPatIdx++) {
    const songPatIdx = sortedPatIndices[cbaPatIdx];
    const pat = songPatIdx < song.patterns.length ? song.patterns[songPatIdx] : null;

    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const cell = pat?.channels[ch]?.rows[row];
        if (cell) {
          const encoded = encodeCBACell(cell);
          output.set(encoded, pos);
        }
        // else: already zero-filled (no note, no instrument, no effect)
        pos += BYTES_PER_CELL;
      }
    }
  }

  // ── Write sample data (delta-encoded PCM) ─────────────────────────────────
  for (let i = 0; i < numSamples; i++) {
    const s = samples[i];
    if (s.pcmLength > 0) {
      const deltaPCM = deltaEncode(s.pcm);
      output.set(deltaPCM, pos);
      pos += s.pcmLength;
    }
  }

  // ── Build result ──────────────────────────────────────────────────────────
  const baseName = (song.name ?? 'untitled').replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'untitled';
  const filename = `${baseName}.cba`;

  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename,
    warnings,
  };
}
