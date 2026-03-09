/**
 * AMOSMusicBankExporter.ts — Export TrackerSong to AMOS Music Bank (.abk) format.
 *
 * Reconstructs the binary ABK file from TrackerSong data:
 *   [0x00] "AmBk" header (20 bytes)
 *   [0x14] Main header: instruments_offset, songs_offset, patterns_offset (12 bytes)
 *   Instruments section: numInst(u16) + headers(32 bytes each) + PCM data
 *   Songs section: numSongs(u16) + song offset(u32) + song data + playlist
 *   Patterns section: numPatt(u16) + channel offsets(8 bytes each) + encoded patterns
 *
 * Pattern encoding is the exact reverse of decodeABKChannelPattern() in
 * AMOSMusicBankParser.ts — command-based stream with 2-byte words.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { TrackerCell } from '@/types';

// ── Amiga period table (same as AmigaUtils.ts) ─────────────────────────────
// Index 0..35 → C-1 to B-3

const AMIGA_PERIODS = [
  // Octave 1 (C-1 to B-1)
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  // Octave 2 (C-2 to B-2)
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  // Octave 3 (C-3 to B-3)
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
];

/**
 * Convert XM note number back to Amiga period.
 * Parser does: periodToNoteIndex(period) + 1 → noteIndex, then noteIndex + 12 → XM note.
 * Reverse: XM note - 12 → noteIndex (1-based), noteIndex - 1 → AMIGA_PERIODS index.
 */
function xmNoteToPeriod(xmNote: number): number {
  if (xmNote === 0) return 0;
  const idx = xmNote - 12 - 1; // XM note → 0-based period table index
  if (idx < 0 || idx >= AMIGA_PERIODS.length) return 0;
  return AMIGA_PERIODS[idx];
}

// ── Binary write helpers ────────────────────────────────────────────────────

function writeU16BE(view: DataView, offset: number, val: number): void {
  view.setUint16(offset, val & 0xFFFF, false);
}

function writeU32BE(view: DataView, offset: number, val: number): void {
  view.setUint32(offset, val >>> 0, false);
}

function writeString(view: DataView, offset: number, str: string, len: number): void {
  for (let i = 0; i < len; i++) {
    view.setUint8(offset + i, i < str.length ? str.charCodeAt(i) & 0xFF : 0);
  }
}

// ── Channel pattern encoder ─────────────────────────────────────────────────
//
// Exact reverse of decodeABKChannelPattern() in AMOSMusicBankParser.ts.
//
// Output: array of uint16BE words forming the command stream.
// Rules:
//   - Instrument changes emit cmd 0x09 (param = inst-1, 0-based)
//   - Volume changes (XM volume column 0x10-0x50) emit cmd 0x03
//   - Effects map back to AMOS commands
//   - Persistent effects (arpeggio 0x0A, tone porta 0x0B, vibrato 0x0C, vol slide 0x0D)
//     are emitted once and then delay fills rows
//   - Notes are emitted as bare period words (new format, bit15=0, bit14=0)
//   - Empty rows are collapsed into delay commands (0x10)
//   - Pattern ends with 0x8000

/**
 * Map XM effect back to AMOS command word(s).
 * Returns [cmd, param] or null if no mapping.
 */
function mapXMEffectToAMOS(effTyp: number, eff: number): { cmd: number; param: number; persistent: boolean } | null {
  if (effTyp === 0 && eff === 0) return null;

  switch (effTyp) {
    case 0x00: // Arpeggio → AMOS 0x0A (persistent)
      return { cmd: 0x0A, param: eff & 0x7F, persistent: true };

    case 0x01: // Portamento up → AMOS 0x01
      return { cmd: 0x01, param: eff & 0x7F, persistent: false };

    case 0x02: // Portamento down → AMOS 0x02
      return { cmd: 0x02, param: eff & 0x7F, persistent: false };

    case 0x03: // Tone portamento → AMOS 0x0B (persistent)
      return { cmd: 0x0B, param: eff & 0x7F, persistent: true };

    case 0x04: // Vibrato → AMOS 0x0C (persistent)
      return { cmd: 0x0C, param: eff & 0x7F, persistent: true };

    case 0x0A: // Volume slide → AMOS 0x0D (persistent)
      if (eff === 0) return { cmd: 0x0D, param: 0, persistent: true }; // stop
      return { cmd: 0x0D, param: eff & 0x7F, persistent: true };

    case 0x0B: // Position jump → AMOS 0x11
      return { cmd: 0x11, param: eff & 0x7F, persistent: false };

    case 0x0E: // Extended effects
      if (eff === 0x00) return { cmd: 0x06, param: 0, persistent: false }; // Filter off
      if (eff === 0x01) return { cmd: 0x07, param: 0, persistent: false }; // Filter on
      if ((eff & 0xF0) === 0x50) return { cmd: 0x05, param: 0, persistent: false }; // Repeat mark
      if ((eff & 0xF0) === 0x60) return { cmd: 0x05, param: eff & 0x0F, persistent: false }; // Repeat loop
      return null;

    case 0x0F: // Set speed → AMOS 0x08 (tempo = round(100/speed))
      if (eff > 0 && eff <= 31) {
        const amosTempo = Math.max(1, Math.round(100 / eff));
        return { cmd: 0x08, param: amosTempo & 0x7F, persistent: false };
      }
      return null;

    default:
      return null;
  }
}

