/**
 * SonicArrangerParser.ts -- Sonic Arranger (.sa) Amiga format parser
 *
 * Sonic Arranger is a 4-channel Amiga tracker by Carsten Schlote et al., 1991-95.
 * Magic: "SOARV1.0" at offset 0 (uncompressed); "@OARV1.0" = lh-compressed (rejected).
 *
 * Format reference: NostalgicPlayer/Source/Agents/Players/SonicArranger/SonicArrangerWorker.cs
 * UADE player source: uade-3.05/amigasrc/players/wanted_team/Sonic_Arranger/Sonic Arranger_v1.asm
 *
 * Chunk layout (sequential, no size fields in most chunks):
 *   [SOARV1.0] magic (8 bytes)
 *   [STBL] uint32 count + count × 12-byte sub-song descriptors
 *   [OVTB] uint32 count + count × 16-byte position entries (4 channels × 4 bytes)
 *   [NTBL] uint32 count + count × 4-byte track row entries
 *   [INST] uint32 count + count × 152-byte instrument descriptors
 *   [SD8B] int32 count + count × 38-byte sample info (skipped) +
 *          count × uint32 byte-lengths + PCM data (signed int8)
 *   [SYWT] uint32 count + count × 128-byte signed waveforms
 *   [SYAR] uint32 count + count × 128-byte ADSR tables
 *   [SYAF] uint32 count + count × 128-byte AMF tables
 *
 * Instrument struct (152 bytes):
 *   +0   uint16 type       (0=Sample, 1=Synth)
 *   +2   uint16 waveformNumber  (sample index for type=Sample)
 *   +4   uint16 waveformLength  (one-shot length in words)
 *   +6   uint16 repeatLength    (loop length in words; 0=loop all, 1=no loop)
 *   +8   skip 8 bytes
 *   +16  uint16 volume     (0-64)
 *   +18  int16  fineTuning
 *   +20  uint16 portamentoSpeed
 *   +22  uint16 vibratoDelay
 *   +24  uint16 vibratoSpeed
 *   +26  uint16 vibratoLevel
 *   +28  uint16 amfNumber + amfDelay + amfLength + amfRepeat (8 bytes)
 *   +36  uint16 adsrNumber + adsrDelay + adsrLength + adsrRepeat + sustainPoint + sustainDelay (12 bytes)
 *   +48  skip 16 bytes
 *   +64  uint16 effectArg1 + effect + effectArg2 + effectArg3 + effectDelay (10 bytes)
 *   +74  3 × { uint8 length, uint8 repeat, int8[14] values } = 48 bytes
 *   +122 char[30] name
 *   = 152 bytes total
 *
 * Track row (4 bytes):
 *   byte 0: note  (0=empty, 1-108 = period table index 1-based)
 *   byte 1: instrument (1-based, 0=none)
 *   byte 2: bits7-6=DisableSoundTranspose/NoteTranspose, bits5-4=arpeggioTable, bits3-0=effect
 *   byte 3: effect argument
 *
 * Note → XM note conversion:
 *   SA period table entry 49 (1-based) = period 856 = ProTracker C-1 = DEViLBOX XM 13
 *   Formula: xmNote = saNote - 36   (valid for saNote 37..132 → XM 1..96)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';
import type { UADEChipRamInfo, SonicArrangerConfig } from '@/types/instrument';
import { DEFAULT_SONIC_ARRANGER } from '@/types/instrument';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeSonicArrangerCell } from '@/engine/uade/encoders/SonicArrangerEncoder';

// -- Binary helpers -----------------------------------------------------------

function u8(v: DataView, off: number): number  { return v.getUint8(off); }
function i8(v: DataView, off: number): number  { return v.getInt8(off); }
function u16(v: DataView, off: number): number { return v.getUint16(off, false); }
function u32(v: DataView, off: number): number { return v.getUint32(off, false); }
function i32(v: DataView, off: number): number { return v.getInt32(off, false); }

function readMark(v: DataView, off: number): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += String.fromCharCode(v.getUint8(off + i));
  return s;
}

function readString(v: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const ch = v.getUint8(off + i);
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s.trim();
}

// -- SA period table (from sonic_arranger_synth.c) ----------------------------
// 1-based: index 49 = period 856 = ProTracker C-1, index 73 = 214 = PT C-3.
const SA_PERIOD_TABLE: readonly number[] = [
  0,
  13696,12928,12192,11520,10848,10240,9664,9120,8608,8128,7680,7248,
   6848, 6464, 6096, 5760, 5424, 5120,4832,4560,4304,4064,3840,3624,
   3424, 3232, 3048, 2880, 2712, 2560,2416,2280,2152,2032,1920,1812,
   1712, 1616, 1524, 1440, 1356, 1280,1208,1140,1076,1016, 960, 906,
    856,  808,  762,  720,  678,  640, 604, 570, 538, 508, 480, 453,
    428,  404,  381,  360,  339,  320, 302, 285, 269, 254, 240, 226,
    214,  202,  190,  180,  170,  160, 151, 143, 135, 127, 120, 113,
    107,  101,   95,   90,   85,   80,  75,  71,  67,  63,  60,  56,
     53,   50,   47,   45,   42,   40,  37,  35,  33,  31,  30,  28,
];

// -- SA note → XM note --------------------------------------------------------
// SA period table is 1-based: index 49 = period 856 = ProTracker C-1.
// XM note 13 = C-1 (displays "C-1"). So xmNote = saNote - 36.
// Reverse: saIdx = xmNote + 36.

function saNote2XM(note: number): number {
  if (note === 0) return 0;
  if (note === 0x7F || note === 0x80) return 97; // note-off (0x7F=force quiet, 0x80=release)
  const xm = note - 36;
  return (xm >= 1 && xm <= 96) ? xm : 0;
}

// Look up the real Amiga period for an SA note (after transpose).
// xmNote is the transposed XM note; SA index = xmNote + 36.
function saNotePeriod(xmNote: number): number | undefined {
  if (xmNote <= 0 || xmNote >= 97) return undefined;
  const saIdx = xmNote + 36;
  return (saIdx >= 1 && saIdx <= 108) ? SA_PERIOD_TABLE[saIdx] : undefined;
}

// -- Sub-song info ------------------------------------------------------------

interface SASong {
  startSpeed:      number;  // ticks per row
  rowsPerTrack:    number;
  firstPosition:   number;
  lastPosition:    number;
  restartPosition: number;
  tempo:           number;  // Hz value → BPM = tempo * 125 / 50
}

// -- Instrument info ----------------------------------------------------------

interface SAInstrument {
  isSynth:        boolean;
  waveformNumber: number;   // index into sampleData[] (type=Sample) or waveformData[] (Synth)
  waveformLength: number;   // one-shot length in words → *2 bytes
  repeatLength:   number;   // loop length in words → *2 bytes (0=all, 1=no loop)
  volume:         number;   // 0-64
  fineTuning:     number;   // int16 at +18
  portamentoSpeed: number;  // uint16 at +20
  vibratoDelay:   number;   // uint16 at +22
  vibratoSpeed:   number;   // uint16 at +24
  vibratoLevel:   number;   // uint16 at +26
  amfNumber:      number;   // uint16 at +28
  amfDelay:       number;   // uint16 at +30
  amfLength:      number;   // uint16 at +32
  amfRepeat:      number;   // uint16 at +34
  adsrNumber:     number;   // uint16 at +36
  adsrDelay:      number;   // uint16 at +38
  adsrLength:     number;   // uint16 at +40
  adsrRepeat:     number;   // uint16 at +42
  sustainPoint:   number;   // uint16 at +44
  sustainDelay:   number;   // uint16 at +46
  effectArg1:     number;   // uint16 at +64
  effect:         number;   // uint16 at +66
  effectArg2:     number;   // uint16 at +68
  effectArg3:     number;   // uint16 at +70
  effectDelay:    number;   // uint16 at +72
  arpeggios:      Array<{ length: number; repeat: number; values: number[] }>;  // 3 × 16 bytes at +74
  name:           string;
}

// -- Track row ----------------------------------------------------------------

interface SARow {
  note:    number;    // 0=empty, 1-108 = period index
  instr:   number;   // 1-based instrument, 0=none
  disableSoundTranspose: boolean;
  disableNoteTranspose:  boolean;
  arpeggioTable:         number;  // 0-2 (SA arpeggio table selector, not used in XM mapping)
  effect:  number;   // 0x0-0xF
  effArg:  number;   // 0-255
}

// -- Position entry -----------------------------------------------------------

interface SAPosition {
  startTrackRow:  number;   // index into trackLines[]
  soundTranspose: number;   // signed int8
  noteTranspose:  number;   // signed int8
}

// -- Format detection ---------------------------------------------------------

/**
 * Returns true if the buffer is a Sonic Arranger file. Two sub-formats accepted:
 *
 * 1. Uncompressed song data: starts with "SOARV1.0" magic followed by "STBL" chunk.
 *    "@OARV1.0" (lh-compressed) is rejected — UADE handles it natively.
 *
 * 2. Player+data binary: starts with 0x4EFA (JSR PC-relative) instructions.
 *    Per Sonic Arranger_v1.asm Check2 (NoSong path):
 *      - word[0] == 0x4EFA
 *      - displacement D1 = word[2]: > 0, not negative, even
 *      - word at (6 + D1): == 0x41FA (lea PC-relative to song data)
 */
