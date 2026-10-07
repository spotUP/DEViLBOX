/**
 * maModule.ts - the Music Assembler module's own tables, read once.
 *
 * A Music Assembler file is the 68k player followed by its data; the player's code names where the data
 * is (mirrors NostalgicPlayer MusicAssemblerWorker.cs and ma-wasm's ma_module_parse): the sub-song
 * table, the four position lists of each sub-song, the track offset table and track bytes, the
 * instrument table and the sample table. The parser (grid, instruments), the walk (maWalk.ts) and the
 * edit writer (maGridEdits.ts) all read it from here.
 *
 * ZERO imports: no engine, no UI.
 */

/** PAL Amiga clock frequency (Hz). */
export const MA_PAL_CLOCK = 3546895;

/** Music Assembler period table: 48 entries (4 octaves x 12 notes), index 12 = 856 (NostalgicPlayer Tables.cs). */
export const MA_PERIODS: readonly number[] = [
  1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016, 960, 906,
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
];

/** Voice index -> Amiga channel (the position lists of a sub-song are stored in Amiga channel order). */
export const MA_CHANNEL_MAP = [0, 3, 1, 2] as const;

export function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

export function s16(buf: Uint8Array, off: number): number {
  const v = (buf[off] << 8) | buf[off + 1];
  return v < 0x8000 ? v : v - 0x10000;
}

export function s32BE(buf: Uint8Array, off: number): number {
  return (buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3];
}

export function s8v(v: number): number {
  return v < 128 ? v : v - 256;
}

