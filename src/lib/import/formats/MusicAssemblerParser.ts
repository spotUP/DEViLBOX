/**
 * MusicAssemblerParser.ts — Music Assembler native parser
 *
 * Music Assembler is a 4-channel Amiga tracker format. It has no magic bytes;
 * instead it is identified by scanning M68k 68000 player bytecode for known
 * assembler instruction sequences.
 *
 * Reference: NostalgicPlayer MusicAssemblerWorker.cs (authoritative loader/replayer)
 *
 * Identification (TestModule):
 *   bytes[0]=0x60, bytes[1]=0x00, bytes[4]=0x60, bytes[5]=0x00,
 *   bytes[8]=0x60, bytes[9]=0x00, bytes[12]=0x48, bytes[13]=0xe7
 *   + ExtractInfoFromInitFunction succeeds
 *   + ExtractInfoFromPlayFunction succeeds
 *
 * Offset extraction (mirrors ExtractInfoFromInitFunction + ExtractInfoFromPlayFunction):
 *   startOfInit = s16(bytes[2..3]) + 2
 *   CMPI.W (0xb0 0x7c) → subSongCount from next 2 bytes
 *   LEA.L pc-rel1 (0x49 0xfa) → subSongSpeedOffset = s16(disp) + index + 2
 *   LEA.L pc-rel2 (0x49 0xfb) → subSongPositionListOffset = s8(byte3) + index + 2
 *   startOfPlay = 0x0c
 *   LEA.L (0x43 0xfa) → moduleStartOffset = s16(disp) + index + 2
 *   ADDA.L (0xd3 0xfa) → instrumentInfoOffsetOffset = s16(disp) + index + 2
 *   ADDA.L (0xd5 0xfa) → sampleInfoOffsetOffset = s16(disp) + index + 6
 *   BSR.B (0x61) → index = s8(byte1) + index + 2, then scan for ADDA.L (0xdb 0xfa)
 *   → tracksOffsetOffset = s16(disp) + index + 2
 *
 * Channel map: [0, 3, 1, 2] (non-linear Amiga LRRL assignment)
 *
 * Period table: 48 entries (4 octaves × 12 notes). Index 12 = 856 = XM C-3.
 *   xmNote = 37 + (maNoteIdx - 12)
 *
 * Position list: 2 bytes per entry. Terminated by TrackNumber 0xff or 0xfe.
 *   byte0 = TrackNumber
 *   byte1 encodes: val = (byte1 << 4) & 0xffff
 *     transpose     = (val >> 8) & 0xff
 *     repeatRaw     = (val & 0xff) >> 1
 *     repeatCounter = s8(repeatRaw)
 *
 * Track encoding: variable-length, 2–4 bytes per event. Terminated by 0xff.
 *   if (b0 & 0x80):
 *     if (b0 & 0x40): read b1, b2. if (b2 & 0x80): read b3.  → 3 or 4 bytes
 *     else: (just b0, done for this event)                     → 1 byte
 *   else:
 *     read b1. if (b1 & 0x80): read b2.                        → 2 or 3 bytes
 *
 * Sample info: 24 bytes per sample
 *   offset(s32BE) + length(u16BE) + loopLength(u16BE) + name(16 bytes)
 *   Length and loopLength are in words (multiply by 2 for bytes).
 *   length <= 128 words → synthesis (no PCM); length > 128 words → PCM sample.
 *   Loop: loopStart = (length - loopLength) * 2, loopLength * 2 bytes.
 *
 * Instrument info: 16 bytes per instrument (12 fields + 4 pad)
 *   SampleNumber(1), Attack(1), Decay_Sustain(1), VibratoDelay(1),
 *   Release(1), VibratoSpeed(1), VibratoLevel(1), Arpeggio(1),
 *   FxArp_SpdLp(1), Hold(1), Key_WaveRate(1), WaveLevel_Speed(1),
 *   pad(4)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Constants ─────────────────────────────────────────────────────────────

/** PAL Amiga clock frequency (Hz) */
const PAL_CLOCK = 3546895;

