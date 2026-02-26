/**
 * DeltaMusic1Parser.ts -- Delta Music 1.0 native parser
 *
 * Delta Music 1.0 is a 4-channel Amiga tracker using wavetable-based synthesis
 * and optional PCM sample playback. It stores 4 independent channel tracks, each
 * a sequence of [block_number, transpose] pairs. Blocks are 16-row x 4-byte
 * patterns (instrument, note, effect, effectArg). Instruments carry either a PCM
 * sample or a synth sound table (48-byte waveform sequence).
 *
 * Reference: NostalgicPlayer DeltaMusic10Worker.cs (authoritative loader/replayer)
 * Reference: NostalgicPlayer DeltaMusic10/Containers/ (data structures)
 * Reference: NostalgicPlayer DeltaMusic10/Tables.cs (period table)
 *
 * File layout (all offsets from file start):
 *   0x000        Magic: "ALL " (4 bytes)
 *   0x004        Track lengths: 4 x uint32 BE (bytes; divide by 2 -> entry count)
 *   0x014        Block section length: uint32 BE (bytes; divide by 64 -> block count)
 *   0x018        Instrument lengths: 20 x uint32 BE (bytes each)
 *   0x068        Track data: 4 x trackLength[i] bytes, each entry = [blockNum: uint8, transpose: int8]
 *   +            Block data: blockLength bytes, each block = 16 rows x 4 bytes
 *                  Row = [instrument: uint8, note: uint8, effect: uint8, effectArg: uint8]
 *   +            Instrument data: up to 20 instruments, variable size per slot
 *
 * Track jump: blockNumber=0xFF, transpose=-1 signals end-of-track / loop-back.
 *   The NEXT two bytes encode the new position:
 *   newPos = ((next.blockNumber << 8) | (byte)next.transpose) & 0x7FF
 *
 * Note mapping:
 *   DM1 note byte 0 = no note. Non-zero: note + channel.Transpose -> index into DM1 Periods.
 *   DM1 period table: index 0 = 0 (silent), 1-72 = valid Amiga periods, 73-83 = clamped at 113.
 *   Index 37 = 856 = ProTracker C-1 = XM note 13.
 *
 * Instrument header sizes:
 *   isSample=true:  30 bytes (no 48-byte synth table)
 *   isSample=false: 78 bytes (30 fixed + 48 synth table)
 *
 * Default play speed: 6 (hardcoded in DeltaMusic10Worker.cs InitializeSound)
 * Default BPM: 125 (Amiga standard)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument, periodToNoteIndex, amigaNoteToXM } from './AmigaUtils';

// -- Constants ---------------------------------------------------------------

/** PAL Amiga clock frequency (Hz) */
const PAL_CLOCK = 3546895;

/**
 * DM1 period table (84 entries). Index 0 = silent, 1-72 = valid Amiga periods,
 * 73-83 = clamped at 113 (highest note limit).
 * Source: NostalgicPlayer DeltaMusic10/Tables.cs
 */
const DM1_PERIODS: number[] = [
     0, 6848, 6464, 6096, 5760, 5424, 5120, 4832, 4560, 4304, 4064, 3840,
  3616, 3424, 3232, 3048, 2880, 2712, 2560, 2416, 2280, 2152, 2032, 1920,
  1808, 1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076,  960,  904,
   856,  808,  762,  720,  678,  640,  604,  570,  538,  508,  480,  452,
   428,  404,  381,  360,  339,  320,  302,  285,  269,  254,  240,  226,
   214,  202,  190,  180,  170,  160,  151,  143,  135,  127,  120,  113,
   113,  113,  113,  113,  113,  113,  113,  113,  113,  113,  113,  113,
];

/**
 * PAL sample rate at ProTracker C-1 (period 856).
 * Synth wavetable instruments are stored at this rate with baseNote "C3" so that
 * DM1 note index 37 (period 856, XM note 13 = C-1) plays at the correct frequency.
 */
const SYNTH_BASE_RATE = Math.round(PAL_CLOCK / (2 * 856)); // 2072 Hz

/**
 * PAL sample rate at ProTracker C-3 (period 214) -- standard Amiga PCM rate.
 * PCM sample instruments are stored at this rate with baseNote "C3".
 */
