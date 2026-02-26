/**
 * TFMXParser.ts — Jochen Hippel TFMX format parser
 *
 * TFMX (The Final Music eXpander) is a 4-channel Amiga tracker format using
 * chained SndModSeq/VolModSeq macro sequences and raw PCM samples.
 *
 * Song structure: a track table of steps, each step assigning one TFMX Pattern
 * per channel plus note and sound-sequence transpose values.  Instruments are
 * defined by VolModSeqs (volume envelopes) which reference SndModSeqs (synthesis
 * chains) which eventually reference PCM sample slots.
 *
 * References:
 *   libtfmxaudiodecoder (Jochen Hippel): HippelDecoder.h, TFMX.cpp, Instrument.cpp
 *
 * File layout (header at "TFMX\0" magic offset h):
 *   h+0x04  sndSeqsMax  u16BE  → count = value+1
 *   h+0x06  volSeqsMax  u16BE  → count = value+1
 *   h+0x08  patternsMax u16BE  → count = value+1
 *   h+0x0A  trackStepsMax u16BE → count = value+1
 *   h+0x0D  patternSize u8      (expected 64)
 *   h+0x10  songCount   u16BE
 *   h+0x12  sampleCount u16BE
 *
 * Sections sequential from h+0x20:
 *   SndModSeqs  64 bytes × sndSeqsCount
 *   VolModSeqs  64 bytes × volSeqsCount
 *   Patterns    64 bytes × patternsCount   (32 rows × 2 bytes each)
 *   TrackTable  12 bytes × trackStepsCount (4 voices × 3 bytes)
 *   SubSongTab   6 bytes × (songCount+1)   (firstStep u16, lastStep u16, speed u16)
 *   SampleHdrs  30 bytes × sampleCount    (18 name + 4 startOffs + 2 len + 4 repOffs + 2 repLen)
 *   SampleData  raw 8-bit signed PCM
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';
import type { TFMXConfig } from '@/types/instrument';
import { createSamplerInstrument } from './AmigaUtils';

// ── Constants (from HippelDecoder.h) ─────────────────────────────────────────

const TFMX_TRACKTAB_STEP_SIZE = 0x0C; // 12 bytes per step (4 voices × 3 bytes)
const TFMX_SONGTAB_ENTRY_SIZE = 6;    // u16 firstStep + u16 lastStep + u16 speed
const TFMX_SAMPLE_STRUCT_SIZE = 30;   // 18+4+2+4+2 bytes per sample header
const TFMX_SEQ_SIZE           = 64;   // 64 bytes per SndSeq, VolSeq, or Pattern
const TFMX_PATTERN_ROWS       = 32;   // 64 bytes / 2 bytes per row = 32 note events

// ── Utilities ─────────────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}

function u32BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

function s8(v: number): number {
  return v < 128 ? v : v - 256;
}

/**
 * Convert a TFMX note index to an XM note number.
 * Mirrors FCParser's fcPeriodIdxToXM: +13 maps the Amiga period-table index
 * to XM note space (C3=37 = period 428 = index 24; 24+13=37).
 */
function tfmxNoteToXM(noteIdx: number): number {
  return Math.max(1, Math.min(96, (noteIdx & 0x7F) + 13));
}

// ── Magic detection ───────────────────────────────────────────────────────────

/** Scan the first 0xB80 bytes for the 5-byte TFMX magic "TFMX\0". */
function findTFMXMagic(buf: Uint8Array): number {
  const limit = Math.min(0xB80, buf.length - 5);
  for (let i = 0; i < limit; i++) {
    if (buf[i] === 0x54 && buf[i + 1] === 0x46 && buf[i + 2] === 0x4D &&
        buf[i + 3] === 0x58 && buf[i + 4] === 0x00) {
      return i;
    }
  }
  return -1;
}

export function isTFMXFile(buffer: ArrayBuffer): boolean {
  return findTFMXMagic(new Uint8Array(buffer)) >= 0;
}

// ── SndSeq walker ─────────────────────────────────────────────────────────────

/**
 * Walk a SndModSeq to find the index of the first sample referenced by an
 * E2 (set_wave) or E4 (new_wave) command.  Follows E7 (set_seq) chains up
 * to depth 8.  Returns -1 if no sample is found.
 *
 * SndSeq command byte encoding:
 *   0xE0  loop          (+1 arg byte)
 *   0xE1  end           (no args)
 *   0xE2  set_wave      (+1 arg = sample index)
 *   0xE3  vibrato       (+2 args)
 *   0xE4  new_wave      (+1 arg = sample index)
 *   0xE5  wave_mod      (+8 args)
 *   0xE6  update_wave_mod (+5 args)
 *   0xE7  set_seq       (+1 arg = seq number to follow)
 *   0xE8  sustain       (+1 arg)
 *   0xE9  sample_pack   (+2 args)
 *   0xEA  randomize     (+1 arg)
 *   <0xE0 regular 2-byte entry (duration + param)
 */