/**
 * Music Assembler period table — 48 entries (4 octaves × 12 notes).
 * Index 12 = 856 (Amiga C-3 / XM C-3 = note 37).
 * Copied verbatim from NostalgicPlayer MusicAssembler/Tables.cs.
 */
const MA_PERIODS: number[] = [
  1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016,  960,  906,
   856,  808,  762,  720,  678,  640,  604,  570,  538,  508,  480,  453,
   428,  404,  381,  360,  339,  320,  302,  285,  269,  254,  240,  226,
   214,  202,  190,  180,  170,  160,  151,  143,  135,  127,  120,  113,
];

/**
 * Index in MA_PERIODS corresponding to XM note 37 (C-3, period 856).
 */
const MA_REFERENCE_IDX = 12; // MA_PERIODS[12] = 856

/**
 * XM note number for the MA reference period.
 */
const XM_REFERENCE_NOTE = 37;

/**
 * Channel map from MusicAssemblerWorker.cs Tables.ChannelMap.
 * Maps voice index → actual Amiga channel (LRRL hard stereo).
 */
const CHANNEL_MAP = [0, 3, 1, 2];

/**
 * PAL sample rate at Amiga C-3 (period 214): 3546895 / (2 × 214) ≈ 8287 Hz.
 */
const PCM_BASE_RATE = Math.round(PAL_CLOCK / (2 * 214)); // 8287 Hz

// ── Utility ────────────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function s16(buf: Uint8Array, off: number): number {
  const v = (buf[off] << 8) | buf[off + 1];
  return v < 0x8000 ? v : v - 0x10000;
}

function s32BE(buf: Uint8Array, off: number): number {
  const v = ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]);
  return v;
}

function s8v(v: number): number {
  return v < 128 ? v : v - 256;
}

/** Convert Music Assembler note index → XM note (0 = no note). */
function maNoteToXM(n: number): number {
  if (n === 0) return 0;
  return XM_REFERENCE_NOTE + (n - MA_REFERENCE_IDX);
}