/** Decode a null-terminated Amiga Latin-1 string from buf[off..off+len). */
export function readString(buf: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = buf[off + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

// -- Offset extraction (mirrors MusicAssemblerWorker.cs) ---------------------

export interface ExtractedOffsets {
  subSongCount: number;
  subSongSpeedOffset: number;
  subSongPositionListOffset: number;
  moduleStartOffset: number;
  instrumentInfoOffsetOffset: number;
  sampleInfoOffsetOffset: number;
  tracksOffsetOffset: number;
}

/** Extract all data offsets from the 68k player's code; null when the file does not match the player's signature. */
export function extractOffsets(buf: Uint8Array): ExtractedOffsets | null {
  const searchLength = buf.length;

  // ExtractInfoFromInitFunction: the init function starts at the signed 16-bit displacement at bytes[2..3] + 2
  const startOfInit = s16(buf, 2) + 2;
  if (startOfInit < 0 || startOfInit >= searchLength) return null;

  let index = startOfInit;

  // CMPI.W (0xb0 0x7c): the sub-song count
  while (index < searchLength - 4) {
    if (buf[index] === 0xb0 && buf[index + 1] === 0x7c) break;
    index += 2;
  }
  if (index >= searchLength - 4) return null;

  const subSongCount = (buf[index + 2] << 8) | buf[index + 3];
  index += 4;

  // LEA.L pc-relative (0x49 0xfa): the sub-song speed table
  while (index < searchLength - 4) {
    if (buf[index] === 0x49 && buf[index + 1] === 0xfa) break;
    index += 2;
  }
  if (index >= searchLength - 4) return null;

  const subSongSpeedOffset = s16(buf, index + 2) + index + 2;
  index += 4;

  // LEA.L pc-relative2 (0x49 0xfb): the sub-song position list table (one-byte displacement)
  while (index < searchLength - 4) {
    if (buf[index] === 0x49 && buf[index + 1] === 0xfb) break;
    index += 2;
  }
  if (index >= searchLength - 4) return null;

  const subSongPositionListOffset = s8v(buf[index + 3]) + index + 2;

  // ExtractInfoFromPlayFunction: the play function starts at 0x0c
  index = 0x0c;

  // LEA.L (0x43 0xfa): the start of the module data
  while (index < searchLength - 4) {
    if (buf[index] === 0x43 && buf[index + 1] === 0xfa) break;
    index += 2;
  }
  if (index >= searchLength - 4) return null;

  const moduleStartOffset = s16(buf, index + 2) + index + 2;
  index += 4;

  // ADDA.L (0xd3 0xfa): the instrument table pointer
  while (index < searchLength - 8) {
    if (buf[index] === 0xd3 && buf[index + 1] === 0xfa) break;
    index += 2;
  }
  if (index >= searchLength - 8) return null;

  const instrumentInfoOffsetOffset = s16(buf, index + 2) + index + 2;

  // the next instruction must be ADDA.L (0xd5 0xfa): the sample table pointer
  if (buf[index + 4] !== 0xd5 || buf[index + 5] !== 0xfa) return null;
  const sampleInfoOffsetOffset = s16(buf, index + 6) + index + 6;
  index += 8;

  // BSR.B (0x61): follow the branch to the routine that adds the tracks offset
  while (index < searchLength - 2) {
    if (buf[index] === 0x61) break;
    index += 2;
  }
  if (index >= searchLength - 2) return null;

  index = s8v(buf[index + 1]) + index + 2;
  if (index < 0 || index >= searchLength) return null;

  // ADDA.L (0xdb 0xfa): the tracks pointer
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

/** Whether `bytes` is a Music Assembler module: the player's code signature, then a full offset extraction. */
export function isMusicAssemblerModule(bytes: Uint8Array): boolean {
  if (bytes.length < 0x622) return false;
  if (
    bytes[0] !== 0x60 || bytes[1] !== 0x00 ||
    bytes[4] !== 0x60 || bytes[5] !== 0x00 ||
    bytes[8] !== 0x60 || bytes[9] !== 0x00 ||
    bytes[12] !== 0x48 || bytes[13] !== 0xe7
  ) return false;
  // a 0x700-byte search window (as MusicAssemblerWorker.cs)
  const searchBuf = bytes.length >= 0x700 ? bytes.subarray(0, 0x700) : bytes;
  return extractOffsets(searchBuf) !== null;
}

// -- Tables ------------------------------------------------------------------

export interface MaPosition {
  trackNumber: number;
  transpose: number;
  repeatCounter: number;
  /** File offset of this 2-byte entry (byte 0: track number; byte 1: transpose and repeat, see loadPositionList). */
  fileOffset: number;
}

/** A position list: 2 bytes an entry, ended by track number 0xff (restart at the first entry) or 0xfe. */
export function loadPositionList(bytes: Uint8Array, off: number): MaPosition[] | null {
  const list: MaPosition[] = [];
  for (;;) {
    if (off + 2 > bytes.length) return null;
    const fileOffset = off;
    const trackNumber = bytes[off++];
    const rawByte = bytes[off++];

    // LoadSinglePositionList in MusicAssemblerWorker.cs:
    //   ushort val = (ushort)(byt << 4); transpose = val >> 8; repeat = (sbyte)((val & 0xff) >> 1)
    const val = (rawByte << 4) & 0xffff;
    const transpose = (val >> 8) & 0xff;
    const repeatRaw = (val & 0xff) >> 1;
    list.push({ trackNumber, transpose, repeatCounter: s8v(repeatRaw), fileOffset });

    if (trackNumber === 0xff || trackNumber === 0xfe) break;
  }
  return list;
}

/** The bytes of one track from `off`: events of 1..4 bytes, ended by 0xff (included); null when the file ends first. */
export function loadSingleTrack(bytes: Uint8Array, off: number): Uint8Array | null {
  const trackBytes: number[] = [];

  for (;;) {
    if (off >= bytes.length) return null;
    let byt = bytes[off++];
    trackBytes.push(byt);

    if ((byt & 0x80) !== 0) {
      if ((byt & 0x40) !== 0) {
        if (off >= bytes.length) return null;
        byt = bytes[off++];
        trackBytes.push(byt);
        if (off >= bytes.length) return null;
        byt = bytes[off++];
        trackBytes.push(byt);
        if ((byt & 0x80) !== 0) {
          if (off >= bytes.length) return null;
          byt = bytes[off++];
          trackBytes.push(byt);
        }
      }
      // high bit set but not bit 6: the one byte already pushed
    } else {
      if (off >= bytes.length) return null;
      byt = bytes[off++];
      trackBytes.push(byt);
      if ((byt & 0x80) !== 0) {
        if (off >= bytes.length) return null;
        byt = bytes[off++];
        trackBytes.push(byt);
      }
    }

    if (off >= bytes.length) return null;
    if (bytes[off] === 0xff) {
      trackBytes.push(0xff);
      off++;
      break;
    }
  }

  return new Uint8Array(trackBytes);
}

export interface MaInstrument {
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
  /** File offset of the 16-byte record. */
  fileOffset: number;
}

export interface MaSample {
  name: string;
  /** Absolute file offset of the data, or -1 when the sample has none (the player then plays its 4-byte empty sample, length 1 word). */
  dataOffset: number;
  lengthWords: number;
  loopLengthWords: number;
}

export interface MaSubSong {
  /** Index in the module's sub-song table (dummy sub-songs are skipped, so this is not the list index). */
  tableIndex: number;
  startSpeed: number;
  /** The four position list offsets (relative to moduleStartOffset), in Amiga channel order. */
  positionListOffsets: number[];
}

export interface MaModuleData {
  offsets: ExtractedOffsets;
  moduleStartOffset: number;
  subSongs: MaSubSong[];
  /** Position lists by their offset (relative to moduleStartOffset). */
  positionLists: Map<number, MaPosition[]>;
  numberOfTracks: number;
  /** Absolute file offset of track 0's table base: track i is at tracksStartOffset + trackOffsetTable[i]. */
  tracksStartOffset: number;
  trackOffsetTable: number[];
  tracks: Array<Uint8Array | null>;
  instruments: MaInstrument[];
  samples: MaSample[];
}

/** Read the module's tables; null where the module is not a usable Music Assembler module (the parser's own refusals). */
export function loadMaModule(bytes: Uint8Array): MaModuleData | null {
  if (!isMusicAssemblerModule(bytes)) return null;
  const searchBuf = bytes.length >= 0x700 ? bytes.subarray(0, 0x700) : bytes;
  const offsets = extractOffsets(searchBuf);
  if (!offsets) return null;

  const {
    subSongCount, subSongSpeedOffset, subSongPositionListOffset, moduleStartOffset,
    instrumentInfoOffsetOffset, sampleInfoOffsetOffset, tracksOffsetOffset,
  } = offsets;

  if (subSongCount <= 0 || subSongCount > 256) return null;

  // sub-song speeds
  if (subSongSpeedOffset + subSongCount > bytes.length) return null;
  const speedList = bytes.subarray(subSongSpeedOffset, subSongSpeedOffset + subSongCount);

  // each sub-song has 4 position list offsets (u16 BE, one per voice)
  const posListTableOff = subSongPositionListOffset;
  if (posListTableOff + subSongCount * 4 * 2 > bytes.length) return null;

  const subSongs: MaSubSong[] = [];
  for (let i = 0; i < subSongCount; i++) {
    const base = posListTableOff + i * 8;
    const pl0 = u16BE(bytes, base + 0);
    const pl1 = u16BE(bytes, base + 2);
    const pl2 = u16BE(bytes, base + 4);
    const pl3 = u16BE(bytes, base + 6);
    // consecutive offsets = an empty (dummy) sub-song
    if ((pl0 + 2) === pl1 && (pl1 + 2) === pl2 && (pl2 + 2) === pl3) continue;
    subSongs.push({ tableIndex: i, startSpeed: speedList[i] || 6, positionListOffsets: [pl0, pl1, pl2, pl3] });
  }
  if (subSongs.length === 0) return null;

  // every position list of every sub-song, once
  const positionLists = new Map<number, MaPosition[]>();
  for (const song of subSongs) {
    for (const plOff of song.positionListOffsets) {
      if (positionLists.has(plOff)) continue;
      const absOff = moduleStartOffset + plOff;
      if (absOff >= bytes.length) continue;
      const pl = loadPositionList(bytes, absOff);
      if (pl) positionLists.set(plOff, pl);
    }
  }

  // the number of tracks: the highest track number any list names + 1
  let maxTrackNumber = 0;
  for (const pl of positionLists.values()) {
    for (const entry of pl) {
      if (entry.trackNumber !== 0xff && entry.trackNumber !== 0xfe && entry.trackNumber > maxTrackNumber) maxTrackNumber = entry.trackNumber;
    }
  }
  const numberOfTracks = maxTrackNumber + 1;

  // track offsets: a u16 BE table at the module start, relative to the tracks start
  if (tracksOffsetOffset + 4 > bytes.length) return null;
  const tracksStartOffset = s32BE(bytes, tracksOffsetOffset) + moduleStartOffset;
  if (moduleStartOffset + numberOfTracks * 2 > bytes.length) return null;
  const trackOffsetTable: number[] = [];
  for (let i = 0; i < numberOfTracks; i++) trackOffsetTable.push(u16BE(bytes, moduleStartOffset + i * 2));

  const tracks: Array<Uint8Array | null> = new Array<Uint8Array | null>(numberOfTracks).fill(null);
  for (let i = 0; i < numberOfTracks; i++) {
    const trackOff = tracksStartOffset + trackOffsetTable[i];
    if (trackOff < 0 || trackOff >= bytes.length) continue;
    tracks[i] = loadSingleTrack(bytes, trackOff);
  }

  // instruments: 16 bytes each, between the instrument table and the sample table
  if (instrumentInfoOffsetOffset + 4 > bytes.length) return null;
  const instrStartRel = s32BE(bytes, instrumentInfoOffsetOffset);
  if (sampleInfoOffsetOffset + 4 > bytes.length) return null;
  const sampleStartRel = s32BE(bytes, sampleInfoOffsetOffset);

  const numberOfInstruments = (sampleStartRel - instrStartRel) / 16;
  if (numberOfInstruments < 0 || numberOfInstruments > 256) return null;

  const instrAbsOff = moduleStartOffset + instrStartRel;
  if (instrAbsOff + numberOfInstruments * 16 > bytes.length) return null;

  const instruments: MaInstrument[] = [];
  for (let i = 0; i < numberOfInstruments; i++) {
    const base = instrAbsOff + i * 16;
    instruments.push({
      sampleNumber: bytes[base + 0],
      attack: bytes[base + 1],
      decaySustain: bytes[base + 2],
      vibratoDelay: bytes[base + 3],
      release: bytes[base + 4],
      vibratoSpeed: bytes[base + 5],
      vibratoLevel: bytes[base + 6],
      arpeggio: bytes[base + 7],
      fxArpSpdLp: bytes[base + 8],
      hold: bytes[base + 9],
      keyWaveRate: bytes[base + 10],
      waveLevelSpeed: bytes[base + 11],
      fileOffset: base,
    });
  }

  // samples: 24 bytes of info each, from the sample table to the first position list
  const sampleAbsOff = moduleStartOffset + sampleStartRel;
  let minPosListOffset = Infinity;
  for (const k of positionLists.keys()) if (k < minPosListOffset) minPosListOffset = k;
  if (!isFinite(minPosListOffset)) return null;

  const numberOfSamples = Math.floor((minPosListOffset + moduleStartOffset - sampleAbsOff) / 24);
  if (numberOfSamples < 0 || numberOfSamples > 256) return null;
  if (sampleAbsOff + numberOfSamples * 24 > bytes.length) return null;

  const samples: MaSample[] = [];
  for (let i = 0; i < numberOfSamples; i++) {
    const base = sampleAbsOff + i * 24;
    const relOff = s32BE(bytes, base + 0);
    samples.push({
      name: readString(bytes, base + 8, 16),
      dataOffset: relOff < 0 ? -1 : sampleAbsOff + relOff,
      lengthWords: u16BE(bytes, base + 4),
      loopLengthWords: u16BE(bytes, base + 6),
    });
  }

  return {
    offsets, moduleStartOffset, subSongs, positionLists, numberOfTracks, tracksStartOffset, trackOffsetTable, tracks, instruments, samples,
  };
}