export function isSonicArrangerFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 8) return false;
  const v = new DataView(buffer);

  // Path 1: "SOARV1.0" magic
  let magic = '';
  for (let i = 0; i < 8; i++) magic += String.fromCharCode(v.getUint8(i));
  if (magic === 'SOARV1.0') return true;

  // Path 2: 4EFA JSR player binary
  if (buffer.byteLength < 50) return false;
  const w0 = v.getUint16(0, false);
  if (w0 !== 0x4EFA) return false;

  const d1 = v.getUint16(2, false);
  if (d1 === 0) return false;
  if (d1 & 0x8000) return false; // negative
  if (d1 & 0x0001) return false; // odd

  // Check 0x41FA at offset (6 + d1)
  const leaOffset = 6 + d1;
  if (leaOffset + 2 > buffer.byteLength) return false;
  return v.getUint16(leaOffset, false) === 0x41FA;
}

// -- Main parser --------------------------------------------------------------

/**
 * Parse a Sonic Arranger (.sa) file into a TrackerSong.
 *
 * Two sub-formats:
 *   1. SOARV1.0 — fully parsed (patterns, instruments, samples).
 *   2. 4EFA player binary — metadata stub only (UADE handles audio).
 */
export async function parseSonicArrangerFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const v     = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  if (buffer.byteLength < 8) throw new Error('SonicArranger: file too small');

  let magic = '';
  for (let i = 0; i < 8; i++) magic += String.fromCharCode(v.getUint8(i));

  // ── 4EFA player binary — find embedded song data ──────────────────────────
  // The 4EFA format embeds song data inside a player binary. The data uses an
  // offset table (8 longwords) instead of chunk markers (STBL/OVTB/etc.).
  // Algorithm from UADE Sonic Arranger_v1.asm InitPlayer → NoAR (line 772):
  //   A0 += word[2]; A0 += 8; A0 += word[A0]; → SongPtr
  let songBase = 0;  // absolute offset where song data starts
  let useOffsetTable = false;  // true for 4EFA format (offset table), false for SOARV1.0 (chunks)

  if (magic !== 'SOARV1.0') {
    if (v.getUint16(0, false) !== 0x4EFA) {
      throw new Error(`SonicArranger: unrecognised format (magic="${magic}")`);
    }
    // Calculate song data offset from 4EFA player binary
    const d1 = v.getUint16(2, false);  // first JSR displacement
    const leaOff = d1 + 8;             // skip past JSR + 8 bytes
    if (leaOff + 2 > buffer.byteLength) throw new Error('SonicArranger: 4EFA binary too small');
    const d2 = v.getUint16(leaOff, false);  // lea displacement
    songBase = leaOff + d2;
    if (songBase + 32 > buffer.byteLength) throw new Error('SonicArranger: 4EFA song data out of bounds');
    useOffsetTable = true;
  }

  if (buffer.byteLength < songBase + 16) throw new Error('SonicArranger: file too small');

  let pos: number;
  let numSubSongs: number;

  if (useOffsetTable) {
    // 4EFA format: 8 longword offsets relative to songBase
    // [0]=STBL [1]=OVTB [2]=NTBL [3]=INST [4]=SYWT [5]=SYAR [6]=SYAF [7]=SD8B
    const offSTBL = u32(v, songBase + 0);
    const offOVTB = u32(v, songBase + 4);
    // Number of sub-songs = (offOVTB - offSTBL) / 12
    numSubSongs = Math.floor((offOVTB - offSTBL) / 12);
    pos = songBase + offSTBL;  // cursor at sub-song table data
  } else {
    // SOARV1.0 chunk format
    pos = 8;  // cursor after magic
    if (readMark(v, pos) !== 'STBL') throw new Error('SonicArranger: missing STBL chunk');
    pos += 4;
    numSubSongs = u32(v, pos); pos += 4;
  }
  const subSongs: SASong[] = [];
  for (let i = 0; i < numSubSongs; i++) {
    const ss: SASong = {
      startSpeed:      u16(v, pos),
      rowsPerTrack:    u16(v, pos + 2),
      firstPosition:   u16(v, pos + 4),
      lastPosition:    u16(v, pos + 6),
      restartPosition: u16(v, pos + 8),
      tempo:           u16(v, pos + 10),
    };
    pos += 12;
    // Skip invalid sub-songs (0xFFFF markers used internally)
    if (ss.lastPosition !== 0xFFFF && ss.restartPosition !== 0xFFFF) {
      subSongs.push(ss);
    }
  }

  // Use first valid sub-song
  const song: SASong = subSongs[0] ?? {
    startSpeed: 6, rowsPerTrack: 64, firstPosition: 0, lastPosition: 0,
    restartPosition: 0, tempo: 50,
  };

  // ── OVTB — position/order table ────────────────────────────────────────────
  let numPositions: number;
  if (useOffsetTable) {
    const offOVTB = u32(v, songBase + 4);
    const offNTBL = u32(v, songBase + 8);
    numPositions = Math.floor((offNTBL - offOVTB) / 16);  // 16 bytes per position (4 channels × 4 bytes)
    pos = songBase + offOVTB;
  } else {
    if (readMark(v, pos) !== 'OVTB') throw new Error('SonicArranger: missing OVTB chunk');
    pos += 4;
    numPositions = u32(v, pos); pos += 4;
  }
  // positions[posIdx][ch] → SAPosition
  const positions: SAPosition[][] = [];
  for (let p = 0; p < numPositions; p++) {
    const chans: SAPosition[] = [];
    for (let ch = 0; ch < 4; ch++) {
      chans.push({
        startTrackRow:  u16(v, pos),
        soundTranspose: i8(v, pos + 2),
        noteTranspose:  i8(v, pos + 3),
      });
      pos += 4;
    }
    positions.push(chans);
  }

  // ── NTBL — track rows ──────────────────────────────────────────────────────
  let numTrackRows: number;
  if (useOffsetTable) {
    const offNTBL = u32(v, songBase + 8);
    const offINST = u32(v, songBase + 12);
    numTrackRows = Math.floor((offINST - offNTBL) / 4);  // 4 bytes per track row
    pos = songBase + offNTBL;
  } else {
    if (readMark(v, pos) !== 'NTBL') throw new Error('SonicArranger: missing NTBL chunk');
    pos += 4;
    numTrackRows = u32(v, pos); pos += 4;
  }
  const ntblDataOffset = pos;  // file offset of first 4-byte track row in NTBL
  const trackLines: SARow[] = [];
  for (let i = 0; i < numTrackRows; i++) {
    const b0 = u8(v, pos);
    const b1 = u8(v, pos + 1);
    const b2 = u8(v, pos + 2);
    const b3 = u8(v, pos + 3);
    trackLines.push({
      note:                    b0,
      instr:                   b1,
      disableSoundTranspose:   (b2 & 0x80) !== 0,
      disableNoteTranspose:    (b2 & 0x40) !== 0,
      arpeggioTable:           (b2 & 0x30) >> 4,
      effect:                  b2 & 0x0F,
      effArg:                  b3,
    });
    pos += 4;
  }

  // ── INST — instruments ─────────────────────────────────────────────────────
  let numInstruments: number;
  if (useOffsetTable) {
    const offINST = u32(v, songBase + 12);
    const offSYWT = u32(v, songBase + 16);  // SYWT follows INST
    numInstruments = Math.floor((offSYWT - offINST) / 152);
    pos = songBase + offINST;
  } else {
    if (readMark(v, pos) !== 'INST') throw new Error('SonicArranger: missing INST chunk');
    pos += 4;
    numInstruments = u32(v, pos); pos += 4;
  }
  const instTableStart = pos;  // file offset of first 152-byte instrument entry
  const saInstruments: SAInstrument[] = [];
  for (let i = 0; i < numInstruments; i++) {
    const base = pos;
    const isSynth       = u16(v, base)     !== 0;
    const waveformNumber = u16(v, base + 2);
    const waveformLength = u16(v, base + 4);
    const repeatLength   = u16(v, base + 6);
    // +8: skip 8 bytes
    const volume = u16(v, base + 16) & 0xFF;  // effective 0-255, but SA uses 0-64
    const fineTuning     = v.getInt16(base + 18, false);
    const portamentoSpeed = u16(v, base + 20);
    const vibratoDelay   = u16(v, base + 22);
    const vibratoSpeed   = u16(v, base + 24);
    const vibratoLevel   = u16(v, base + 26);
    const amfNumber      = u16(v, base + 28);
    const amfDelay       = u16(v, base + 30);
    const amfLength      = u16(v, base + 32);
    const amfRepeat      = u16(v, base + 34);
    const adsrNumber     = u16(v, base + 36);
    const adsrDelay      = u16(v, base + 38);
    const adsrLength     = u16(v, base + 40);
    const adsrRepeat     = u16(v, base + 42);
    const sustainPoint   = u16(v, base + 44);
    const sustainDelay   = u16(v, base + 46);
    // +48: skip 16 bytes
    const effectArg1     = u16(v, base + 64);
    const effect         = u16(v, base + 66);
    const effectArg2     = u16(v, base + 68);
    const effectArg3     = u16(v, base + 70);
    const effectDelay    = u16(v, base + 72);

    // 3 arpeggio sub-tables at +74, each 16 bytes: length(u8), repeat(u8), values(int8[14])
    const arpeggios: Array<{ length: number; repeat: number; values: number[] }> = [];
    for (let a = 0; a < 3; a++) {
      const arpBase = base + 74 + a * 16;
      const arpLen = u8(v, arpBase);
      const arpRepeat = u8(v, arpBase + 1);
      const arpValues: number[] = [];
      for (let j = 0; j < 14; j++) {
        arpValues.push(i8(v, arpBase + 2 + j));
      }
      arpeggios.push({ length: arpLen, repeat: arpRepeat, values: arpValues });
    }

    // Name at +122, 30 bytes
    const name = readString(v, base + 122, 30) || `Instrument ${i + 1}`;

    saInstruments.push({
      isSynth,
      waveformNumber,
      waveformLength,
      repeatLength,
      volume: Math.min(volume, 64),
      fineTuning,
      portamentoSpeed,
      vibratoDelay,
      vibratoSpeed,
      vibratoLevel,
      amfNumber,
      amfDelay,
      amfLength,
      amfRepeat,
      adsrNumber,
      adsrDelay,
      adsrLength,
      adsrRepeat,
      sustainPoint,
      sustainDelay,
      effectArg1,
      effect,
      effectArg2,
      effectArg3,
      effectDelay,
      arpeggios,
      name,
    });
    pos += 152;
  }

  // ── SD8B — sample data ─────────────────────────────────────────────────────
  if (useOffsetTable) {
    pos = songBase + u32(v, songBase + 28);  // offset[7] = SD8B
  } else {
    if (readMark(v, pos) !== 'SD8B') throw new Error('SonicArranger: missing SD8B chunk');
    pos += 4;
  }

  const numSamples = i32(v, pos); pos += 4;

  const samplePCM: (Uint8Array | null)[] = [];

  if (numSamples > 0) {
    // SOARV1.0 chunk format has 38-byte sample info headers before the size table;
    // 4EFA offset table format does NOT have these headers (sizes follow count directly)
    if (!useOffsetTable) {
      pos += numSamples * 38;
    }

    // Read per-sample byte-lengths
    const sampleLengths: number[] = [];
    for (let i = 0; i < numSamples; i++) {
      sampleLengths.push(u32(v, pos)); pos += 4;
    }

    // Read signed int8 PCM data for each sample
    for (let i = 0; i < numSamples; i++) {
      const len = sampleLengths[i];
      if (len > 0 && pos + len <= buffer.byteLength) {
        // SA samples are signed int8 (no conversion needed)
        samplePCM.push(bytes.slice(pos, pos + len));
        pos += len;
      } else {
        samplePCM.push(null);
        pos += len;
      }
    }
  }

  // ── SYWT — waveform data (for synth instruments) ───────────────────────────
  // Each waveform: 128 signed int8 bytes
  const waveformData: (Uint8Array | null)[] = [];
  {
    let numWaveforms: number;
    if (useOffsetTable) {
      const offSYWT = u32(v, songBase + 16);  // offset[4] = SYWT
      const offSYAR = u32(v, songBase + 20);  // offset[5] = SYAR
      numWaveforms = Math.floor((offSYAR - offSYWT) / 128);
      pos = songBase + offSYWT;
    } else if (pos + 4 <= buffer.byteLength && readMark(v, pos) === 'SYWT') {
      pos += 4;
      numWaveforms = u32(v, pos); pos += 4;
    } else {
      numWaveforms = 0;
    }
    for (let i = 0; i < numWaveforms; i++) {
      if (pos + 128 <= buffer.byteLength) {
        waveformData.push(bytes.slice(pos, pos + 128));
        pos += 128;
      } else {
        waveformData.push(null);
        pos += 128;
      }
    }
  }

  // ── SYAR — ADSR tables (128 bytes each, unsigned uint8) ──────────────────
  const adsrTables: number[][] = [];
  let syarFileOffset = -1;
  {
    let numAdsrTables: number;
    if (useOffsetTable) {
      const offSYAR = u32(v, songBase + 20);  // offset[5] = SYAR
      const offSYAF = u32(v, songBase + 24);  // offset[6] = SYAF
      numAdsrTables = Math.floor((offSYAF - offSYAR) / 128);
      pos = songBase + offSYAR;
    } else if (pos + 4 <= buffer.byteLength && readMark(v, pos) === 'SYAR') {
      pos += 4;
      numAdsrTables = u32(v, pos); pos += 4;
    } else {
      numAdsrTables = 0;
    }
    if (numAdsrTables > 0) syarFileOffset = pos;
    for (let i = 0; i < numAdsrTables; i++) {
      const table: number[] = [];
      for (let j = 0; j < 128; j++) {
        table.push(u8(v, pos + j));
      }
      adsrTables.push(table);
      pos += 128;
    }
  }

  // ── SYAF — AMF tables (128 bytes each, signed int8) ────────────────────
  const amfTables: number[][] = [];
  let syafFileOffset = -1;
  {
    let numAmfTables: number;
    if (useOffsetTable) {
      const offSYAF = u32(v, songBase + 24);  // offset[6] = SYAF
      const offSD8B = u32(v, songBase + 28);   // offset[7] = SD8B (next section)
      numAmfTables = Math.floor((offSD8B - offSYAF) / 128);
      pos = songBase + offSYAF;
    } else if (pos + 4 <= buffer.byteLength && readMark(v, pos) === 'SYAF') {
      pos += 4;
      numAmfTables = u32(v, pos); pos += 4;
    } else {
      numAmfTables = 0;
    }
    if (numAmfTables > 0) syafFileOffset = pos;
    for (let i = 0; i < numAmfTables; i++) {
      const table: number[] = [];
      for (let j = 0; j < 128; j++) {
        table.push(i8(v, pos + j));
      }
      amfTables.push(table);
      pos += 128;
    }
  }

  // ── Build InstrumentConfig list ─────────────────────────────────────────────

  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < numInstruments; i++) {
    const inst = saInstruments[i];
    const id   = i + 1;
    const instrBase = instTableStart + i * 152;
    const chipRam: UADEChipRamInfo = {
      moduleBase: 0,
      moduleSize: bytes.length,
      instrBase,
      instrSize: 152,
      sections: {
        instTable: instTableStart,
        ...(syarFileOffset >= 0 ? { syarBase: syarFileOffset } : {}),
        ...(syafFileOffset >= 0 ? { syafBase: syafFileOffset } : {}),
        numAdsrTables: adsrTables.length,
        numAmfTables: amfTables.length,
      },
    };

    if (!inst.isSynth) {
      // PCM sample instrument
      const pcm = inst.waveformNumber < samplePCM.length ? samplePCM[inst.waveformNumber] : null;

      if (!pcm || pcm.length === 0) {
        instruments.push({
          id, name: inst.name,
          type: 'sample' as const, synthType: 'Sampler' as const,
          effects: [], volume: -60, pan: 0,
          uadeChipRam: chipRam,
        } as unknown as InstrumentConfig);
      } else {
        // Loop logic (from NostalgicPlayer Samples property):
        //   repeatLength == 1: no loop
        //   repeatLength == 0: loop entire sample (LoopStart=0, LoopEnd=pcm.length)
        //   else: LoopStart = waveformLength*2, LoopEnd = waveformLength*2 + repeatLength*2
        let loopStart = 0, loopEnd = 0;
        if (inst.repeatLength !== 1 && inst.waveformLength !== 0) {
          if (inst.repeatLength === 0) {
            loopStart = 0;
            loopEnd   = pcm.length;
          } else {
            loopStart = inst.waveformLength * 2;
            loopEnd   = inst.waveformLength * 2 + inst.repeatLength * 2;
            loopEnd   = Math.min(loopEnd, pcm.length);
          }
        }

        instruments.push({
          // sampleRate = PAL_CLOCK / 214 = 16574 Hz (period 214 = SA note 73 = XM 61 = C5).
          // With rawPeriod stored on cells, the replayer computes:
          //   rate = PAL_CLOCK / rawPeriod / sampleRate
          // e.g. SA note 49 (period 856): rate = 3546895/856/16574 ≈ 0.25 = 2 octaves down from C5.
          ...createSamplerInstrument(id, inst.name, pcm, inst.volume, 16574, loopStart, loopEnd),
          uadeChipRam: chipRam,
        });
      }
    } else {
      // Synth instrument → SonicArrangerSynth with full config
      const wf = inst.waveformNumber < waveformData.length ? waveformData[inst.waveformNumber] : null;

      // Build allWaveforms (all waveform tables as number[][])
      const allWaveforms: number[][] = waveformData.map(wfData =>
        wfData ? Array.from(wfData).map(b => b > 127 ? b - 256 : b) : new Array(128).fill(0)
      );

      const saConfig: SonicArrangerConfig = {
        ...DEFAULT_SONIC_ARRANGER,
        volume: inst.volume,
        fineTuning: inst.fineTuning,
        waveformNumber: inst.waveformNumber,
        waveformLength: inst.waveformLength,
        portamentoSpeed: inst.portamentoSpeed,
        vibratoDelay: inst.vibratoDelay,
        vibratoSpeed: inst.vibratoSpeed,
        vibratoLevel: inst.vibratoLevel,
        amfNumber: inst.amfNumber,
        amfDelay: inst.amfDelay,
        amfLength: inst.amfLength,
        amfRepeat: inst.amfRepeat,
        adsrNumber: inst.adsrNumber,
        adsrDelay: inst.adsrDelay,
        adsrLength: inst.adsrLength,
        adsrRepeat: inst.adsrRepeat,
        sustainPoint: inst.sustainPoint,
        sustainDelay: inst.sustainDelay,
        effect: inst.effect,
        effectArg1: inst.effectArg1,
        effectArg2: inst.effectArg2,
        effectArg3: inst.effectArg3,
        effectDelay: inst.effectDelay,
        arpeggios: inst.arpeggios as SonicArrangerConfig['arpeggios'],
        waveformData: wf ? Array.from(wf).map(b => b > 127 ? b - 256 : b) : new Array(128).fill(0),
        adsrTable: inst.adsrNumber < adsrTables.length ? adsrTables[inst.adsrNumber] : new Array(128).fill(255),
        amfTable: inst.amfNumber < amfTables.length ? amfTables[inst.amfNumber] : new Array(128).fill(0),
        allWaveforms,
        name: inst.name,
      };

      instruments.push({
        id, name: inst.name,
        type: 'synth' as const,
        synthType: 'SonicArrangerSynth' as const,
        effects: [], volume: 0, pan: 0,
        sonicArranger: saConfig,
        uadeChipRam: chipRam,
      } as unknown as InstrumentConfig);
    }
  }

  // ── Effect mapping: SA → XM ──────────────────────────────────────────────
  // SA Effect enum (nibble 0x0-0xF):
  //   0=Arpeggio, 1=SetSlideSpeed, 2=RestartAdsr, 4=SetVibrato, 5=Sync,
  //   6=SetMasterVolume, 7=SetPortamento, 8=SkipPortamento, 9=SetTrackLen,
  //   A=VolumeSlide, B=PositionJump, C=SetVolume, D=TrackBreak, E=SetFilter, F=SetSpeed

  function saEffectToXM(eff: number, arg: number): { effTyp: number; eff: number; volCol: number } {
    let effTyp = 0, effVal = 0, volCol = 0;
    switch (eff) {
      case 0x0:  // Arpeggio
        if (arg !== 0) { effTyp = 0x00; effVal = arg; }
        break;
      // Effects 1, 2, 4, 7, 8, A are routed directly to WASM synth via replayer.
      // They are stored in saEffect/saEffectArg fields, not mapped to XM effects.
      case 0x1:  // SetSlideSpeed — handled by WASM paramId 16
      case 0x2:  // RestartAdsr — handled by WASM paramId 13
      case 0x4:  // SetVibrato — handled by WASM paramId 12
      case 0x7:  // SetPortamento — handled by WASM paramId 15
      case 0x8:  // SkipPortamento — handled by WASM paramId 14
      case 0xA:  // VolumeSlide — handled by WASM paramId 17
        break;  // no XM mapping; raw values stored in TrackerCell.saEffect/saEffectArg
      case 0x6:  // SetMasterVolume → XM Gxx (global volume)
        effTyp = 0x10; effVal = Math.min(arg, 64);
        break;
      case 0xB:  // PositionJump → XM Bxx
        effTyp = 0x0B; effVal = arg;
        break;
      case 0xC:  // SetVolume → volume column
        volCol = 0x10 + Math.min(arg, 64);
        break;
      case 0xD:  // TrackBreak → XM Dxx (pattern break)
        effTyp = 0x0D; effVal = 0;
        break;
      case 0xE:  // SetFilter → XM E0x
        effTyp = 0x0E; effVal = arg & 0x01;
        break;
      case 0xF:  // SetSpeed → XM Fxx
        effTyp = 0x0F; effVal = arg;
        break;
      // 5=Sync, 9=SetTrackLen → no XM equivalent
      default: break;
    }
    return { effTyp, eff: effVal, volCol };
  }

  // ── Build patterns ──────────────────────────────────────────────────────────
  // Each position in the order list becomes one Pattern.
  // The song order is positions[firstPosition..lastPosition] (inclusive).
  //
  // SA's SetTrackLen (effect 9) dynamically changes the global pattern length
  // at runtime. We simulate this by pre-scanning track data to find the
  // effective length for each position, tracking the running trackLen state
  // across positions in song order (firstPosition..lastPosition).
  //
  // SoundTranspose: each channel in a position has a signed offset that is
  // added to the instrument number (unless the track row disables it).

  const defaultRowsPerTrack = Math.max(1, song.rowsPerTrack);
  const PANNING = [-50, 50, 50, -50] as const;  // Amiga LRRL
  const first = Math.min(song.firstPosition, positions.length - 1);
  const last  = Math.min(song.lastPosition,  positions.length - 1);

  // Pre-scan: determine effective track length for each position in song order.
  // SetTrackLen (effect 9) persists across positions (global state), so we scan
  // in playback order and propagate the running length.
  //
  // SA row advancement: after processing row N, counter becomes N+1.
  // If N+1 >= RowsPerTrack, the position ends. Effect 9 on row N changes
  // RowsPerTrack immediately, affecting the check for that same row.
  const positionTrackLen: Map<number, number> = new Map();
  let runningTrackLen = defaultRowsPerTrack;

  for (let pidx = first; pidx <= last; pidx++) {
    const posEntry = positions[pidx];
    if (!posEntry) continue;

    // Simulate row-by-row with effect 9 handling
    let currentLen = runningTrackLen;
    let actualRows = 0;

    for (let row = 0; row < 128; row++) {  // 128 = max possible (safety cap)
      // Check all 4 channels on this row for effect 9
      for (let ch = 0; ch < 4; ch++) {
        const tlidx = posEntry[ch].startTrackRow + row;
        if (tlidx < trackLines.length) {
          const tl = trackLines[tlidx];
          if (tl.effect === 0x9 && tl.effArg > 0 && tl.effArg <= 64) {
            currentLen = tl.effArg;
          }
        }
      }
      actualRows = row + 1;

      // After processing this row, check: row+1 >= currentLen → end of position
      if (row + 1 >= currentLen) break;
    }

    positionTrackLen.set(pidx, actualRows);
    runningTrackLen = currentLen;  // propagate for next position
  }

  // Also pre-compute for positions outside the song range (use default)
  for (let pidx = 0; pidx < positions.length; pidx++) {
    if (!positionTrackLen.has(pidx)) {
      positionTrackLen.set(pidx, defaultRowsPerTrack);
    }
  }

  // We build a pattern for EVERY position in positions[], then build the song order
  const builtPatterns: Pattern[] = [];

  for (let pidx = 0; pidx < positions.length; pidx++) {
    const posEntry = positions[pidx];
    const trackLen = positionTrackLen.get(pidx) ?? defaultRowsPerTrack;

    const channels: ChannelData[] = Array.from({ length: 4 }, (_, ch) => {
      const posCh   = posEntry[ch];
      const rowBase = posCh.startTrackRow;
      const noteTranspose  = posCh.noteTranspose;
      const soundTranspose = posCh.soundTranspose;

      const rows: TrackerCell[] = [];

      for (let row = 0; row < trackLen; row++) {
        const tlidx = rowBase + row;
        const tl    = tlidx < trackLines.length ? trackLines[tlidx] : null;

        if (!tl || (tl.note === 0 && tl.instr === 0 && tl.effect === 0 && tl.effArg === 0)) {
          rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0, saArpTable: tl?.arpeggioTable ?? 0, saEffect: 0, saEffectArg: 0 });
          continue;
        }

        // Note: apply NoteTranspose unless disabled
        let xmNote = saNote2XM(tl.note);
        if (xmNote > 0 && xmNote < 97 && !tl.disableNoteTranspose && noteTranspose !== 0) {
          xmNote = Math.max(1, Math.min(96, xmNote + noteTranspose));
        }

        // SA 0x7F = force quiet: note-off + volume 0
        const isForceQuiet = tl.note === 0x7F;

        // Instrument: apply SoundTranspose unless disabled
        let instrNum = tl.instr > 0 ? tl.instr : 0;
        if (instrNum > 0 && !tl.disableSoundTranspose && soundTranspose !== 0) {
          instrNum = instrNum + soundTranspose;
          if (instrNum < 1) instrNum = 0;  // invalid → no instrument
        }

        let { effTyp, eff: effVal, volCol } = saEffectToXM(tl.effect, tl.effArg);

        // Force quiet (SA 0x7F) → set volume to 0 (XM vol column 0x10 = vol 0)
        if (isForceQuiet && volCol === 0) {
          volCol = 0x10; // volume 0
        }

        // Adjust PositionJump (Bxx) arg relative to firstPosition offset
        // SA position args are absolute; our songPositions start at firstPosition
        if (effTyp === 0x0B && first > 0) {
          effVal = Math.max(0, effVal - first);
        }

        // Store real SA Amiga period so the replayer uses it directly
        // instead of the broken noteToPeriod MOD mapping (fixes sample pitch).
        const saPeriod = saNotePeriod(xmNote);

        rows.push({
          note:       xmNote,
          instrument: instrNum,
          volume:     volCol,
          effTyp,
          eff:        effVal,
          effTyp2: 0,
          eff2:    0,
          ...(saPeriod ? { period: saPeriod } : {}),
          saArpTable: tl.arpeggioTable,
          saEffect: tl.effect,
          saEffectArg: tl.effArg,
        });
      }

      return {
        id:           `channel-${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          PANNING[ch],
        instrumentId: null,
        color:        null,
        rows,
      };
    });

    builtPatterns.push({
      id:       `pattern-${pidx}`,
      name:     `Pattern ${pidx}`,
      length:   trackLen,
      channels,
      importMetadata: {
        sourceFormat:          'SonicArranger',
        sourceFile:            filename,
        importedAt:            new Date().toISOString(),
        originalChannelCount:  4,
        originalPatternCount:  positions.length,
        originalInstrumentCount: numInstruments,
      },
    });
  }

  // Fallback: at least one empty pattern
  if (builtPatterns.length === 0) {
    builtPatterns.push({
      id: 'pattern-0', name: 'Pattern 0', length: 64,
      channels: Array.from({ length: 4 }, (_, ch) => ({
        id: `channel-${ch}`, name: `Channel ${ch + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100, pan: PANNING[ch], instrumentId: null, color: null,
        rows: Array.from({ length: 64 }, (): TrackerCell => ({
          note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        })),
      })),
      importMetadata: {
        sourceFormat: 'SonicArranger', sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4, originalPatternCount: 0, originalInstrumentCount: 0,
      },
    });
  }

  // ── Song order ──────────────────────────────────────────────────────────────
  // first/last already computed above for the pre-scan; reuse them.
  const songPositions: number[] = [];
  for (let p = first; p <= last; p++) songPositions.push(p);
  if (songPositions.length === 0) songPositions.push(0);

  // ── Tempo/BPM ───────────────────────────────────────────────────────────────
  // SA Tempo = Hz value. BPM = tempo * 125 / 50 (from UADE ASM: mulu #125 / divu #50)
  const initialBPM = song.tempo > 0
    ? Math.max(32, Math.min(255, Math.round(song.tempo * 125 / 50)))
    : 125;

  const restartPos = Math.min(
    Math.max(0, song.restartPosition - first),
    songPositions.length - 1,
  );

  const moduleName = filename.replace(/\.[^/.]+$/, '');

  // Build uadePatternLayout with getCellFileOffset for NTBL track indirection
  const uadePatternLayout: UADEPatternLayout = {
    formatId: 'sonicArranger',
    patternDataFileOffset: ntblDataOffset,
    bytesPerCell: 4,
    rowsPerPattern: defaultRowsPerTrack,
    numChannels: 4,
    numPatterns: builtPatterns.length,
    moduleSize: buffer.byteLength,
    encodeCell: encodeSonicArrangerCell,
    decodeCell: (raw: Uint8Array): TrackerCell => {
      const b0 = raw[0]; // note
      const b1 = raw[1]; // instrument
      const b2 = raw[2]; // flags + arp + effect
      const b3 = raw[3]; // effect arg

      let note = 0;
      if (b0 === 0x7F || b0 === 0x80) {
        note = 97; // note-off
      } else if (b0 > 0) {
        const xm = b0 - 36;
        note = (xm >= 1 && xm <= 96) ? xm : 0;
      }
      const instrument = b1;
      const effect = b2 & 0x0F;
      const { effTyp, eff, volCol } = saEffectToXM(effect, b3);
      return { note, instrument, volume: volCol, effTyp, eff, effTyp2: 0, eff2: 0 };
    },
    getCellFileOffset: (pattern: number, row: number, channel: number): number => {
      const posEntry = positions[pattern];
      if (!posEntry) return 0;
      const startRow = posEntry[channel].startTrackRow;
      const rowIdx = startRow + row;
      if (rowIdx < 0 || rowIdx >= numTrackRows) return 0;
      return ntblDataOffset + rowIdx * 4;
    },
  };

  return {
    name:            moduleName,
    format:          'MOD' as TrackerFormat,
    patterns:        builtPatterns,
    instruments,
    songPositions,
    songLength:      songPositions.length,
    restartPosition: restartPos,
    numChannels:     4,
    initialSpeed:    Math.max(1, song.startSpeed),
    initialBPM,
    linearPeriods:   false,
    // Only use dedicated WASM replayer for SOARV1.0 chunk format;
    // 4EFA player binaries need UADE's 68k emulation
    ...(useOffsetTable ? {} : { sonicArrangerFileData: buffer.slice(0) as ArrayBuffer }),
    uadePatternLayout,
  };
}
