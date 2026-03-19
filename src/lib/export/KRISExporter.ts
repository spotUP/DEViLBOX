/**
 * KRISExporter.ts — Export TrackerSong to ChipTracker KRIS binary format.
 *
 * Produces a valid KRIS file with the following layout:
 *
 *   +0    song name (22 bytes, space-padded)
 *   +22   31 × MOD sample headers (30 bytes each = 930 bytes)
 *         Each: name(22) + length(u16BE, words) + finetune(int8) + volume(u8)
 *               + loopStart(u16BE, words) + loopLen(u16BE, words)
 *   +952  "KRIS" magic (4 bytes)
 *   +956  numOrders (uint8, 1–128)
 *   +957  restartPos (uint8, 0–127)
 *   +958  track reference table [128 × 4 × 2 bytes] = 1024 bytes
 *         Entry at [orderIdx * 4 + ch]: byte[0] = track index (uint8), byte[1] = transpose (int8)
 *   +1982 track data: numTracks × 256 bytes (64 rows × 4 bytes per cell)
 *   +trackEnd: sample PCM data (8-bit signed, sequential)
 *
 * Note: Synth waveforms are not exported (numSynthWaveforms = 0).
 *
 * Cell encoding (4 bytes per row):
 *   byte[0]: noteByte (0xA8 = empty; even 0x18-0x9E = note)
 *   byte[1]: instrument (1-based; 0 = none)
 *   byte[2]: effect type (low nibble only)
 *   byte[3]: effect parameter
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

// ── Constants ─────────────────────────────────────────────────────────────────

const NUM_SAMPLES       = 31;
const SAMPLE_HDR_SIZE   = 30;
const NAME_SIZE         = 22;
const MAGIC_OFFSET      = 952;
const TRACK_REF_OFFSET  = 958;
const TRACKS_OFFSET     = 1982; // no synth waveforms
const NUM_CHANNELS      = 4;
const ROWS_PER_TRACK    = 64;
const BYTES_PER_TRACK   = ROWS_PER_TRACK * 4; // 256

// ── Binary write helpers ──────────────────────────────────────────────────────

function writeStr(buf: Uint8Array, off: number, str: string, len: number): void {
  for (let i = 0; i < len; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 0x7F : 0x20; // space-pad
  }
}

function writeU8(buf: Uint8Array, off: number, val: number): void {
  buf[off] = val & 0xFF;
}

function writeI8(buf: Uint8Array, off: number, val: number): void {
  buf[off] = val & 0xFF;
}

function writeU16BE(buf: Uint8Array, off: number, val: number): void {
  buf[off]     = (val >>> 8) & 0xFF;
  buf[off + 1] = val & 0xFF;
}

// ── Sample extraction ─────────────────────────────────────────────────────────

interface SampleInfo {
  name: string;
  pcm: Uint8Array;       // 8-bit signed PCM
  volume: number;        // 0–64
  finetune: number;      // int8
  loopStart: number;     // in bytes
  loopLen: number;       // in bytes (>2 = loop enabled)
}

function extractSample(inst: TrackerSong['instruments'][number]): SampleInfo | null {
  if (!inst?.sample?.audioBuffer) return null;

  const wavBuf = inst.sample.audioBuffer;
  if (wavBuf.byteLength < 44) return null;

  const wav = new DataView(wavBuf);
  const dataLen = wav.getUint32(40, true);
  const bitsPerSample = wav.getUint16(34, true);
  const frames = bitsPerSample === 16
    ? Math.floor(dataLen / 2)
    : dataLen;

  if (frames === 0) return null;

  const pcm = new Uint8Array(frames);
  if (bitsPerSample === 16) {
    for (let j = 0; j < frames; j++) {
      const s16 = wav.getInt16(44 + j * 2, true);
      pcm[j] = (s16 >> 8) & 0xFF;
    }
  } else {
    for (let j = 0; j < frames; j++) {
      pcm[j] = (wav.getUint8(44 + j) ^ 0x80) & 0xFF;
    }
  }

  const volume = Math.min(64, Math.max(0, inst.metadata?.modPlayback?.defaultVolume ?? 64));
  const finetune = inst.metadata?.modPlayback?.finetune ?? 0;
  const loopStart = inst.sample.loopStart ?? 0;
  const loopEnd = inst.sample.loopEnd ?? 0;
  const loopLen = loopEnd > loopStart ? loopEnd - loopStart : 2;

  return {
    name: inst.name ?? '',
    pcm,
    volume,
    finetune,
    loopStart,
    loopLen: loopEnd > loopStart ? loopLen : 2, // MOD convention: 2 = no loop
  };
}

// ── Note encoding ─────────────────────────────────────────────────────────────

/**
 * Convert XM note back to KRIS note byte.
 *
 * Parser mapping (without transpose):
 *   rawNote = (noteByte - 0x18) / 2
 *   xmNote  = 25 + rawNote + transpose
 *
 * Since we don't use transpose in the track ref table (all zero),
 * we reverse as: rawNote = xmNote - 25, noteByte = rawNote * 2 + 0x18
 *
 * The encoder (KRISEncoder) uses: noteIdx = xmNote - 37, noteByte = noteIdx * 2 + 0x18
 * which means it assumes a transpose offset of 12 (37 - 25 = 12).
 * We use the same mapping as the encoder for consistency.
 */
