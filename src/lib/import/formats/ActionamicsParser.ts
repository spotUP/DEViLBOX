/**
 * ActionamicsParser.ts — Actionamics Sound Tool native parser
 *
 * Actionamics is a 4-channel Amiga tracker. Files are identified by the
 * signature "ACTIONAMICS SOUND TOOL" at offset 62 (22 ASCII bytes).
 * Extension: .act (also .ast in some docs but NostalgicPlayer uses .ast)
 *
 * Reference: NostalgicPlayer ActionamicsWorker.cs (authoritative loader)
 * Reference music: /Users/spot/Code/DEViLBOX/Reference Music/Actionamics/
 *
 * File layout:
 *   Offset 0: uint16 BE tempo (BPM)
 *   Offset 2: uint32 BE × 15 section lengths (lengths[0..14])
 *   Offset 62: "ACTIONAMICS SOUND TOOL" (22 bytes — identification mark)
 *
 * Section offsets (computed from section lengths):
 *   base = 2 + 4*15 = 62
 *   base + lengths[0]  → module info: uint32 totalLength
 *   +lengths[1]        → position lists (track numbers, note transposes, instrument transposes)
 *   +lengths[2]+[3]+[4] skipped, then instruments
 *   +lengths[5]        → instrument records (32 bytes each)
 *   +lengths[6]        → sampleNumberList (sbyte[N][16])
 *   +lengths[7]        → arpeggioList
 *   +lengths[8]        → frequencyList
 *   +lengths[9]+[10]   skipped
 *   +lengths[11]       → sub-song info (4 bytes each: start, end, loop, speed)
 *   +lengths[12]       skipped
 *   +lengths[13]       → sample headers (64 bytes each)
 *   +lengths[14]       → track offset table (uint16 BE each) + track data
 *   at totalLength - sum(sampleLengths*2) → sample PCM data
 *
 * Track format (variable-length):
 *   0x80-0xFF = delay byte (~value = delay count)
 *   0x70-0x7F = effect command + 1 arg byte
 *   0x00-0x6F = note byte, then instrument byte or delay/effect, then effect byte + arg
 *
 * Period table (from Tables.cs): index 1-73 → periods 5760..95
 * Note index 0 = no note. Note 37 (period 856) = XM C3.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Constants ──────────────────────────────────────────────────────────────

const SIGNATURE = 'ACTIONAMICS SOUND TOOL';
const SIGNATURE_OFFSET = 62;
const PAL_CLOCK = 3546895;

/**
 * Actionamics period table (verbatim from Tables.cs).
 * Index 0 = no note. Index 1-73 = valid periods.
 * Index 37 maps to period 856 = ProTracker C-2 = XM C3 (note 37).
 */
const PERIODS: number[] = [
  0,
  5760, 5424, 5120, 4832, 4560, 4304, 4064, 3840, 3816,
  3424, 3232, 3048, 2880, 2712, 2560, 2416, 2280, 2152, 2032, 1920, 1808,
  1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016,  960,  904,
   856,  808,  762,  720,  678,  640,  604,  570,  538,  508,  480,  453,
   428,  404,  381,  360,  339,  320,  302,  285,  269,  254,  240,  226,
   214,  202,  190,  180,  170,  160,  151,  143,  135,  127,  120,  113,
   107,  101,   95,
];

// XM note 37 = C-3 corresponds to period 856 (PERIODS index 37, 1-based → index 36 in 0-based).
// PERIODS[37] = 856, so noteIndex 37 → XM note 37 (C-3).
// Linear mapping: xmNote = noteIndex + 12 (because PERIODS[1]=5760 = C-0 in Amiga, XM note 13).
// Actually: PERIODS[1]=5760 is very low (C-0). ProTracker C-1 = period 856 = PERIODS[37].
// PERIODS[37] = 856 → XM C3 = 37. PERIODS[1] = 5760 → much lower octave.
// The mapping: xmNote = noteIndex (the table index IS the XM note).
// Because PERIODS[37]=856 = ProTracker C-2 = XM C3 = note 37. So 1:1 mapping works.
const PERIOD_TABLE_REFERENCE_IDX = 37; // period 856
const XM_REFERENCE_NOTE = 37;          // XM C-3

