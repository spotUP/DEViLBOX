/**
 * RichardJosephParser.ts — Richard Joseph Player (.rjp / .sng + .ins) native parser
 *
 * Richard Joseph Player is a 4-channel Amiga music format created by Richard Joseph
 * and Andi Smithers (1992–93). It is a two-file format:
 *   - Song data:   `RJP.name`  or  `name.SNG`
 *   - Sample data: `SMP.name`  or  `name.INS`  or  `SMP.set` (James Pond 2 AGA)
 *
 * Binary layout of song data file (interleaved [size][data] chunks):
 *   [0..2]   "RJP" magic bytes (0x52, 0x4A, 0x50)
 *   [3]      version byte
 *   [4..7]   "SMOD" tag (0x53, 0x4D, 0x4F, 0x44) — present in pre-patched files
 *   [8..]    7 interleaved chunks: [u32BE size][size bytes data]
 *            Chunk 0: Sample descriptors (32 bytes each)
 *            Chunk 1: Instrument envelope/wavetable data
 *            Chunk 2: Subsong table (4 bytes each: 1 byte per channel = step-index)
 *            Chunk 3: Channel/step pointer table (longword offsets into chunk 5)
 *            Chunk 4: Pattern pointer table (longword offsets into chunk 6)
 *            Chunk 5: Step/position data (byte sequences of pattern indices)
 *            Chunk 6: Pattern/track data (variable-length note+command byte stream)
 *
 * Pattern byte stream encoding (from Richard Joseph Player_v2.asm):
 *   $00..$7F  Note value → period table lookup, triggers note, returns to caller
 *   $80/$81   End of pattern → advance step sequence (cmd 0)
 *   $82/$83   Vibrato → init fade-down vibrato, continue reading (cmd 1)
 *   $84/$85   Set speed → 1 byte operand (note duration), continue reading (cmd 2)
 *   $86/$87   Set loop-len → 1 byte operand (sub-timer), continue reading (cmd 3)
 *   $88/$89   Set instrument → 1 byte operand (1-based), continue reading (cmd 4)
 *   $8A/$8B   Set base pitch → 2 byte operand, continue reading (cmd 5)
 *   $8C/$8D   Pitch slide → 5 byte operand, continue reading (cmd 6)
 *   $8E/$8F   No-op / stream advance (cmd 7)
 *
 * Commands chain until a note ($00-$7F) or end-of-pattern ($80/$81) terminates.
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/RichardJosephPlayer/
 *   src/Richard Joseph Player_v2.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { createSamplerInstrument } from './AmigaUtils';

// ── Constants ───────────────────────────────────────────────────────────────

const NUM_CHANNELS = 4;
const MAX_EVENTS_PER_PATTERN = 512;
const MAX_STEPS_PER_CHANNEL = 256;

/** RJP period table (35 entries, 3 octaves) from lbW000C82 in the ASM */
const RJP_PERIODS = [
  // Octave 1
  0x1C5, 0x1E0, 0x1FC, 0x21A, 0x23A, 0x25C, 0x280, 0x2A6, 0x2D0, 0x2FA, 0x328, 0x358,
  // Octave 2
  0xE2, 0xF0, 0xFE, 0x10D, 0x11D, 0x12E, 0x140, 0x153, 0x168, 0x17D, 0x194, 0x1AC,
  // Octave 3
  0x71, 0x78, 0x7F, 0x87, 0x8F, 0x97, 0xA0, 0xAA, 0xB4, 0xBE, 0xCA, 0xD6,
];

/** Standard ProTracker period table for reverse-lookup */
const PT_PERIODS = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
];

// ── Binary helpers ─────────────────────────────────────────────────────────

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is a Richard Joseph Player song data file.
 *
 * Checks: bytes[0..2] = "RJP", bytes[4..7] = "SMOD"
 */
export function isRJPFormat(buf: Uint8Array): boolean {
  if (buf.length < 16) return false;
  if (buf[0] !== 0x52 || buf[1] !== 0x4a || buf[2] !== 0x50) return false;
  if (buf[4] !== 0x53 || buf[5] !== 0x4d || buf[6] !== 0x4f || buf[7] !== 0x44) return false;
  return true;
}

// ── Chunk parsing ──────────────────────────────────────────────────────────

interface RJPChunks {
  sampleDescs: { offset: number; size: number };    // chunk 0
  envelopes: { offset: number; size: number };       // chunk 1
  subsongs: { offset: number; size: number };        // chunk 2
  stepPtrs: { offset: number; size: number };        // chunk 3
  patternPtrs: { offset: number; size: number };     // chunk 4
  stepData: { offset: number; size: number };        // chunk 5
  patternData: { offset: number; size: number };     // chunk 6
}

