/**
 * WallyBebenParser.ts — Wally Beben music format parser (WB.* prefix)
 *
 * Wally Beben files are self-contained 68k executables with embedded player code,
 * song structure (voice sequences → phrase references), and PCM sample data.
 *
 * Detection (from Wally Beben_v1.asm Check2):
 *   u16BE(0) = 0x6000 (BRA), u16BE(2) = positive even displacement,
 *   u32BE(4) = 0x48E7FFFE (MOVEM), u16BE(8) = 0x6100 (BSR)
 *
 * Key structures found by opcode scanning:
 *   0x223C (MOVE.L #n,D1) → subsong count
 *   0x1039 (MOVE.B abs,D0) → origin (load base address)
 *   0x41F9 (LEA abs,A0) after 0x223C → SongsPtr table
 *   0xE584 (ASL.L #2,D4) → SamplesPtr table (LEA 6 bytes before)
 *
 * Song structure: voice sequences (byte arrays, 0xFF-terminated) reference phrase
 * indices. Each phrase is a command stream with note indices (0-35 into period table)
 * and control bytes (>= 0x80).
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/WallyBeben/src/Wally Beben_v1.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers ─────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

// ── Amiga period table (matches WB's 36-entry table) ──────────────────────

const WB_PERIODS: number[] = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
];

const PT_PERIODS = WB_PERIODS; // same table

function periodToXMNote(period: number): number {
  if (period <= 0) return 0;
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < PT_PERIODS.length; i++) {
    const d = Math.abs(PT_PERIODS[i] - period);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return Math.max(1, Math.min(96, bestIdx + 13));
}

function noteIndexToXM(idx: number): number {
  if (idx < 0 || idx >= WB_PERIODS.length) return 0;
  return periodToXMNote(WB_PERIODS[idx]);
}

// ── Format detection ───────────────────────────────────────────────────────

export function isWallyBebenFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 10) return false;
  if (u16BE(buf, 0) !== 0x6000) return false;
  const d1 = u16BE(buf, 2);
  if (d1 === 0 || (d1 & 0x8000) || (d1 & 0x0001)) return false;
  if (u32BE(buf, 4) !== 0x48E7FFFE) return false;
  if (u16BE(buf, 8) !== 0x6100) return false;
  return true;
}

// ── Origin extraction ─────────────────────────────────────────────────────

function findOrigin(buf: Uint8Array): number {
  const limit = Math.min(0x200, buf.length - 6);
  for (let i = 0; i < limit; i += 2) {
    if (u16BE(buf, i) === 0x1039) {
      const absAddr = u32BE(buf, i + 2);
      return (absAddr - (i + 2)) >>> 0;
    }
  }
  return 0;
}

function toFileOffset(origin: number, absAddr: number, fileLen: number): number {
  let result: number;
  if (origin > 0x80000000) {
    result = ((absAddr - origin + 0x100000000) & 0xFFFFFFFF) >>> 0;
  } else {
    result = absAddr - origin;
  }
  return (result > 0 && result < fileLen) ? result : -1;
}

// ── Subsong count ─────────────────────────────────────────────────────────

function findSubsongCount(buf: Uint8Array): number {
  const limit = Math.min(0x200, buf.length - 6);
  for (let i = 0; i < limit; i += 2) {
    if (u16BE(buf, i) === 0x223C) {
      return u32BE(buf, i + 2);
    }
  }
  return 1;
}

// ── SongsPtr table ────────────────────────────────────────────────────────

function findSongsPtr(buf: Uint8Array, origin: number): { fileOff: number; isU16Hi: boolean } {
  const limit = Math.min(0x200, buf.length - 6);
  let past223c = false;
  for (let i = 0; i < limit; i += 2) {
    if (u16BE(buf, i) === 0x223C) past223c = true;
    if (past223c && u16BE(buf, i) === 0x41F9) {
      const foff = toFileOffset(origin, u32BE(buf, i + 2), buf.length);
      if (foff > 0 && foff + 4 < buf.length) {
        const isU16Hi = (u32BE(buf, foff) & 0xFFFF) === 0;
        return { fileOff: foff, isU16Hi };
      }
    }
  }
  return { fileOff: -1, isU16Hi: false };
}

// ── Sample table ──────────────────────────────────────────────────────────

interface WBSample {
  fileOffset: number;
  length: number;
  loopStart: number;
  loopLength: number;
  hasLoop: boolean;
}

function findSamples(buf: Uint8Array, origin: number): WBSample[] {
  const samples: WBSample[] = [];

  // Find SamplesPtr via 0xE584 opcode
  let samplesFileOff = -1;
  for (let i = 0; i < buf.length - 8; i += 2) {
    if (u16BE(buf, i) === 0xE584) {
      const leaPos = i - 4;
      if (leaPos >= 2) {
        const leaOp = u16BE(buf, leaPos - 2);
        if (leaOp === 0x41F9 || leaOp === 0x43F9) {
          const spOff = toFileOffset(origin, u32BE(buf, leaPos), buf.length);
          if (spOff > 0 && spOff < buf.length) {
            samplesFileOff = spOff;
          }
        }
      }
      break;
    }
  }

  if (samplesFileOff < 0) return samples;

  // Read sample pointers (null-terminated)
  const samplePtrs: number[] = [];
  for (let i = 0; i < 64; i++) {
    const off = samplesFileOff + i * 4;
    if (off + 4 > buf.length) break;
    const ptr = u32BE(buf, off);
    if (ptr === 0) break;
    const foff = toFileOffset(origin, ptr, buf.length);
    samplePtrs.push(foff);
  }

  // Find SamplesLen table — it's typically just before or after SamplesPtr
  // Look for it by scanning near SamplesPtr for sequential indices (0,1,2,3...)
  let samplesLenOff = -1;
  // Try common offsets relative to SamplesPtr
  for (const delta of [samplePtrs.length * 4, -samplePtrs.length * 8, 0x3C, -0x3C]) {
    const candidate = samplesFileOff + delta;
    if (candidate < 0 || candidate + 8 > buf.length) continue;
    // Check if first byte is 0 (seq_index 0) and structure looks valid
    if (buf[candidate] === 0 && buf[candidate + 1] <= 1) {
      // Verify second entry has seq_index 1
      if (candidate + 16 <= buf.length && buf[candidate + 8] === 1) {
        samplesLenOff = candidate;
        break;
      }
    }
  }

  for (let i = 0; i < samplePtrs.length; i++) {
    const foff = samplePtrs[i];
    if (foff < 0) continue;

    let length = 0;
    let loopStart = 0;
    let loopLength = 0;
    let hasLoop = false;

    if (samplesLenOff >= 0) {
      const entryOff = samplesLenOff + i * 8;
      if (entryOff + 8 <= buf.length) {
        hasLoop = buf[entryOff + 1] === 1;
        length = u16BE(buf, entryOff + 2);
        loopStart = u16BE(buf, entryOff + 4);
        loopLength = u16BE(buf, entryOff + 6);
        if (loopLength <= 2) hasLoop = false;
      }
    }

    // Fallback: compute length from next sample pointer
    if (length === 0 && i < samplePtrs.length - 1) {
      const nextFoff = samplePtrs[i + 1];
      if (nextFoff > foff) length = nextFoff - foff;
    }
    if (length === 0) length = Math.min(4096, buf.length - foff);

    samples.push({ fileOffset: foff, length, loopStart, loopLength, hasLoop });
  }

  return samples;
}

// ── Voice sequence reading ────────────────────────────────────────────────

function readVoiceSequences(
  buf: Uint8Array,
  origin: number,
  songsPtr: number,
  isU16Hi: boolean,
  nSubsongs: number,
): number[][][] {
  // Returns [subsong][voice][phraseIdx...]
  const allSequences: number[][][] = [];

  for (let s = 0; s < nSubsongs; s++) {
    const voices: number[][] = [];
    for (let v = 0; v < 4; v++) {
      const ptrOff = songsPtr + (s * 4 + v) * 4;
      if (ptrOff + 4 > buf.length) { voices.push([]); continue; }

      let foff: number;
      if (isU16Hi) {
        const hi16 = (u32BE(buf, ptrOff) >>> 16) & 0xFFFF;
        foff = hi16 - (origin & 0xFFFF);
      } else {
        foff = toFileOffset(origin, u32BE(buf, ptrOff), buf.length);
      }

      if (foff < 0 || foff >= buf.length) { voices.push([]); continue; }

      const seq: number[] = [];
      for (let j = 0; j < 500 && foff + j < buf.length; j++) {
        if (buf[foff + j] === 0xFF) break;
        seq.push(buf[foff + j]);
      }
      voices.push(seq);
    }
    allSequences.push(voices);
  }

  return allSequences;
}

// ── Main parser ────────────────────────────────────────────────────────────

export function parseWallyBebenFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isWallyBebenFormat(buf)) throw new Error('Not a Wally Beben module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^wb\./i, '').replace(/\.wb$/i, '') || baseName;

  // ── Extract metadata ─────────────────────────────────────────────────────

  const origin = findOrigin(buf);
  const nSubsongs = findSubsongCount(buf);
  const { fileOff: songsPtr, isU16Hi } = findSongsPtr(buf, origin);
  const wbSamples = findSamples(buf, origin);

  // ── Voice sequences (subsong 0) ──────────────────────────────────────────

  let voiceSeqs: number[][] = [[], [], [], []];
  if (songsPtr >= 0) {
    const allSeqs = readVoiceSequences(buf, origin, songsPtr, isU16Hi, nSubsongs);
    if (allSeqs.length > 0) voiceSeqs = allSeqs[0];
  }

  // ── Build patterns from voice sequences ──────────────────────────────────
  // Each step in the voice sequence is a phrase index. We create one tracker
  // pattern per step, with the phrase index shown as a note placeholder.

  const songLength = Math.max(...voiceSeqs.map(s => s.length), 1);

  const emptyCell = (): TrackerCell => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  });

  const trackerPatterns: Pattern[] = [];
  const ROWS_PER_PATTERN = 64; // Display each phrase as 64 rows

  for (let pos = 0; pos < songLength; pos++) {
    const channels = [];
    for (let ch = 0; ch < 4; ch++) {
      const seq = voiceSeqs[ch];
      const phraseIdx = pos < seq.length ? seq[pos] : -1;

      const rows: TrackerCell[] = Array.from({ length: ROWS_PER_PATTERN }, emptyCell);

      // Show phrase index as a note on row 0 for visual reference
      if (phraseIdx >= 0 && phraseIdx < 36) {
        rows[0].note = noteIndexToXM(phraseIdx);
        rows[0].instrument = 1;
      } else if (phraseIdx >= 0) {
        // For phrase indices > 35, show as effect value
        rows[0].effTyp = 0xF;
        rows[0].eff = phraseIdx;
      }

      channels.push({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100, pan: (ch === 0 || ch === 3) ? -50 : 50,
        instrumentId: null, color: null,
        rows,
      });
    }

    trackerPatterns.push({
      id: `pattern-${pos}`,
      name: `Pattern ${pos}`,
      length: ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat: 'MOD' as const,
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: songLength,
        originalInstrumentCount: wbSamples.length,
      },
    });
  }

  if (trackerPatterns.length === 0) {
    trackerPatterns.push({
      id: 'pattern-0',
      name: 'Pattern 0',
      length: ROWS_PER_PATTERN,
      channels: Array.from({ length: 4 }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100, pan: (ch === 0 || ch === 3) ? -50 : 50,
        instrumentId: null, color: null,
        rows: Array.from({ length: ROWS_PER_PATTERN }, emptyCell),
      })),
      importMetadata: {
        sourceFormat: 'MOD' as const,
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: 0,
      },
    });
  }

  // ── Build instruments with real sample data ──────────────────────────────

  const instruments: InstrumentConfig[] = [];
  for (let i = 0; i < wbSamples.length; i++) {
    const s = wbSamples[i];
    const id = i + 1;

    if (s.fileOffset >= 0 && s.length > 0 && s.fileOffset + s.length <= buf.length) {
      const pcm = new Uint8Array(s.length);
      for (let j = 0; j < s.length; j++) {
        pcm[j] = buf[s.fileOffset + j];
      }
      const loopStart = s.hasLoop ? s.loopStart : 0;
      const loopEnd = s.hasLoop ? s.loopStart + s.loopLength : 0;
      instruments.push(createSamplerInstrument(id, `WB Sample ${id}`, pcm, 64, 8287, loopStart, loopEnd));
    } else {
      instruments.push({
        id,
        name: `WB Sample ${id}`,
        type: 'synth' as const,
        synthType: 'Synth' as const,
        effects: [],
        volume: 0,
        pan: 0,
      } as InstrumentConfig);
    }
  }

  if (instruments.length === 0) {
    instruments.push({
      id: 1,
      name: 'WB Sample 1',
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: 0,
      pan: 0,
    } as InstrumentConfig);
  }

  return {
    name: `${moduleName} [Wally Beben]`,
    format: 'MOD' as TrackerFormat,
    patterns: trackerPatterns,
    instruments,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  };
}
