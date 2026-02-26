/**
 * MTMParser.ts — MultiTracker (.mtm) format parser
 *
 * MultiTracker is a PC DOS tracker format by Ian Croft.
 *
 * Binary layout:
 *   +0    File header (66 bytes):
 *           id[3]          = "MTM"
 *           version        = uint8 (e.g. 0x10)
 *           songName[20]   = ASCIIZ
 *           numTracks      = uint16LE
 *           lastPattern    = uint8
 *           lastOrder      = uint8
 *           commentSize    = uint16LE
 *           numSamples     = uint8
 *           attribute      = uint8 (unused)
 *           beatsPerTrack  = uint8 (usually 64)
 *           numChannels    = uint8 (1-32)
 *           panPos[32]     = uint8[32]
 *
 *   +66   Sample headers: numSamples x 37 bytes each
 *           samplename[22], length(u32le), loopStart(u32le), loopEnd(u32le),
 *           finetune(i8), volume(u8 0-64), attribute(u8 bit0=16bit)
 *
 *   +66+numSamples*37      Order table: 128 x uint8
 *   +66+numSamples*37+128  Track data: numTracks x 192 bytes
 *                           Each track: 64 rows x 3 bytes [noteInstr, instrCmd, par]
 *   +...                   Pattern table: (lastPattern+1) x 32 x uint16LE track refs
 *   +...                   Comment (commentSize bytes)
 *   +...                   Sample PCM (sequential, unsigned 8-bit or LE 16-bit)
 *
 * Reference: OpenMPT Load_mtm.cpp
 */
import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// -- Binary helpers -----------------------------------------------------------

function u8(v: DataView, off: number): number    { return v.getUint8(off); }
function i8(v: DataView, off: number): number    { return v.getInt8(off); }
function u16le(v: DataView, off: number): number { return v.getUint16(off, true); }
function u32le(v: DataView, off: number): number { return v.getUint32(off, true); }

function readString(raw: Uint8Array, off: number, maxLen: number): string {
  let end = off;
  while (end < off + maxLen && raw[end] \!== 0) end++;
  return String.fromCharCode(...Array.from(raw.subarray(off, end))).trim();
}

// -- Constants ----------------------------------------------------------------

const FILE_HEADER_SIZE      = 66;
const SAMPLE_HEADER_SIZE    = 37;
const ORDER_TABLE_SIZE      = 128;
const ROWS_PER_TRACK_STORED = 64;
const BYTES_PER_TRACK_ROW   = 3;
const TRACK_BLOCK_SIZE      = ROWS_PER_TRACK_STORED * BYTES_PER_TRACK_ROW; // 192
const MAX_CHANNELS_IN_PAT   = 32;
const SAMPLE_RATE           = 8363;

// -- Format detection ---------------------------------------------------------

/**
 * Returns true if the buffer begins with "MTM" magic and passes header validation.
 */
export function isMTMFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < FILE_HEADER_SIZE) return false;
  const raw = new Uint8Array(buffer);
  if (raw[0] \!== 0x4D || raw[1] \!== 0x54 || raw[2] \!== 0x4D) return false;
  if (raw[3] >= 0x20) return false;
  if (raw[27] > 127) return false;
  if (raw[32] > 64)  return false;
  if (raw[33] === 0 || raw[33] > 32) return false;
  return true;
}
// -- Effect mapping -----------------------------------------------------------

/**
 * Map raw MTM effect cmd+param to XM effTyp/eff.
 * Replicates OpenMPT Load_mtm.cpp quirk adjustments.
 */
function mapMTMEffect(cmd: number, param: number): { effTyp: number; eff: number } {
  if (cmd === 0 && param === 0) return { effTyp: 0, eff: 0 };

  let p = param;
  if (cmd === 0x0A) {
    // Volume slide: keep only high or low nibble
    if (p & 0xF0) p = p & 0xF0;
    else          p = p & 0x0F;
  } else if (cmd === 0x08) {
    // Panning (8xx): not supported in MTM
    return { effTyp: 0, eff: 0 };
  } else if (cmd === 0x0E) {
    // Extended: several sub-commands unsupported in MTM
    const sub = p & 0xF0;
    if (sub === 0x00 || sub === 0x30 || sub === 0x40 ||
        sub === 0x60 || sub === 0x70 || sub === 0xF0) {
      return { effTyp: 0, eff: 0 };
    }
  }
  return { effTyp: cmd, eff: p };
}

// -- Note conversion ----------------------------------------------------------

/**
 * Convert MTM raw note value (noteInstr >> 2) to XM note number.
 * MTM stores 0-based semitone index; XM note 1 = C-0.
 * Returns 0 for empty.
 */
function mtmNoteToXM(rawNote: number): number {
  if (rawNote === 0) return 0;
  return Math.min(rawNote, 96);
}

