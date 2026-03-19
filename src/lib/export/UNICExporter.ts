/**
 * UNICExporter.ts — Export TrackerSong as UNIC Tracker v1 (.unic) format
 *
 * Reconstructs the binary layout documented in UNICParser.ts:
 *   +0     song title (20 bytes, space-padded ASCII)
 *   +20    31 × 30-byte sample headers (MOD-style with UNIC finetune at name[20..21])
 *   +950   numOrders (uint8)
 *   +951   restartPos (uint8)
 *   +952   order list (128 bytes)
 *   +1080  magic "M.K." (4 bytes)
 *   +1084  pattern data (numPatterns × 768 bytes; 64 rows × 4 ch × 3 bytes/cell)
 *   +...   sample PCM (signed int8)
 *
 * Only sample-based instruments are exported; others produce silent placeholders.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

// ── Constants ─────────────────────────────────────────────────────────────────

const HEADER_SIZE       = 1084;
const BYTES_PER_PATTERN = 768;   // 64 rows × 4 channels × 3 bytes
const NUM_CHANNELS      = 4;
const ROWS_PER_PATTERN  = 64;
const MAX_SAMPLES       = 31;
const UNIC_NOTE_OFFSET  = 12;    // XM note = noteIdx + 12, so noteIdx = xmNote - 12

// ── Binary write helpers ──────────────────────────────────────────────────────

function writeStr(view: DataView, offset: number, str: string, len: number): void {
  for (let i = 0; i < len; i++) {
    view.setUint8(offset + i, i < str.length ? str.charCodeAt(i) & 0x7F : 0);
  }
}

function writeU8(view: DataView, offset: number, val: number): void {
  view.setUint8(offset, val & 0xFF);
}

function writeU16BE(view: DataView, offset: number, val: number): void {
  view.setUint16(offset, val & 0xFFFF, false);
}

function writeI16BE(view: DataView, offset: number, val: number): void {
  view.setInt16(offset, val, false);
}

// ── XM finetune → UNIC raw finetune ──────────────────────────────────────────

/**
 * Reverse of mod2XMFinetune: XM finetune (-128..+112) → MOD nibble (0–15),
 * then negate to get the UNIC raw finetune stored at name[20..21].
 *
 * The parser does: rawFT stored as int16BE at name[20..21],
 * then xmFinetune = mod2XMFinetune(-rawFT).
 * So to reverse: nibble = xmFinetune2MODNibble(xmFinetune), rawFT = -nibble.
 */
function xmFinetuneToUNICRaw(xmFinetune: number): number {
  // Standard table: nibble → xmFinetune
  const table = [0, 16, 32, 48, 64, 80, 96, 112, -128, -112, -96, -80, -64, -48, -32, -16];
  let nibble = 0;
  for (let i = 0; i < 16; i++) {
    if (table[i] === xmFinetune) {
      nibble = i;
      break;
    }
  }
  // Parser reads rawFT then passes -rawFT to mod2XMFinetune, so rawFT = -nibble
  return -nibble;
}

// ── Sample PCM extraction ─────────────────────────────────────────────────────

/**
 * Extract 8-bit signed PCM from an instrument's WAV audioBuffer.
 * Returns empty array if no sample data.
 */
function extractPCM(inst: TrackerSong['instruments'][number]): Uint8Array {
  if (!inst?.sample?.audioBuffer) return new Uint8Array(0);

  const wav = new DataView(inst.sample.audioBuffer);
  // Standard WAV: data length at offset 40, PCM at offset 44 (16-bit LE samples)
  const dataLen = wav.getUint32(40, true);
  const frames = Math.floor(dataLen / 2);
  const pcm = new Uint8Array(frames);

  for (let j = 0; j < frames; j++) {
    const s16 = wav.getInt16(44 + j * 2, true);
    // 16-bit signed → 8-bit signed (stored as two's complement byte)
    pcm[j] = (s16 >> 8) & 0xFF;
  }

  return pcm;
}

// ── Main exporter ─────────────────────────────────────────────────────────────