const PCM_BASE_RATE = Math.round(PAL_CLOCK / (2 * 214)); // 8287 Hz

// -- Utility -----------------------------------------------------------------

function u16BE(buf: Uint8Array, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}

function u32BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

function s8(v: number): number {
  return v < 128 ? v : v - 256;
}

// -- Format Identification ---------------------------------------------------

/**
 * Returns true if buffer appears to be a Delta Music 1.0 module.
 *
 * Detection algorithm (from DeltaMusic10Worker.cs Identify()):
 *   1. File length >= 104 bytes
 *   2. First 4 bytes = "ALL " (0x41 0x4C 0x4C 0x20)
 *   3. Sum of all 25 length fields (4 track + 1 block + 20 instrument lengths)
 *      plus 104 (header size) must not exceed the total file length
 */
export function isDeltaMusic1Format(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 104) return false;
  const bytes = new Uint8Array(buffer);

  // Check magic "ALL "
  if (bytes[0] !== 0x41 || bytes[1] !== 0x4c || bytes[2] !== 0x4c || bytes[3] !== 0x20) {
    return false;
  }

  // Validate total length against actual file size
  let totalLength = 104;
  for (let i = 0; i < 25; i++) {
    totalLength += u32BE(bytes, 4 + i * 4);
    if (totalLength > buffer.byteLength) return false;
  }

  return true;
}

// -- Internal data types -----------------------------------------------------

interface DM1TrackEntry {
  blockNumber: number;  // 0-based block index; 0xFF = jump/end marker
  transpose: number;    // signed transpose applied to all notes in this block
}

interface DM1BlockLine {
  instrument: number;  // 0-based instrument index (meaningful only when note != 0)
  note: number;        // raw note index; 0 = no note, 1+ = index into DM1_PERIODS
  effect: number;      // effect type (0x00-0x1E, see Effect.cs)
  effectArg: number;   // effect argument byte
}

interface DM1Instrument {
  number: number;
  attackStep: number;
  attackDelay: number;
  decayStep: number;
  decayDelay: number;
  sustain: number;
  releaseStep: number;
  releaseDelay: number;
  volume: number;         // 0-64 Amiga volume
  vibratoWait: number;
  vibratoStep: number;
  vibratoLength: number;
  bendRate: number;       // signed
  portamento: number;
  isSample: boolean;
  tableDelay: number;
  arpeggio: number[];     // 8 bytes
  sampleLength: number;   // in words (16-bit units)
  repeatStart: number;    // in words
  repeatLength: number;   // in words
  table: number[] | null; // 48-byte synth waveform sequence table; null when isSample
  sampleData: Int8Array | null;
}

// -- Note conversion ---------------------------------------------------------

/**
 * Convert a DM1 note index (after applying channel transpose) to an XM note number.
 *
 * DM1 index 0 = no note (returns 0).
 * DM1 index 1-83 -> DM1_PERIODS lookup -> Amiga period -> XM note via AmigaUtils.
 *
 * Example: DM1 note 37 -> period 856 -> periodToNoteIndex(856)=1 -> amigaNoteToXM(1)=13 (XM C-1)
 */
function dm1NoteToXM(noteIndex: number): number {
  if (noteIndex <= 0) return 0;
  const idx = Math.max(0, Math.min(83, noteIndex));
  const period = DM1_PERIODS[idx];
  if (period === 0) return 0;
  const amigaIdx = periodToNoteIndex(period);
  return amigaNoteToXM(amigaIdx);
}

// -- Main Parser -------------------------------------------------------------

/**
 * Parse a Delta Music 1.0 module and return a TrackerSong.
 * Throws if the format check fails or the file is critically malformed.
 */
