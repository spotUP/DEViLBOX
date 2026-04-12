/**
 * SpecialFXParser.ts — Special FX Amiga music format native parser
 *
 * Special FX (also known as "JD") is a 4-channel Amiga music format. The module
 * begins with a sequence of BRA (branch always) opcodes pointing to the player
 * subroutines, which serves as the format signature.
 *
 * NOTE: This parser handles the Special FX format (UADE prefix "JD.*") and must
 * not be confused with SoundFXParser.ts which handles the unrelated Sound FX
 * format (.sfx files).
 *
 * Detection (from UADE Special FX_v2.asm Check2 routine):
 *   buf.length >= 16
 *   u16BE(buf, 0)  === 0x6000   (BRA opcode at offset 0)
 *   u16BE(buf, 2)  !== 0, bit 15 clear (positive), even
 *   u16BE(buf, 4)  === 0x6000   (BRA opcode at offset 4)
 *   u16BE(buf, 6)  !== 0, bit 15 clear (positive), even
 *   u16BE(buf, 8)  === 0x6000   (BRA opcode at offset 8)
 *   u16BE(buf, 10) !== 0, bit 15 clear (positive), even
 *   u16BE(buf, 12) === 0x6000   (BRA opcode at offset 12)
 *   u16BE(buf, 14) !== 0, bit 15 clear (positive), even
 *
 * File prefix: "JD." (e.g. "JD.songname")
 * Single-file format: music data binary.
 * Actual audio playback is delegated to UADE.
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/SpecialFX/...
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeMODCell, decodeMODCell } from '@/engine/uade/encoders/MODEncoder';

const MIN_FILE_SIZE = 16;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

export function isSpecialFXFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // First BRA opcode
  if (u16BE(buf, 0) !== 0x6000) return false;

  // Branch displacement at offset 2: non-zero, positive (bit 15 clear), even
  const d2 = u16BE(buf, 2);
  if (d2 === 0 || (d2 & 0x8000) !== 0 || (d2 & 1) !== 0) return false;

  // Second BRA opcode
  if (u16BE(buf, 4) !== 0x6000) return false;

  // Branch displacement at offset 6: non-zero, positive (bit 15 clear), even
  const d3 = u16BE(buf, 6);
  if (d3 === 0 || (d3 & 0x8000) !== 0 || (d3 & 1) !== 0) return false;

  // Third BRA opcode
  if (u16BE(buf, 8) !== 0x6000) return false;

  // Branch displacement at offset 10: non-zero, positive (bit 15 clear), even
  const d4 = u16BE(buf, 10);
  if (d4 === 0 || (d4 & 0x8000) !== 0 || (d4 & 1) !== 0) return false;

  // Fourth BRA opcode
  if (u16BE(buf, 12) !== 0x6000) return false;

  // Branch displacement at offset 14: non-zero, positive (bit 15 clear), even
  const d5 = u16BE(buf, 14);
  if (d5 === 0 || (d5 & 0x8000) !== 0 || (d5 & 1) !== 0) return false;

  return true;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

export function parseSpecialFXFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isSpecialFXFormat(buf)) throw new Error('Not a Special FX module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^jd\./i, '').replace(/^doda\./i, '').replace(/\.jd$/i, '').replace(/\.doda$/i, '') || baseName;

  // ── Follow BRA targets to find init/play entry points ─────────────────────
  //
  // The four BRA opcodes at offsets 0, 4, 8, 12 point to subroutines:
  //   BRA #0 → Init
  //   BRA #1 → Play (VBlank)
  //   BRA #2 → Stop
  //   BRA #3 → Exit
  //
  // BRA.W displacement is PC-relative from opcode+2.

  const braTargets: number[] = [];
  for (let i = 0; i < 4; i++) {
    const disp = u16BE(buf, i * 4 + 2);
    const target = (i * 4 + 2) + disp;
    if (target < buf.length) {
      braTargets.push(target);
    }
  }

  // ── Scan for LEA instructions to find sample/pattern data tables ──────────
  //
  // $41FA = LEA d16(PC),A0 — often points to sample table
  // $43FA = LEA d16(PC),A1 — often points to data tables
  // $45FA = LEA d16(PC),A2 — another common target

  const instruments: InstrumentConfig[] = [];
  let sampleCount = 0;

  try {
    // Start scanning from the init routine if we found it, otherwise from offset 16
    const scanStart = braTargets.length > 0 ? Math.min(braTargets[0], buf.length - 4) : 16;
    const scanEnd = Math.min(buf.length - 4, scanStart + 2048);

    interface SFXTableRef {
      target: number;
      register: string;
    }
    const tableRefs: SFXTableRef[] = [];

    for (let off = scanStart; off < scanEnd; off += 2) {
      const opcode = u16BE(buf, off);

      // LEA d16(PC),An opcodes: $41FA(A0), $43FA(A1), $45FA(A2), $47FA(A3)
      if ((opcode === 0x41FA || opcode === 0x43FA || opcode === 0x45FA || opcode === 0x47FA) &&
          off + 4 <= buf.length) {
        const disp = u16BE(buf, off + 2);
        const signedDisp = disp < 0x8000 ? disp : disp - 0x10000;
        const target = off + 2 + signedDisp;
        if (target > 0 && target < buf.length) {
          const reg = opcode === 0x41FA ? 'A0' :
                      opcode === 0x43FA ? 'A1' :
                      opcode === 0x45FA ? 'A2' : 'A3';
          tableRefs.push({ target, register: reg });
        }
      }
    }

    // Try to extract sample info from the first table reference that looks like sample data
    for (const ref of tableRefs) {
      let off = ref.target;
      const candidates: number[] = [];

      // Try reading sample entries: u32 offset + u32 length (8 bytes each)
      for (let i = 0; i < 32 && off + 8 <= buf.length; i++) {
        const smpOff = u32BE(buf, off);
        const smpLen = u32BE(buf, off + 4);
        if (smpLen === 0 || smpLen > 0x80000) break;
        if (smpOff > buf.length * 2) break;
        candidates.push(smpLen);
        off += 8;
      }

      if (candidates.length >= 2) {
        sampleCount = candidates.length;
        for (let i = 0; i < sampleCount; i++) {
          instruments.push({
            id: i + 1,
            name: `Sample ${i + 1} (${candidates[i]} bytes)`,
            type: 'synth' as const,
            synthType: 'Synth' as const,
            effects: [],
            volume: 0,
            pan: 0,
          } as InstrumentConfig);
        }
        break;
      }

      // Try 6-byte entries: u32 offset + u16 length
      off = ref.target;
      const candidates6: number[] = [];
      for (let i = 0; i < 32 && off + 6 <= buf.length; i++) {
        const smpOff = u32BE(buf, off);
        const smpLen = u16BE(buf, off + 4) * 2;
        if (smpLen === 0 || smpLen > 0x80000) break;
        if (smpOff > buf.length * 2) break;
        candidates6.push(smpLen);
        off += 6;
      }

      if (candidates6.length >= 2) {
        sampleCount = candidates6.length;
        for (let i = 0; i < sampleCount; i++) {
          instruments.push({
            id: i + 1,
            name: `Sample ${i + 1} (${candidates6[i]} bytes)`,
            type: 'synth' as const,
            synthType: 'Synth' as const,
            effects: [],
            volume: 0,
            pan: 0,
          } as InstrumentConfig);
        }
        break;
      }
    }
  } catch {
    // Binary scan failed — fall back to default
  }

  // Fallback: single placeholder
  if (instruments.length === 0) {
    instruments.push({
      id: 1, name: 'Sample 1', type: 'synth' as const,
      synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
    } as InstrumentConfig);
    sampleCount = 1;
  }

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  const pattern = {
    id: 'pattern-0', name: 'Pattern 0', length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`,
      muted: false, solo: false, collapsed: false,
      volume: 100, pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null, color: null, rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4, originalPatternCount: 1,
      originalInstrumentCount: sampleCount,
      braTargets,
    },
  };

  return {
    name: `${moduleName} [Special FX]`,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments,
    songPositions: [0], songLength: 1, restartPosition: 0,
    numChannels: 4, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'specialFX',
      patternDataFileOffset: 0,
      bytesPerCell: 4,
      rowsPerPattern: 64,
      numChannels: 4,
      numPatterns: 1,
      moduleSize: buffer.byteLength,
      encodeCell: encodeMODCell,
      decodeCell: decodeMODCell,
    } as UADEPatternLayout,
  };
}