/**
 * Encode a 64-row TrackerCell array into an ABK command stream (array of uint16BE words).
 * This is the exact reverse of decodeABKChannelPattern().
 */
function encodeABKChannelPattern(rows: TrackerCell[]): number[] {
  const words: number[] = [];
  let currentInst = 0;      // tracks the current instrument (1-based)
  let activePersistent: { cmd: number; param: number } | null = null;
  let pendingDelay = 0;

  function flushDelay(): void {
    while (pendingDelay > 0) {
      const d = Math.min(pendingDelay, 127); // param is 7 bits
      words.push(0x8000 | (0x10 << 8) | d);  // delay command
      pendingDelay -= d;
    }
  }

  for (let row = 0; row < 64; row++) {
    const cell = rows[row] ?? { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
    const hasNote = cell.note > 0;
    const hasInst = cell.instrument > 0;
    const hasVolume = cell.volume >= 0x10 && cell.volume <= 0x50;
    const effInfo = mapXMEffectToAMOS(cell.effTyp ?? 0, cell.eff ?? 0);

    const hasContent = hasNote || hasInst || hasVolume || effInfo !== null;

    if (!hasContent) {
      // Empty row — accumulate delay
      pendingDelay++;
      continue;
    }

    // Flush any accumulated delay before this row's content
    flushDelay();

    // Emit instrument change if needed
    if (hasInst && cell.instrument !== currentInst) {
      currentInst = cell.instrument;
      words.push(0x8000 | (0x09 << 8) | ((currentInst - 1) & 0x7F)); // 0-based
    }

    // Emit volume command
    if (hasVolume) {
      const vol = Math.min((cell.volume ?? 0) - 0x10, 64);
      words.push(0x8000 | (0x03 << 8) | (vol & 0x7F));
    }

    // Handle effects
    if (effInfo !== null) {
      if (effInfo.persistent) {
        // Persistent effect — emit the command, it will apply each delay row
        if (!activePersistent || activePersistent.cmd !== effInfo.cmd || activePersistent.param !== effInfo.param) {
          words.push(0x8000 | (effInfo.cmd << 8) | (effInfo.param & 0x7F));
          activePersistent = { cmd: effInfo.cmd, param: effInfo.param };
        }
      } else {
        // Non-persistent commands clear the persistent effect (matching parser logic)
        if (effInfo.cmd !== 0x03 && effInfo.cmd !== 0x09 &&
            effInfo.cmd !== 0x0B && effInfo.cmd !== 0x0C && effInfo.cmd !== 0x0D) {
          activePersistent = null;
        }
        // Position jump (0x11) is special — emitted but also ends pattern in parser
        words.push(0x8000 | (effInfo.cmd << 8) | (effInfo.param & 0x7F));
      }
    } else if (activePersistent) {
      // If the row has content but no effect, check if we should stop the persistent effect
      // The parser clears persistent on non-persistent commands that are not volume/inst related
      // If there's no effect at all on a row with a note, the persistent continues via delay
    }

    // Emit note (new format: bare period word, bit15=0, bit14=0)
    if (hasNote) {
      const period = xmNoteToPeriod(cell.note);
      if (period > 0) {
        words.push(period & 0x0FFF);
      }
    }

    // After emitting content for this row, we need a delay of 1 to advance past it
    pendingDelay = 1;
  }

  // Flush any remaining delay
  flushDelay();

  // End-of-pattern marker
  words.push(0x8000);

  return words;
}

// ── Sample extraction ───────────────────────────────────────────────────────

/**
 * Extract raw 8-bit signed PCM from an instrument's WAV audioBuffer.
 * Returns the PCM bytes or an empty array if no sample data.
 */
function extractPCM(inst: { sample?: { audioBuffer?: ArrayBuffer } }): Uint8Array {
  if (!inst?.sample?.audioBuffer) return new Uint8Array(0);

  const wav = new DataView(inst.sample.audioBuffer);
  if (inst.sample.audioBuffer.byteLength < 44) return new Uint8Array(0);

  const dataLen = wav.getUint32(40, true);
  const frameCount = dataLen / 2; // 16-bit WAV samples
  const pcm = new Uint8Array(frameCount);
  const dataOffset = 44;

  for (let j = 0; j < frameCount; j++) {
    if (dataOffset + j * 2 + 2 > inst.sample.audioBuffer.byteLength) break;
    // 16-bit signed → 8-bit signed (stored as unsigned byte, two's complement)
    const s16 = wav.getInt16(dataOffset + j * 2, true);
    pcm[j] = ((s16 >> 8) + 256) & 0xFF;
  }

  return pcm;
}

// ── Main exporter ───────────────────────────────────────────────────────────

/**
 * Export a TrackerSong to AMOS Music Bank (.abk) binary format.
 */
export function exportAMOSMusicBank(song: TrackerSong): ArrayBuffer {
  const numPatterns = song.patterns.length;
  const numInstr = Math.min(song.instruments.length, 255);

  // ── Extract sample PCM data ──────────────────────────────────────────────
  const samplePCMs: Uint8Array[] = [];
  for (let i = 0; i < numInstr; i++) {
    samplePCMs.push(extractPCM(song.instruments[i]));
  }

  // ── Encode all channel patterns ──────────────────────────────────────────
  // Each pattern has 4 channels, each encoded independently
  const encodedPatterns: number[][][] = []; // [patIdx][chIdx] = word array
  for (const pattern of song.patterns) {
    const channels: number[][] = [];
    for (let ch = 0; ch < 4; ch++) {
      const rows = pattern.channels[ch]?.rows ?? [];
      channels.push(encodeABKChannelPattern(rows));
    }
    encodedPatterns.push(channels);
  }

  // ── Calculate section sizes ──────────────────────────────────────────────

  // Instruments section:
  //   u16 numInstr + numInstr × 32-byte headers + PCM data
  const instrHeaderSize = 2 + numInstr * 32;
  let totalSampleBytes = 0;
  for (const pcm of samplePCMs) {
    totalSampleBytes += pcm.length;
  }
  const instrSectionSize = instrHeaderSize + totalSampleBytes;

  // Songs section:
  //   u16 numSongs(1) + u32 songOffset + song data
  //   Song data: 4×u16 playlist offsets + u16 tempo + u16 unused + 16-byte name
  //   + playlist (u16 entries + 0xFFFE terminator) × 4 channels
  const songOrder = song.songPositions;
  const playlistLen = songOrder.length + 1; // entries + terminator
  const songDataSize = 8 + 2 + 2 + 16 + playlistLen * 2 * 4; // 4 playlists
  const songsSectionSize = 2 + 4 + songDataSize;

  // Patterns section:
  //   u16 numPatterns + numPatterns × 8 bytes (channel offsets)
  //   + encoded pattern data (2 bytes per word)
  const pattHeaderSize = 2 + numPatterns * 8;
  let totalPatternWords = 0;
  for (const channels of encodedPatterns) {
    for (const words of channels) {
      totalPatternWords += words.length;
    }
  }
  const pattSectionSize = pattHeaderSize + totalPatternWords * 2;

  // Total file size
  const mainHeaderSize = 12; // 3 × u32 offsets
  const amosHeaderSize = 0x14; // 20 bytes: "AmBk" + type + flags + length + name
  const totalSize = amosHeaderSize + mainHeaderSize + instrSectionSize + songsSectionSize + pattSectionSize;

  // ── Allocate and write ───────────────────────────────────────────────────
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // ── AMOS bank header (20 bytes) ──────────────────────────────────────────
  writeString(view, 0x00, 'AmBk', 4);
  writeU16BE(view, 0x04, 0x0003);          // bank type = music
  writeU16BE(view, 0x06, 0x0000);          // chip/fast flags
  writeU32BE(view, 0x08, totalSize - amosHeaderSize); // bank data length
  writeString(view, 0x0C, 'Music   ', 8);  // bank name (8 chars, space-padded)

  // ── Main header at 0x14 ──────────────────────────────────────────────────
  // Offsets are relative to 0x14 (AMOS_MAIN_HEADER)
  const instrOffset = mainHeaderSize;
  const songsOffset = mainHeaderSize + instrSectionSize;
  const pattOffset  = mainHeaderSize + instrSectionSize + songsSectionSize;

  writeU32BE(view, 0x14, instrOffset);
  writeU32BE(view, 0x18, songsOffset);
  writeU32BE(view, 0x1C, pattOffset);

  // ── Instruments section ──────────────────────────────────────────────────
  const instrBase = amosHeaderSize + mainHeaderSize;
  writeU16BE(view, instrBase, numInstr);

  // Calculate sample data offset (after all headers)
  let sampleDataPos = instrBase + instrHeaderSize;

  for (let i = 0; i < numInstr; i++) {
    const hdrBase = instrBase + 2 + i * 32;
    const inst = song.instruments[i];
    const pcm = samplePCMs[i];
    const sampleLenWords = Math.floor(pcm.length / 2);

    // Sample offset from instrBase
    const sampleOff = sampleDataPos - instrBase;
    writeU32BE(view, hdrBase + 0x00, sampleOff);

    // Repeat offset and loop length
    const hasLoop = inst?.sample?.loop && (inst.sample.loopEnd ?? 0) > (inst.sample.loopStart ?? 0);
    const loopStartBytes = hasLoop ? (inst.sample?.loopStart ?? 0) : 0;
    const loopLenWords = hasLoop ? Math.floor(((inst.sample?.loopEnd ?? 0) - loopStartBytes) / 2) : 2;
    const repeatOff = hasLoop ? sampleOff + loopStartBytes : sampleOff;
    writeU32BE(view, hdrBase + 0x04, repeatOff);

    // Sample length in words
    writeU16BE(view, hdrBase + 0x08, sampleLenWords);
    // Repeat end (loop length in words; >2 means loop)
    writeU16BE(view, hdrBase + 0x0A, hasLoop ? loopLenWords : 2);
    // Volume (0-64)
    const vol = inst?.metadata?.modPlayback?.defaultVolume ?? 64;
    writeU16BE(view, hdrBase + 0x0C, Math.min(vol, 64));
    // Sample length 2 (same as primary length)
    writeU16BE(view, hdrBase + 0x0E, sampleLenWords);
    // Name (16 bytes)
    writeString(view, hdrBase + 0x10, inst?.name ?? '', 16);

    // Write PCM data
    bytes.set(pcm, sampleDataPos);
    sampleDataPos += pcm.length;
  }

  // ── Songs section ────────────────────────────────────────────────────────
  const songsBase = amosHeaderSize + songsOffset;
  writeU16BE(view, songsBase, 1); // numSongs = 1

  // Song data offset (from songsBase) — immediately after numSongs + songOffset fields
  const songDataOffset = 6; // u16 numSongs + u32 songOffset = 6 bytes
  writeU32BE(view, songsBase + 2, songDataOffset);

  const songDataBase = songsBase + songDataOffset;

  // Playlist offsets for 4 channels (all point to same playlist data)
  // Playlist data starts after the song header (8 + 2 + 2 + 16 = 28 bytes)
  const playlistDataOffset = 28; // relative to songDataBase
  for (let ch = 0; ch < 4; ch++) {
    writeU16BE(view, songDataBase + ch * 2, playlistDataOffset + ch * playlistLen * 2);
  }

  // Tempo: reverse of parser's speed = round(100/tempo) → tempo = round(100/speed)
  const speed = song.initialSpeed ?? 6;
  const amosTempo = Math.max(1, Math.min(100, Math.round(100 / speed)));
  writeU16BE(view, songDataBase + 0x08, amosTempo);
  writeU16BE(view, songDataBase + 0x0A, 0); // unused

  // Song name (16 bytes)
  writeString(view, songDataBase + 0x0C, song.name ?? '', 16);

  // Write playlists for all 4 channels (same pattern indices)
  for (let ch = 0; ch < 4; ch++) {
    let plPos = songDataBase + playlistDataOffset + ch * playlistLen * 2;
    for (const pattIdx of songOrder) {
      writeU16BE(view, plPos, pattIdx);
      plPos += 2;
    }
    writeU16BE(view, plPos, 0xFFFE); // terminator
  }

  // ── Patterns section ─────────────────────────────────────────────────────
  const pattBase = amosHeaderSize + pattOffset;
  writeU16BE(view, pattBase, numPatterns);

  // First, calculate where pattern data starts (after all offset headers)
  let patternDataPos = pattBase + pattHeaderSize;

  // Write channel offsets and pattern data
  for (let pIdx = 0; pIdx < numPatterns; pIdx++) {
    const chanOffsetBase = pattBase + 2 + pIdx * 8;

    for (let ch = 0; ch < 4; ch++) {
      // Channel offset is relative to pattBase
      const chanOff = patternDataPos - pattBase;
      writeU16BE(view, chanOffsetBase + ch * 2, chanOff);

      // Write the encoded words
      const words = encodedPatterns[pIdx][ch];
      for (const word of words) {
        writeU16BE(view, patternDataPos, word);
        patternDataPos += 2;
      }
    }
  }

  return buf;
}
