/**
 * DSMDynExporter.ts — Export TrackerSong as Dynamic Studio DSm format
 *
 * Reconstructs a valid Dynamic Studio DSm binary from TrackerSong data.
 * Only the Dynamic Studio variant (Format B) is supported — not RIFF DSMF.
 *
 * Binary layout (little-endian):
 *   +0   magic[4]          "DSm\x1A"
 *   +4   version (uint8)   0x20
 *   +5   title[20]         null-padded
 *   +25  artist[20]        null-padded
 *   +45  numChannels (u8)
 *   +46  numSamples (u8)
 *   +47  numOrders (u8)
 *   +48  packInformation (u8)  0
 *   +49  globalVol (u8)    0–100
 *   +50  padding[14]
 *   === 64 bytes header ===
 *   Channel panning: numChannels bytes ((pan >> 4) & 0x0F per channel, expanded via * 0x11)
 *   Order list: numOrders bytes
 *   Track names: numPatterns × numChannels × 8 bytes
 *   Sample headers: numSamples × 32 bytes
 *   Patterns: numPatterns × numChannels × 64 rows × 4 bytes/cell (row-major)
 *   Sample PCM: sequential signed 8-bit data
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

// ── Helpers ──────────────────────────────────────────────────────────────────

function writeStringPadded(out: Uint8Array, offset: number, str: string, len: number): void {
  for (let i = 0; i < len; i++) {
    out[offset + i] = i < str.length ? str.charCodeAt(i) & 0xFF : 0;
  }
}

function setU16LE(view: DataView, off: number, val: number): void {
  view.setUint16(off, val & 0xFFFF, true);
}

const ROWS_PER_PATTERN = 64;
const DSm_FILE_HEADER_SIZE = 64;
const DSm_SAMPLE_HEADER_SIZE = 32;

// ── Note encoding ────────────────────────────────────────────────────────────
// Parser: xmNote = (d1 >> 1) + NOTE_MIN + 35 = (d1 >> 1) + 36  (NOTE_MIN=1)
// Reverse: d1 = (xmNote - 36) * 2

function encodeNote(xmNote: number): number {
  if (xmNote <= 0) return 0;
  if (xmNote < 36) return 0;
  const d1 = (xmNote - 36) * 2;
  return Math.min(168, d1);
}

// ── Effect encoding ──────────────────────────────────────────────────────────
// Standard MOD effects 0x00–0x0F map through as identity.
// DSm-specific effects (0x08 panning, 0x13 3D, 0x20+ offset+vol) are lossy
// and written as standard MOD equivalents.

function encodeEffect(effTyp: number, eff: number): [number, number] {
  if (effTyp === 0 && eff === 0) return [0, 0];
  if (effTyp <= 0x0F) return [effTyp, eff];
  // Effects beyond 0x0F are not natively representable — drop with warning
  return [0, 0];
}

// ── Sample extraction ────────────────────────────────────────────────────────
// Extract signed 8-bit PCM from instrument WAV audioBuffer.

function extractPCM8(inst: TrackerSong['instruments'][0]): Uint8Array {
  if (!inst?.sample?.audioBuffer) return new Uint8Array(0);
  const wav = new DataView(inst.sample.audioBuffer);
  if (wav.byteLength < 44) return new Uint8Array(0);
  const dataLen = wav.getUint32(40, true);
  const bitsPerSample = wav.getUint16(34, true);
  const frames = bitsPerSample === 16 ? Math.floor(dataLen / 2) : dataLen;
  const pcm = new Uint8Array(frames);

  if (bitsPerSample === 16) {
    for (let j = 0; j < frames; j++) {
      // 16-bit signed LE → 8-bit signed (high byte)
      pcm[j] = (wav.getInt16(44 + j * 2, true) >> 8) & 0xFF;
    }
  } else {
    // 8-bit — already signed in our WAV (data starts at offset 44)
    for (let j = 0; j < frames; j++) {
      pcm[j] = wav.getUint8(44 + j);
    }
  }
  return pcm;
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function exportDSMDyn(
  song: TrackerSong,
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const warnings: string[] = [];

  const numChannels = Math.min(16, song.numChannels);
  const numSamples = Math.min(255, song.instruments.length);
  const numOrders = Math.min(255, song.songPositions.length);

  if (numChannels < 1) {
    warnings.push('Song has no channels; writing minimum 1 channel');
  }
  const channels = Math.max(1, numChannels);

  // Determine number of patterns from max order index + existing patterns
  let maxPatIdx = 0;
  for (const p of song.songPositions) {
    if (p > maxPatIdx) maxPatIdx = p;
  }
  const numPatterns = Math.max(maxPatIdx + 1, song.patterns.length);

  // ── Global volume ──────────────────────────────────────────────────────────
  // compatFlags.globalVolume is 0–256 scale; DSm uses 0–100
  let globalVol = 100;
  if (song.compatFlags && typeof (song.compatFlags as Record<string, unknown>).globalVolume === 'number') {
    globalVol = Math.round(((song.compatFlags as Record<string, unknown>).globalVolume as number) * 100 / 256);
  }

  // ── Extract sample PCM data ────────────────────────────────────────────────
  const samplePCMs: Uint8Array[] = [];
  for (let i = 0; i < numSamples; i++) {
    samplePCMs.push(extractPCM8(song.instruments[i]));
  }

  // ── Calculate sizes ────────────────────────────────────────────────────────
  const channelPanSize = channels;
  const orderListSize = numOrders;
  const trackNamesSize = numPatterns * channels * 8;
  const sampleHeadersSize = numSamples * DSm_SAMPLE_HEADER_SIZE;
  const patternDataSize = numPatterns * channels * ROWS_PER_PATTERN * 4;
  const totalSampleBytes = samplePCMs.reduce((s, p) => s + p.length, 0);

  const totalSize = DSm_FILE_HEADER_SIZE
    + channelPanSize
    + orderListSize
    + trackNamesSize
    + sampleHeadersSize
    + patternDataSize
    + totalSampleBytes;

  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  let cur = 0;

  // ── File header (64 bytes) ─────────────────────────────────────────────────
  // Magic "DSm\x1A"
  output[0] = 0x44; // D
  output[1] = 0x53; // S
  output[2] = 0x6D; // m
  output[3] = 0x1A;
  // Version 0x20
  output[4] = 0x20;
  // Title (20 bytes)
  writeStringPadded(output, 5, song.name || '', 20);
  // Artist (20 bytes) — not stored in TrackerSong, leave blank
  writeStringPadded(output, 25, '', 20);
  // numChannels
  output[45] = channels;
  // numSamples
  output[46] = numSamples;
  // numOrders
  output[47] = numOrders;
  // packInformation
  output[48] = 0;
  // globalVol (0–100)
  output[49] = Math.min(100, Math.max(0, globalVol));
  // padding[14] — already zero
  cur = DSm_FILE_HEADER_SIZE;

  // ── Channel panning ────────────────────────────────────────────────────────
  // Parser: (u8(v, cur++) & 0x0F) * 0x11 → 0–255 panning
  // Reverse: panByte = Math.round(pan255 / 0x11) & 0x0F
  for (let ch = 0; ch < channels; ch++) {
    const pat = song.patterns[0];
    const chanPan = pat?.channels[ch]?.pan ?? 0; // -128..128
    const pan255 = Math.max(0, Math.min(255, chanPan + 128));
    output[cur++] = Math.round(pan255 / 0x11) & 0x0F;
  }

  // ── Order list ─────────────────────────────────────────────────────────────
  for (let i = 0; i < numOrders; i++) {
    output[cur++] = (song.songPositions[i] ?? 0) & 0xFF;
  }

  // ── Track names ────────────────────────────────────────────────────────────
  // numPatterns × numChannels × 8 bytes
  for (let patIdx = 0; patIdx < numPatterns; patIdx++) {
    for (let ch = 0; ch < channels; ch++) {
      const pat = song.patterns[patIdx];
      const name = pat?.channels[ch]?.name ?? `Channel ${ch + 1}`;
      writeStringPadded(output, cur, name.substring(0, 8), 8);
      cur += 8;
    }
  }

  // ── Sample headers ─────────────────────────────────────────────────────────
  // Each header: 32 bytes
  //   +0   name[22]
  //   +22  type (u8): 0 = 8-bit, 16 = 16-bit
  //   +23  length (u16LE, in words)
  //   +25  finetune (u8)
  //   +26  volume (u8, 0–64)
  //   +27  loopStart (u16LE, bytes)
  //   +29  loopLength (u16LE, bytes)
  //   +31  padding (u8)
  for (let i = 0; i < numSamples; i++) {
    const inst = song.instruments[i];
    const hOff = cur;

    // name[22]
    writeStringPadded(output, hOff, inst?.name ?? `Sample ${i + 1}`, 22);

    // type: always 8-bit in our export
    output[hOff + 22] = 0;

    // length in words (bytes / 2)
    const pcmLen = samplePCMs[i].length;
    setU16LE(view, hOff + 23, Math.floor(pcmLen / 2));

    // finetune: reverse mod2xmFineTune
    // mod2xmFineTune: nibble < 8 → nibble * 16; nibble >= 8 → (nibble - 16) * 16
    // Reverse: xmFinetune / 16 → nibble (+ 16 if negative)
    let finetune = 0;
    const xmFt = inst?.metadata?.modPlayback?.finetune ?? 0;
    if (xmFt !== 0) {
      const nibble = Math.round(xmFt / 16);
      finetune = nibble < 0 ? (nibble + 16) & 0x0F : nibble & 0x0F;
    }
    output[hOff + 25] = finetune;

    // volume (0–64)
    const vol = inst?.metadata?.modPlayback?.defaultVolume ?? 64;
    output[hOff + 26] = Math.min(64, Math.max(0, vol));

    // loopStart (u16LE, bytes)
    const loopStart = inst?.sample?.loopStart ?? 0;
    setU16LE(view, hOff + 27, loopStart & 0xFFFF);

    // loopLength (u16LE, bytes)
    const loopEnd = inst?.sample?.loopEnd ?? 0;
    const hasLoop = inst?.sample?.loop && loopEnd > loopStart;
    const loopLength = hasLoop ? (loopEnd - loopStart) : 0;
    setU16LE(view, hOff + 29, loopLength & 0xFFFF);

    // padding
    output[hOff + 31] = 0;

    cur += DSm_SAMPLE_HEADER_SIZE;
  }

  // ── Pattern data ───────────────────────────────────────────────────────────
  // Row-major: for each pattern, rows × channels × 4 bytes
  // Cell: [instrument, note_encoded, effect, param]
  for (let patIdx = 0; patIdx < numPatterns; patIdx++) {
    const pat = song.patterns[patIdx];
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < channels; ch++) {
        const cell = pat?.channels[ch]?.rows[row];

        // Byte 0: instrument
        output[cur] = (cell?.instrument ?? 0) & 0xFF;

        // Byte 1: note_encoded
        output[cur + 1] = encodeNote(cell?.note ?? 0);

        // Bytes 2-3: effect + param
        const [effCmd, effParam] = encodeEffect(cell?.effTyp ?? 0, cell?.eff ?? 0);
        output[cur + 2] = effCmd;
        output[cur + 3] = effParam;

        cur += 4;
      }
    }
  }

  // ── Sample PCM data ────────────────────────────────────────────────────────
  for (let i = 0; i < numSamples; i++) {
    output.set(samplePCMs[i], cur);
    cur += samplePCMs[i].length;
  }

  // ── Warnings for lossy conversions ─────────────────────────────────────────
  if (song.numChannels > 16) {
    warnings.push(`Song has ${song.numChannels} channels; DSm supports max 16. Extra channels truncated.`);
  }
  if (song.instruments.length > 255) {
    warnings.push(`Song has ${song.instruments.length} instruments; DSm supports max 255. Extra instruments dropped.`);
  }

  // Check for effects that cannot be round-tripped
  let lossyEffects = 0;
  for (const pat of song.patterns) {
    for (const ch of pat.channels) {
      for (const row of ch.rows) {
        if (row.effTyp > 0x0F) lossyEffects++;
      }
    }
  }
  if (lossyEffects > 0) {
    warnings.push(`${lossyEffects} effect(s) with command > 0x0F could not be encoded in DSm format.`);
  }

  const filename = (song.name || 'untitled').replace(/[^a-zA-Z0-9_\- ]/g, '') + '.dsm';
  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename,
    warnings,
  };
}