export async function parseDeltaMusic1File(buffer: ArrayBuffer, filename: string): Promise<TrackerSong> {
  if (!isDeltaMusic1Format(buffer)) {
    throw new Error(`[DeltaMusic1Parser] Not a Delta Music 1.0 file: ${filename}`);
  }

  const bytes = new Uint8Array(buffer);

  // -- Read length table (25 x uint32 BE at offset 4) ----------------------
  // Header: [4..19] track lengths, [20..23] block length, [24..99] instrument lengths
  // Total header: 4 + 16 + 4 + 80 = 104 bytes
  const trackLengths: number[] = [];
  for (let i = 0; i < 4; i++) {
    trackLengths.push(u32BE(bytes, 4 + i * 4));
  }
  const blockSectionLength = u32BE(bytes, 20);
  const instrumentLengths: number[] = [];
  for (let i = 0; i < 20; i++) {
    instrumentLengths.push(u32BE(bytes, 24 + i * 4));
  }

  let off = 104;
  // -- Read tracks (4 channels) --------------------------------------------
  // Each track is trackLength[ch] bytes; each entry = 2 bytes [blockNum: uint8, transpose: int8].
  const tracks: DM1TrackEntry[][] = [];
  for (let ch = 0; ch < 4; ch++) {
    const entryCount = trackLengths[ch] / 2;
    const entries: DM1TrackEntry[] = [];
    for (let j = 0; j < entryCount; j++) {
      entries.push({
        blockNumber: bytes[off],
        transpose:   s8(bytes[off + 1]),
      });
      off += 2;
    }
    tracks.push(entries);
  }

  // -- Read blocks ---------------------------------------------------------
  // Each block = 64 bytes = 16 rows x 4 bytes.
  // Row layout: [instrument: uint8, note: uint8, effect: uint8, effectArg: uint8]
  const numBlocks = Math.floor(blockSectionLength / 64);
  const blocks: DM1BlockLine[][] = [];
  for (let b = 0; b < numBlocks; b++) {
    const rows: DM1BlockLine[] = [];
    for (let row = 0; row < 16; row++) {
      rows.push({
        instrument: bytes[off],
        note:        bytes[off + 1],
        effect:      bytes[off + 2],
        effectArg:   bytes[off + 3],
      });
      off += 4;
    }
    blocks.push(rows);
  }
  // -- Read instruments (up to 20) -----------------------------------------
  //
  // Instrument header layout (DeltaMusic10Worker.cs Load(), ~lines 155-195):
  //   byte  attackStep    (0)
  //   byte  attackDelay   (1)
  //   byte  decayStep     (2)
  //   byte  decayDelay    (3)
  //   uint16 BE sustain   (4-5)
  //   byte  releaseStep   (6)
  //   byte  releaseDelay  (7)
  //   byte  volume        (8)    0-64 Amiga scale
  //   byte  vibratoWait   (9)
  //   byte  vibratoStep   (10)
  //   byte  vibratoLength (11)
  //   int8  bendRate      (12)
  //   byte  portamento    (13)
  //   byte  isSample      (14)   0 = synth, non-zero = PCM sample
  //   byte  tableDelay    (15)
  //   byte[8] arpeggio    (16-23)
  //   uint16 BE sampleLength  (24-25)  in words
  //   uint16 BE repeatStart   (26-27)  in words
  //   uint16 BE repeatLength  (28-29)  in words
  //   [byte[48] table -- only when !isSample] (30-77)
  //   sampleData[instrumentLength - headerSize]
  //
  // Header size: isSample=true -> 30 bytes, isSample=false -> 78 bytes.
  const instruments: DM1Instrument[] = [];
  for (let i = 0; i < 20; i++) {
    const instLen = instrumentLengths[i];
    if (instLen === 0) {
      instruments.push({
        number: i,
        attackStep: 0, attackDelay: 0, decayStep: 0, decayDelay: 0,
        sustain: 0, releaseStep: 0, releaseDelay: 0, volume: 0,
        vibratoWait: 0, vibratoStep: 0, vibratoLength: 0,
        bendRate: 0, portamento: 0, isSample: false, tableDelay: 0,
        arpeggio: new Array(8).fill(0),
        sampleLength: 0, repeatStart: 0, repeatLength: 0,
        table: null, sampleData: null,
      });
      continue;
    }
    const base = off;
    const attackStep    = bytes[base + 0];
    const attackDelay   = bytes[base + 1];
    const decayStep     = bytes[base + 2];
    const decayDelay    = bytes[base + 3];
    const sustain       = u16BE(bytes, base + 4);
    const releaseStep   = bytes[base + 6];
    const releaseDelay  = bytes[base + 7];
    const volume        = bytes[base + 8];
    const vibratoWait   = bytes[base + 9];
    const vibratoStep   = bytes[base + 10];
    const vibratoLength = bytes[base + 11];
    const bendRate      = s8(bytes[base + 12]);
    const portamento    = bytes[base + 13];
    const isSample      = bytes[base + 14] !== 0;
    const tableDelay    = bytes[base + 15];

    const arpeggio: number[] = [];
    for (let a2 = 0; a2 < 8; a2++) {
      arpeggio.push(bytes[base + 16 + a2]);
    }

    const sampleLength  = u16BE(bytes, base + 24);
    const repeatStart   = u16BE(bytes, base + 26);
    const repeatLength  = u16BE(bytes, base + 28);

    let table: number[] | null = null;
    let headerSize: number;

    if (!isSample) {
      // Synth instruments carry a 48-byte sound table after the fixed header
      table = [];
      for (let t = 0; t < 48; t++) {
        table.push(bytes[base + 30 + t]);
      }
      headerSize = 78;
    } else {
      headerSize = 30;
    }
    // Sample data follows the header; length = instrumentLength - headerSize
    const sampleDataLength = instLen - headerSize;
    let sampleData: Int8Array | null = null;
    if (sampleDataLength > 0 && base + headerSize + sampleDataLength <= bytes.length) {
      sampleData = new Int8Array(
        bytes.buffer,
        bytes.byteOffset + base + headerSize,
        sampleDataLength
      );
    }

    instruments.push({
      number: i,
      attackStep, attackDelay, decayStep, decayDelay,
      sustain, releaseStep, releaseDelay, volume,
      vibratoWait, vibratoStep, vibratoLength,
      bendRate, portamento, isSample, tableDelay,
      arpeggio, sampleLength, repeatStart, repeatLength,
      table, sampleData,
    });

    off += instLen;
  }
  // -- Build InstrumentConfig[] --------------------------------------------
  // DM1 instrument slots are 0-based in pattern data; DEViLBOX uses 1-based IDs.
  const trackerInstruments: InstrumentConfig[] = [];

  for (let i = 0; i < 20; i++) {
    const inst = instruments[i];
    const id = i + 1;

    if (inst.sampleLength === 0 || inst.sampleData === null) {
      // Empty slot: produce a placeholder instrument
      trackerInstruments.push({
        id,
        name: `Instrument ${id}`,
        type: 'synth' as const,
        synthType: 'Synth' as const,
        effects: [],
        volume: -6,
        pan: 0,
      } as InstrumentConfig);
      continue;
    }
    if (inst.isSample) {
      // PCM sample instrument.
      // sampleLength, repeatStart, repeatLength are stored in words (16-bit units).
      // sampleData contains the raw PCM bytes (instrumentLength - 30 bytes).
      const pcmLen = inst.sampleData.length;
      const pcmUint8 = new Uint8Array(pcmLen);
      for (let j = 0; j < pcmLen; j++) {
        pcmUint8[j] = inst.sampleData[j] & 0xff;
      }

      // Loop condition: repeatLength > 1 (from DeltaMusic10Worker.cs Samples getter)
      const hasLoop = inst.repeatLength > 1;
      // Convert word offsets to byte offsets
      const loopStart = hasLoop ? inst.repeatStart * 2 : 0;
      const loopEnd   = hasLoop ? (inst.repeatStart + inst.repeatLength) * 2 : 0;

      trackerInstruments.push(
        createSamplerInstrument(id, `Sample ${i}`, pcmUint8, inst.volume, PCM_BASE_RATE, loopStart, loopEnd)
      );

    } else if (inst.table !== null) {
      // Synth (wavetable) instrument.
      // The 48-byte sound table drives waveform segment playback at runtime:
      //   entry >= 0x80: set tableDelay (entry & 0x7F); advance to next
      //   entry == 0xFF: loop back to table[entry+1]; stop scanning
      //   entry <  0x80: play segment at sampleData[entry * 32 .. +32)
      //
      // For the static snapshot we use the first valid waveform segment.
      let waveOffset = 0;
      for (let t = 0; t < 48; t++) {
        const entry = inst.table[t];
        if (entry === 0xff) break;
        if (entry < 0x80) {
          waveOffset = entry * 32;
          break;
        }
        // entry >= 0x80: delay modifier -- keep scanning
      }
      const waveLen = Math.min(32, inst.sampleData.length - waveOffset);
      if (waveLen <= 0) {
        trackerInstruments.push({
          id,
          name: `Synth ${i}`,
          type: 'synth' as const,
          synthType: 'Synth' as const,
          effects: [],
          volume: -6,
          pan: 0,
        } as InstrumentConfig);
        continue;
      }

      const pcmUint8 = new Uint8Array(waveLen);
      for (let j = 0; j < waveLen; j++) {
        pcmUint8[j] = inst.sampleData[waveOffset + j] & 0xff;
      }

      // Store at SYNTH_BASE_RATE (2072 Hz = PAL C-1) with baseNote "C3" (XM note 37).
      // DM1 note index 37 (period 856) maps to XM note 13 (C-1), so the sampler
      // pitches the waveform correctly for all DM1 note values.
      trackerInstruments.push(
        createSamplerInstrument(id, `Synth ${i}`, pcmUint8, inst.volume, SYNTH_BASE_RATE, 0, waveLen)
      );

    } else {
      trackerInstruments.push({
        id,
        name: `Instrument ${id}`,
        type: 'synth' as const,
        synthType: 'Synth' as const,
        effects: [],
        volume: -6,
        pan: 0,
      } as InstrumentConfig);
    }
  }
  // -- Build patterns -------------------------------------------------------
  //
  // DM1 plays all 4 channels independently, each with its own track pointer.
  // We zip the 4 channels into TrackerSong patterns (one per track position),
  // using loop wrapping for channels shorter than the longest.
  //
  // Track jump encoding (from CalculateFrequency in DeltaMusic10Worker.cs):
  //   entry.blockNumber == 0xFF && entry.transpose == -1 -> jump marker
  //   next entry: newPos = ((next.blockNumber << 8) | (byte)next.transpose) & 0x7FF
  //
  // First pass: resolve each channel's effective entry list and loop point.
  const effectiveEntries: DM1TrackEntry[][] = [];
  const loopPositions: number[] = [];

  for (let ch = 0; ch < 4; ch++) {
    const raw = tracks[ch];
    const resolved: DM1TrackEntry[] = [];
    let loopPos = 0;

    for (let j = 0; j < raw.length; j++) {
      const entry = raw[j];
      // Jump marker: blockNumber=0xFF and transpose byte=0xFF (signed -1)
      if (entry.blockNumber === 0xff && entry.transpose === -1) {
        // Next entry encodes the loop-back position
        if (j + 1 < raw.length) {
          const next = raw[j + 1];
          const jumpTarget = ((next.blockNumber << 8) | (next.transpose & 0xff)) & 0x7ff;
          loopPos = Math.min(jumpTarget, resolved.length > 0 ? resolved.length - 1 : 0);
        }
        break;
      }
      resolved.push(entry);
    }

    effectiveEntries.push(resolved);
    loopPositions.push(loopPos);
  }
  const maxTrackLen = Math.max(...effectiveEntries.map(t => t.length), 1);
  const trackerPatterns: Pattern[] = [];

  for (let pos = 0; pos < maxTrackLen; pos++) {
    const channelRows: TrackerCell[][] = [[], [], [], []];

    for (let ch = 0; ch < 4; ch++) {
      const chEntries = effectiveEntries[ch];
      const tLen = chEntries.length;

      if (tLen === 0) {
        for (let row = 0; row < 16; row++) {
          channelRows[ch].push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
        }
        continue;
      }

      // Loop wrapping for channels shorter than maxTrackLen
      let trackPos = pos;
      if (trackPos >= tLen) {
        const loopStart = loopPositions[ch] < tLen ? loopPositions[ch] : 0;
        const loopSpan = tLen - loopStart;
        trackPos = loopSpan > 0
          ? loopStart + ((pos - loopStart) % loopSpan)
          : tLen - 1;
      }

      const entry = chEntries[trackPos];
      const blockIdx = entry.blockNumber;
      const chTranspose = entry.transpose;
      const block = blockIdx < blocks.length ? blocks[blockIdx] : null;
      for (let row = 0; row < 16; row++) {
        if (!block) {
          channelRows[ch].push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }

        const line = block[row];

        // Convert DM1 note index (with channel transpose) to XM note number
        let xmNote = 0;
        if (line.note !== 0) {
          xmNote = dm1NoteToXM(line.note + chTranspose);
          xmNote = Math.max(0, Math.min(96, xmNote));
        }

        // Instrument is 0-based in DM1, 1-based in DEViLBOX; only set on a note trigger
        const instrId = (line.note !== 0 && line.instrument < 20) ? line.instrument + 1 : 0;

        // -- Effect mapping (DM1 Effect enum -> XM effects) ----------------
        //   0x00 None
        //   0x01 SetSpeed       -> XM Fxx (set speed)
        //   0x02 SlideUp        -> XM 1xx (portamento up, period-based)
        //   0x03 SlideDown      -> XM 2xx (portamento down, period-based)
        //   0x04 SetFilter      -> no XM equivalent (Amiga LED filter toggle)
        //   0x05 SetVibratoWait -> no XM equivalent
        //   0x06 SetVibratoStep -> no XM equivalent
        //   0x07 SetVibratoLength -> no XM equivalent
        //   0x08 SetBendRate    -> no XM equivalent
        //   0x09 SetPortamento  -> XM 3xx (tone portamento to target note)
        //   0x0A SetVolume      -> XM Cxx (set channel volume, 0-64)
        //   0x0B-0x1E: set arpeggio/ADSR params -> no standard XM equivalent
        let effTyp = 0;
        let eff = 0;
        const effTyp2 = 0;
        const eff2 = 0;
        switch (line.effect) {
          case 0x01: // SetSpeed
            if (line.effectArg !== 0) {
              effTyp = 0x0f;
              eff = line.effectArg;
            }
            break;

          case 0x02: // SlideUp (period decreases -> pitch rises)
            effTyp = 0x01;
            eff = line.effectArg;
            break;

          case 0x03: // SlideDown (period increases -> pitch falls)
            effTyp = 0x02;
            eff = line.effectArg;
            break;

          case 0x09: // SetPortamento (tone portamento to current note)
            effTyp = 0x03;
            eff = line.effectArg;
            break;

          case 0x0a: // SetVolume (0-64 Amiga scale)
            effTyp = 0x0c;
            eff = Math.min(64, line.effectArg);
            break;

          default:
            break;
        }

        channelRows[ch].push({
          note: xmNote,
          instrument: instrId,
          volume: 0,
          effTyp,
          eff,
          effTyp2,
          eff2,
        });
      }
    }
    trackerPatterns.push({
      id: `pattern-${pos}`,
      name: `Position ${pos}`,
      length: 16,
      channels: channelRows.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        // Amiga hard stereo panning: LRRL
        pan: (ch === 0 || ch === 3) ? -50 : 50,
        instrumentId: null,
        color: null,
        rows,
      })),
      importMetadata: {
        sourceFormat: 'DM1',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: numBlocks,
        originalInstrumentCount: instruments.filter(inst => inst.sampleLength > 0).length,
      },
    });
  }
  // Fallback: ensure at least one pattern exists
  if (trackerPatterns.length === 0) {
    trackerPatterns.push({
      id: 'pattern-0',
      name: 'Pattern 0',
      length: 16,
      channels: Array.from({ length: 4 }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: (ch === 0 || ch === 3) ? -50 : 50,
        instrumentId: null,
        color: null,
        rows: Array.from({ length: 16 }, () => ({
          note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        })),
      })),
      importMetadata: {
        sourceFormat: 'DM1',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: 0,
      },
    });
  }
  const moduleName = filename.replace(/.[^/.]+$/, '');

  return {
    name: moduleName,
    format: 'MOD' as TrackerFormat,
    patterns: trackerPatterns,
    instruments: trackerInstruments,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
  };
}