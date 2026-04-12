/**
 * WallyBebenParser.ts — Wally Beben music format parser (.wb / WB.*)
 *
 * Wally 'Hagar' Beben composed music for Amiga games including Dark Side,
 * Elite, Hammerfist, Hawkeye, and Total Eclipse.
 *
 * The file is a raw 68k executable with embedded player code and music data.
 * Data structures are located via opcode scanning:
 *   - Origin (load base): scan for 0x1039 (MOVE.B abs,D0)
 *   - Subsong count: scan for 0x223C (MOVE.L #n,D1)
 *   - SongsPtr table: scan for 0x41F9 (LEA abs,A0) after 0x223C
 *   - SamplesPtr table: scan for 0xE584 (ASL.L #2,D4) with preceding LEA
 *
 * SongsPtr table layout:
 *   [0..nSubsongs*4-1] = voice sequence pointers (4 per subsong)
 *   [nSubsongs*4..]     = phrase/pattern data pointers
 *
 * Voice sequences: byte arrays terminated by 0xFF.
 *   byte < 0x80: phrase index (look up in phrase table)
 *   byte >= 0x80, != 0xFF: control command in voice stream
 *   byte == 0xFF: end of sequence
 *
 * Phrase data: byte stream per phrase:
 *   byte 0x00-0x23: note index into 36-entry period table (C-1 to B-3)
 *   byte >= 0x80: control/instrument command
 *   byte 0xFF: end of phrase
 *   byte 0x24-0x7F: rest/hold
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/WallyBeben/src/Wally Beben_v1.asm
 * Research: thoughts/shared/research/2026-04-05_wally-beben-format.md
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell } from '@/types';
import type { InstrumentConfig } from '@/types/instrument';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { createSamplerInstrument, amigaNoteToXM } from './AmigaUtils';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

// ── Format detection ──────────────────────────────────────────────────────────

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

// ── Opcode scanning utilities ─────────────────────────────────────────────────

function findOrigin(buf: Uint8Array): number {
  for (let i = 0; i < Math.min(0x200, buf.length - 6); i += 2) {
    if (u16BE(buf, i) === 0x1039) {
      const absAddr = u32BE(buf, i + 2);
      const d0 = i + 2;
      return (absAddr - d0) >>> 0;
    }
  }
  return 0;
}

function toFileOff(origin: number, absAddr: number, fileLen: number): number {
  const result = origin > 0x80000000
    ? ((absAddr - origin + 0x100000000) & 0xFFFFFFFF)
    : absAddr - origin;
  return (result > 0 && result < fileLen) ? result : -1;
}

function findSubsongCount(buf: Uint8Array): number {
  for (let i = 0; i < Math.min(0x200, buf.length - 6); i += 2) {
    if (u16BE(buf, i) === 0x223C) {
      return u32BE(buf, i + 2);
    }
  }
  return 1;
}

function findSongsPtr(buf: Uint8Array, origin: number): { offset: number; isU16Hi: boolean } {
  let past223c = false;
  for (let i = 0; i < Math.min(0x200, buf.length - 6); i += 2) {
    if (u16BE(buf, i) === 0x223C) past223c = true;
    if (past223c && u16BE(buf, i) === 0x41F9) {
      const foff = toFileOff(origin, u32BE(buf, i + 2), buf.length);
      if (foff > 0 && foff + 4 < buf.length) {
        const isU16Hi = (u32BE(buf, foff) & 0xFFFF) === 0;
        return { offset: foff, isU16Hi };
      }
      break;
    }
  }
  return { offset: -1, isU16Hi: false };
}

function findSamplesPtr(buf: Uint8Array, origin: number): number {
  for (let i = 0; i < buf.length - 8; i += 2) {
    if (u16BE(buf, i) === 0xE584) {
      const leaPos = i - 4;
      if (leaPos >= 2) {
        const leaOp = u16BE(buf, leaPos - 2);
        if (leaOp === 0x41F9 || leaOp === 0x43F9) {
          const spOff = toFileOff(origin, u32BE(buf, leaPos), buf.length);
          if (spOff > 0 && spOff < buf.length) return spOff;
        }
      }
      break;
    }
  }
  return -1;
}

function readSongPtr(buf: Uint8Array, origin: number, songsOff: number, idx: number, isU16Hi: boolean): number {
  const ptrOff = songsOff + idx * 4;
  if (ptrOff + 4 > buf.length) return -1;
  if (isU16Hi) {
    const hi16 = (u32BE(buf, ptrOff) >>> 16) & 0xFFFF;
    return hi16 - (origin & 0xFFFF);
  }
  return toFileOff(origin, u32BE(buf, ptrOff), buf.length);
}

// ── Decode phrase data into tracker rows ──────────────────────────────────────

interface PhraseDecodeResult {
  rows: TrackerCell[];
  /** File byte offset of each row's note/rest byte */
  offsets: number[];
}

