/**
 * GraoumfTracker2Parser.ts — Graoumf Tracker 1/2 (.gtk/.gt2) native parser
 *
 * Graoumf Tracker was an Atari Falcon/PC tracker by Vincent Voois.
 * GTK = Graoumf Tracker 1 (file versions 1-4, fixed-length structure).
 * GT2 = Graoumf Tracker 2 (file versions 5-9, chunk-based IFF structure).
 *
 * File layout (GTK):
 *   Header (206 bytes): magic "GTK", fileVersion, songName[32], smallComment[160],
 *     numSamples(u16BE), numRows(u16BE), numChannels(u16BE), numOrders(u16BE), restartPos(u16BE)
 *   Sample headers: numSamples × (48 or 64 bytes depending on version)
 *   Order list: 512 bytes (u16BE indices)
 *   Pattern data: numOrders × numRows × numChannels × (4 or 5 bytes/cell)
 *   Sample data: consecutive raw PCM
 *
 * File layout (GT2):
 *   Header (236 bytes): magic "GT2", fileVersion, headerSize(u32BE), songName[32],
 *     smallComment[160], day, month, year(u16BE), trackerName[24],
 *     speed(u16BE), tempo(u16BE), masterVol(u16BE), numPannedTracks(u16BE)
 *   Chunk-based IFF after headerSize offset:
 *     PATS — channel count
 *     SONG — order list
 *     PATD — pattern data (one per pattern)
 *     SAMP / SAM2 — sample data
 *     INST — instrument data
 *     TNAM — track names
 *     TCN1 / TCN2 — timing & config
 *     TVOL — track volumes
 *     MIXP — mix preset
 *     XCOM — extended comment
 *     ENDC — end of chunks
 *
 * Reference: Reference Code/openmpt-master/soundlib/Load_gt2.cpp (authoritative)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u8(buf: Uint8Array, off: number): number  { return buf[off] ?? 0; }
function s8(buf: Uint8Array, off: number): number  { const v = buf[off] ?? 0; return v < 128 ? v : v - 256; }
function u16be(buf: Uint8Array, off: number): number {
  return ((buf[off] ?? 0) << 8) | (buf[off + 1] ?? 0);
}
function u32be(buf: Uint8Array, off: number): number {
  return (((buf[off] ?? 0) << 24) | ((buf[off + 1] ?? 0) << 16) | ((buf[off + 2] ?? 0) << 8) | (buf[off + 3] ?? 0)) >>> 0;
}

function readString(buf: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = buf[off + i] ?? 0;
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

// ── GTK header layout ─────────────────────────────────────────────────────────
// struct GTKFileHeader (206 bytes):
//   signature[3], fileVersion(1), songName[32], smallComment[160],
//   numSamples(2), numRows(2), numChannels(2), numOrders(2), restartPos(2)

const GTK_HEADER_SIZE = 206;

interface GTKHeader {
  fileVersion:  number;
  songName:     string;
  numSamples:   number;
  numRows:      number;
  numChannels:  number;
  numOrders:    number;
  restartPos:   number;
}

function readGTKHeader(buf: Uint8Array): GTKHeader | null {
  if (buf.length < GTK_HEADER_SIZE) return null;
  if (buf[0] !== 0x47 || buf[1] !== 0x54 || buf[2] !== 0x4B) return null; // "GTK"

  const fileVersion = u8(buf, 3);
  if (fileVersion < 1 || fileVersion > 4) return null;

  const songName    = readString(buf, 4, 32);
  const numSamples  = u16be(buf, 196);
  const numRows     = u16be(buf, 198);
  const numChannels = u16be(buf, 200);
  const numOrders   = u16be(buf, 202);
  const restartPos  = u16be(buf, 204);

  if (numSamples > 255)         return null;
  if (numRows === 0 || numRows > 256) return null;
  if (numChannels === 0 || numChannels > 32) return null;
  if (numOrders > 256)          return null;
  if (numOrders > 0 && restartPos >= numOrders) return null;

  return { fileVersion, songName, numSamples, numRows, numChannels, numOrders, restartPos };
}

// ── GT2 header layout ─────────────────────────────────────────────────────────
// struct GT2FileHeader (236 bytes):
//   signature[3], fileVersion(1), headerSize(4), songName[32], smallComment[160],
//   day(1), month(1), year(2), trackerName[24],
//   speed(2), tempo(2), masterVol(2), numPannedTracks(2)

const GT2_HEADER_SIZE = 236;

interface GT2Header {
  fileVersion:     number;
  headerSize:      number;
  songName:        string;
  speed:           number;
  tempo:           number;
  masterVol:       number;
  numPannedTracks: number;
}

function readGT2Header(buf: Uint8Array): GT2Header | null {
  if (buf.length < GT2_HEADER_SIZE) return null;
  if (buf[0] !== 0x47 || buf[1] !== 0x54 || buf[2] !== 0x32) return null; // "GT2"

  const fileVersion     = u8(buf, 3);
  if (fileVersion > 9) return null;

  const headerSize      = u32be(buf, 4);
  const songName        = readString(buf, 8, 32);
  const year            = u16be(buf, 203);
  if (year < 1980 || year > 9999) return null;

  // Fields only present in version 0-5
  const speed           = fileVersion <= 5 ? u16be(buf, 228) : 6;
  const tempo           = fileVersion <= 5 ? u16be(buf, 230) : 125;
  const masterVol       = fileVersion <= 5 ? u16be(buf, 232) : 0xFFF;
  const numPannedTracks = fileVersion <= 5 ? u16be(buf, 234) : 0;

  if (fileVersion <= 5) {
    if (speed === 0 || tempo === 0) return null;
    if (masterVol > 0xFFF)          return null;
    if (numPannedTracks > 99)       return null;
  }

  return { fileVersion, headerSize, songName, speed, tempo, masterVol, numPannedTracks };
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if the buffer is a Graoumf Tracker 1 (GTK) or Graoumf Tracker 2 (GT2) file.
 * Mirrors GTKFileHeader::Validate() and GT2FileHeader::Validate() from Load_gt2.cpp.
 */