// ── Utilities ──────────────────────────────────────────────────────────────

function u16BE(b: Uint8Array, off: number): number {
  return (b[off] << 8) | b[off + 1];
}

function u32BE(b: Uint8Array, off: number): number {
  return ((b[off] << 24) | (b[off + 1] << 16) | (b[off + 2] << 8) | b[off + 3]) >>> 0;
}

function s8(v: number): number {
  return v < 128 ? v : v - 256;
}

function readAmigaString(b: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = b[off + i];
    if (c === 0) break;
    if (c >= 32 && c < 128) s += String.fromCharCode(c);
  }
  return s.trim();
}

/** Convert Actionamics note index (1-based) to XM note number */
function astNoteToXM(noteIdx: number): number {
  if (noteIdx <= 0 || noteIdx >= PERIODS.length) return 0;
  // PERIODS[37]=856=ProTracker C-2=XM C3=37. Direct index mapping.
  const xm = XM_REFERENCE_NOTE + (noteIdx - PERIOD_TABLE_REFERENCE_IDX);
  return Math.max(1, Math.min(96, xm));
}

/** Get sample rate from period */
function periodToRate(period: number): number {
  if (period <= 0) return 8287;
  return Math.round(PAL_CLOCK / (2 * period));
}

// ── Format Identification ──────────────────────────────────────────────────

export function isActionamicsFormat(bytes: Uint8Array): boolean {
  if (bytes.length < 90) return false;
  let sig = '';
  for (let i = 0; i < SIGNATURE.length; i++) {
    sig += String.fromCharCode(bytes[SIGNATURE_OFFSET + i]);
  }
  return sig === SIGNATURE;
}

// ── Internal types ─────────────────────────────────────────────────────────

interface AstSample {
  name: string;
  length: number;      // in words
  loopStart: number;   // in words
  loopLength: number;  // in words
  pcm: Int8Array | null;
  arpeggioListNumber: number;
}

interface AstInstrument {
  sampleNumberListNumber: number;
  sampleNumberListValuesCount: number;
  sampleNumberListStartDelta: number;
  sampleNumberListCounterEnd: number;
  arpeggioListNumber: number;
  arpeggioListValuesCount: number;
  arpeggioListStartDelta: number;
  arpeggioListCounterEnd: number;
  frequencyListNumber: number;
  frequencyListValuesCount: number;
  frequencyListStartDelta: number;
  frequencyListCounterEnd: number;
  portamentoIncrement: number;
  portamentoDelay: number;
  noteTranspose: number;
  attackEndVolume: number;
  attackSpeed: number;
  decayEndVolume: number;
  decaySpeed: number;
  sustainDelay: number;
  releaseEndVolume: number;
  releaseSpeed: number;
}

interface AstSongInfo {
  startPosition: number;
  endPosition: number;
  loopPosition: number;
  speed: number;
}

interface AstPositionInfo {
  trackNumber: number;
  noteTranspose: number;   // signed
  instrumentTranspose: number; // signed
}

// ── Main parser ────────────────────────────────────────────────────────────

export function parseActionamicsFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isActionamicsFormat(bytes)) return null;

  try {
    return parseInternal(bytes, filename);
  } catch (e) {
    console.warn('[ActionamicsParser] Parse failed:', e);
    return null;
  }
}

