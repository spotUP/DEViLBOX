/**
 * AMOSMusicBankParser.ts -- AMOS Music Bank (.abk) Amiga format parser
 *
 * AMOS Music Bank is the music format for AMOS BASIC (François Lionet, 1990).
 * Magic: "AmBk" at offset 0, bank type 0x0003, "Music   " bank name.
 *
 * File structure (AMOS standard header + main header + 3 sections):
 *   [0x00] "AmBk" + bank type + chip/fast + bank length + "Music   "
 *   [0x14] Main header: instruments_offset, songs_offset, patterns_offset
 *   [0x14 + instruments_offset] Instruments: numInst + inst headers + PCM data
 *   [0x14 + songs_offset]       Songs: numSongs + song data + playlists
 *   [0x14 + patterns_offset]    Patterns: numPatt + channel-offsets + pattern data
 *
 * Patterns are command-based (not fixed-row): commands set effects/instruments,
 * notes trigger at the current row, delay (0x10) commands advance the row.
 * Each ABK pattern defines 4 independent per-channel sub-patterns.
 *
 * References:
 *   Reference Code/libxmp-master/docs/formats/AMOS_Music_Bank_format.txt
 *   Reference Code/libxmp-master/src/loaders/abk_load.c
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument, periodToNoteIndex } from './AmigaUtils';

// -- Binary helpers -----------------------------------------------------------

function u8(view: DataView, off: number): number  { return view.getUint8(off); }
function u16(view: DataView, off: number): number { return view.getUint16(off, false); }
function u32(view: DataView, off: number): number { return view.getUint32(off, false); }

function readString(view: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const ch = view.getUint8(off + i);
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s;
}

// -- Constants ----------------------------------------------------------------

const AMOS_MAIN_HEADER = 0x14;   // main header always at offset 20

// -- Amiga period → XM note --------------------------------------------------

function periodToXM(period: number): number {
  if (period === 0) return 0;
  const idx = periodToNoteIndex(period);
  return idx > 0 ? idx + 12 : 0;
}

// -- Instrument metadata (from instruments section) --------------------------

interface ABKInstrument {
  name: string;
  sampleOffset: number;   // from instruments section start
  repeatOffset: number;   // from instruments section start
  sampleLength: number;   // in words (→ ×2 for bytes)
  repeatEnd: number;      // loop length in words (>2 = has loop)
  volume: number;         // 0-64
}

// -- ABK pattern decoder ------------------------------------------------------
//
// An ABK per-channel pattern is a sequence of 2-byte words:
//   bit15=1 → command: bits14-8=cmd, bits7-0=param
//   bit15=0 → note:    bit14=old_format flag
//             new format (bit14=0): bits11-0 = Amiga period
//             old format (bit14=1): bits7-0 = row delay; next word bits11-0 = period
//   0x8000 or 0x9100 → end of pattern
//
// Persistent effects (arpeggio, vibrato, portamento, volume slide):
//   Set by commands 0x0A–0x0D. Delay command (0x10) writes them once per row.

function decodeABKChannelPattern(
  view: DataView,
  absOffset: number,
  bufLen: number,
): TrackerCell[] {
  const rows: TrackerCell[] = Array.from({ length: 64 }, (): TrackerCell => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  let pos     = absOffset;
  let rowPos  = 0;
  let inst    = 0;
  let done    = false;
  let perFxt  = 0;  // persistent effect type (XM)
  let perFxp  = 0;  // persistent effect param

  while (!done && pos + 2 <= bufLen) {
    const word = u16(view, pos); pos += 2;

    if (word === 0x8000 || word === 0x9100) break;  // end of pattern

    if (word & 0x8000) {
      // ── Command ──────────────────────────────────────────────────────────
      const cmd   = (word >> 8) & 0x7F;
      const param = word & 0x7F;

      // Non-persistent commands clear the persistent effect (except volume-related)
      if (cmd !== 0x03 && cmd !== 0x09 &&
          cmd !== 0x0B && cmd !== 0x0C && cmd !== 0x0D &&
          cmd < 0x10) {
        perFxt = 0; perFxp = 0;
      }

      switch (cmd) {
        case 0x01: case 0x0E:  // portamento up → XM 1
          if (rowPos < 64) { rows[rowPos].effTyp = 0x01; rows[rowPos].eff = param; }
          break;

        case 0x02: case 0x0F:  // portamento down → XM 2
          if (rowPos < 64) { rows[rowPos].effTyp = 0x02; rows[rowPos].eff = param; }
          break;

        case 0x03:  // set volume → XM volume column
          if (rowPos < 64) { rows[rowPos].volume = 0x10 + Math.min(param, 64); }
          break;

        case 0x04:  // stop effect
          perFxt = 0; perFxp = 0;
          break;

        case 0x05:  // repeat (E50 = mark, E6x = loop x times)
          if (rowPos < 64) {
            rows[rowPos].effTyp = 0x0E;
            rows[rowPos].eff = param === 0 ? 0x50 : 0x60 | (param & 0x0F);
          }
          break;

        case 0x06:  // low-pass filter off → E00
          if (rowPos < 64) { rows[rowPos].effTyp = 0x0E; rows[rowPos].eff = 0x00; }
          break;

        case 0x07:  // low-pass filter on → E01
          if (rowPos < 64) { rows[rowPos].effTyp = 0x0E; rows[rowPos].eff = 0x01; }
          break;

        case 0x08:  // set tempo → XM Fxx (speed = 100/amos_tempo)
          if (param > 0 && rowPos < 64) {
            rows[rowPos].effTyp = 0x0F;
            rows[rowPos].eff = Math.max(1, Math.round(100 / param));
          }
          break;

        case 0x09:  // set instrument (0-based → 1-based)
          inst = param + 1;
          break;

        case 0x0A:  // arpeggio (persistent) → XM 0xy
          perFxt = 0x00; perFxp = param;
          break;

        case 0x0B:  // tone portamento (persistent) → XM 3
          perFxt = 0x03; perFxp = param;
          break;

        case 0x0C:  // vibrato (persistent) → XM 4xy
          perFxt = 0x04; perFxp = param;
          break;

        case 0x0D:  // volume slide (persistent) → XM Axy
          if (param !== 0) { perFxt = 0x0A; perFxp = param; }
          else { perFxt = 0; perFxp = 0; }
          break;

        case 0x10:  // delay — advance rowPos, applying persistent effect each row
          if (perFxt !== 0 || perFxp !== 0) {
            for (let d = 0; d < param && rowPos < 64; d++) {
              rows[rowPos].effTyp = perFxt;
              rows[rowPos].eff = perFxp;
              rowPos++;
            }
          } else {
            rowPos += param;
          }
          if (rowPos >= 64) done = true;
          break;

        case 0x11:  // position jump → XM Bxx
          if (rowPos < 64) { rows[rowPos].effTyp = 0x0B; rows[rowPos].eff = param; }
          done = true;
          break;

        default:
          break;
      }
    } else {
      // ── Note ─────────────────────────────────────────────────────────────
      if (word & 0x4000) {
        // Old format: 2 words — delay in bits7-0 of first word, period in bits11-0 of second
        const delay = word & 0xFF;
        if (pos + 2 > bufLen) break;
        const word2 = u16(view, pos); pos += 2;

        if (word2 === 0 && delay === 0) break;  // null entry = end of pattern

        if (word2 !== 0 && rowPos < 64) {
          const period = word2 & 0x0FFF;
          rows[rowPos].note = periodToXM(period);
          rows[rowPos].instrument = inst;
        }

        rowPos += delay;
        if (rowPos >= 64) done = true;
      } else {
        // New format: 1 word — period in bits11-0
        const period = word & 0x0FFF;
        if (period !== 0 && rowPos < 64) {
          rows[rowPos].note = periodToXM(period);
          rows[rowPos].instrument = inst;
        }
        // No implicit row advance — a delay (0x10) command must follow
      }
    }
  }

  return rows;
}

// -- Format detection ---------------------------------------------------------

/**
 * Returns true if the buffer starts with the AMOS Music Bank "AmBk" magic
 * and has bank type 0x0003 (music).
 */