function xmNoteToKRIS(xmNote: number): number {
  if (xmNote <= 0 || xmNote > 96) return 0xA8; // empty
  if (xmNote === 97) return 0xA8; // note-off → empty (KRIS has no note-off)

  // Match the encoder: noteIdx = xmNote - 37
  const noteIdx = xmNote - 37;
  if (noteIdx < 0) return 0xA8;

  const noteByte = noteIdx * 2 + 0x18;
  if (noteByte > 0x9E) return 0xA8;
  return noteByte & 0xFF;
}

// ── Track deduplication ───────────────────────────────────────────────────────

/**
 * Encode a pattern channel into a 256-byte track buffer (64 rows × 4 bytes).
 */
function encodeTrack(
  song: TrackerSong,
  patIdx: number,
  chIdx: number,
): Uint8Array {
  const track = new Uint8Array(BYTES_PER_TRACK);
  const pattern = song.patterns[patIdx];
  if (!pattern) return track;

  const channel = pattern.channels[chIdx];
  if (!channel) return track;

  for (let row = 0; row < ROWS_PER_TRACK; row++) {
    const cell = channel.rows[row];
    const off = row * 4;

    if (!cell) {
      track[off] = 0xA8;
      track[off + 1] = 0;
      track[off + 2] = 0;
      track[off + 3] = 0;
      continue;
    }

    track[off]     = xmNoteToKRIS(cell.note ?? 0);
    track[off + 1] = (cell.instrument ?? 0) & 0xFF;
    track[off + 2] = (cell.effTyp ?? 0) & 0x0F;
    track[off + 3] = (cell.eff ?? 0) & 0xFF;
  }

  return track;
}

/**
 * Convert a track to a string key for deduplication.
 */
function trackKey(data: Uint8Array): string {
  // Use a simple hex string for comparison
  const parts: string[] = [];
  for (let i = 0; i < data.length; i++) {
    parts.push(data[i].toString(16).padStart(2, '0'));
  }
  return parts.join('');
}

// ── Main exporter ─────────────────────────────────────────────────────────────