function parseChunks(buf: Uint8Array): RJPChunks | null {
  if (buf.length < 36) return null;

  let off = 8;
  const chunks: { offset: number; size: number }[] = [];

  for (let i = 0; i < 7; i++) {
    if (off + 4 > buf.length) return null;
    const size = u32BE(buf, off);
    const dataOff = off + 4;
    if (dataOff + size > buf.length) return null;
    chunks.push({ offset: dataOff, size });
    off = dataOff + size;
  }

  return {
    sampleDescs: chunks[0],
    envelopes: chunks[1],
    subsongs: chunks[2],
    stepPtrs: chunks[3],
    patternPtrs: chunks[4],
    stepData: chunks[5],
    patternData: chunks[6],
  };
}

// ── RJP period → XM note conversion ───────────────────────────────────────

/**
 * Convert an RJP note value (index into RJP_PERIODS) to an XM note number.
 * RJP note 0 = octave 1 C = period 0x1C5 ≈ PT period 453 = C-1
 * XM note 13 = C-1, so RJP note N → XM note N + 13.
 */
function rjpNoteToXM(rjpNote: number): number {
  if (rjpNote === 0) return 0;
  if (rjpNote < 0 || rjpNote >= RJP_PERIODS.length) return 0;

  const period = RJP_PERIODS[rjpNote];
  // Find closest ProTracker period
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < PT_PERIODS.length; i++) {
    const d = Math.abs(PT_PERIODS[i] - period);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx + 1 + 12; // 1-based PT index + 12 for XM offset
}

// ── Pattern event decoding ─────────────────────────────────────────────────

interface RJPEvent {
  note: number;          // XM note (0 = none)
  instrument: number;    // 1-based instrument (0 = no change)
  speed: number;         // speed override (0 = no change)
  vibrato: boolean;      // vibrato command present
  pitchSlide: boolean;   // pitch slide active
  fileOffset: number;    // file offset of this event's note byte (for editing)
  eventBytes: number;    // total bytes consumed by this event in the stream
}

/**
 * Decode a single pattern's event stream from chunk 6.
 *
 * The stream is variable-length: commands chain until a note byte ($00-$7F)
 * or end-of-pattern ($80/$81) terminates the event.
 *
 * @param buf      Full file buffer
 * @param baseOff  File offset of the start of this pattern's byte stream
 * @param chunkEnd File offset of the end of chunk 6 (safety bound)
 */
function decodePatternEvents(
  buf: Uint8Array,
  baseOff: number,
  chunkEnd: number,
): RJPEvent[] {
  const events: RJPEvent[] = [];
  let pos = baseOff;

  while (pos < chunkEnd && events.length < MAX_EVENTS_PER_PATTERN) {
    const eventStart = pos;
    let note = 0;
    let instrument = 0;
    let speed = 0;
    let vibrato = false;
    let pitchSlide = false;
    let noteFileOffset = pos;
    let endOfPattern = false;

    // Read command chain until a note or end-of-pattern
    while (pos < chunkEnd) {
      const b = buf[pos];

      if (b < 0x80) {
        // Note value — triggers note, ends event
        noteFileOffset = pos;
        note = rjpNoteToXM(b);
        pos++;
        break;
      }

      // Command byte: dispatch via (b & 0x7E) >> 1
      const cmd = (b & 0x7E) >> 1;
      pos++;

      switch (cmd) {
        case 0: // End of pattern → advance step sequence
          endOfPattern = true;
          break;

        case 1: // Vibrato (no operand)
          vibrato = true;
          break;

        case 2: // Set speed (1 byte operand)
          if (pos < chunkEnd) {
            speed = buf[pos];
            pos++;
          }
          break;

        case 3: // Set loop-len (1 byte operand)
          if (pos < chunkEnd) pos++;
          break;

        case 4: // Set instrument (1 byte operand)
          if (pos < chunkEnd) {
            const instrByte = buf[pos];
            if (instrByte > 0) {
              instrument = instrByte;
            }
            pos++;
          }
          break;

        case 5: // Set base pitch (2 byte operand)
          if (pos + 1 < chunkEnd) pos += 2;
          break;

        case 6: // Pitch slide (5 byte operand)
          pitchSlide = true;
          if (pos + 4 < chunkEnd) pos += 5;
          break;

        case 7: // No-op
          break;

        default:
          break;
      }

      if (endOfPattern) break;
    }

    if (endOfPattern) break;

    // Only create an event if we got a note
    if (note > 0 || instrument > 0 || speed > 0) {
      events.push({
        note,
        instrument,
        speed,
        vibrato,
        pitchSlide,
        fileOffset: noteFileOffset,
        eventBytes: pos - eventStart,
      });
    }
  }

  return events;
}