export function isAMOSMusicBankFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 0x20) return false;
  const view = new DataView(buffer);
  if (readString(view, 0, 4) !== 'AmBk') return false;
  if (u16(view, 4) !== 0x0003) return false;
  if (readString(view, 0x0C, 8) !== 'Music   ') return false;
  return true;
}

// -- Main parser --------------------------------------------------------------

/**
 * Parse an AMOS Music Bank (.abk) file into a TrackerSong.
 */
export async function parseAMOSMusicBankFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const view  = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  if (!isAMOSMusicBankFormat(buffer)) {
    throw new Error('ABK: not an AMOS Music Bank file');
  }

  // ── Main header (at 0x14) ────────────────────────────────────────────────

  const instrOff  = u32(view, AMOS_MAIN_HEADER + 0x00);
  const songsOff  = u32(view, AMOS_MAIN_HEADER + 0x04);
  const pattOff   = u32(view, AMOS_MAIN_HEADER + 0x08);

  if (instrOff > 0x100000 || songsOff > 0x100000 || pattOff > 0x100000) {
    throw new Error('ABK: implausible section offsets');
  }

  const instrBase = AMOS_MAIN_HEADER + instrOff;
  const songsBase = AMOS_MAIN_HEADER + songsOff;
  const pattBase  = AMOS_MAIN_HEADER + pattOff;

  // ── Instruments section ───────────────────────────────────────────────────
  //
  // instrBase + 0: numInstruments (uint16BE)
  // instrBase + 2: numInstruments × 32-byte headers:
  //   +0x00 sample_offset uint32BE (from instrBase)
  //   +0x04 repeat_offset uint32BE (from instrBase)
  //   +0x08 sample_length uint16BE (words; if non-repeating, the reliable length)
  //   +0x0A repeat_end    uint16BE (words; loop length; >2 = has loop)
  //   +0x0C volume        uint16BE (0–64)
  //   +0x0E sample_length2 uint16BE (may be more reliable; use if > 4)
  //   +0x10 name[16]

  if (instrBase + 2 > buffer.byteLength) throw new Error('ABK: instruments section out of range');
  const numInstr = u16(view, instrBase);

  const abkInstruments: ABKInstrument[] = [];
  for (let i = 0; i < numInstr; i++) {
    const base = instrBase + 2 + i * 32;
    if (base + 32 > buffer.byteLength) break;

    const sampleOffset  = u32(view, base + 0x00);
    const repeatOffset  = u32(view, base + 0x04);
    const len1          = u16(view, base + 0x08);  // sample length (words) or repeat start
    const repeatEnd     = u16(view, base + 0x0A);  // loop length (words)
    const volume        = u16(view, base + 0x0C);
    const len2          = u16(view, base + 0x0E);  // sample length (words), may be incorrect
    const name          = readString(view, base + 0x10, 16).trim();

    // Use the more reliable length field (>4 → trust it, else fall back to len1)
    const sampleLength = len2 > 4 ? len2 : len1;

    abkInstruments.push({
      name: name || `Sample ${i + 1}`,
      sampleOffset,
      repeatOffset,
      sampleLength,
      repeatEnd,
      volume: Math.min(volume, 64),
    });
  }

  // ── Songs section ─────────────────────────────────────────────────────────
  //
  // songsBase + 0: numSongs (uint16BE) — we only support song 0
  // songsBase + 2: song offset (uint32BE, from songsBase)
  // song data at songsBase + songOffset:
  //   +0x00..+0x07: 4 × uint16BE playlist offsets (from song data start)
  //   +0x08: tempo (uint16BE, 1-100)
  //   +0x0A: unused (uint16BE)
  //   +0x0C: song name[16]
  //   playlists: uint16BE values until 0xFFFE or 0xFFFF

  let songName    = filename.replace(/\.[^/.]+$/, '');
  let amosSpeed   = 6;
  let songOrder: number[] = [];

  if (songsBase + 6 <= buffer.byteLength) {
    const numSongs = u16(view, songsBase);
    if (numSongs >= 1 && songsBase + 6 <= buffer.byteLength) {
      const songDataOffset = u32(view, songsBase + 2);
      const songDataBase   = songsBase + songDataOffset;

      if (songDataBase + 0x1C <= buffer.byteLength) {
        // Read playlist offsets for all 4 channels (we use channel 0)
        const ch0PlaylistAbs = songDataBase + u16(view, songDataBase + 0x00);
        const amosTempo      = u16(view, songDataBase + 0x08);
        const rawName        = readString(view, songDataBase + 0x0C, 16).trim();
        if (rawName) songName = rawName;

        // AMOS tempo → SoundTracker-like speed: speed = round(100 / amosTempo)
        if (amosTempo > 0) {
          amosSpeed = Math.max(1, Math.min(31, Math.round(100 / amosTempo)));
        }

        // Read channel 0's playlist (sequence of uint16BE pattern indices)
        let plPos = ch0PlaylistAbs;
        while (plPos + 2 <= buffer.byteLength) {
          const pattIdx = u16(view, plPos); plPos += 2;
          if (pattIdx === 0xFFFF || pattIdx === 0xFFFE) break;
          songOrder.push(pattIdx);
        }
      }
    }
  }

  // ── Patterns section ──────────────────────────────────────────────────────
  //
  // pattBase + 0: numPatterns (uint16BE)
  // pattBase + 2: numPatterns × 8 bytes (4 × uint16BE channel-pattern offsets each)
  //   chanOffset[k] = offset from pattBase to that channel's pattern data
  // Pattern data: command-based (see decodeABKChannelPattern)

  if (pattBase + 2 > buffer.byteLength) throw new Error('ABK: patterns section out of range');
  const numPatterns = u16(view, pattBase);

  const patterns: Pattern[] = [];
  const PANNING = [-50, 50, 50, -50] as const;

  for (let pIdx = 0; pIdx < numPatterns; pIdx++) {
    const chanOffsetBase = pattBase + 2 + pIdx * 8;
    if (chanOffsetBase + 8 > buffer.byteLength) break;

    const channels: ChannelData[] = Array.from({ length: 4 }, (_, ch) => {
      const chanOff = u16(view, chanOffsetBase + ch * 2);
      const absOff  = pattBase + chanOff;

      const rows = (absOff + 2 <= buffer.byteLength)
        ? decodeABKChannelPattern(view, absOff, buffer.byteLength)
        : Array.from({ length: 64 }, (): TrackerCell => ({
            note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
          }));

      return {
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: PANNING[ch],
        instrumentId: null,
        color: null,
        rows,
      };
    });

    patterns.push({
      id: `pattern-${pIdx}`,
      name: `Pattern ${pIdx}`,
      length: 64,
      channels,
      importMetadata: {
        sourceFormat: 'AMOSMusicBank',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: numPatterns,
        originalInstrumentCount: numInstr,
      },
    });
  }

  // Fallback: at least one empty pattern
  if (patterns.length === 0) {
    patterns.push({
      id: 'pattern-0',
      name: 'Pattern 0',
      length: 64,
      channels: Array.from({ length: 4 }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: PANNING[ch],
        instrumentId: null,
        color: null,
        rows: Array.from({ length: 64 }, (): TrackerCell => ({
          note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        })),
      })),
      importMetadata: {
        sourceFormat: 'AMOSMusicBank',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: 0,
      },
    });
  }

  // ── Build InstrumentConfig list ───────────────────────────────────────────

  const instrConfigs: InstrumentConfig[] = abkInstruments.map((inst, i) => {
    const sampleByteLen = inst.sampleLength * 2;
    const sampleAbs     = instrBase + inst.sampleOffset;

    if (sampleByteLen <= 2 || sampleAbs + sampleByteLen > buffer.byteLength) {
      return {
        id: i + 1,
        name: inst.name,
        type: 'sample' as const,
        synthType: 'Sampler' as const,
        effects: [],
        volume: -60,
        pan: 0,
      } as unknown as InstrumentConfig;
    }

    const pcm = bytes.slice(sampleAbs, sampleAbs + sampleByteLen);

    const hasLoop   = inst.repeatEnd > 2;
    const loopStart = hasLoop && inst.repeatOffset > inst.sampleOffset
      ? (inst.repeatOffset - inst.sampleOffset) * 2
      : 0;
    const loopEnd   = hasLoop ? loopStart + inst.repeatEnd * 2 : 0;

    return createSamplerInstrument(i + 1, inst.name, pcm, inst.volume, 8287, loopStart, loopEnd);
  });

  // ── Song order ───────────────────────────────────────────────────────────

  const songPositions = songOrder.length > 0
    ? songOrder.filter(idx => idx < patterns.length)
    : [0];

  if (songPositions.length === 0) songPositions.push(0);

  return {
    name: songName,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments: instrConfigs,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: amosSpeed,
    initialBPM: 125,
    linearPeriods: false,
  };
}