/** Decode a null-terminated Amiga Latin-1 string from buf[off..off+len). */
function readString(buf: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = buf[off + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

// ── Offset extraction (mirrors MusicAssemblerWorker.cs) ──────────────────

interface ExtractedOffsets {
  subSongCount: number;
  subSongSpeedOffset: number;
  subSongPositionListOffset: number;
  moduleStartOffset: number;
  instrumentInfoOffsetOffset: number;
  sampleInfoOffsetOffset: number;
  tracksOffsetOffset: number;
}

/**
 * Extract all data offsets from the M68k player bytecode.
 * Returns null if the file doesn't match the Music Assembler player signature.
 */
function extractOffsets(buf: Uint8Array): ExtractedOffsets | null {
  const searchLength = buf.length;

  // ── ExtractInfoFromInitFunction ─────────────────────────────────────────
  // Find init function start: signed 16-bit displacement at bytes[2..3] + 2
  const startOfInit = s16(buf, 2) + 2;
  if (startOfInit < 0 || startOfInit >= searchLength) return null;

  let index = startOfInit;

  // Find CMPI.W (0xb0 0x7c) — compare immediate word to register
  while (index < searchLength - 4) {
    if (buf[index] === 0xb0 && buf[index + 1] === 0x7c) break;
    index += 2;
  }
  if (index >= searchLength - 4) return null;

  const subSongCount = (buf[index + 2] << 8) | buf[index + 3];
  index += 4;

  // Find LEA.L pc-relative (0x49 0xfa) → subSongSpeedOffset
  while (index < searchLength - 4) {
    if (buf[index] === 0x49 && buf[index + 1] === 0xfa) break;
    index += 2;
  }
  if (index >= searchLength - 4) return null;

  const subSongSpeedOffset = s16(buf, index + 2) + index + 2;
  index += 4;

  // Find LEA.L pc-relative2 (0x49 0xfb) → subSongPositionListOffset
  // displacement is only 1 byte (signed byte at index+3)
  while (index < searchLength - 4) {
    if (buf[index] === 0x49 && buf[index + 1] === 0xfb) break;
    index += 2;
  }
  if (index >= searchLength - 4) return null;

  const subSongPositionListOffset = s8v(buf[index + 3]) + index + 2;

  // ── ExtractInfoFromPlayFunction ─────────────────────────────────────────
  // Start scanning from 0x0c (the play function entry)
  const startOfPlay = 0x0c;
  index = startOfPlay;

  // Find LEA.L (0x43 0xfa) → moduleStartOffset
  while (index < searchLength - 4) {
    if (buf[index] === 0x43 && buf[index + 1] === 0xfa) break;
    index += 2;
  }
  if (index >= searchLength - 4) return null;

  const moduleStartOffset = s16(buf, index + 2) + index + 2;
  index += 4;

  // Find ADDA.L (0xd3 0xfa) → instrumentInfoOffsetOffset
  while (index < searchLength - 8) {
    if (buf[index] === 0xd3 && buf[index + 1] === 0xfa) break;
    index += 2;
  }
  if (index >= searchLength - 8) return null;

  const instrumentInfoOffsetOffset = s16(buf, index + 2) + index + 2;

  // Next instruction must be ADDA.L (0xd5 0xfa) → sampleInfoOffsetOffset
  if (buf[index + 4] !== 0xd5 || buf[index + 5] !== 0xfa) return null;
  const sampleInfoOffsetOffset = s16(buf, index + 6) + index + 6;
  index += 8;

  // Find BSR.B (0x61) — branch to subroutine with 8-bit displacement
  while (index < searchLength - 2) {
    if (buf[index] === 0x61) break;
    index += 2;
  }
  if (index >= searchLength - 2) return null;

  // Follow branch: displacement is signed byte at index+1; new index = s8(disp) + index + 2
  index = s8v(buf[index + 1]) + index + 2;
  if (index < 0 || index >= searchLength) return null;

  // Find ADDA.L (0xdb 0xfa) → tracksOffsetOffset
  while (index < searchLength - 4) {
    if (buf[index] === 0xdb && buf[index + 1] === 0xfa) break;
    index += 2;
  }
  if (index >= searchLength - 4) return null;

  const tracksOffsetOffset = s16(buf, index + 2) + index + 2;

  return {
    subSongCount,
    subSongSpeedOffset,
    subSongPositionListOffset,
    moduleStartOffset,
    instrumentInfoOffsetOffset,
    sampleInfoOffsetOffset,
    tracksOffsetOffset,
  };
}

// ── Format Identification ──────────────────────────────────────────────────

/**
 * Returns true if `bytes` appears to be a Music Assembler module.
 * Checks M68k player code signature, then attempts full offset extraction.
 */
export function isMusicAssemblerFormat(bytes: Uint8Array): boolean {
  if (bytes.length < 0x622) return false;

  // Check mandatory M68k bytecode sequence at fixed positions
  if (
    bytes[0]  !== 0x60 || bytes[1]  !== 0x00 ||
    bytes[4]  !== 0x60 || bytes[5]  !== 0x00 ||
    bytes[8]  !== 0x60 || bytes[9]  !== 0x00 ||
    bytes[12] !== 0x48 || bytes[13] !== 0xe7
  ) return false;

  // Use a 0x700-byte search window (matching MusicAssemblerWorker.cs)
  const searchBuf = bytes.length >= 0x700 ? bytes.subarray(0, 0x700) : bytes;
  return extractOffsets(searchBuf) !== null;
}

// ── Parser ─────────────────────────────────────────────────────────────────

/**
 * Parse a Music Assembler (.ma) module into a TrackerSong.
 * Returns null if the file is not valid or cannot be parsed.
 */
export function parseMusicAssemblerFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  try {
    return parseMusicAssembler(bytes, filename);
  } catch {
    return null;
  }
}

// ── Position list ──────────────────────────────────────────────────────────

interface MAPositionEntry {
  trackNumber: number;
  transpose: number;
  repeatCounter: number;
}

function loadPositionList(bytes: Uint8Array, off: number): MAPositionEntry[] | null {
  const list: MAPositionEntry[] = [];
  for (;;) {
    if (off + 2 > bytes.length) return null;
    const trackNumber = bytes[off++];
    const rawByte     = bytes[off++];

    // From LoadSinglePositionList in MusicAssemblerWorker.cs:
    //   ushort val = (ushort)(byt << 4);
    //   byt = (byte)((val & 0xff) >> 1);
    //   posInfo.Transpose = (byte)(val >> 8);
    //   posInfo.RepeatCounter = (sbyte)byt;
    const val       = (rawByte << 4) & 0xffff;
    const transpose = (val >> 8) & 0xff;
    const repeatRaw = (val & 0xff) >> 1;
    const repeatCounter = s8v(repeatRaw);

    list.push({ trackNumber, transpose, repeatCounter });

    if (trackNumber === 0xff || trackNumber === 0xfe) break;
  }
  return list;
}

// ── Track loader ────────────────────────────────────────────────────────────

function loadSingleTrack(bytes: Uint8Array, off: number): Uint8Array | null {
  const trackBytes: number[] = [];

  for (;;) {
    if (off >= bytes.length) return null;
    let byt = bytes[off++];
    trackBytes.push(byt);

    if ((byt & 0x80) !== 0) {
      if ((byt & 0x40) !== 0) {
        // Read b1
        if (off >= bytes.length) return null;
        byt = bytes[off++];
        trackBytes.push(byt);
        // Read b2
        if (off >= bytes.length) return null;
        byt = bytes[off++];
        trackBytes.push(byt);
        // Optionally read b3
        if ((byt & 0x80) !== 0) {
          if (off >= bytes.length) return null;
          byt = bytes[off++];
          trackBytes.push(byt);
        }
      }
      // else: high-bit set but not bit 6 → just the 1 byte already pushed
    } else {
      // Read b1
      if (off >= bytes.length) return null;
      byt = bytes[off++];
      trackBytes.push(byt);
      // Optionally read b2
      if ((byt & 0x80) !== 0) {
        if (off >= bytes.length) return null;
        byt = bytes[off++];
        trackBytes.push(byt);
      }
    }

    // Peek next byte for end-of-track check
    if (off >= bytes.length) return null;
    const nextByte = bytes[off];
    if (nextByte === 0xff) {
      trackBytes.push(nextByte);
      off++;
      break;
    }
    // Not end — continue reading (nextByte is the first byte of the next event)
  }

  return new Uint8Array(trackBytes);
}

// ── Decode a single track into rows ─────────────────────────────────────────

interface MATrackRow {
  note: number;       // MA note index (0 = no note)
  instrument: number; // instrument index (1-based, 0 = none)
  speed: number;      // new speed (0 = no change)
}

function decodeTrack(track: Uint8Array): MATrackRow[] {
  const rows: MATrackRow[] = [];
  let off = 0;

  while (off < track.length) {
    const b0 = track[off++];
    if (b0 === 0xff) break;

    let note = 0;
    let instrument = 0;
    let speed = 0;

    if ((b0 & 0x80) !== 0) {
      if ((b0 & 0x40) !== 0) {
        // 3-byte or 4-byte event
        // b0 has note encoded in lower bits
        note = b0 & 0x3f;
        if (off >= track.length) break;
        const b1 = track[off++]; // instrument
        instrument = b1 & 0x7f;
        if (off >= track.length) break;
        const b2 = track[off++]; // flags / speed
        if ((b2 & 0x80) !== 0) {
          // 4th byte
          if (off >= track.length) break;
          const b3 = track[off++];
          speed = b3;
        }
        // b2 low bits may encode additional info (ignored for static import)
        void b2;
      } else {
        // 1-byte event: just delay / empty row marker
        // no note, no instrument
      }
    } else {
      // 2-byte or 3-byte event
      note = b0 & 0x3f;
      if (off >= track.length) break;
      const b1 = track[off++];
      instrument = b1 & 0x7f;
      if ((b1 & 0x80) !== 0) {
        // 3rd byte: speed
        if (off >= track.length) break;
        speed = track[off++];
      }
    }

    rows.push({ note, instrument, speed });
  }

  return rows;
}

// ── Main parser ─────────────────────────────────────────────────────────────

function parseMusicAssembler(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isMusicAssemblerFormat(bytes)) return null;

  // Use 0x700-byte search window for offset extraction
  const searchBuf = bytes.length >= 0x700 ? bytes.subarray(0, 0x700) : bytes;
  const offsets = extractOffsets(searchBuf);
  if (!offsets) return null;

  const {
    subSongCount,
    subSongSpeedOffset,
    subSongPositionListOffset,
    moduleStartOffset,
    instrumentInfoOffsetOffset,
    sampleInfoOffsetOffset,
    tracksOffsetOffset,
  } = offsets;

  if (subSongCount <= 0 || subSongCount > 256) return null;

  // ── Load sub-song speed list ─────────────────────────────────────────────
  if (subSongSpeedOffset + subSongCount > bytes.length) return null;
  const speedList = bytes.subarray(subSongSpeedOffset, subSongSpeedOffset + subSongCount);

  // ── Load sub-song position list offsets ─────────────────────────────────
  // Each sub-song has 4 position list offsets (one per voice), each u16 BE
  // Layout: subSongCount * 4 entries of u16 BE
  const posListTableOff = subSongPositionListOffset;
  if (posListTableOff + subSongCount * 4 * 2 > bytes.length) return null;

  interface MASongInfo {
    startSpeed: number;
    positionListOffsets: number[]; // 4 offsets (relative to moduleStartOffset)
  }
  const subSongs: MASongInfo[] = [];

  for (let i = 0; i < subSongCount; i++) {
    const base = posListTableOff + i * 8; // 4 × u16BE = 8 bytes per sub-song
    const pl0 = u16BE(bytes, base + 0);
    const pl1 = u16BE(bytes, base + 2);
    const pl2 = u16BE(bytes, base + 4);
    const pl3 = u16BE(bytes, base + 6);

    // Filter out dummy sub-songs (consecutive offsets = empty sub-song)
    if ((pl0 + 2) === pl1 && (pl1 + 2) === pl2 && (pl2 + 2) === pl3) continue;

    subSongs.push({
      startSpeed: speedList[i] || 6,
      positionListOffsets: [pl0, pl1, pl2, pl3],
    });
  }

  if (subSongs.length === 0) return null;

  // ── Load all unique position lists ──────────────────────────────────────
  const positionListCache = new Map<number, MAPositionEntry[]>();

  for (const song of subSongs) {
    for (const plOff of song.positionListOffsets) {
      if (positionListCache.has(plOff)) continue;
      const absOff = moduleStartOffset + plOff;
      if (absOff >= bytes.length) continue;
      const pl = loadPositionList(bytes, absOff);
      if (pl) positionListCache.set(plOff, pl);
    }
  }

  // ── Determine number of tracks ─────────────────────────────────────────
  let maxTrackNumber = 0;
  for (const pl of positionListCache.values()) {
    for (const entry of pl) {
      if (entry.trackNumber !== 0xff && entry.trackNumber !== 0xfe) {
        if (entry.trackNumber > maxTrackNumber) maxTrackNumber = entry.trackNumber;
      }
    }
  }
  const numberOfTracks = maxTrackNumber + 1;

  // ── Load tracks start offset ────────────────────────────────────────────
  if (tracksOffsetOffset + 4 > bytes.length) return null;
  const tracksRelOffset = s32BE(bytes, tracksOffsetOffset);
  const tracksStartOffset = tracksRelOffset + moduleStartOffset;

  // ── Load track offset table ─────────────────────────────────────────────
  // Track offsets are stored at moduleStartOffset as u16 BE table
  if (moduleStartOffset + numberOfTracks * 2 > bytes.length) return null;
  const trackOffsetTable: number[] = [];
  for (let i = 0; i < numberOfTracks; i++) {
    trackOffsetTable.push(u16BE(bytes, moduleStartOffset + i * 2));
  }

  // ── Load each track ─────────────────────────────────────────────────────
  const tracks: (Uint8Array | null)[] = new Array(numberOfTracks).fill(null);
  for (let i = 0; i < numberOfTracks; i++) {
    const trackOff = tracksStartOffset + trackOffsetTable[i];
    if (trackOff < 0 || trackOff >= bytes.length) continue;
    tracks[i] = loadSingleTrack(bytes, trackOff);
  }

  // ── Decode tracks into rows ─────────────────────────────────────────────
  const decodedTracks: MATrackRow[][] = tracks.map(t => t ? decodeTrack(t) : []);

  // ── Load instrument info ─────────────────────────────────────────────────
  if (instrumentInfoOffsetOffset + 4 > bytes.length) return null;
  const instrStartRel = s32BE(bytes, instrumentInfoOffsetOffset);
  if (sampleInfoOffsetOffset + 4 > bytes.length) return null;
  const sampleStartRel = s32BE(bytes, sampleInfoOffsetOffset);

  const numberOfInstruments = (sampleStartRel - instrStartRel) / 16;
  if (numberOfInstruments < 0 || numberOfInstruments > 256) return null;

  const instrAbsOff = moduleStartOffset + instrStartRel;
  if (instrAbsOff + numberOfInstruments * 16 > bytes.length) return null;

  interface MAInstrument {
    sampleNumber: number;
    attack: number;
    decaySustain: number;
    vibratoDelay: number;
    release: number;
    vibratoSpeed: number;
    vibratoLevel: number;
    arpeggio: number;
    fxArpSpdLp: number;
    hold: number;
    keyWaveRate: number;
    waveLevelSpeed: number;
  }
  const instruments: MAInstrument[] = [];
  for (let i = 0; i < numberOfInstruments; i++) {
    const base = instrAbsOff + i * 16;
    instruments.push({
      sampleNumber:  bytes[base + 0],
      attack:        bytes[base + 1],
      decaySustain:  bytes[base + 2],
      vibratoDelay:  bytes[base + 3],
      release:       bytes[base + 4],
      vibratoSpeed:  bytes[base + 5],
      vibratoLevel:  bytes[base + 6],
      arpeggio:      bytes[base + 7],
      fxArpSpdLp:    bytes[base + 8],
      hold:          bytes[base + 9],
      keyWaveRate:   bytes[base + 10],
      waveLevelSpeed: bytes[base + 11],
      // bytes[base+12..15] = padding (4 bytes)
    });
  }

  // ── Load sample info ─────────────────────────────────────────────────────
  const sampleAbsOff = moduleStartOffset + sampleStartRel;

  // Number of samples: (min positionList offset + moduleStartOffset - sampleAbsOff) / 24
  // From MusicAssemblerWorker.cs:
  //   int numberOfSamples = (positionLists.Keys.Min() + moduleStartOffset - sampleStartOffset) / 24;
  let minPosListOffset = Infinity;
  for (const k of positionListCache.keys()) {
    if (k < minPosListOffset) minPosListOffset = k;
  }
  if (!isFinite(minPosListOffset)) return null;

  const numberOfSamples = Math.floor((minPosListOffset + moduleStartOffset - sampleAbsOff) / 24);
  if (numberOfSamples < 0 || numberOfSamples > 256) return null;
  if (sampleAbsOff + numberOfSamples * 24 > bytes.length) return null;

  interface MASample {
    name: string;
    dataOffset: number; // absolute byte offset into `bytes`, or -1 if no data
    lengthWords: number;
    loopLengthWords: number;
  }
  const sampleInfos: MASample[] = [];

  for (let i = 0; i < numberOfSamples; i++) {
    const base = sampleAbsOff + i * 24;
    const relOff    = s32BE(bytes, base + 0);
    const lengthW   = u16BE(bytes, base + 4);
    const loopW     = u16BE(bytes, base + 6);
    const name      = readString(bytes, base + 8, 16);

    const dataOff = relOff < 0 ? -1 : sampleAbsOff + relOff;

    sampleInfos.push({
      name,
      dataOffset: dataOff,
      lengthWords: lengthW,
      loopLengthWords: loopW,
    });
  }

  // ── Build InstrumentConfigs ─────────────────────────────────────────────
  const instrumentConfigs: InstrumentConfig[] = [];

  for (let i = 0; i < numberOfInstruments; i++) {
    const instr   = instruments[i];
    const instrId = i + 1;
    const sIdx    = instr.sampleNumber;

    if (sIdx >= numberOfSamples || sampleInfos[sIdx].dataOffset < 0) {
      // No sample data — placeholder
      instrumentConfigs.push({
        id:         instrId,
        name:       `Instrument ${instrId}`,
        type:       'synth' as const,
        synthType:  'Synth' as const,
        effects:    [],
        volume:     0,
        pan:        0,
        oscillator: { type: 'sawtooth' as const, detune: 0, octave: 0 },
      } as InstrumentConfig);
      continue;
    }

    const si = sampleInfos[sIdx];

    if (si.lengthWords > 1 && si.lengthWords <= 128) {
      // Synthesis wavetable — no real PCM; create synth placeholder
      instrumentConfigs.push({
        id:         instrId,
        name:       si.name || `Instrument ${instrId}`,
        type:       'synth' as const,
        synthType:  'Synth' as const,
        effects:    [],
        volume:     0,
        pan:        0,
        oscillator: { type: 'sawtooth' as const, detune: 0, octave: 0 },
      } as InstrumentConfig);
    } else if (si.lengthWords > 128) {
      // PCM sample
      const lengthBytes = si.lengthWords * 2;
      const dataOff     = si.dataOffset;

      if (dataOff + lengthBytes > bytes.length) {
        instrumentConfigs.push({
          id:         instrId,
          name:       si.name || `Instrument ${instrId}`,
          type:       'synth' as const,
          synthType:  'Synth' as const,
          effects:    [],
          volume:     0,
          pan:        0,
          oscillator: { type: 'sawtooth' as const, detune: 0, octave: 0 },
        } as InstrumentConfig);
        continue;
      }

      const pcm = bytes.slice(dataOff, dataOff + lengthBytes);

      // Loop: loopStart = (lengthWords - loopLengthWords) * 2 bytes from start
      let loopStart = 0;
      let loopEnd   = 0;
      if (si.loopLengthWords !== 0) {
        loopStart = (si.lengthWords - si.loopLengthWords) * 2;
        loopEnd   = loopStart + si.loopLengthWords * 2;
      }

      instrumentConfigs.push(
        createSamplerInstrument(instrId, si.name || `Sample ${sIdx}`, pcm, 64, PCM_BASE_RATE, loopStart, loopEnd)
      );
    } else {
      // Length == 0 or 1 → empty
      instrumentConfigs.push({
        id:         instrId,
        name:       si.name || `Instrument ${instrId}`,
        type:       'synth' as const,
        synthType:  'Synth' as const,
        effects:    [],
        volume:     0,
        pan:        0,
        oscillator: { type: 'sawtooth' as const, detune: 0, octave: 0 },
      } as InstrumentConfig);
    }
  }

  // ── Build patterns ──────────────────────────────────────────────────────
  // Use sub-song 0 as the primary song.
  const primarySong = subSongs[0];
  if (!primarySong) return null;

  // Amiga hard stereo panning (LRRL): channels 0,3 = left; 1,2 = right
  const CHANNEL_PAN = [-50, 50, 50, -50];

  // Collect the position lists for this sub-song in channel-map order
  const voicePosLists: MAPositionEntry[][] = [];
  for (let v = 0; v < 4; v++) {
    const plOff = primarySong.positionListOffsets[CHANNEL_MAP[v]];
    const pl    = positionListCache.get(plOff);
    voicePosLists.push(pl ?? []);
  }

  // Determine song length (max position count across all 4 voices, excluding terminators)
  const voicePositionCounts = voicePosLists.map(pl =>
    pl.filter(e => e.trackNumber !== 0xff && e.trackNumber !== 0xfe).length
  );
  const maxPositions = Math.max(...voicePositionCounts, 0);

  // Determine how many rows are in each track (scan the decoded tracks)
  function trackRowCount(trackIdx: number): number {
    if (trackIdx >= decodedTracks.length) return 16;
    return Math.max(decodedTracks[trackIdx].length, 1);
  }

  // Build one pattern per position slot
  const patterns: Pattern[] = [];
  const songPositions: number[] = [];

  for (let posIdx = 0; posIdx < maxPositions; posIdx++) {
    // Determine pattern length = max rows across the 4 voices at this position
    let patternLen = 16;
    for (let v = 0; v < 4; v++) {
      const pl = voicePosLists[v];
      if (posIdx < pl.length) {
        const entry     = pl[posIdx];
        const trackIdx  = entry.trackNumber;
        if (trackIdx !== 0xff && trackIdx !== 0xfe) {
          const rowCount = trackRowCount(trackIdx);
          if (rowCount > patternLen) patternLen = rowCount;
        }
      }
    }

    const cells: TrackerCell[][] = Array.from({ length: patternLen }, () =>
      Array.from({ length: 4 }, () => ({
        note: 0, instrument: 0, volume: 0,
        effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      } as TrackerCell))
    );

    for (let v = 0; v < 4; v++) {
      const pl = voicePosLists[v];
      if (posIdx >= pl.length) continue;

      const entry    = pl[posIdx];
      if (entry.trackNumber === 0xff || entry.trackNumber === 0xfe) continue;

      const trackIdx = entry.trackNumber;
      if (trackIdx >= decodedTracks.length) continue;

      const trackRows = decodedTracks[trackIdx];
      const transpose = entry.transpose;

      for (let row = 0; row < Math.min(trackRows.length, patternLen); row++) {
        const tr = trackRows[row];

        let xmNote = 0;
        if (tr.note !== 0) {
          // Apply transpose (unsigned byte added to note index)
          const rawNote = tr.note + transpose;
          const clamped = Math.max(0, Math.min(MA_PERIODS.length - 1, rawNote));
          xmNote = maNoteToXM(clamped);
        }

        let effTyp = 0;
        let eff    = 0;
        if (tr.speed !== 0) {
          effTyp = 0x0F;
          eff    = tr.speed;
        }

        cells[row][v] = {
          note:       xmNote,
          instrument: tr.instrument,
          volume:     0,
          effTyp,
          eff,
          effTyp2: 0,
          eff2:    0,
        };
      }
    }

    const patIdx = patterns.length;
    patterns.push({
      id:     `pattern-${patIdx}`,
      name:   `Pattern ${patIdx}`,
      length: patternLen,
      channels: Array.from({ length: 4 }, (_, chIdx) => ({
        id:           `channel-${chIdx}`,
        name:         `Channel ${chIdx + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          CHANNEL_PAN[chIdx],
        instrumentId: null,
        color:        null,
        rows:         cells.map(row => row[chIdx]),
      })),
      importMetadata: {
        sourceFormat:            'MusicAssembler' as const,
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    4,
        originalPatternCount:    maxPositions,
        originalInstrumentCount: numberOfInstruments,
      },
    });

    songPositions.push(patIdx);
  }

  if (patterns.length === 0) return null;

  const baseName = filename.replace(/\.[^/.]+$/, '');

  return {
    name:            baseName,
    format:          'XM' as TrackerFormat,
    patterns,
    instruments:     instrumentConfigs,
    songPositions,
    songLength:      songPositions.length,
    restartPosition: 0,
    numChannels:     4,
    initialSpeed:    primarySong.startSpeed || 6,
    initialBPM:      125,
  };
}