function parseInternal(bytes: Uint8Array, filename: string): TrackerSong | null {
  const len = bytes.length;

  // ── Header ────────────────────────────────────────────────────────────
  const tempo = u16BE(bytes, 0);

  const sectionLengths: number[] = [];
  for (let i = 0; i < 15; i++) {
    sectionLengths.push(u32BE(bytes, 2 + i * 4));
  }

  // Base offset: 2 (tempo) + 15*4 (lengths) = 62
  let cursor = 62;

  // ── Section 0: Module info ────────────────────────────────────────────
  // Skip section 0 data, then read totalLength at (cursor + lengths[0])
  const moduleInfoOffset = cursor + sectionLengths[0];
  if (moduleInfoOffset + 4 > len) return null;
  const totalLength = u32BE(bytes, moduleInfoOffset);

  // ── Section 1: Position lists ─────────────────────────────────────────
  // positions[channel][position] — lengths[2] = trackNumberLength = instrumentTransposeLength = noteTransposeLength
  const positionsOffset = moduleInfoOffset + sectionLengths[1];
  const trackNumberLength = sectionLengths[2];
  const instrumentTransposeLength = sectionLengths[3];
  const noteTransposeLength = sectionLengths[4];

  if (trackNumberLength !== instrumentTransposeLength || trackNumberLength !== noteTransposeLength) {
    return null;
  }

  // Actually: trackNumberLength is total bytes for all 4 channels for track numbers
  // So count = trackNumberLength / 4 (one byte per channel per position, 4 channels)
  // Wait: per NostalgicPlayer: count = (int)(trackNumberLength / 4) — this is the number of positions per channel
  // because it reads 4 channels × count positions = 4×count bytes total
  // But trackNumberLength has units of bytes-per-array: actually count = trackNumberLength since it's one byte per position per channel stored sequentially
  // Let me re-read: int count = (int)(trackNumberLength / 4); — no wait, looking again:
  // "int count = (int)(trackNumberLength / 4);" — this divides by 4
  // Then for i=0..3 (channels), j=0..count-1 (positions): reads 1 byte = count*4 total = trackNumberLength. Correct.
  const numPositions = Math.floor(trackNumberLength / 4);

  if (positionsOffset + trackNumberLength + instrumentTransposeLength + noteTransposeLength > len) return null;

  // positions[4][numPositions]
  const positions: AstPositionInfo[][] = Array.from({ length: 4 }, () =>
    Array.from({ length: numPositions }, () => ({ trackNumber: 0, noteTranspose: 0, instrumentTranspose: 0 }))
  );

  let p = positionsOffset;
  // Read track numbers: 4 channels × numPositions
  for (let ch = 0; ch < 4; ch++) {
    for (let j = 0; j < numPositions; j++) {
      positions[ch][j].trackNumber = bytes[p++];
    }
  }
  // Read note transposes
  for (let ch = 0; ch < 4; ch++) {
    for (let j = 0; j < numPositions; j++) {
      positions[ch][j].noteTranspose = s8(bytes[p++]);
    }
  }
  // Read instrument transposes
  for (let ch = 0; ch < 4; ch++) {
    for (let j = 0; j < numPositions; j++) {
      positions[ch][j].instrumentTranspose = s8(bytes[p++]);
    }
  }

  // ── Instruments ───────────────────────────────────────────────────────
  const instrumentsOffset = positionsOffset + trackNumberLength + instrumentTransposeLength + noteTransposeLength;
  const instrumentLength = sectionLengths[5];
  const numInstruments = Math.floor(instrumentLength / 32);

  if (instrumentsOffset + instrumentLength > len) return null;

  const instruments: AstInstrument[] = [];
  let iOff = instrumentsOffset;
  for (let i = 0; i < numInstruments; i++) {
    // Each instrument is 32 bytes:
    // 3 × InstrumentList (4 bytes each = 12 bytes): listNumber, valuesCount, startDelta, counterEnd
    // portamentoIncrement (1), portamentoDelay (1), noteTranspose (1), pad (1) = 4
    // attackEnd (1), attackSpeed (1), decayEnd (1), decaySpeed (1), sustainDelay (1),
    // releaseEnd (1), releaseSpeed (1) = 7
    // pad (9) = 9
    // Total: 12 + 4 + 7 + 9 = 32 ✓
    const instr: AstInstrument = {
      sampleNumberListNumber: bytes[iOff],
      sampleNumberListValuesCount: bytes[iOff + 1],
      sampleNumberListStartDelta: bytes[iOff + 2],
      sampleNumberListCounterEnd: bytes[iOff + 3],
      arpeggioListNumber: bytes[iOff + 4],
      arpeggioListValuesCount: bytes[iOff + 5],
      arpeggioListStartDelta: bytes[iOff + 6],
      arpeggioListCounterEnd: bytes[iOff + 7],
      frequencyListNumber: bytes[iOff + 8],
      frequencyListValuesCount: bytes[iOff + 9],
      frequencyListStartDelta: bytes[iOff + 10],
      frequencyListCounterEnd: bytes[iOff + 11],
      portamentoIncrement: s8(bytes[iOff + 12]),
      portamentoDelay: bytes[iOff + 13],
      noteTranspose: s8(bytes[iOff + 14]),
      // iOff+15 = pad
      attackEndVolume: bytes[iOff + 16],
      attackSpeed: bytes[iOff + 17],
      decayEndVolume: bytes[iOff + 18],
      decaySpeed: bytes[iOff + 19],
      sustainDelay: bytes[iOff + 20],
      releaseEndVolume: bytes[iOff + 21],
      releaseSpeed: bytes[iOff + 22],
      // iOff+23..31 = pad (9 bytes)
    };
    instruments.push(instr);
    iOff += 32;
  }

  // ── Lists (sampleNumberList, arpeggioList, frequencyList) ─────────────
  // Each list section: count × 16 sbytes
  const sampleNumberListOffset = instrumentsOffset + instrumentLength;
  const arpeggioListOffset = sampleNumberListOffset + sectionLengths[6];
  const frequencyListOffset = arpeggioListOffset + sectionLengths[7];

  function loadList(offset: number, length: number): Int8Array[] {
    const count = Math.floor(length / 16);
    const result: Int8Array[] = [];
    for (let i = 0; i < count; i++) {
      const arr = new Int8Array(16);
      for (let j = 0; j < 16; j++) {
        arr[j] = s8(bytes[offset + i * 16 + j]);
      }
      result.push(arr);
    }
    return result;
  }

  const sampleNumberList = loadList(sampleNumberListOffset, sectionLengths[6]);
  // frequencyList loaded but not used for pattern extraction

  // ── Sub-songs ─────────────────────────────────────────────────────────
  // Skip lengths[9] and [10] after frequencyList
  const subSongsOffset = frequencyListOffset + sectionLengths[8] + sectionLengths[9] + sectionLengths[10];
  const subSongCount = Math.floor(sectionLengths[11] / 4);

  if (subSongsOffset + sectionLengths[11] > len) return null;

  const allSongInfos: AstSongInfo[] = [];
  for (let i = 0; i < subSongCount; i++) {
    const base = subSongsOffset + i * 4;
    const si: AstSongInfo = {
      startPosition: bytes[base],
      endPosition: bytes[base + 1],
      loopPosition: bytes[base + 2],
      speed: bytes[base + 3],
    };
    allSongInfos.push(si);
  }

  // Filter: remove all-zero entries (as NostalgicPlayer does)
  const songInfoList = allSongInfos.filter(s => s.startPosition !== 0 || s.endPosition !== 0 || s.loopPosition !== 0);
  if (songInfoList.length === 0) {
    // Fallback: use first entry even if zero
    if (allSongInfos.length > 0) songInfoList.push(allSongInfos[0]);
    else return null;
  }

  // ── Sample info ────────────────────────────────────────────────────────
  // skip lengths[12] after sub-songs section
  const sampleInfoOffset = subSongsOffset + sectionLengths[11] + sectionLengths[12];
  const sampleInfoLength = sectionLengths[13];
  const numSamples = Math.floor(sampleInfoLength / 64);

  if (sampleInfoOffset + sampleInfoLength > len) return null;

  const samples: AstSample[] = [];
  for (let i = 0; i < numSamples; i++) {
    const base = sampleInfoOffset + i * 64;
    // Layout per NostalgicPlayer LoadSampleInfo:
    //  seek(4) — pointer to data (skip)
    //  length (uint16 BE) — in words
    //  loopStart (uint16 BE) — in words
    //  loopLength (uint16 BE) — in words
    //  effectStartPosition (uint16 BE)
    //  effectLength (uint16 BE) — hi-byte is also arpeggio list number
    //  effectSpeed (uint16 BE)
    //  effectMode (uint16 BE)
    //  effectIncrementValue (int16 BE)
    //  effectPosition (int32 BE)
    //  effectSpeedCounter (uint16 BE)
    //  alreadyTaken (uint16 BE != 0)
    //  seek(4) — padding
    //  name (32 bytes string)
    const length = u16BE(bytes, base + 4);
    const loopStart = u16BE(bytes, base + 6);
    const loopLength = u16BE(bytes, base + 8);
    const effectLength = u16BE(bytes, base + 12);
    const arpeggioListNumber = (effectLength >> 8) & 0xff;
    const name = readAmigaString(bytes, base + 32, 32);

    samples.push({ name, length, loopStart, loopLength, pcm: null, arpeggioListNumber });
  }

  // ── Tracks ─────────────────────────────────────────────────────────────
  const tracksOffset = sampleInfoOffset + sampleInfoLength;
  const trackOffsetsLength = sectionLengths[14];
  const numTrackOffsets = Math.floor(trackOffsetsLength / 2);
  const numTracks = numTrackOffsets - 1; // last offset is sentinel

  if (tracksOffset + trackOffsetsLength > len) return null;

  const trackOffsetTable: number[] = [];
  for (let i = 0; i < numTrackOffsets; i++) {
    trackOffsetTable.push(u16BE(bytes, tracksOffset + i * 2));
  }

  const trackDataStart = tracksOffset + trackOffsetsLength;
  const trackDataArrays: Uint8Array[] = [];

  for (let i = 0; i < numTracks; i++) {
    const trackStart = trackDataStart + trackOffsetTable[i];
    const trackEnd = trackDataStart + trackOffsetTable[i + 1];
    if (trackEnd > len || trackStart > trackEnd) {
      trackDataArrays.push(new Uint8Array(0));
      continue;
    }
    trackDataArrays.push(bytes.slice(trackStart, trackEnd));
  }

  // ── Sample data ────────────────────────────────────────────────────────
  // Sample data starts at totalLength - sum(all sample lengths in bytes)
  const totalSampleBytes = samples.reduce((acc, s) => acc + s.length * 2, 0);
  const sampleDataStart = totalLength - totalSampleBytes;

  if (sampleDataStart >= 0 && sampleDataStart + totalSampleBytes <= len) {
    let sOff = sampleDataStart;
    for (const sample of samples) {
      if (sample.length > 0) {
        const byteLen = sample.length * 2;
        const pcm = new Int8Array(byteLen);
        for (let j = 0; j < byteLen; j++) {
          pcm[j] = s8(bytes[sOff + j]);
        }
        sample.pcm = pcm;
        sOff += byteLen;
      }
    }
  }

  // ── Use song 0 (primary sub-song) ─────────────────────────────────────
  const primarySong = songInfoList[0];

  // ── Build InstrumentConfig[] from samples ─────────────────────────────
  // Instruments reference samples via sampleNumberList. We build one
  // InstrumentConfig per sample (1-based).
  const instrumentConfigs: InstrumentConfig[] = [];

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const id = i + 1;

    if (sample.pcm && sample.length > 0) {
      const pcmBytes = new Uint8Array(sample.pcm.buffer);
      // Sample stored as signed 8-bit; createSamplerInstrument expects Uint8Array
      // (it will interpret as signed internally — consistent with other parsers)
      const period = PERIODS[PERIOD_TABLE_REFERENCE_IDX] || 856;
      const sampleRate = periodToRate(period);
      const loopStart = sample.loopLength > 1 ? sample.loopStart * 2 : 0;
      const loopEnd = sample.loopLength > 1 ? (sample.loopStart + sample.loopLength) * 2 : 0;

      instrumentConfigs.push(
        createSamplerInstrument(id, sample.name || `Sample ${i + 1}`, pcmBytes, 64, sampleRate, loopStart, loopEnd)
      );
    } else {
      instrumentConfigs.push({
        id,
        name: sample.name || `Sample ${i + 1}`,
        type: 'synth' as const,
        synthType: 'Synth' as const,
        effects: [],
        volume: 0,
        pan: 0,
      } as InstrumentConfig);
    }
  }

  // ── Decode tracks into patterns ────────────────────────────────────────
  // Parse track data. Each track is a stream of events for up to 64 rows.
  // We decode each track into an array of { note, instrNum } per row.
  interface TrackRow { note: number; instrNum: number; effect: number; effectArg: number; }

  function decodeTrack(data: Uint8Array): TrackRow[] {
    const rows: TrackRow[] = [];
    let pos = 0;
    let delayCounter = 0;
    const MAX_ROWS = 64;

    while (rows.length < MAX_ROWS && pos < data.length) {
      if (delayCounter > 0) {
        rows.push({ note: 0, instrNum: 0, effect: 0, effectArg: 0 });
        delayCounter--;
        continue;
      }

      const b0 = data[pos++];

      if ((b0 & 0x80) !== 0) {
        // Delay: ~b0 = delay count
        delayCounter = (~b0) & 0xff;
        rows.push({ note: 0, instrNum: 0, effect: 0, effectArg: 0 });
        continue;
      }

      if (b0 >= 0x70) {
        // Effect-only row
        const effArg = pos < data.length ? data[pos++] : 0;
        rows.push({ note: 0, instrNum: 0, effect: b0, effectArg: effArg });
        continue;
      }

      // Note row
      const note = b0;
      let instrNum = 0;
      let effect = 0;
      let effectArg = 0;

      if (pos >= data.length) {
        rows.push({ note, instrNum, effect, effectArg });
        break;
      }

      const b1 = data[pos++];
      if ((b1 & 0x80) !== 0) {
        delayCounter = (~b1) & 0xff;
        rows.push({ note, instrNum, effect, effectArg });
        continue;
      }
      if (b1 >= 0x70) {
        effectArg = pos < data.length ? data[pos++] : 0;
        rows.push({ note, instrNum, effect: b1, effectArg });
        continue;
      }

      instrNum = b1;

      if (pos >= data.length) {
        rows.push({ note, instrNum, effect, effectArg });
        break;
      }

      const b2 = data[pos++];
      if ((b2 & 0x80) !== 0) {
        delayCounter = (~b2) & 0xff;
        rows.push({ note, instrNum, effect, effectArg });
        continue;
      }

      effect = b2;
      effectArg = pos < data.length ? data[pos++] : 0;
      rows.push({ note, instrNum, effect, effectArg });
    }

    // Pad to 64 rows
    while (rows.length < MAX_ROWS) {
      rows.push({ note: 0, instrNum: 0, effect: 0, effectArg: 0 });
    }

    return rows.slice(0, MAX_ROWS);
  }

  /** Map Actionamics effect codes to XM effTyp/eff */
  function mapEffect(effect: number, arg: number): { effTyp: number; eff: number } {
    switch (effect) {
      case 0x70: return { effTyp: 0x00, eff: arg };          // Arpeggio
      case 0x71: return { effTyp: 0x01, eff: arg };          // Slide up (portamento up)
      case 0x72: return { effTyp: 0x02, eff: arg };          // Slide down
      case 0x73: return { effTyp: 0x0A, eff: arg };          // Volume slide after envelope
      case 0x74: return { effTyp: 0x04, eff: arg };          // Vibrato
      case 0x75: return { effTyp: 0x0F, eff: arg };          // Set rows (speed-like)
      case 0x76: return { effTyp: 0x09, eff: arg };          // Set sample offset
      case 0x77: return { effTyp: 0x0E, eff: 0xD0 | (arg & 0x0f) }; // Note delay (Exy E=D)
      case 0x78: return { effTyp: 0x0E, eff: 0xC0 | (arg & 0x0f) }; // Mute (cut) → ECx
      case 0x79: return { effTyp: 0x09, eff: arg };          // Sample restart
      case 0x7A: return { effTyp: 0x07, eff: arg };          // Tremolo
      case 0x7B: return { effTyp: 0x0D, eff: arg };          // Break
      case 0x7C: return { effTyp: 0x0C, eff: Math.min(64, arg) }; // Set volume
      case 0x7D: return { effTyp: 0x0A, eff: arg };          // Volume slide
      case 0x7E: return { effTyp: 0x06, eff: arg };          // Volume slide + vibrato
      case 0x7F: return { effTyp: 0x0F, eff: arg };          // Set speed
      default:   return { effTyp: 0, eff: 0 };
    }
  }

  // ── Build TrackerSong patterns ─────────────────────────────────────────
  // Use the primary sub-song's position list.
  // Each position entry gives track numbers for 4 channels.
  // We expand: one TrackerSong pattern per song position.

  const startPos = primarySong.startPosition;
  const endPos = primarySong.endPosition;

  const ROWS_PER_PATTERN = 64;
  const trackerPatterns: Pattern[] = [];

  for (let posIdx = startPos; posIdx <= endPos && posIdx < numPositions; posIdx++) {
    const channelRows: TrackerCell[][] = Array.from({ length: 4 }, () => []);

    for (let ch = 0; ch < 4; ch++) {
      const posInfo = positions[ch][posIdx];
      const trackIdx = posInfo.trackNumber;
      const noteTranspose = posInfo.noteTranspose;
      const instrTranspose = posInfo.instrumentTranspose;

      const trackData = trackIdx < trackDataArrays.length ? trackDataArrays[trackIdx] : new Uint8Array(0);
      const decodedRows = decodeTrack(trackData);

      for (let row = 0; row < ROWS_PER_PATTERN; row++) {
        const r = decodedRows[row] || { note: 0, instrNum: 0, effect: 0, effectArg: 0 };

        let xmNote = 0;
        let instrId = 0;

        if (r.note > 0) {
          // Apply note transpose
          const transposedNote = r.note + noteTranspose;
          xmNote = astNoteToXM(transposedNote);

          if (r.instrNum > 0) {
            // Apply instrument transpose to instrument index
            const instrIdx = r.instrNum - 1 + instrTranspose;
            if (instrIdx >= 0 && instrIdx < instruments.length) {
              const instr = instruments[instrIdx];
              // Get sample number from sampleNumberList
              const snListNum = instr.sampleNumberListNumber;
              if (snListNum < sampleNumberList.length) {
                const sampleNum = sampleNumberList[snListNum][0];
                instrId = (sampleNum >= 0 ? sampleNum : sampleNum + 256) + 1; // 1-based
              } else {
                instrId = r.instrNum;
              }
            }
          }
        }

        const { effTyp, eff } = mapEffect(r.effect, r.effectArg);

        channelRows[ch].push({
          note: xmNote,
          instrument: instrId,
          volume: 0,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0,
        });
      }
    }

    const patIdx = posIdx - startPos;
    trackerPatterns.push({
      id: `pattern-${patIdx}`,
      name: `Position ${posIdx}`,
      length: ROWS_PER_PATTERN,
      channels: channelRows.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ([-50, 50, 50, -50] as const)[ch] ?? 0,
        instrumentId: null,
        color: null,
        rows,
      })),
      importMetadata: {
        sourceFormat: 'AST',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: numTracks,
        originalInstrumentCount: numSamples,
      },
    });
  }

  if (trackerPatterns.length === 0) {
    // Fallback: one empty pattern
    trackerPatterns.push({
      id: 'pattern-0',
      name: 'Pattern 0',
      length: ROWS_PER_PATTERN,
      channels: Array.from({ length: 4 }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ([-50, 50, 50, -50] as const)[ch] ?? 0,
        instrumentId: null,
        color: null,
        rows: Array.from({ length: ROWS_PER_PATTERN }, () => ({
          note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        })),
      })),
      importMetadata: {
        sourceFormat: 'AST',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: numSamples,
      },
    });
  }

  const moduleName = filename.replace(/\.[^/.]+$/, '');

  // Convert BPM tempo: NostalgicPlayer stores it as SetBpmTempo value
  const bpm = tempo > 0 ? tempo : 125;
  const speed = primarySong.speed > 0 ? primarySong.speed : 6;

  return {
    name: moduleName,
    format: 'AST' as TrackerFormat,
    patterns: trackerPatterns,
    instruments: instrumentConfigs,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: speed,
    initialBPM: bpm,
    linearPeriods: false,
  };
}