export async function exportKRIS(
  song: TrackerSong,
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const warnings: string[] = [];

  // ── Collect samples ─────────────────────────────────────────────────────
  const samples: (SampleInfo | null)[] = [];
  for (let i = 0; i < NUM_SAMPLES; i++) {
    if (i < song.instruments.length) {
      samples.push(extractSample(song.instruments[i]));
    } else {
      samples.push(null);
    }
  }

  if (song.instruments.length > NUM_SAMPLES) {
    warnings.push(
      `KRIS format supports max ${NUM_SAMPLES} samples; ${song.instruments.length - NUM_SAMPLES} instruments were dropped.`,
    );
  }

  if (song.numChannels > NUM_CHANNELS) {
    warnings.push(
      `KRIS format is 4-channel only; channels 5-${song.numChannels} were dropped.`,
    );
  }

  // ── Build unique tracks with deduplication ────────────────────────────
  const numOrders = Math.min(128, song.songPositions.length);
  if (numOrders === 0) {
    warnings.push('Song has no order list entries.');
  }

  // For each (order, channel) produce a track, deduplicate identical ones
  const trackDataMap = new Map<string, number>(); // key → trackIdx
  const trackDataList: Uint8Array[] = [];

  // trackRefs[order][channel] = trackIdx
  const trackRefs: number[][] = [];

  for (let o = 0; o < numOrders; o++) {
    const patIdx = song.songPositions[o] ?? 0;
    const refs: number[] = [];

    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const data = encodeTrack(song, patIdx, ch);
      const key = trackKey(data);

      let idx = trackDataMap.get(key);
      if (idx === undefined) {
        idx = trackDataList.length;
        trackDataMap.set(key, idx);
        trackDataList.push(data);
      }
      refs.push(idx);
    }

    trackRefs.push(refs);
  }

  if (trackDataList.length > 255) {
    warnings.push(
      `Track count ${trackDataList.length} exceeds KRIS max 255; some tracks will wrap.`,
    );
  }

  // ── Compute total sample PCM size ─────────────────────────────────────
  let totalPCM = 0;
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const s = samples[i];
    if (s) totalPCM += s.pcm.length;
  }

  // ── Compute file size ─────────────────────────────────────────────────
  const numTracks = trackDataList.length;
  const trackDataSize = numTracks * BYTES_PER_TRACK;
  const totalSize = TRACKS_OFFSET + trackDataSize + totalPCM;

  const output = new Uint8Array(totalSize);

  // ── Song name (22 bytes at offset 0) ──────────────────────────────────
  const songName = (song.name || 'Untitled').slice(0, NAME_SIZE);
  writeStr(output, 0, songName, NAME_SIZE);

  // ── Sample headers (31 × 30 bytes at offset 22) ──────────────────────
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const base = NAME_SIZE + i * SAMPLE_HDR_SIZE;
    const s = samples[i];

    if (s && s.pcm.length > 0) {
      // Name (22 bytes)
      writeStr(output, base, s.name.slice(0, 22), 22);

      // Length in words (u16BE)
      const lenWords = Math.floor(s.pcm.length / 2);
      writeU16BE(output, base + 22, lenWords);

      // Finetune (int8)
      writeI8(output, base + 24, s.finetune);

      // Volume (u8, 0-64)
      writeU8(output, base + 25, Math.min(64, s.volume));

      // Loop start in words (u16BE)
      const loopStartWords = Math.floor(s.loopStart / 2);
      writeU16BE(output, base + 26, loopStartWords);

      // Loop length in words (u16BE) — >1 means loop enabled
      const loopLenWords = Math.max(1, Math.floor(s.loopLen / 2));
      writeU16BE(output, base + 28, loopLenWords);
    } else {
      // Empty sample: name is empty, length fields all zero except loopLen=1
      writeU16BE(output, base + 28, 1); // loopLen=1 (no loop)
    }
  }

  // ── "KRIS" magic at offset 952 ────────────────────────────────────────
  output[MAGIC_OFFSET]     = 0x4B; // 'K'
  output[MAGIC_OFFSET + 1] = 0x52; // 'R'
  output[MAGIC_OFFSET + 2] = 0x49; // 'I'
  output[MAGIC_OFFSET + 3] = 0x53; // 'S'

  // ── numOrders (u8 at 956) ─────────────────────────────────────────────
  writeU8(output, 956, Math.max(1, numOrders));

  // ── restartPos (u8 at 957) ────────────────────────────────────────────
  const restartPos = Math.min(127, song.restartPosition ?? 0);
  writeU8(output, 957, restartPos);

  // ── Track reference table [128 × 4 × 2 bytes] at offset 958 ──────────
  // Entry: [trackIdx(u8), transpose(i8)]
  // We don't use transpose — all notes are pre-transposed into the tracks.
  for (let o = 0; o < 128; o++) {
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const off = TRACK_REF_OFFSET + (o * NUM_CHANNELS + ch) * 2;
      if (o < numOrders) {
        writeU8(output, off, trackRefs[o][ch] & 0xFF);
        writeI8(output, off + 1, 0); // transpose = 0
      } else {
        output[off] = 0;
        output[off + 1] = 0;
      }
    }
  }

  // ── Track data at offset 1982 ─────────────────────────────────────────
  for (let t = 0; t < numTracks; t++) {
    output.set(trackDataList[t], TRACKS_OFFSET + t * BYTES_PER_TRACK);
  }

  // ── Sample PCM data (8-bit signed, sequential after tracks) ───────────
  let pcmOffset = TRACKS_OFFSET + trackDataSize;
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const s = samples[i];
    if (s && s.pcm.length > 0) {
      output.set(s.pcm, pcmOffset);
      pcmOffset += s.pcm.length;
    }
  }

  // ── Generate filename ─────────────────────────────────────────────────
  const baseName = (song.name || 'untitled')
    .replace(/\s*\[KRIS\s*(?:Tracker)?\]\s*/i, '')
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    || 'untitled';
  const filename = `${baseName}.kris`;

  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename,
    warnings,
  };
}