export async function exportUNIC(
  song: TrackerSong,
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const warnings: string[] = [];

  // ── Determine pattern count from order list ───────────────────────────────
  const songPositions = song.songPositions ?? [];
  const numOrders = Math.min(127, songPositions.length || 1);
  let maxPatIdx = 0;
  for (let i = 0; i < numOrders; i++) {
    const p = songPositions[i] ?? 0;
    if (p > maxPatIdx) maxPatIdx = p;
  }
  const numPatterns = maxPatIdx + 1;

  if (numPatterns > 128) {
    warnings.push(`Pattern count ${numPatterns} exceeds UNIC max of 128; clamping.`);
  }
  const clampedPatterns = Math.min(128, numPatterns);

  // ── Collect sample data ───────────────────────────────────────────────────
  interface SampleInfo {
    name: string;
    pcm: Uint8Array;
    volume: number;
    loopStart: number;  // in bytes
    loopEnd: number;    // in bytes
    finetune: number;   // XM finetune value
  }

  const samples: SampleInfo[] = [];
  for (let i = 0; i < MAX_SAMPLES; i++) {
    const inst = i < song.instruments.length ? song.instruments[i] : undefined;
    if (inst) {
      const pcm = extractPCM(inst);
      // Prefer modPlayback.defaultVolume (0-64), else convert dB volume back
      const modVol = inst.metadata?.modPlayback?.defaultVolume;
      const vol = modVol !== undefined
        ? Math.min(64, Math.max(0, Math.round(modVol)))
        : (inst.volume !== undefined && inst.volume > -60
          ? Math.min(64, Math.round(Math.pow(10, inst.volume / 20) * 64))
          : 0);
      const finetune = inst.metadata?.modPlayback?.finetune ?? 0;

      samples.push({
        name: (inst.name ?? `Sample ${i + 1}`).slice(0, 20),
        pcm,
        volume: pcm.length > 0 ? vol : 0,
        loopStart: inst.sample?.loopStart ?? 0,
        loopEnd: inst.sample?.loopEnd ?? 0,
        finetune,
      });
    } else {
      samples.push({
        name: '',
        pcm: new Uint8Array(0),
        volume: 0,
        loopStart: 0,
        loopEnd: 0,
        finetune: 0,
      });
    }
  }

  // Warn if instruments exceed 31
  if (song.instruments.length > MAX_SAMPLES) {
    warnings.push(`Song has ${song.instruments.length} instruments; UNIC supports max 31. Extras ignored.`);
  }

  // ── Calculate total size ──────────────────────────────────────────────────
  let totalSampleBytes = 0;
  for (const s of samples) {
    // Ensure even byte length (MOD convention: length in words)
    const len = s.pcm.length % 2 === 0 ? s.pcm.length : s.pcm.length + 1;
    totalSampleBytes += len;
  }

  const totalSize = HEADER_SIZE + clampedPatterns * BYTES_PER_PATTERN + totalSampleBytes;
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);

  // ── Song title (+0, 20 bytes) ─────────────────────────────────────────────
  const title = (song.name ?? 'Untitled').slice(0, 20);
  writeStr(view, 0, title, 20);

  // ── Sample headers (+20, 31 × 30 bytes) ──────────────────────────────────
  for (let i = 0; i < MAX_SAMPLES; i++) {
    const base = 20 + i * 30;
    const s = samples[i];

    // Name: 22 bytes total. First 20 bytes = name, bytes [20..21] = int16BE finetune
    writeStr(view, base, s.name, 20);

    // Finetune as int16BE at name[20..21]
    const rawFT = xmFinetuneToUNICRaw(s.finetune);
    writeI16BE(view, base + 20, rawFT);

    // Length in words (uint16BE)
    const byteLen = s.pcm.length % 2 === 0 ? s.pcm.length : s.pcm.length + 1;
    const wordLen = Math.floor(byteLen / 2);
    writeU16BE(view, base + 22, wordLen);

    // Standard MOD finetune byte (must be 0 for UNIC)
    writeU8(view, base + 24, 0);

    // Volume (uint8, 0-64)
    writeU8(view, base + 25, Math.min(64, s.volume));

    // Loop start and loop length in words
    let loopStartWords = 0;
    let loopLenWords = 0;
    if (s.loopEnd > s.loopStart && s.loopEnd > 0) {
      loopStartWords = Math.floor(s.loopStart / 2);
      loopLenWords = Math.max(1, Math.floor((s.loopEnd - s.loopStart) / 2));
      // loopLen > 1 signals active loop; ensure at least 2
      if (loopLenWords <= 1) loopLenWords = 2;
    } else {
      loopLenWords = 1; // no loop: loopLen = 1 (MOD convention)
    }
    writeU16BE(view, base + 26, loopStartWords);
    writeU16BE(view, base + 28, loopLenWords);
  }

  // ── numOrders (+950) ──────────────────────────────────────────────────────
  writeU8(view, 950, numOrders);

  // ── restartPos (+951) ─────────────────────────────────────────────────────
  writeU8(view, 951, song.restartPosition ?? 0);

  // ── Order list (+952, 128 bytes) ──────────────────────────────────────────
  for (let i = 0; i < 128; i++) {
    writeU8(view, 952 + i, i < numOrders ? (songPositions[i] ?? 0) : 0);
  }

  // ── Magic (+1080, 4 bytes) ────────────────────────────────────────────────
  writeStr(view, 1080, 'M.K.', 4);

  // ── Pattern data (+1084) ──────────────────────────────────────────────────
  for (let pIdx = 0; pIdx < clampedPatterns; pIdx++) {
    const pat = pIdx < song.patterns.length ? song.patterns[pIdx] : undefined;

    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cellOff = HEADER_SIZE + pIdx * BYTES_PER_PATTERN + (row * NUM_CHANNELS + ch) * 3;

        if (!pat || ch >= pat.channels.length || row >= pat.channels[ch].rows.length) {
          // Empty cell: 3 zero bytes
          output[cellOff] = 0;
          output[cellOff + 1] = 0;
          output[cellOff + 2] = 0;
          continue;
        }

        const cell = pat.channels[ch].rows[row];
        const note = cell.note ?? 0;
        const instr = cell.instrument ?? 0;

        // noteIdx: XM note → UNIC noteIdx (1-36 range, 0 = empty)
        let noteIdx = 0;
        if (note > 0) {
          noteIdx = note - UNIC_NOTE_OFFSET;
          if (noteIdx < 0) noteIdx = 0;
          if (noteIdx > 63) {
            noteIdx = 63;
            if (warnings.indexOf('Note out of UNIC range (clamped to 63)') === -1) {
              warnings.push('Note out of UNIC range (clamped to 63)');
            }
          }
        }

        // Encode cell: same logic as UNICEncoder.encodeUNICCell
        // b0 = instrHi[7:6] | noteIdx[5:0]
        const instrHi = (instr & 0x30) << 2;
        output[cellOff] = instrHi | (noteIdx & 0x3F);

        // b1 = instrLo[7:4] | command[3:0]
        const instrLo = (instr & 0x0F) << 4;
        output[cellOff + 1] = instrLo | ((cell.effTyp ?? 0) & 0x0F);

        // b2 = effect parameter
        output[cellOff + 2] = (cell.eff ?? 0) & 0xFF;
      }
    }
  }

  // ── Sample PCM data ───────────────────────────────────────────────────────
  let pcmCursor = HEADER_SIZE + clampedPatterns * BYTES_PER_PATTERN;
  for (const s of samples) {
    if (s.pcm.length > 0) {
      output.set(s.pcm, pcmCursor);
      pcmCursor += s.pcm.length;
      // Pad to even length if needed
      if (s.pcm.length % 2 !== 0) {
        output[pcmCursor] = 0;
        pcmCursor += 1;
      }
    }
  }

  // ── Build result ──────────────────────────────────────────────────────────
  const blob = new Blob([output], { type: 'application/octet-stream' });
  const baseName = (song.name ?? 'untitled').replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'untitled';
  const filename = `${baseName}.unic`;

  return { data: blob, filename, warnings };
}