function decodePhraseToRows(buf: Uint8Array, phraseOff: number): PhraseDecodeResult {
  const rows: TrackerCell[] = [];
  const offsets: number[] = [];
  if (phraseOff < 0 || phraseOff >= buf.length) return { rows, offsets };

  let pos = phraseOff;
  let currentInstr = 0;

  for (let i = 0; i < 256 && pos < buf.length; i++) {
    const byteOff = pos;
    const b = buf[pos++];

    if (b === 0xFF) break;

    if (b <= 0x23) {
      // Note index (0-35) into period table
      const xmNote = amigaNoteToXM(b + 1); // 1-based
      rows.push({
        note: xmNote, instrument: currentInstr,
        volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      });
      offsets.push(byteOff);
    } else if (b >= 0xE0 && b <= 0xEF) {
      // Set instrument (0xE0 = inst 1, 0xE1 = inst 2, etc.)
      currentInstr = (b & 0x0F) + 1;
    } else if (b >= 0xC0 && b <= 0xCF && pos < buf.length) {
      // Command with parameter byte — skip parameter
      pos++;
    } else if (b >= 0x80) {
      // Other control command — no row generated
    } else {
      // 0x24-0x7F: rest/hold — generate empty row
      rows.push({
        note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      });
      offsets.push(byteOff);
    }
  }

  return { rows, offsets };
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseWallyBebenFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isWallyBebenFormat(buf)) throw new Error('Not a Wally Beben module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^wb\./i, '').replace(/\.wb$/i, '') || baseName;

  const origin = findOrigin(buf);
  const nSubsongs = findSubsongCount(buf);
  const { offset: songsOff, isU16Hi } = findSongsPtr(buf, origin);

  // ── Extract samples ─────────────────────────────────────────────────────
  const instruments: InstrumentConfig[] = [];
  const samplesOff = findSamplesPtr(buf, origin);
  let numSamples = 0;

  if (samplesOff > 0) {
    for (let j = 0; j < 64; j++) {
      const ptr = u32BE(buf, samplesOff + j * 4);
      if (ptr === 0 || toFileOff(origin, ptr, buf.length) < 0) break;
      numSamples++;
    }

    for (let i = 0; i < numSamples; i++) {
      const pcmOff = toFileOff(origin, u32BE(buf, samplesOff + i * 4), buf.length);
      if (pcmOff < 0) {
        instruments.push({
          id: i + 1, name: `WB Sample ${i + 1}`,
          type: 'synth' as const, synthType: 'Synth' as const,
          effects: [], volume: 0, pan: 0,
        } as InstrumentConfig);
        continue;
      }

      // Calculate sample length from next pointer or file end
      let lenBytes = 0;
      if (i + 1 < numSamples) {
        const nextOff = toFileOff(origin, u32BE(buf, samplesOff + (i + 1) * 4), buf.length);
        if (nextOff > pcmOff) lenBytes = nextOff - pcmOff;
      }
      if (lenBytes === 0) lenBytes = Math.min(buf.length - pcmOff, 0x10000);

      if (lenBytes <= 0 || pcmOff + lenBytes > buf.length) {
        instruments.push({
          id: i + 1, name: `WB Sample ${i + 1}`,
          type: 'synth' as const, synthType: 'Synth' as const,
          effects: [], volume: 0, pan: 0,
        } as InstrumentConfig);
        continue;
      }

      const pcm = new Uint8Array(lenBytes);
      for (let k = 0; k < lenBytes; k++) pcm[k] = buf[pcmOff + k];

      instruments.push(createSamplerInstrument(
        i + 1, `WB Sample ${i + 1}`, pcm, 64, 8287, 0, 0,
      ));
    }
  }

  if (instruments.length === 0) {
    instruments.push({
      id: 1, name: 'Sample 1',
      type: 'synth' as const, synthType: 'Synth' as const,
      effects: [], volume: 0, pan: 0,
    } as InstrumentConfig);
  }

  // ── Build phrase table ──────────────────────────────────────────────────
  const phraseTableStart = songsOff >= 0 ? songsOff + nSubsongs * 4 * 4 : -1;
  const phraseOffsets: number[] = [];

  if (phraseTableStart > 0) {
    for (let i = 0; i < 256; i++) {
      const ptrOff = phraseTableStart + i * 4;
      if (ptrOff + 4 > buf.length) break;
      const absPtr = u32BE(buf, ptrOff);
      if (absPtr === 0) break;
      const off = toFileOff(origin, absPtr, buf.length);
      if (off < 0) break;
      phraseOffsets.push(off);
    }
  }

  // ── Parse voice sequences and build patterns ────────────────────────────
  const patterns: Pattern[] = [];
  const songPositions: number[] = [];
  // cellOffsetMap: keyed by "patIdx-channel-row" → file byte offset
  const cellOffsetMap = new Map<string, number>();

  if (songsOff >= 0 && phraseOffsets.length > 0) {
    // Read voice sequences for subsong 1
    const voiceSeqs: number[][] = [[], [], [], []];

    for (let v = 0; v < 4; v++) {
      const seqOff = readSongPtr(buf, origin, songsOff, v, isU16Hi);
      if (seqOff < 0) continue;
      let pos = seqOff;
      while (pos < buf.length) {
        const b = buf[pos++];
        if (b === 0xFF) break;
        if (b < 0x80) {
          voiceSeqs[v].push(b);
        }
      }
    }

    const numSteps = Math.max(...voiceSeqs.map(s => s.length), 1);

    for (let step = 0; step < numSteps; step++) {
      const channelRows: TrackerCell[][] = [];
      const channelOffsets: number[][] = [];
      let maxRows = 1;

      for (let v = 0; v < 4; v++) {
        const phraseIdx = step < voiceSeqs[v].length ? voiceSeqs[v][step] : -1;
        let rows: TrackerCell[] = [];
        let offsets: number[] = [];

        if (phraseIdx >= 0 && phraseIdx < phraseOffsets.length) {
          const result = decodePhraseToRows(buf, phraseOffsets[phraseIdx]);
          rows = result.rows;
          offsets = result.offsets;
        }

        if (rows.length === 0) {
          rows = [{ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }];
          offsets = [-1];
        }

        channelRows.push(rows);
        channelOffsets.push(offsets);
        maxRows = Math.max(maxRows, rows.length);
      }

      maxRows = Math.min(maxRows, 128);

      const channels: ChannelData[] = [];
      for (let v = 0; v < 4; v++) {
        const rows = channelRows[v];
        const offsets = channelOffsets[v];
        const trackerRows: TrackerCell[] = [];
        for (let r = 0; r < maxRows; r++) {
          trackerRows.push(r < rows.length ? rows[r]
            : { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          // Record file offset for cells that have one
          const off = r < offsets.length ? offsets[r] : -1;
          if (off >= 0) {
            cellOffsetMap.set(`${step}-${v}-${r}`, off);
          }
        }
        channels.push({
          id: `channel-${v}`, name: `Channel ${v + 1}`,
          muted: false, solo: false, collapsed: false,
          volume: 100, pan: (v === 0 || v === 3) ? -50 : 50,
          instrumentId: null, color: null, rows: trackerRows,
        });
      }

      patterns.push({
        id: `pattern-${step}`, name: `Pattern ${step}`, length: maxRows, channels,
        importMetadata: {
          sourceFormat: 'MOD' as const, sourceFile: filename,
          importedAt: new Date().toISOString(), originalChannelCount: 4,
          originalPatternCount: numSteps, originalInstrumentCount: instruments.length,
        },
      });
      songPositions.push(step);
    }
  }

  // Fallback
  if (patterns.length === 0) {
    const emptyRows: TrackerCell[] = Array.from({ length: 64 }, () => ({
      note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
    }));
    patterns.push({
      id: 'pattern-0', name: 'Pattern 0', length: 64,
      channels: Array.from({ length: 4 }, (_, ch) => ({
        id: `channel-${ch}`, name: `Channel ${ch + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100, pan: (ch === 0 || ch === 3) ? -50 : 50,
        instrumentId: null, color: null, rows: emptyRows,
      })),
      importMetadata: {
        sourceFormat: 'MOD' as const, sourceFile: filename,
        importedAt: new Date().toISOString(), originalChannelCount: 4,
        originalPatternCount: 1, originalInstrumentCount: instruments.length,
      },
    });
    songPositions.push(0);
  }

  // ── Build UADEPatternLayout for live editing ────────────────────────────
  const wallyBebenLayout: UADEPatternLayout = {
    formatId: 'wallyBeben',
    patternDataFileOffset: 0, // not used — getCellFileOffset is custom
    bytesPerCell: 1,
    rowsPerPattern: patterns.length > 0 ? patterns[0].length : 64,
    numChannels: 4,
    numPatterns: patterns.length,
    moduleSize: buf.byteLength,
    encodeCell: (cell: TrackerCell): Uint8Array => {
      const out = new Uint8Array(1);
      if (cell.note > 0) {
        // XM note back to WB note index: amigaNoteToXM adds 12, undo that, then -1 for 0-based
        const wbIdx = cell.note - 12 - 1;
        out[0] = (wbIdx >= 0 && wbIdx <= 0x23) ? wbIdx : 0x24;
      } else {
        out[0] = 0x24; // rest
      }
      return out;
    },
    decodeCell: (raw: Uint8Array): TrackerCell => {
      const b = raw[0];
      // amigaNoteToXM(b + 1) = b + 13; values 0x24+ are rest
      const note = (b < 0x24) ? amigaNoteToXM(b + 1) : 0;
      return { note, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
    },
    getCellFileOffset: (pattern: number, row: number, channel: number): number => {
      return cellOffsetMap.get(`${pattern}-${channel}-${row}`) ?? -1;
    },
  };

  return {
    name: `${moduleName} [Wally Beben]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 1,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: wallyBebenLayout,
  };
}