// -- Parser -------------------------------------------------------------------

export async function parseMTMFile(
  buffer: ArrayBuffer,
  filename: string
): Promise<TrackerSong> {
  const v   = new DataView(buffer);
  const raw = new Uint8Array(buffer);

  // File header offsets (from MTMFileHeader struct in Load_mtm.cpp):
  //   0: id[3]  3: version  4: songName[20]  24: numTracks(u16le)
  //  26: lastPattern  27: lastOrder  28: commentSize(u16le)
  //  30: numSamples  31: attribute  32: beatsPerTrack  33: numChannels
  //  34: panPos[32]

  const songName      = readString(raw, 4, 20);
  const numTracks     = u16le(v, 24);
  const lastPattern   = u8(v, 26);
  const lastOrder     = u8(v, 27);
  const commentSize   = u16le(v, 28);
  const numSamples    = u8(v, 30);
  const beatsPerTrack = u8(v, 32);
  const numChannels   = u8(v, 33);
  const panPos        = Array.from(raw.subarray(34, 66));

  const rowsPerPattern = beatsPerTrack > 0 ? beatsPerTrack : 64;
  const numPatterns    = lastPattern + 1;
  const songLength     = lastOrder + 1;

  const sampleHdrsOffset = FILE_HEADER_SIZE;
  const orderTableOffset = sampleHdrsOffset + numSamples * SAMPLE_HEADER_SIZE;
  const trackDataOffset  = orderTableOffset + ORDER_TABLE_SIZE;
  const patTableOffset   = trackDataOffset  + numTracks * TRACK_BLOCK_SIZE;
  const patTableSize     = numPatterns * MAX_CHANNELS_IN_PAT * 2;
  const commentOffset    = patTableOffset + patTableSize;
  const sampleDataOffset = commentOffset + commentSize;
  // -- Sample headers --------------------------------------------------------
  interface MTMSampleInfo {
    name:      string;
    rawLength: number;  // original byte count in file (before 16-bit halving)
    length:    number;  // in samples (after halving for 16-bit)
    loopStart: number;
    loopEnd:   number;
    finetune:  number;
    volume:    number;
    is16bit:   boolean;
    hasLoop:   boolean;
  }

  const sampleInfos: MTMSampleInfo[] = [];
  for (let s = 0; s < numSamples; s++) {
    const base     = sampleHdrsOffset + s * SAMPLE_HEADER_SIZE;
    const sName    = readString(raw, base, 22);
    const sLen     = u32le(v, base + 22);
    const sLoopSt  = u32le(v, base + 26);
    const sLoopEnd = u32le(v, base + 30);
    const sFine    = i8(v, base + 34);
    const sVol     = u8(v, base + 35);
    const sAttr    = u8(v, base + 36);
    const is16bit  = (sAttr & 0x01) !== 0;

    // Replicate OpenMPT ConvertToMPT:
    // nLoopEnd = max(loopEnd, 1) - 1, clamped to nLength
    // halve all values if 16-bit; clear loop if nLoopStart+4 >= nLoopEnd
    let adjLen      = sLen;
    let adjLoopSt   = sLoopSt;
    let adjLoopEnd  = Math.min(Math.max(sLoopEnd, 1) - 1, sLen);

    if (is16bit) {
      adjLen     = Math.floor(adjLen    / 2);
      adjLoopSt  = Math.floor(adjLoopSt / 2);
      adjLoopEnd = Math.floor(adjLoopEnd / 2);
    }

    let hasLoop = false;
    if (adjLen > 2) {
      if (adjLoopSt + 4 >= adjLoopEnd) {
        adjLoopSt  = 0;
        adjLoopEnd = 0;
      }
      hasLoop = adjLoopEnd > 2;
    } else {
      adjLen = 0;
    }

    sampleInfos.push({
      name: sName, rawLength: sLen, length: adjLen,
      loopStart: adjLoopSt, loopEnd: adjLoopEnd,
      finetune: sFine, volume: Math.min(sVol, 64), is16bit, hasLoop,
    });
  }

  // -- Order table -----------------------------------------------------------
  const orders: number[] = [];
  for (let i = 0; i < songLength; i++) {
    orders.push(u8(v, orderTableOffset + i));
  }
  // -- Pre-parse all tracks --------------------------------------------------
  interface TrackRow { note: number; instr: number; effTyp: number; eff: number; }
  const parsedTracks: TrackRow[][] = [];

  for (let t = 0; t < numTracks; t++) {
    const tBase = trackDataOffset + t * TRACK_BLOCK_SIZE;
    const rows: TrackRow[] = [];
    for (let row = 0; row < rowsPerPattern; row++) {
      const off       = tBase + row * BYTES_PER_TRACK_ROW;
      const noteInstr = u8(v, off);
      const instrCmd  = u8(v, off + 1);
      const par       = u8(v, off + 2);

      const rawNote = noteInstr >> 2;
      const note    = (noteInstr & 0xFC) !== 0 ? mtmNoteToXM(rawNote) : 0;
      const instr   = ((noteInstr & 0x03) << 4) | (instrCmd >> 4);
      const cmd     = instrCmd & 0x0F;
      const { effTyp, eff } = mapMTMEffect(cmd, par);
      rows.push({ note, instr, effTyp, eff });
    }
    parsedTracks.push(rows);
  }
  // -- Build patterns --------------------------------------------------------
  const patterns: Pattern[] = [];

  for (let pat = 0; pat < numPatterns; pat++) {
    const patBase = patTableOffset + pat * MAX_CHANNELS_IN_PAT * 2;
    const trackIndices: number[] = [];
    for (let ch = 0; ch < MAX_CHANNELS_IN_PAT; ch++) {
      trackIndices.push(u16le(v, patBase + ch * 2));
    }

    const channels: ChannelData[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const trackRef = trackIndices[ch];
      const rows: TrackerCell[] = [];

      for (let row = 0; row < rowsPerPattern; row++) {
        if (trackRef === 0 || trackRef > numTracks || trackRef > parsedTracks.length) {
          rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
        } else {
          const tRow = parsedTracks[trackRef - 1][row];
          rows.push({
            note: tRow.note, instrument: tRow.instr, volume: 0,
            effTyp: tRow.effTyp, eff: tRow.eff, effTyp2: 0, eff2: 0,
          });
        }
      }

      const panNibble = panPos[ch] & 0x0F;
      const pan = Math.round(((panNibble / 15) * 2 - 1) * 50);
      channels.push({
        id: `channel-${ch}`, name: `Channel ${ch + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100, pan, instrumentId: null, color: null, rows,
      });
    }

    patterns.push({
      id: `pattern-${pat}`, name: `Pattern ${pat}`,
      length: rowsPerPattern, channels,
      importMetadata: {
        sourceFormat: 'MTM', sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: numChannels,
        originalPatternCount: numPatterns,
        originalInstrumentCount: numSamples,
      },
    });
  }
  // -- Song positions --------------------------------------------------------
  const songPositions: number[] = orders.map(ord => Math.min(ord, numPatterns - 1));

  // -- Instruments -----------------------------------------------------------
  // MTM sample PCM is stored sequentially after the comment block.
  // 8-bit: unsigned PCM -> XOR 0x80 to convert to signed (for pcm8ToWAV).
  // 16-bit: unsigned LE 16-bit -> downsample to signed 8-bit.

  let sampleReadOffset = sampleDataOffset;

  const instruments: InstrumentConfig[] = sampleInfos.map((info, i) => {
    const id   = i + 1;
    const name = info.name || `Sample ${id}`;

    const fileBytesForSample = info.rawLength;
    const startOff = sampleReadOffset;
    sampleReadOffset += fileBytesForSample;

    if (
      info.length === 0 ||
      fileBytesForSample === 0 ||
      startOff + fileBytesForSample > buffer.byteLength
    ) {
      return { id, name, type: 'sample' as const, synthType: 'Sampler' as const,
               effects: [], volume: -60, pan: 0 } as InstrumentConfig;
    }

    const loopStart = info.hasLoop ? info.loopStart : 0;
    const loopEnd   = info.hasLoop ? info.loopEnd   : 0;

    if (info.is16bit) {
      // 16-bit unsigned LE -> signed 8-bit approximation
      const numSmp16 = info.length;
      const pcm = new Uint8Array(numSmp16);
      for (let s = 0; s < numSmp16 && startOff + s * 2 + 1 < buffer.byteLength; s++) {
        const u16val = u16le(v, startOff + s * 2);
        // unsigned 16-bit high byte -> flip sign bit
        pcm[s] = ((u16val >> 8) ^ 0x80) & 0xFF;
      }
      return createSamplerInstrument(id, name, pcm, info.volume, SAMPLE_RATE, loopStart, loopEnd);
    } else {
      // 8-bit unsigned -> signed: XOR 0x80
      const pcm = new Uint8Array(fileBytesForSample);
      for (let s = 0; s < fileBytesForSample; s++) {
        pcm[s] = raw[startOff + s] ^ 0x80;
      }
      return createSamplerInstrument(id, name, pcm, info.volume, SAMPLE_RATE, loopStart, loopEnd);
    }
  });
  return {
    name:            songName || filename.replace(/\.[^/.]+$/, ''),
    format:          'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength:      songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed:    6,
    initialBPM:      125,
    linearPeriods:   false,
  };
}