function findFirstSampleInSndSeq(
  buf: Uint8Array,
  sndSeqsOff: number,
  sndSeqsCount: number,
  seqNum: number,
  depth = 0,
): number {
  if (depth > 8 || seqNum < 0 || seqNum >= sndSeqsCount) return -1;
  const seqOff = sndSeqsOff + seqNum * TFMX_SEQ_SIZE;
  let pos = 0;
  while (pos < TFMX_SEQ_SIZE - 1) {
    const cmd = buf[seqOff + pos];
    if (cmd === 0xE1) break;
    if (cmd === 0xE2 || cmd === 0xE4) return buf[seqOff + pos + 1];
    if (cmd === 0xE0) { pos += 2; continue; }
    if (cmd === 0xE3) { pos += 3; continue; }
    if (cmd === 0xE5) { pos += 9; continue; }
    if (cmd === 0xE6) { pos += 6; continue; }
    if (cmd === 0xE7) {
      return findFirstSampleInSndSeq(buf, sndSeqsOff, sndSeqsCount, buf[seqOff + pos + 1], depth + 1);
    }
    if (cmd === 0xE8) { pos += 2; continue; }
    if (cmd === 0xE9) { pos += 3; continue; }
    if (cmd === 0xEA) { pos += 2; continue; }
    if (cmd >= 0xE0) { pos += 1; continue; } // unknown high cmd — skip 1 byte
    pos += 2; // regular 2-byte seq entry
  }
  return -1;
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseTFMXFile(
  buffer: ArrayBuffer,
  filename: string,
  subsong = 0,
): TrackerSong {
  const buf = new Uint8Array(buffer);

  // 1. Locate TFMX header
  const h = findTFMXMagic(buf);
  if (h < 0) throw new Error('[TFMXParser] Magic "TFMX\\0" not found');

  // 2. Read header fields
  const sndSeqsCount    = 1 + u16BE(buf, h + 0x04);
  const volSeqsCount    = 1 + u16BE(buf, h + 0x06);
  const patternsCount   = 1 + u16BE(buf, h + 0x08);
  const trackStepsCount = 1 + u16BE(buf, h + 0x0A);
  const songCount       = u16BE(buf, h + 0x10);
  const sampleCount     = u16BE(buf, h + 0x12);

  if (sndSeqsCount > 512 || volSeqsCount > 512 || patternsCount > 512 || trackStepsCount > 4096) {
    throw new Error('[TFMXParser] Implausible section counts — not a valid TFMX file');
  }

  // 3. Compute section offsets (all sequential from h+0x20)
  const sndSeqsOff    = h + 0x20;
  const volSeqsOff    = sndSeqsOff    + TFMX_SEQ_SIZE           * sndSeqsCount;
  const patternsOff   = volSeqsOff    + TFMX_SEQ_SIZE           * volSeqsCount;
  const trackTabOff   = patternsOff   + TFMX_SEQ_SIZE           * patternsCount;
  const subSongTabOff = trackTabOff   + TFMX_TRACKTAB_STEP_SIZE * trackStepsCount;
  const sampleHdrsOff = subSongTabOff + TFMX_SONGTAB_ENTRY_SIZE * (songCount + 1);
  const sampleDataOff = sampleHdrsOff + TFMX_SAMPLE_STRUCT_SIZE  * sampleCount;

  if (sampleDataOff > buf.length) {
    throw new Error('[TFMXParser] File too small for declared section layout');
  }

  // 4. Select subsong
  const clampedSong = Math.max(0, Math.min(Math.max(0, songCount - 1), subsong));
  const ssOff       = subSongTabOff + clampedSong * TFMX_SONGTAB_ENTRY_SIZE;
  const firstStep   = u16BE(buf, ssOff);
  const lastStep    = u16BE(buf, ssOff + 2);
  const startSpeed  = u16BE(buf, ssOff + 4);

  // 5. Extract raw section blobs needed for TFMXSynth
  // SndModSeqs: sndSeqsCount × 64 bytes
  const sndModSeqData = buf.slice(sndSeqsOff, sndSeqsOff + TFMX_SEQ_SIZE * sndSeqsCount);
  // Sample headers: sampleCount × 30 bytes
  const sampleHeaders = sampleCount > 0
    ? buf.slice(sampleHdrsOff, sampleHdrsOff + TFMX_SAMPLE_STRUCT_SIZE * sampleCount)
    : new Uint8Array(0);
  // Sample data: from sampleDataOff to end of file
  const sampleDataBlob = sampleDataOff < buf.length
    ? buf.slice(sampleDataOff)
    : new Uint8Array(0);

  // 6. Build VolSeq → first sample index lookup (for Sampler fallback naming)
  const volSeqToSampleIdx = new Map<number, number>();
  for (let vsIdx = 0; vsIdx < volSeqsCount; vsIdx++) {
    const vsOff       = volSeqsOff + vsIdx * TFMX_SEQ_SIZE;
    const soundSeqNum = buf[vsOff + 1]; // byte 1 of VolSeq = SndSeq number
    const sampleIdx   = findFirstSampleInSndSeq(buf, sndSeqsOff, sndSeqsCount, soundSeqNum);
    if (sampleIdx >= 0 && sampleIdx < sampleCount) {
      volSeqToSampleIdx.set(vsIdx, sampleIdx);
    }
  }

  // 7. Parse sample headers for name extraction (used in fallback Sampler + TFMXSynth naming)
  const sampleNames: string[] = [];
  const sampleIdxToInstrId = new Map<number, number>();

  for (let sIdx = 0; sIdx < sampleCount; sIdx++) {
    const sh = sampleHdrsOff + sIdx * TFMX_SAMPLE_STRUCT_SIZE;
    let name = '';
    for (let i = 0; i < 18 && sh + i < buf.length && buf[sh + i] !== 0; i++) {
      name += String.fromCharCode(buf[sh + i]);
    }
    sampleNames.push(name.trim() || `Sample ${sIdx + 1}`);
    sampleIdxToInstrId.set(sIdx, sIdx + 1);
  }

  // 8. Build instruments: one TFMXSynth per VolModSeq
  const instruments: InstrumentConfig[] = [];
  const volSeqToInstrId = new Map<number, number>();

  for (let vsIdx = 0; vsIdx < volSeqsCount; vsIdx++) {
    const instrId = vsIdx + 1;
    volSeqToInstrId.set(vsIdx, instrId);

    // Name: use the first-referenced sample's name, or a generic fallback
    const sampleIdx = volSeqToSampleIdx.get(vsIdx);
    const name = sampleIdx !== undefined
      ? sampleNames[sampleIdx] ?? `Instrument ${instrId}`
      : `Instrument ${instrId}`;

    // Extract this VolModSeq's raw 64 bytes
    const vsOff = volSeqsOff + vsIdx * TFMX_SEQ_SIZE;
    const volModSeqData = buf.slice(vsOff, vsOff + TFMX_SEQ_SIZE);

    const tfmxConfig: TFMXConfig = {
      sndSeqsCount,
      sndModSeqData,
      volModSeqData,
      sampleCount,
      sampleHeaders,
      sampleData: sampleDataBlob,
    };

    instruments.push({
      id:        instrId,
      name,
      type:      'synth',
      synthType: 'TFMXSynth',
      tfmx:      tfmxConfig,
      effects:   [],
      volume:    -6,
      pan:       0,
    } as unknown as InstrumentConfig);
  }

  // Ensure at least one instrument entry even if no VolModSeqs
  if (instruments.length === 0 && sampleCount > 0) {
    // Fall back to one Sampler per sample slot
    for (let sIdx = 0; sIdx < sampleCount; sIdx++) {
      const sh         = sampleHdrsOff + sIdx * TFMX_SAMPLE_STRUCT_SIZE;
      const name       = sampleNames[sIdx] ?? `Sample ${sIdx + 1}`;
      const startOffs  = u32BE(buf, sh + 18);
      const lenWords   = u16BE(buf, sh + 22);
      const repOffsBytes = u16BE(buf, sh + 26);
      const repLenWords  = u16BE(buf, sh + 28);
      const instrId    = sIdx + 1;
      const byteLen    = lenWords * 2;
      const dataStart  = sampleDataOff + startOffs;

      if (byteLen < 2 || dataStart + byteLen > buf.length) {
        instruments.push(createSamplerInstrument(instrId, name, new Uint8Array(2), 64, 8287, 0, 0));
        continue;
      }
      const pcm       = buf.slice(dataStart, dataStart + byteLen);
      const hasLoop   = repLenWords > 1 && repOffsBytes < byteLen;
      const loopStart = hasLoop ? repOffsBytes : 0;
      const loopEnd   = hasLoop ? Math.min(repOffsBytes + repLenWords * 2, byteLen) : 0;
      instruments.push(createSamplerInstrument(instrId, name, pcm, 64, 8287, loopStart, loopEnd));
    }
  }

  // 7. Build TrackerSong patterns from the track table
  const trackerPatterns: Pattern[] = [];
  const clampedLast = Math.min(lastStep, trackStepsCount - 1);

  for (let stepIdx = firstStep; stepIdx <= clampedLast; stepIdx++) {
    const stepOff = trackTabOff + stepIdx * TFMX_TRACKTAB_STEP_SIZE;

    // Per-voice data: 3 bytes each (patIdx u8, transpose s8, soundTranspose u8)
    // soundTranspose 0x80 = channel off for this step
    interface VoiceStep {
      patIdx: number;
      transpose: number;
      soundTranspose: number;
      off: boolean;
    }
    const voiceSteps: VoiceStep[] = [];
    for (let ch = 0; ch < 4; ch++) {
      const col   = stepOff + ch * 3;
      const rawST = buf[col + 2];
      voiceSteps.push({
        patIdx:        buf[col],
        transpose:     s8(buf[col + 1]),
        soundTranspose: rawST === 0x80 ? 0 : s8(rawST),
        off:           rawST === 0x80,
      });
    }

    const channelRows: TrackerCell[][] = [[], [], [], []];
    const channelDone = [false, false, false, false];

    for (let row = 0; row < TFMX_PATTERN_ROWS; row++) {
      for (let ch = 0; ch < 4; ch++) {
        const empty: TrackerCell = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };

        if (channelDone[ch] || voiceSteps[ch].off) {
          channelRows[ch].push(empty);
          continue;
        }

        const voice  = voiceSteps[ch];
        const patOff = patternsOff + voice.patIdx * TFMX_SEQ_SIZE + row * 2;
        if (patOff + 1 >= buf.length) {
          channelRows[ch].push(empty);
          continue;
        }

        const byte0   = buf[patOff];
        const byte1   = buf[patOff + 1];
        const hasNote = (byte0 & 0x80) !== 0;
        const noteIdx = byte0 & 0x7F;

        // noteIdx 0x01 = pattern break — channel goes silent for remaining rows
        if (noteIdx === 0x01) {
          channelDone[ch] = true;
          channelRows[ch].push(empty);
          continue;
        }

        let xmNote  = 0;
        let instrId = 0;

        if (hasNote) {
          const transposedNote = (noteIdx + voice.transpose) & 0x7F;
          xmNote = tfmxNoteToXM(transposedNote);

          // Effective VolSeq = (byte1 & 0x1F) + soundTranspose, clamped
          const vsIdx = Math.max(0, Math.min(volSeqsCount - 1, (byte1 & 0x1F) + voice.soundTranspose));
          instrId = volSeqToInstrId.get(vsIdx) ?? 0;
        }

        channelRows[ch].push({ note: xmNote, instrument: instrId, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
      }
    }

    trackerPatterns.push({
      id: `pattern-${trackerPatterns.length}`,
      name: `Pattern ${trackerPatterns.length + 1}`,
      length: TFMX_PATTERN_ROWS,
      channels: channelRows.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: (ch === 0 || ch === 3) ? -50 : 50, // Amiga LRRL hard pan
        instrumentId: null,
        color: null,
        rows,
      })),
      importMetadata: {
        sourceFormat: 'TFMX',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: patternsCount,
        originalInstrumentCount: sampleCount,
      },
    });
  }

  // Fallback: ensure at least one empty pattern
  if (trackerPatterns.length === 0) {
    trackerPatterns.push({
      id: 'pattern-0',
      name: 'Pattern 0',
      length: TFMX_PATTERN_ROWS,
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
        rows: Array.from({ length: TFMX_PATTERN_ROWS }, () => ({
          note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        })),
      })),
      importMetadata: {
        sourceFormat: 'TFMX',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: 0,
      },
    });
  }

  return {
    name: filename.replace(/\.[^/.]+$/, ''),
    format: 'TFMX' as TrackerFormat,
    patterns: trackerPatterns,
    instruments,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: startSpeed > 0 && startSpeed < 32 ? startSpeed : 6,
    initialBPM: 125,
    linearPeriods: false,
  };
}