export function isGraoumfTracker2Format(bytes: Uint8Array): boolean {
  if (bytes.length < 10) return false;

  // GT2 magic
  if (bytes[0] === 0x47 && bytes[1] === 0x54 && bytes[2] === 0x32) {
    return readGT2Header(bytes) !== null;
  }

  // GTK magic
  if (bytes[0] === 0x47 && bytes[1] === 0x54 && bytes[2] === 0x4B) {
    return readGTKHeader(bytes) !== null;
  }

  return false;
}

// ── Effect translation ────────────────────────────────────────────────────────

/**
 * Translate a Graoumf Tracker effect to a DEViLBOX-compatible (XM/IT-style) effect.
 * Returns { effTyp, eff } — 0/0 if no translation available.
 *
 * Mirrors TranslateGraoumfEffect() from Load_gt2.cpp.
 * Only translates what maps cleanly to existing effect types.
 * fileVersion is the actual file version (positive for GT2, negated for GTK in OpenMPT).
 *
 * @param effect      - effect byte (0x00-0xFF)
 * @param param       - effect parameter (0x00-0xFF)
 * @param isGTK       - true = GTK file (negative fileVersion in OpenMPT)
 * @param speed       - current tempo speed (for CMD_SPEED tracking)
 */
function translateEffect(
  effect: number,
  param: number,
  isGTK: boolean,
): { effTyp: number; eff: number } {
  if (!effect) return { effTyp: 0, eff: 0 };
  // B0-BF effects require GT2 (not available in GTK where fileVersion is negated)
  if (effect >= 0xB0 && isGTK) return { effTyp: 0, eff: 0 };

  const param12bit = ((effect & 0x0F) << 8) | param;
  const param4bitSlide = Math.min(param, 0x0E);

  switch (effect >> 4) {
    case 0x02:  // 2xxx: Set Volume (linear, 0-255 range, divide by 4 = 0-64)
      return { effTyp: 0x0C, eff: Math.min(Math.trunc(param12bit / 4), 64) };
    case 0x04:  // 4xxx: Panning
      return { effTyp: 0x08, eff: Math.min(Math.trunc(param12bit / 16), 255) };
    case 0x07:  // 7xyy: Roll (retrigger)
      return { effTyp: 0x1B, eff: effect & 0x0F };
  }

  // Single-byte effect codes
  switch (effect) {
    case 0x01:  // 01xx: Portamento up
      return { effTyp: 0x01, eff: param };
    case 0x02:  // 02xx: Portamento down
      return { effTyp: 0x02, eff: param };
    case 0x03:  // 03xx: Tone portamento
      return { effTyp: 0x03, eff: param };
    case 0x04:  // 04xx: Vibrato
      return { effTyp: 0x04, eff: param };
    case 0x07:  // 07xx: Tremolo
      return { effTyp: 0x07, eff: param };
    case 0x0B:  // 0Bxx: Pattern jump
      return { effTyp: 0x0B, eff: param };
    case 0x0D:  // 0Dxx: Pattern break
      return { effTyp: 0x0D, eff: param };
    case 0x0F:  // 0Fxx: Set speed/tempo
      return { effTyp: 0x0F, eff: param };
    case 0x09:  // 09xx: Note delay
      return { effTyp: 0x0E, eff: 0xD0 | Math.min(param, 0x0F) };
    case 0x0A:  // 0Axx: Cut note / key off
      return { effTyp: 0x14, eff: 0 };
    case 0x10:  // 10xy: Arpeggio
      return { effTyp: 0x00, eff: param };
    case 0x14:  // 14xx: Linear volume slide up
      return { effTyp: 0x0A, eff: param4bitSlide << 4 };
    case 0x15:  // 15xx: Linear volume slide down
      return { effTyp: 0x0A, eff: param4bitSlide };
    case 0xAA:  // AAxx: Pattern delay
      return { effTyp: 0x0E, eff: 0xE0 | Math.min(param, 0x0F) };
    case 0xA8:  // A8xx: Set number of ticks
      if (param > 0) return { effTyp: 0x0F, eff: param };
      return { effTyp: 0, eff: 0 };
    case 0xB1:  // B1xx: Pattern loop
      return { effTyp: 0x0E, eff: 0xB0 | Math.min(param, 0x0F) };
    default:
      return { effTyp: 0, eff: 0 };
  }
}

// ── GTK parser ────────────────────────────────────────────────────────────────