// ── Step sequence parsing ──────────────────────────────────────────────────

interface ChannelStep {
  patternIndex: number;
  stepDataFileOffset: number; // file offset of this step byte in chunk 5
}

/**
 * Parse a channel's step sequence from chunk 5.
 * Returns the list of pattern indices this channel plays through.
 */
function parseStepSequence(
  buf: Uint8Array,
  stepDataOff: number,
  stepDataEnd: number,
): ChannelStep[] {
  const steps: ChannelStep[] = [];
  let pos = stepDataOff;

  while (pos < stepDataEnd && steps.length < MAX_STEPS_PER_CHANNEL) {
    const b = buf[pos];
    if (b === 0) break; // end-of-sequence terminal

    steps.push({ patternIndex: b, stepDataFileOffset: pos });
    pos++;
  }

  return steps;
}

// ── Main parser ────────────────────────────────────────────────────────────

export async function parseRJPFile(
  buffer: ArrayBuffer,
  filename: string,
  companionFiles?: Map<string, ArrayBuffer>,
): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);

  if (!isRJPFormat(buf)) {
    throw new Error('Not a Richard Joseph Player module');
  }

  const version = buf[3];

  const chunks = parseChunks(buf);
  if (!chunks) {
    throw new Error('Failed to parse RJP chunk structure');
  }

  // ── Module name ──────────────────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName =
    baseName.replace(/^rjp\./i, '').replace(/\.(sng|rjp)$/i, '') || baseName;

  // ── Sample descriptors (chunk 0) ─────────────────────────────────────────

  const numSamples = Math.min(chunks.sampleDescs.size >>> 5, 256);

  // ── Sample extraction from companion SMP/INS file ────────────────────────

  let smpBuf: Uint8Array | null = null;
  if (companionFiles) {
    // Try to find companion: SMP.name, name.ins, SMP.set
    const songBase = baseName.replace(/^rjp\./i, '').replace(/\.(sng|rjp)$/i, '');
    const candidates = [
      `SMP.${songBase}`,
      `smp.${songBase}`,
      `${songBase}.ins`,
      `${songBase}.INS`,
      'SMP.set',
      'smp.set',
    ];
    for (const cand of candidates) {
      for (const [key, val] of companionFiles) {
        const keyBase = key.split('/').pop() ?? key;
        if (keyBase.toLowerCase() === cand.toLowerCase()) {
          smpBuf = new Uint8Array(val);
          break;
        }
      }
      if (smpBuf) break;
    }
  }

  // ── Instruments ──────────────────────────────────────────────────────────

  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < numSamples; i++) {
    const descBase = chunks.sampleDescs.offset + i * 32;
    if (descBase + 32 > buf.length) break;

    const smpOffset = u32BE(buf, descBase);         // +0: sample data offset in SMP file
    const loopStartW = u16BE(buf, descBase + 16);   // +16: loop start in words
    const oneShotW = u16BE(buf, descBase + 18);     // +18: one-shot length in words
    const loopLenW = u16BE(buf, descBase + 20);     // +20: loop/repeat length in words

    const loopStart = loopStartW * 2;
    const loopEnd = loopStart + loopLenW * 2;
    const lengthBytes = (oneShotW + loopLenW) * 2;

    if (smpBuf && smpOffset + lengthBytes <= smpBuf.length && lengthBytes > 2) {
      // Extract real PCM from companion file
      const pcm = smpBuf.slice(smpOffset, smpOffset + lengthBytes);
      instruments.push(
        createSamplerInstrument(
          i + 1,
          `Sample ${i + 1}`,
          pcm,
          64, // full volume
          8287, // Amiga C-3 rate
          loopStart,
          loopEnd,
        ),
      );
    } else {
      // Placeholder instrument
      instruments.push({
        id: i + 1,
        name: `Sample ${i + 1}`,
        type: 'synth' as const,
        synthType: 'Synth' as const,
        effects: [],
        volume: 0,
        pan: 0,
        metadata: {
          rjpSample: {
            loopStart,
            loopSize: loopLenW * 2,
            hasLoop: loopLenW > 1,
            lengthBytes,
          },
        },
      } as InstrumentConfig);
    }
  }

  if (instruments.length === 0) {
    instruments.push({
      id: 1,
      name: 'Sample 1',
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: 0,
      pan: 0,
    } as InstrumentConfig);
  }

  // ── Subsong table (chunk 2) ──────────────────────────────────────────────

  const numSubsongs = Math.min(chunks.subsongs.size >>> 2, 256);

  // ── Parse subsong 0 (default) ────────────────────────────────────────────

  const patterns: Pattern[] = [];
  const songPositions: number[] = [];

  // File offset map for editing: patternIndex → row → channel → { fileOffset, byteLen }
  const cellOffsetMap = new Map<string, { fileOffset: number; byteLen: number }>();

  if (numSubsongs > 0 && chunks.stepPtrs.size >= 4 && chunks.patternPtrs.size >= 4) {
    // Find first non-empty subsong (step-index 0 = channel inactive)
    let selectedSubsong = 0;
    for (let s = 0; s < numSubsongs; s++) {
      const off = chunks.subsongs.offset + s * 4;
      if (buf[off] !== 0 || buf[off + 1] !== 0 || buf[off + 2] !== 0 || buf[off + 3] !== 0) {
        selectedSubsong = s;
        break;
      }
    }

    const subsongOff = chunks.subsongs.offset + selectedSubsong * 4;
    const stepIndices: number[] = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      stepIndices.push(buf[subsongOff + ch]);
    }

    // For each channel, resolve step-index → step pointer → step sequence
    const channelSteps: ChannelStep[][] = [];
    const stepDataEnd = chunks.stepData.offset + chunks.stepData.size;
    const numStepPtrs = chunks.stepPtrs.size >>> 2;

    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const stepIdx = stepIndices[ch];
      if (stepIdx === 0 || stepIdx > numStepPtrs) {
        channelSteps.push([]);
        continue;
      }

      // Look up step pointer (longword offset into chunk 5)
      const ptrOff = chunks.stepPtrs.offset + stepIdx * 4;
      if (ptrOff + 4 > buf.length) {
        channelSteps.push([]);
        continue;
      }
      const stepOffset = u32BE(buf, ptrOff);
      const absStepOff = chunks.stepData.offset + stepOffset;

      if (absStepOff >= stepDataEnd) {
        channelSteps.push([]);
        continue;
      }

      channelSteps.push(parseStepSequence(buf, absStepOff, stepDataEnd));
    }

    // Number of song positions = max step count across all channels
    const numSteps = Math.max(1, ...channelSteps.map(s => s.length));
    const numPatPtrs = chunks.patternPtrs.size >>> 2;
    const patDataEnd = chunks.patternData.offset + chunks.patternData.size;

    // Track which pattern pointer indices we've already decoded
    const decodedPatterns = new Map<number, RJPEvent[]>();

    for (let step = 0; step < numSteps; step++) {
      const channelRows: TrackerCell[][] = [[], [], [], []];
      let maxRows = 0;

      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const chStep = channelSteps[ch][step];
        if (!chStep) continue;

        const patIdx = chStep.patternIndex;
        if (patIdx >= numPatPtrs) continue;

        // Look up pattern pointer (longword offset into chunk 6)
        let events = decodedPatterns.get(patIdx);
        if (!events) {
          const patPtrOff = chunks.patternPtrs.offset + patIdx * 4;
          if (patPtrOff + 4 > buf.length) continue;
          const patOffset = u32BE(buf, patPtrOff);
          const absPatOff = chunks.patternData.offset + patOffset;

          if (absPatOff >= patDataEnd) continue;
          events = decodePatternEvents(buf, absPatOff, patDataEnd);
          decodedPatterns.set(patIdx, events);
        }

        // Convert events to TrackerCell rows (1 row per event)
        const rows: TrackerCell[] = [];
        for (const evt of events) {
          // Map speed to effect F (set speed) in the effect column
          let effTyp = 0;
          let eff = 0;
          if (evt.speed > 0) {
            effTyp = 0x0F; // Fxx = set speed
            eff = evt.speed & 0xFF;
          } else if (evt.vibrato) {
            effTyp = 0x04; // 4xy = vibrato
            eff = 0x40; // moderate depth
          } else if (evt.pitchSlide) {
            effTyp = 0x03; // 3xx = portamento
            eff = 0x20;
          }

          rows.push({
            note: evt.note,
            instrument: evt.instrument,
            volume: 0,
            effTyp,
            eff,
            effTyp2: 0,
            eff2: 0,
          });

          // Store offset map entry for editing
          const key = `${step}:${rows.length - 1}:${ch}`;
          cellOffsetMap.set(key, {
            fileOffset: evt.fileOffset,
            byteLen: 1, // note byte is always 1 byte
          });
        }

        channelRows[ch] = rows;
        if (rows.length > maxRows) maxRows = rows.length;
      }

      // Normalize pattern length
      if (maxRows === 0) maxRows = 1;
      let patLen = 16;
      if (maxRows <= 16) patLen = 16;
      else if (maxRows <= 32) patLen = 32;
      else if (maxRows <= 64) patLen = 64;
      else if (maxRows <= 128) patLen = 128;
      else patLen = Math.min(256, ((maxRows + 15) >>> 4) << 4);

      const emptyCell: TrackerCell = {
        note: 0, instrument: 0, volume: 0,
        effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      };

      const channels: ChannelData[] = Array.from({ length: NUM_CHANNELS }, (_, ch) => {
        const rows = channelRows[ch];
        const paddedRows: TrackerCell[] = [];
        for (let r = 0; r < patLen; r++) {
          paddedRows.push(r < rows.length ? rows[r] : { ...emptyCell });
        }
        return {
          id: `channel-${ch}`,
          name: `Channel ${ch + 1}`,
          muted: false,
          solo: false,
          collapsed: false,
          volume: 100,
          pan: ch === 0 || ch === 3 ? -50 : 50,
          instrumentId: null,
          color: null,
          rows: paddedRows,
        };
      });

      patterns.push({
        id: `pattern-${step}`,
        name: `Pattern ${step}`,
        length: patLen,
        channels,
        importMetadata: {
          sourceFormat: 'MOD' as const,
          sourceFile: filename,
          importedAt: new Date().toISOString(),
          originalChannelCount: NUM_CHANNELS,
          originalPatternCount: numSteps,
          originalInstrumentCount: numSamples,
        },
      });
      songPositions.push(step);
    }
  }

  // ── Fallback if no patterns decoded ──────────────────────────────────────

  if (patterns.length === 0) {
    const emptyRows: TrackerCell[] = Array.from({ length: 64 }, () => ({
      note: 0, instrument: 0, volume: 0,
      effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
    }));

    patterns.push({
      id: 'pattern-0',
      name: 'Pattern 0',
      length: 64,
      channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch === 0 || ch === 3 ? -50 : 50,
        instrumentId: null,
        color: null,
        rows: emptyRows,
      })),
      importMetadata: {
        sourceFormat: 'MOD' as const,
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: 1,
        originalInstrumentCount: numSamples,
      },
    });
    songPositions.push(0);
  }

  // ── UADE pattern layout for chip RAM editing ─────────────────────────────
  //
  // RJP uses variable-length events, so we use getCellFileOffset with the
  // pre-built offset map rather than a fixed formula.

  const uadePatternLayout: UADEPatternLayout = {
    formatId: 'richardJoseph',
    patternDataFileOffset: chunks.patternData.offset,
    bytesPerCell: 1, // note byte only (commands are preceding prefix bytes)
    rowsPerPattern: patterns[0]?.length ?? 64,
    numChannels: NUM_CHANNELS,
    numPatterns: patterns.length,
    moduleSize: buf.length,
    encodeCell: (cell: TrackerCell): Uint8Array => {
      // Encode a cell as RJP byte stream.
      // For note-only edits, we write just the note byte.
      // The RJP note value is the index into the period table.
      if (cell.note === 0) {
        // No note — write a no-op byte
        return new Uint8Array([0x8E]);
      }
      // XM note → RJP note: reverse the conversion
      // XM note N = PT index (N-12) → RJP period table index
      const ptIdx = cell.note - 12 - 1; // 0-based PT index
      if (ptIdx < 0 || ptIdx >= PT_PERIODS.length) {
        return new Uint8Array([0x8E]); // out of range → no-op
      }
      // Find closest RJP period
      const ptPeriod = PT_PERIODS[ptIdx];
      let bestRjp = 0;
      let bestDist = Infinity;
      for (let i = 0; i < RJP_PERIODS.length; i++) {
        const d = Math.abs(RJP_PERIODS[i] - ptPeriod);
        if (d < bestDist) {
          bestDist = d;
          bestRjp = i;
        }
      }
      return new Uint8Array([bestRjp]);
    },
    decodeCell: (raw: Uint8Array): TrackerCell => {
      const rjpNote = raw[0];
      const note = rjpNoteToXM(rjpNote);
      return { note, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
    },
    getCellFileOffset: (pattern: number, row: number, channel: number): number => {
      const key = `${pattern}:${row}:${channel}`;
      const entry = cellOffsetMap.get(key);
      return entry?.fileOffset ?? -1;
    },
  };

  return {
    name: `${moduleName} [Richard Joseph v${version}] (${numSamples} smp, ${numSubsongs} sub)`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout,
  };
}