function parseGTKFile(buf: Uint8Array, filename: string): TrackerSong | null {
  const hdr = readGTKHeader(buf);
  if (!hdr) return null;

  const { fileVersion, songName, numSamples, numRows, numChannels, numOrders, restartPos } = hdr;

  // Validate minimum size for header additional data
  const sampleHeaderSize = fileVersion < 3 ? 48 : 64;
  const minAdditional = sampleHeaderSize * numSamples + 512 + (fileVersion < 4 ? 4 : 5) * numRows * numChannels;
  if (buf.length < GTK_HEADER_SIZE + minAdditional) return null;

  let pos = GTK_HEADER_SIZE;

  // ── Sample headers ─────────────────────────────────────────────────────────
  interface GTKSampleMeta {
    name:       string;
    length:     number;
    loopStart:  number;
    loopEnd:    number;
    hasLoop:    boolean;
    volume:     number;
    finetune:   number;
    bits:       number;
    sampleRate: number;
    defaultPan: number;  // -1 = use track, 0-4095 otherwise
  }

  const sampleMetas: GTKSampleMeta[] = [];

  for (let s = 0; s < numSamples; s++) {
    const sampleBase = pos;

    // Version 1: name[32] = 32 bytes total; version 2+: name[28] = 28 bytes
    const nameLen = fileVersion === 1 ? 32 : 28;
    const name = readString(buf, sampleBase, nameLen);

    let defaultPan = -1;
    let bytesPerSample = 1;
    let sampleRate = 8363; // default (no C5 speed stored in v1)

    let ptr = sampleBase + nameLen;

    if (fileVersion >= 3) {
      // Skip 14 reserved bytes, then int16BE defaultPan
      ptr += 14;
      const pan = (u8(buf, ptr) << 8) | u8(buf, ptr + 1);
      // Signed 16-bit big-endian: -1 = no pan, 0-4095 = pan value
      defaultPan = pan >= 0x8000 ? pan - 0x10000 : pan;
      ptr += 2;
    }

    if (fileVersion >= 2) {
      bytesPerSample = u16be(buf, ptr); ptr += 2;
      sampleRate = u16be(buf, ptr) * 2; ptr += 2;  // nC5Speed = file_freq * 2
    }

    const length    = u32be(buf, ptr); ptr += 4;
    const loopStart = u32be(buf, ptr); ptr += 4;
    const loopLen   = u32be(buf, ptr); ptr += 4;
    const volume    = u16be(buf, ptr); ptr += 2;
    const finetune  = u16be(buf, ptr) >= 0x8000 ? u16be(buf, ptr) - 0x10000 : u16be(buf, ptr); ptr += 2;

    let numLength    = length;
    let numLoopStart = loopStart;
    let numLoopEnd   = loopStart + loopLen;
    const has16bit   = bytesPerSample === 2;
    if (has16bit) {
      numLength    /= 2;
      numLoopStart /= 2;
      numLoopEnd   /= 2;
    }

    const hasLoop = loopStart > 0 || loopLen > 2;

    sampleMetas.push({
      name, length: numLength, loopStart: numLoopStart, loopEnd: numLoopEnd,
      hasLoop, volume, finetune, bits: has16bit ? 16 : 8, sampleRate, defaultPan,
    });

    pos += sampleHeaderSize;
  }

  // ── Order list (512 bytes = 256 × u16BE) ────────────────────────────────
  const orderBuf = buf.slice(pos, pos + 512);
  pos += 512;

  const orders: number[] = [];
  for (let i = 0; i < numOrders; i++) {
    orders.push(u16be(orderBuf, i * 2));
  }
  const numPatterns = orders.length > 0 ? Math.max(...orders) + 1 : 0;

  // ── Pattern data ──────────────────────────────────────────────────────────
  const eventSize = fileVersion < 4 ? 4 : 5;
  const isGTK = true;

  // We parse all numPatterns patterns in sequence
  // GTK stores pattern data sequentially (not by order), one pattern after another
  // OpenMPT: Patterns.ResizeArray(numPatterns) and reads them in order
  const rawPatterns: TrackerCell[][][] = [];

  for (let pat = 0; pat < numPatterns; pat++) {
    const cells: TrackerCell[][] = [];
    for (let row = 0; row < numRows; row++) {
      const rowCells: TrackerCell[] = [];
      for (let chn = 0; chn < numChannels; chn++) {
        const off = pos + (row * numChannels + chn) * eventSize;
        if (off + eventSize > buf.length) {
          rowCells.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }
        const data0 = u8(buf, off);
        const data1 = u8(buf, off + 1);
        const data2 = u8(buf, off + 2);
        const data3 = u8(buf, off + 3);
        const data4 = eventSize >= 5 ? u8(buf, off + 4) : 0;

        // Note: data[0] >= 24 && data[0] < 84 → m.note = data[0] + NOTE_MIN + 12
        // NOTE_MIN = 1 in OpenMPT, so note = data[0] + 13
        // data[0] = 24 → note 37 = C-2 in XM (C-0=1, C-1=13, C-2=25... wait)
        // OpenMPT XM note numbering: NOTE_MIN=1 (C-0), note=37 = C-2... no.
        // XM: C-0=1, C-1=13, C-2=25, C-3=37... data[0]+13 where data[0]=24 → note=37=C-2
        let note = 0;
        if (data0 >= 24 && data0 < 84) {
          note = data0 + 13;
        }

        const instr = data1;

        // Effect in data[2] (effect byte) and data[3] (param)
        // GTK uses negated fileVersion in OpenMPT (fileVersion < 0 check), so we pass isGTK=true
        const { effTyp, eff } = translateEffect(data2, data3, isGTK);

        // Version >=4 has a 5th byte for volume column (0 = none)
        let volCmdTyp = 0;
        let volCmdVal = 0;
        if (data4 > 0) {
          volCmdTyp = 0x0C; // set volume
          volCmdVal = Math.min(Math.trunc((data4 + 1) / 4), 64);
        }

        rowCells.push({
          note,
          instrument: instr,
          volume: volCmdTyp === 0x0C ? volCmdVal : 0,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0,
        });
      }
      cells.push(rowCells);
    }
    rawPatterns.push(cells);
    pos += numRows * numChannels * eventSize;
  }

  // ── Sample data ───────────────────────────────────────────────────────────
  const sampleData: Uint8Array[] = [];
  for (const meta of sampleMetas) {
    if (meta.length === 0 || pos >= buf.length) {
      sampleData.push(new Uint8Array(0));
      continue;
    }
    const byteLen = meta.bits === 16 ? meta.length * 2 : meta.length;
    const avail   = Math.min(byteLen, buf.length - pos);
    sampleData.push(buf.slice(pos, pos + avail));
    pos += byteLen;
  }

  // ── Build InstrumentConfig list ───────────────────────────────────────────
  const instruments: InstrumentConfig[] = [];
  for (let i = 0; i < numSamples; i++) {
    const meta = sampleMetas[i];
    const pcm  = sampleData[i];
    const id   = i + 1;

    if (!pcm || pcm.length === 0) {
      instruments.push({
        id, name: meta.name || `Sample ${id}`,
        type: 'sample' as const, synthType: 'Sampler' as const,
        effects: [], volume: 0, pan: 0,
      } as unknown as InstrumentConfig);
      continue;
    }

    // GTK uses big-endian 16-bit signed or 8-bit signed PCM
    // For simplicity, convert 16-bit to 8-bit by taking the high byte
    let mono8: Uint8Array;
    if (meta.bits === 16) {
      mono8 = new Uint8Array(pcm.length / 2);
      for (let j = 0; j < mono8.length; j++) {
        mono8[j] = pcm[j * 2] ?? 0; // high byte (big-endian)
      }
    } else {
      mono8 = pcm;
    }

    const vol       = meta.volume > 0 ? Math.min(meta.volume, 64) : 64;
    const loopStart = meta.hasLoop ? meta.loopStart : 0;
    const loopEnd   = meta.hasLoop ? meta.loopEnd   : 0;
    const rate      = meta.sampleRate > 0 ? meta.sampleRate : 8363;

    instruments.push(
      createSamplerInstrument(id, meta.name || `Sample ${id}`, mono8, vol, rate, loopStart, loopEnd),
    );
  }

  // ── Build patterns ────────────────────────────────────────────────────────
  const defaultPanning: number[] = [];
  for (let c = 0; c < numChannels; c++) {
    // SetupMODPanning(true) in OpenMPT: alternating L-R-R-L per group of 4
    const mod4 = c % 4;
    defaultPanning.push(mod4 === 0 || mod4 === 3 ? -64 : 64);
  }

  const patterns: Pattern[] = orders.map((patIdx, ordIdx) => {
    const rawPat = patIdx < rawPatterns.length ? rawPatterns[patIdx] : null;

    const channels: ChannelData[] = Array.from({ length: numChannels }, (_, ch) => {
      const rows: TrackerCell[] = Array.from({ length: numRows }, (_, row): TrackerCell => {
        if (!rawPat || !rawPat[row] || !rawPat[row][ch]) {
          return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
        }
        return rawPat[row][ch];
      });

      return {
        id:           `channel-${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          defaultPanning[ch] ?? 0,
        instrumentId: null,
        color:        null,
        rows,
      };
    });

    return {
      id:       `pattern-${ordIdx}`,
      name:     `Pattern ${ordIdx}`,
      length:   numRows,
      channels,
      importMetadata: {
        sourceFormat:            'GraoumfTracker',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    numChannels,
        originalPatternCount:    numPatterns,
        originalInstrumentCount: numSamples,
      },
    };
  });

  if (patterns.length === 0) {
    patterns.push(makeEmptyPattern(numChannels, numRows, filename, 0, 0));
  }

  return {
    name:            songName || filename.replace(/\.[^/.]+$/, ''),
    format:          'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions:   patterns.map((_, i) => i),
    songLength:      patterns.length,
    restartPosition: restartPos,
    numChannels,
    initialSpeed:    6,
    initialBPM:      125,
    linearPeriods:   false,
  };
}

// ── GT2 chunk reader ──────────────────────────────────────────────────────────

interface GT2Chunk {
  id:     number;   // 4-byte big-endian chunk ID
  length: number;   // chunk payload length (after subtracting 8-byte header)
  offset: number;   // byte offset in buf where payload starts
}

const CHUNK_XCOM = 0x58434F4D; // "XCOM"
const CHUNK_TCN1 = 0x54434E31; // "TCN1"
const CHUNK_TCN2 = 0x54434E32; // "TCN2"
const CHUNK_TVOL = 0x54564F4C; // "TVOL"
const CHUNK_MIXP = 0x4D495850; // "MIXP"
const CHUNK_SONG = 0x534F4E47; // "SONG"
const CHUNK_PATS = 0x50415453; // "PATS"
const CHUNK_PATD = 0x50415444; // "PATD"
const CHUNK_TNAM = 0x544E414D; // "TNAM"
const CHUNK_INST = 0x494E5354; // "INST"
const CHUNK_SAMP = 0x53414D50; // "SAMP"
const CHUNK_SAM2 = 0x53414D32; // "SAM2"
const CHUNK_ENDC = 0x454E4443; // "ENDC"

function readGT2Chunks(buf: Uint8Array, startOff: number): GT2Chunk[] {
  const chunks: GT2Chunk[] = [];
  let pos = startOff;
  while (pos + 8 <= buf.length) {
    const id     = u32be(buf, pos);
    const rawLen = u32be(buf, pos + 4);
    const payLen = Math.max(rawLen, 8) - 8;
    chunks.push({ id, length: payLen, offset: pos + 8 });
    pos += 8 + payLen;
    if (id === CHUNK_ENDC) break;
  }
  return chunks;
}

function findChunk(chunks: GT2Chunk[], id: number): GT2Chunk | undefined {
  return chunks.find(c => c.id === id);
}

function findAllChunks(chunks: GT2Chunk[], id: number): GT2Chunk[] {
  return chunks.filter(c => c.id === id);
}

// ── GT2 parser ────────────────────────────────────────────────────────────────

function parseGT2File(buf: Uint8Array, filename: string): TrackerSong | null {
  const hdr = readGT2Header(buf);
  if (!hdr) return null;

  const { fileVersion, headerSize, songName, speed, tempo, numPannedTracks } = hdr;

  // pannedTracks: numPannedTracks × u16BE immediately after main header (fileVersion <= 5)
  // They are read after the header struct at offset GT2_HEADER_SIZE.
  const pannedTracksOff = GT2_HEADER_SIZE;
  const pannedTracks: number[] = [];
  if (fileVersion <= 5) {
    for (let i = 0; i < numPannedTracks; i++) {
      pannedTracks.push(u16be(buf, pannedTracksOff + i * 2));
    }
  }

  // Chunks start at headerSize offset (relative to start of file)
  const chunkStart = Math.max(headerSize, GT2_HEADER_SIZE);
  const chunks = readGT2Chunks(buf, chunkStart);

  // ── PATS: channel count ──────────────────────────────────────────────────
  const patsChunk = findChunk(chunks, CHUNK_PATS);
  if (!patsChunk || patsChunk.length < 2) return null;
  const numChannels = u16be(buf, patsChunk.offset);
  if (numChannels < 1 || numChannels > 32) return null;

  // ── SONG: order list ──────────────────────────────────────────────────────
  const songChunk = findChunk(chunks, CHUNK_SONG);
  if (!songChunk || songChunk.length < 2) return null;
  let soff = songChunk.offset;
  const numOrders  = u16be(buf, soff); soff += 2;
  const restartPos = u16be(buf, soff); soff += 2;
  const orders: number[] = [];
  const maxOrders = Math.min(numOrders, Math.trunc((songChunk.length - 4) / 2));
  for (let i = 0; i < maxOrders; i++) {
    orders.push(u16be(buf, soff + i * 2));
  }

  // ── TCN2: tempo & speed (newer format) ───────────────────────────────────
  let initialBPM   = Math.max(tempo, 1);
  let initialSpeed = Math.max(speed, 1);

  const tcn2Chunk = findChunk(chunks, CHUNK_TCN2);
  if (tcn2Chunk && tcn2Chunk.length >= 12) {
    const t = tcn2Chunk.offset;
    // [chunkVersion(2), bpmInt(2), bpmFract(2), speed(2), timeSigNum(2), timeSigDenum(2)]
    const bpmInt  = u16be(buf, t + 2);
    const spd     = u16be(buf, t + 6);
    if (bpmInt >= 32 && bpmInt <= 999) initialBPM   = bpmInt;
    if (spd >= 1 && spd <= 255)        initialSpeed = spd;
  }

  // ── Channel panning ───────────────────────────────────────────────────────
  // fileVersion <= 5: use pannedTracks (0-4095 per channel → 0-256 pan)
  // SetupMODPanning(true) otherwise: alternating L-R-R-L per group of 4
  const channelPan: number[] = [];
  for (let c = 0; c < numChannels; c++) {
    if (fileVersion <= 5 && c < pannedTracks.length) {
      // Map 0-4095 → -128 to +128 range (like OpenMPT maps to 256-scale then to our -128..128)
      const pan256 = Math.min(Math.trunc((pannedTracks[c] * 256) / 4095), 256);
      channelPan.push(pan256 - 128);
    } else {
      const mod4 = c % 4;
      channelPan.push(mod4 === 0 || mod4 === 3 ? -64 : 64);
    }
  }

  // ── TVOL: channel volumes (optional) ────────────────────────────────────
  const tvolChunk = findChunk(chunks, CHUNK_TVOL);
  const channelVol: number[] = new Array(numChannels).fill(100);
  if (tvolChunk && tvolChunk.length >= 2) {
    const cnt = Math.min(u16be(buf, tvolChunk.offset), numChannels);
    for (let c = 0; c < cnt; c++) {
      if (tvolChunk.offset + 2 + c * 2 + 1 < buf.length) {
        const raw = u16be(buf, tvolChunk.offset + 2 + c * 2);
        channelVol[c] = Math.min(Math.trunc(raw / 4096 * 100), 100);
      }
    }
  }

  // ── MIXP: mix preset panning override ────────────────────────────────────
  // MIXP chunk: GT2MixPreset (56 bytes) + GT2MixPresetTrack[] entries (8 bytes each)
  const mixpChunk = findChunk(chunks, CHUNK_MIXP);
  if (mixpChunk && mixpChunk.length >= 56) {
    const m = mixpChunk.offset;
    const trackType = u16be(buf, m + 34);  // GT2MixPreset.trackType at +34
    const version   = u16be(buf, m + 50);  // GT2MixPreset.version at +50
    if (trackType === 4 && version === 0x101) {
      const numTracks = u16be(buf, m + 38);  // GT2MixPreset.numTracks at +38
      for (let i = 0; i < numTracks; i++) {
        const trackOff = m + 56 + i * 8;
        if (trackOff + 7 >= buf.length) break;
        const ttype  = u8(buf, trackOff);
        const tidx   = u16be(buf, trackOff + 2);
        const tvol   = u16be(buf, trackOff + 4);
        const tbal   = u16be(buf, trackOff + 6);
        if (ttype === 0 && tidx < numChannels) {
          const pan256 = Math.min(Math.trunc((tbal * 256) / 0xFFF), 256);
          channelPan[tidx] = pan256 - 128;
          channelVol[tidx] = Math.min(Math.trunc((tvol * 64) / 0x1000), 64);
        }
      }
    }
  }

  // ── SAMP: sample v1 headers + data ───────────────────────────────────────
  // GT2SampleV1 (56 bytes):
  //   smpNum(2), name[28], flags(2), defaultPan(2), bits(2), sampleFreq(2),
  //   length(4), loopStart(4), loopLength(4), volume(2), finetune(2), sampleCoding(2)

  interface GT2SampleRecord {
    smpNum:    number;
    name:      string;
    bits:      number;
    sampleFreq: number;
    length:    number;
    loopStart: number;
    loopEnd:   number;
    hasLoop:   boolean;
    volume:    number;
    stereo:    boolean;
    pingpong:  boolean;
    pcm:       Uint8Array;
  }

  const sampleMap = new Map<number, GT2SampleRecord>();

  // SAM2 (version 2 sample format — GT2SampleV2, 78 bytes):
  //   smpNum(2), name[28], type(2), bits(2), endian(2), numChan(2), defaultPan(2),
  //   volume(2), finetune(2), loopType(2), midiNote(2), sampleCoding(2), filenameLen(2),
  //   ... then skip 12 more bytes ... then sampleFreq(4), length(4), loopStart(4), loopLength(4), loopBufLength(4), dataOffset(4)
  // SAM2 struct total = 78 bytes per OpenMPT MPT_BINARY_STRUCT(GT2SampleV2, 78)
  // Layout from struct:
  //   +0  smpNum(2)
  //   +2  name[28]
  //   +30 type(2)
  //   +32 bits(2)
  //   +34 endian(2)
  //   +36 numChannels(2)
  //   +38 defaultPan(2)
  //   +40 volume(2)
  //   +42 finetune(2)
  //   +44 loopType(2)
  //   +46 midiNote(2)
  //   +48 sampleCoding(2)
  //   +50 filenameLen(2)
  //   +52 yPanning(2)
  //   +54 sampleFreq(4)
  //   +58 length(4)
  //   +62 loopStart(4)
  //   +66 loopLength(4)
  //   +70 loopBufLength(4)
  //   +74 dataOffset(4)
  // Total = 78 bytes

  for (const smpChunk of findAllChunks(chunks, CHUNK_SAM2)) {
    if (smpChunk.length < 78) continue;
    const b = smpChunk.offset;
    const smpNum      = u16be(buf, b);
    if (!smpNum || smpNum >= 1000) continue;
    const name        = readString(buf, b + 2, 28);
    const type        = u16be(buf, b + 30);
    const bits        = u16be(buf, b + 32);
    const endian      = u16be(buf, b + 34);
    const numChan     = u16be(buf, b + 36);
    const volume      = u16be(buf, b + 40);
    const loopType    = u16be(buf, b + 44);
    const sampleCoding = u16be(buf, b + 48);
    const filenameLen = u16be(buf, b + 50);
    const sampleFreq  = u32be(buf, b + 54) * 2;  // nC5Speed = sampleFreq * 2
    const length      = u32be(buf, b + 58);
    const loopStart   = u32be(buf, b + 62);
    const loopLen     = u32be(buf, b + 66);
    const dataOffset  = u32be(buf, b + 74);

    if (sampleCoding > 1 || type > 1) continue;
    if (type !== 0) continue;  // Only memory-based samples

    const loopEnd = loopStart + loopLen;
    const hasLoop = loopType !== 0;

    // dataOffset is relative to start of chunk payload (after 8-byte chunk header)
    // OpenMPT: smpChunk.Seek(sample.dataOffset - 8)
    // "dataOffset - 8" because OpenMPT includes the chunk header in the offset
    const pcmOff = smpChunk.offset - 8 + (dataOffset - 8);
    let pcmLen = 0;
    if (bits === 8) {
      pcmLen = length;
    } else {
      pcmLen = length * 2;  // 16-bit = 2 bytes per sample
    }
    if (numChan === 2) pcmLen *= 2;  // stereo interleaved

    let pcm = new Uint8Array(0);
    if (pcmOff >= 0 && pcmOff < buf.length && pcmLen > 0) {
      const avail = Math.min(pcmLen, buf.length - pcmOff);
      pcm = buf.slice(pcmOff, pcmOff + avail);
    }

    const isStereo  = numChan === 2;
    const isPingpong = (loopType & 2) !== 0;

    sampleMap.set(smpNum, {
      smpNum, name, bits: bits === 16 ? 16 : 8, sampleFreq,
      length, loopStart, loopEnd, hasLoop,
      volume: Math.min(volume, 255),
      stereo: isStereo, pingpong: isPingpong, pcm,
    });
  }

  // SAMP (v1 format — GT2SampleV1, 56 bytes):
  //   smpNum(2), name[28], flags(2), defaultPan(2), bits(2), sampleFreq(2),
  //   length(4), loopStart(4), loopLength(4), volume(2), finetune(2), sampleCoding(2)
  for (const smpChunk of findAllChunks(chunks, CHUNK_SAMP)) {
    if (smpChunk.length < 56) continue;
    const b = smpChunk.offset;
    const smpNum      = u16be(buf, b);
    if (!smpNum || smpNum >= 1000 || sampleMap.has(smpNum)) continue;
    const name        = readString(buf, b + 2, 28);
    const flags       = u16be(buf, b + 30);
    const bits        = u16be(buf, b + 34);
    const sampleFreq  = u16be(buf, b + 36) * 2;  // nC5Speed = file_sampleFreq * 2
    const length      = u32be(buf, b + 38);
    const loopStart   = u32be(buf, b + 42);
    const loopLen     = u32be(buf, b + 46);
    const volume      = u16be(buf, b + 50);
    const sampleCoding = u16be(buf, b + 54);

    if (sampleCoding !== 0) continue;

    const isStereo   = (flags & 0x01) !== 0;
    const isPingpong = (flags & 0x02) !== 0;

    let numLength    = length;
    let numLoopStart = loopStart;
    let numLoopEnd   = loopStart + loopLen;

    if (bits === 16) {
      numLength    /= 2;
      numLoopStart /= 2;
      numLoopEnd   /= 2;
    }

    const hasLoop = loopStart > 0 || loopLen > 2;

    // Sample data follows the 56-byte header in the chunk
    const pcmOff = b + 56;
    let pcmLen = bits === 16 ? length : length;
    if (bits !== 16) pcmLen = length;
    else pcmLen = length;  // length in SAMP is in bytes regardless (divided above for samples)
    // Re-check: GT2SampleV1::ConvertToMPT divides nLength/2 if bits==16
    // meaning the raw length field is in bytes. pcmLen = length bytes.
    if (isStereo) pcmLen *= 2;

    let pcm = new Uint8Array(0);
    if (pcmOff < buf.length && pcmLen > 0) {
      const avail = Math.min(pcmLen, buf.length - pcmOff);
      pcm = buf.slice(pcmOff, pcmOff + avail);
    }

    sampleMap.set(smpNum, {
      smpNum, name, bits: bits === 16 ? 16 : 8, sampleFreq,
      length: numLength, loopStart: numLoopStart, loopEnd: numLoopEnd, hasLoop,
      volume: Math.min(Math.abs(volume), 255),
      stereo: isStereo, pingpong: isPingpong, pcm,
    });
  }

  // ── INST: instrument → sample mapping ────────────────────────────────────
  // GT2Instrument (308 bytes):
  //   insNum(2), name[28], type(2), defaultVelocity(2), defaultPan(2),
  //   volEnv(2), toneEnv(2), panEnv(2), cutoffEnv(2), resoEnv(2),
  //   reserved[4], version(2), samples[128]×{num(1),transpose(1)}
  // Total = 2+28+2+2+2+2+2+2+2+2+4+2 = 54 bytes + 128×2 = 256 → 310... but struct says 308
  // Actually from struct layout: 2+28+2+2+2+2+2+2+2+2+4+2+128*2 = 308 bytes

  // We map insNum → { name, samples[128]: smpNum }
  interface GT2InstrRecord {
    insNum:  number;
    name:    string;
    samples: number[];  // 128 sample nums (one per note), 0=none
  }
  const instrMap = new Map<number, GT2InstrRecord>();

  for (const insChunk of findAllChunks(chunks, CHUNK_INST)) {
    if (insChunk.length < 308) continue;
    const b = insChunk.offset;
    const insNum = u16be(buf, b);
    if (!insNum) continue;
    const name   = readString(buf, b + 2, 28);
    const type   = u16be(buf, b + 30);
    if (type !== 0) continue;  // Only sample-based instruments

    const samples: number[] = [];
    for (let n = 0; n < 128; n++) {
      samples.push(u8(buf, b + 52 + n * 2));  // samples[n].num (transpose at +1 ignored for our purposes)
    }
    instrMap.set(insNum, { insNum, name, samples });
  }

  // ── Build InstrumentConfig list ───────────────────────────────────────────
  // If instruments are defined, use them; otherwise use samples directly.
  const instruments: InstrumentConfig[] = [];

  if (instrMap.size > 0) {
    const sortedInstrNums = Array.from(instrMap.keys()).sort((a, b) => a - b);
    for (const insNum of sortedInstrNums) {
      const instr = instrMap.get(insNum)!;
      // Find first non-zero sample in the note map (use middle C = note 60)
      let smpNum = instr.samples[60] || instr.samples[48] || instr.samples.find(s => s !== 0) || 0;
      const smpData = smpNum > 0 ? sampleMap.get(smpNum) : undefined;

      if (!smpData || smpData.pcm.length === 0) {
        instruments.push({
          id: insNum, name: instr.name || `Instrument ${insNum}`,
          type: 'sample' as const, synthType: 'Sampler' as const,
          effects: [], volume: 0, pan: 0,
        } as unknown as InstrumentConfig);
        continue;
      }

      const mono8 = toMono8(smpData);
      const vol   = smpData.volume > 0 ? Math.min(smpData.volume / 4, 64) : 64;
      const rate  = smpData.sampleFreq > 0 ? smpData.sampleFreq : 8363;

      instruments.push(
        createSamplerInstrument(
          insNum, instr.name || `Instrument ${insNum}`, mono8, vol, rate,
          smpData.hasLoop ? smpData.loopStart : 0,
          smpData.hasLoop ? smpData.loopEnd   : 0,
        ),
      );
    }
  } else {
    // No instruments — use samples directly
    const sortedSmpNums = Array.from(sampleMap.keys()).sort((a, b) => a - b);
    for (const smpNum of sortedSmpNums) {
      const smpData = sampleMap.get(smpNum)!;
      if (smpData.pcm.length === 0) {
        instruments.push({
          id: smpNum, name: smpData.name || `Sample ${smpNum}`,
          type: 'sample' as const, synthType: 'Sampler' as const,
          effects: [], volume: 0, pan: 0,
        } as unknown as InstrumentConfig);
        continue;
      }

      const mono8 = toMono8(smpData);
      const vol   = smpData.volume > 0 ? Math.min(smpData.volume / 4, 64) : 64;
      const rate  = smpData.sampleFreq > 0 ? smpData.sampleFreq : 8363;

      instruments.push(
        createSamplerInstrument(
          smpNum, smpData.name || `Sample ${smpNum}`, mono8, vol, rate,
          smpData.hasLoop ? smpData.loopStart : 0,
          smpData.hasLoop ? smpData.loopEnd   : 0,
        ),
      );
    }
  }

  // ── PATD: pattern data ────────────────────────────────────────────────────
  // GT2PatternCell (5 bytes): note(1), instr(1), effect(1), param(1), volume(1)
  // PATD chunk layout:
  //   patNum(2), name[16], codingVersion(2), numRows(2), numTracks(2), then cells

  const numOrderPatterns  = orders.length > 0 ? Math.max(...orders) + 1 : 0;
  const rawPatterns: Map<number, TrackerCell[][]> = new Map();

  for (const patChunk of findAllChunks(chunks, CHUNK_PATD)) {
    if (patChunk.length < 24) continue;
    const b = patChunk.offset;
    const patNum       = u16be(buf, b);
    // name[16] at b+2, skip
    const codingVersion = u16be(buf, b + 18);
    const numRows       = u16be(buf, b + 20);
    const numTracks     = u16be(buf, b + 22);

    if (codingVersion > 1) continue;
    if (numRows === 0 || numTracks === 0) continue;

    const cellsNeeded = numRows * numTracks * 5;
    if (patChunk.length < 24 + cellsNeeded) continue;

    const cells: TrackerCell[][] = [];
    for (let row = 0; row < numRows; row++) {
      const rowCells: TrackerCell[] = [];
      for (let chn = 0; chn < numTracks; chn++) {
        const off = b + 24 + (row * numTracks + chn) * 5;
        const data0 = u8(buf, off);     // note
        const data1 = u8(buf, off + 1); // instr
        const data2 = u8(buf, off + 2); // effect
        const data3 = u8(buf, off + 3); // param
        const data4 = u8(buf, off + 4); // volume

        // note range: data.note > 0 && data.note <= NOTE_MAX - NOTE_MIN + 1
        // In OpenMPT: m.note = data.note + NOTE_MIN = data.note + 1
        // XM note 1 = C-0, note 13 = C-1, note 37 = C-2, etc.
        let note = 0;
        if (data0 > 0 && data0 <= 120) {
          note = data0 + 1;
        }

        const instr = data1;

        const { effTyp, eff } = translateEffect(data2, data3, false);

        // Volume column: codingVersion 0 → vol / 4, codingVersion 1 → vol - 0x10
        let volVal = 0;
        if (data4 > 0) {
          if (codingVersion === 0) {
            volVal = Math.min(Math.trunc(data4 / 4), 64);
          } else {
            volVal = Math.max(data4 - 0x10, 0);
          }
        }

        rowCells.push({
          note,
          instrument: instr,
          volume: data4 > 0 ? volVal : 0,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0,
        });
      }
      cells.push(rowCells);
    }
    rawPatterns.set(patNum, cells);
  }

  // Default numRows from patterns (use 64 if unknown)
  const firstPat = rawPatterns.values().next().value;
  const defaultRows = firstPat ? firstPat.length : 64;

  // ── TNAM: channel names (optional) ───────────────────────────────────────
  const channelNames: string[] = new Array(numChannels).fill('');
  const tnamChunk = findChunk(chunks, CHUNK_TNAM);
  if (tnamChunk && tnamChunk.length >= 2) {
    const numNames = u16be(buf, tnamChunk.offset);
    // GT2TrackName (36 bytes): type(2), trackNumber(2), name[32]
    for (let i = 0; i < numNames; i++) {
      const base = tnamChunk.offset + 2 + i * 36;
      if (base + 35 >= buf.length) break;
      const ttype  = u16be(buf, base);
      const tnum   = u16be(buf, base + 2);
      if (ttype === 0 && tnum < numChannels) {
        channelNames[tnum] = readString(buf, base + 4, 32);
      }
    }
  }

  // ── Build patterns ────────────────────────────────────────────────────────
  const patterns: Pattern[] = orders.map((patIdx, ordIdx) => {
    const rawPat = rawPatterns.get(patIdx);
    const numRows = rawPat ? rawPat.length : defaultRows;

    const channels: ChannelData[] = Array.from({ length: numChannels }, (_, ch) => {
      const rows: TrackerCell[] = Array.from({ length: numRows }, (_, row): TrackerCell => {
        if (!rawPat || !rawPat[row]) {
          return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
        }
        return rawPat[row][ch] ?? { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
      });

      return {
        id:           `channel-${ch}`,
        name:         channelNames[ch] || `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       channelVol[ch] ?? 100,
        pan:          channelPan[ch] ?? 0,
        instrumentId: null,
        color:        null,
        rows,
      };
    });

    return {
      id:       `pattern-${ordIdx}`,
      name:     `Pattern ${ordIdx}`,
      length:   numRows,
      channels,
      importMetadata: {
        sourceFormat:            'GraoumfTracker2',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    numChannels,
        originalPatternCount:    numOrderPatterns,
        originalInstrumentCount: instrMap.size > 0 ? instrMap.size : sampleMap.size,
      },
    };
  });

  if (patterns.length === 0) {
    patterns.push(makeEmptyPattern(numChannels, defaultRows, filename, 0, 0));
  }

  return {
    name:            songName || filename.replace(/\.[^/.]+$/, ''),
    format:          'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions:   patterns.map((_, i) => i),
    songLength:      patterns.length,
    restartPosition: Math.min(restartPos, Math.max(patterns.length - 1, 0)),
    numChannels,
    initialSpeed,
    initialBPM,
    linearPeriods:   false,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert a GT2SampleRecord to an 8-bit mono PCM array (downmix stereo, downsample 16→8). */
function toMono8(smp: { pcm: Uint8Array; bits: number; stereo: boolean }): Uint8Array {
  const { pcm, bits, stereo } = smp;
  if (bits === 8 && !stereo) return pcm;

  let samples: number[];
  if (bits === 16) {
    // Big-endian 16-bit signed
    const count = Math.trunc(pcm.length / 2);
    samples = [];
    for (let i = 0; i < count; i++) {
      const hi = pcm[i * 2]     ?? 0;
      const lo = pcm[i * 2 + 1] ?? 0;
      const s16 = (hi < 128 ? hi : hi - 256) * 256 + lo;
      // Convert to unsigned 8-bit: 0x80 = silence
      samples.push(Math.round(s16 / 256) + 128);
    }
  } else {
    samples = Array.from(pcm);
  }

  if (stereo) {
    // Stereo interleaved → average L+R
    const mono: number[] = [];
    for (let i = 0; i < samples.length - 1; i += 2) {
      const l = (samples[i]     ?? 128) - 128;
      const r = (samples[i + 1] ?? 128) - 128;
      mono.push(Math.round((l + r) / 2) + 128);
    }
    return new Uint8Array(mono);
  }

  return new Uint8Array(samples);
}

function makeEmptyPattern(
  numChannels: number,
  numRows: number,
  filename: string,
  channelCount: number,
  patternCount: number,
): Pattern {
  return {
    id:     'pattern-0',
    name:   'Pattern 0',
    length: numRows,
    channels: Array.from({ length: numChannels }, (_, ch) => ({
      id:           `channel-${ch}`,
      name:         `Channel ${ch + 1}`,
      muted:        false,
      solo:         false,
      collapsed:    false,
      volume:       100,
      pan:          0,
      instrumentId: null,
      color:        null,
      rows: Array.from({ length: numRows }, (): TrackerCell => ({
        note: 0, instrument: 0, volume: 0,
        effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      })),
    })),
    importMetadata: {
      sourceFormat:            'GraoumfTracker2',
      sourceFile:              filename,
      importedAt:              new Date().toISOString(),
      originalChannelCount:    channelCount,
      originalPatternCount:    patternCount,
      originalInstrumentCount: 0,
    },
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse a Graoumf Tracker 1 (GTK) or Graoumf Tracker 2 (GT2) file.
 * Returns null on any parse failure — never throws.
 */
export function parseGraoumfTracker2File(bytes: Uint8Array, filename: string): TrackerSong | null {
  try {
    if (!bytes || bytes.length < 10) return null;

    // GT2 magic "GT2"
    if (bytes[0] === 0x47 && bytes[1] === 0x54 && bytes[2] === 0x32) {
      return parseGT2File(bytes, filename);
    }

    // GTK magic "GTK"
    if (bytes[0] === 0x47 && bytes[1] === 0x54 && bytes[2] === 0x4B) {
      return parseGTKFile(bytes, filename);
    }

    return null;
  } catch {
    return null;
  }
}
