/**
 * NickPellingPackerParser.ts — Nick Pelling Packer Amiga music format parser
 *
 * Nick Pelling Packer is a Wanted Team Amiga packed music format. Files begin
 * with the ASCII magic word "COMP" followed by size metadata that describes
 * the compressed and decompressed payload sizes.
 *
 * Detection (from UADE Nick Pelling Packer_v1.asm Check2 routine):
 *   bytes[0..3] == 'COMP' (0x434F4D50)
 *   word at offset 4 == 0
 *   word at offset 6 (size): >= 16, <= 272, 4-byte aligned
 *   decompressed size at buf[6 + size - 10] must not exceed file length
 *
 * Sample extraction (from InitPlayer + InitSamp):
 *   The SMP.set data may be appended after the COMP block. It follows standard
 *   MOD-style sample format:
 *     u16 instrument count at offset 0
 *     then count entries of 30 bytes each:
 *       +0..+21: sample name (22 chars)
 *       +22: u16 sample length in words
 *       +24: u8 flags (bit 7 = delta encoding)
 *       +25: u8 volume (0-64)
 *       +26: u16 loop start in words
 *       +28: u16 loop length in words
 *     PCM data follows immediately after all headers.
 *   30 samples hardcoded (from InitSamp: moveq #30,D4).
 *   16-byte runtime entries in lbL005BEE are filled from 30-byte file entries.
 *
 * File prefix: "NPP."
 * Actual audio playback is delegated to UADE.
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/NickPellingPacker/Nick Pelling Packer_v1.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeMODCell } from '@/engine/uade/encoders/MODEncoder';
import { createSamplerInstrument } from './AmigaUtils';

const MIN_FILE_SIZE = 10;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

export function isNickPellingPackerFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // bytes[0..3] must be ASCII 'COMP'
  if (u32BE(buf, 0) !== 0x434F4D50) return false;

  // word at offset 4 must be zero
  if (u16BE(buf, 4) !== 0) return false;

  // word at offset 6 is the header block size
  const size = u16BE(buf, 6);

  // size must be >= 16, <= 272, and 4-byte aligned
  if (size < 0x10) return false;
  if (size > 0x0110) return false;
  if ((size & 3) !== 0) return false;

  // Need enough bytes to read the decompressed size field
  // decompSize is at buf[6 + size - 10], which is a u32BE requiring 4 bytes
  const decompSizeOff = 6 + size - 10;
  if (buf.length < decompSizeOff + 4) return false;

  const decompSize = u32BE(buf, decompSizeOff);

  // Decompressed size must not exceed the actual file length
  if (decompSize > buf.length) return false;

  return true;
}

/**
 * Try to find and parse MOD-style sample data (SMP.set) appended after the
 * COMP module data.
 *
 * Scans from a start offset for a plausible MOD-style sample header:
 *   u16 count (1-31), then count * 30-byte entries, then PCM data.
 *
 * The 30-byte entry format (from lbC00404E):
 *   +0..+21: sample name (22 ASCII chars, null-terminated)
 *   +22 ($16): u16 sample length in words
 *   +24 ($18): u8 flags (bit 7 = delta encoding), u8 finetune
 *   +25 ($19): u8 volume (0..64)
 *   +26 ($1A): u16 repeat start in words
 *   +28 ($1C): u16 repeat length in words
 */
function extractNPPSamples(buf: Uint8Array, scanFrom: number): InstrumentConfig[] | null {
  // Scan for a plausible sample header start
  for (let off = scanFrom; off + 2 < buf.length; off += 2) {
    const count = u16BE(buf, off);
    if (count === 0 || count > 31) continue;

    const headerStart = off + 2;
    const headerSize = count * 30;
    if (headerStart + headerSize > buf.length) continue;

    // Validate: check that sample lengths are reasonable and volumes are in range
    let totalPCMBytes = 0;
    let valid = true;
    for (let i = 0; i < count; i++) {
      const entryOff = headerStart + i * 30;
      const lenWords = u16BE(buf, entryOff + 22);
      const vol = buf[entryOff + 25];
      if (vol > 64) { valid = false; break; }
      totalPCMBytes += lenWords * 2;
    }
    if (!valid) continue;

    const pcmStart = headerStart + headerSize;
    if (totalPCMBytes === 0) continue;
    if (pcmStart + totalPCMBytes > buf.length) continue;

    // This looks like valid sample data — extract
    const instruments: InstrumentConfig[] = [];
    let pcmOff = pcmStart;
    let validSamples = 0;

    for (let i = 0; i < count; i++) {
      const entryOff = headerStart + i * 30;

      // Read sample name (22 bytes, null-terminated)
      let name = '';
      for (let c = 0; c < 22; c++) {
        const ch = buf[entryOff + c];
        if (ch === 0) break;
        name += String.fromCharCode(ch);
      }
      if (!name) name = `NPP Sample ${i + 1}`;

      const lenWords = u16BE(buf, entryOff + 22);
      const lenBytes = lenWords * 2;
      const flags = buf[entryOff + 24];
      const vol = buf[entryOff + 25];
      const repeatStartWords = u16BE(buf, entryOff + 26);
      const repeatLenWords = u16BE(buf, entryOff + 28);

      if (lenBytes > 0 && pcmOff + lenBytes <= buf.length) {
        // Copy PCM data
        const pcm = new Uint8Array(lenBytes);
        pcm.set(buf.subarray(pcmOff, pcmOff + lenBytes));

        // Apply delta decoding if flag bit 7 is set (from InitSamp bclr #7,$18(A0))
        if (flags & 0x80) {
          for (let k = 1; k < lenBytes; k++) {
            pcm[k] = (pcm[k] + pcm[k - 1]) & 0xFF;
          }
        }

        const loopStart = repeatStartWords * 2;
        const loopLen = repeatLenWords * 2;
        let loopEnd = 0;
        // Loop is valid if repeat length >= 4 bytes (from cmp.w #4,D1 / bcs)
        if (loopLen >= 4 && loopStart + loopLen <= lenBytes) {
          loopEnd = loopStart + loopLen;
        }

        instruments.push(createSamplerInstrument(
          i + 1, name, pcm,
          Math.min(vol, 64),
          8287,
          loopStart,
          loopEnd,
        ));
        validSamples++;
      } else {
        instruments.push({
          id: i + 1, name,
          type: 'synth' as const, synthType: 'Synth' as const,
          effects: [], volume: 0, pan: 0,
        } as InstrumentConfig);
      }

      pcmOff += lenBytes;
    }

    if (validSamples > 0) return instruments;
  }

  return null;
}

export function parseNickPellingPackerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isNickPellingPackerFormat(buf)) throw new Error('Not a Nick Pelling Packer module');

  const baseName = (filename.split('/').pop() ?? filename).split('\\').pop() ?? filename;
  const moduleName = baseName.replace(/^npp\./i, '') || baseName;

  // Try to extract samples from appended SMP.set data after the COMP block.
  // The COMP header size is at offset 6; scan from after the header metadata.
  const compHeaderSize = u16BE(buf, 6);
  const scanFrom = 6 + compHeaderSize;

  let instruments: InstrumentConfig[] = [];
  let samplesExtracted = false;

  const extracted = extractNPPSamples(buf, scanFrom);
  if (extracted) {
    instruments = extracted;
    samplesExtracted = true;
  }

  const sampleInfo = samplesExtracted ? ` (${instruments.length} samples)` : '';

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  const pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
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
      originalChannelCount: 4,
      originalPatternCount: 1,
      originalInstrumentCount: instruments.length,
    },
  };

  return {
    name: `${moduleName}${sampleInfo} [Nick Pelling Packer]`,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'mod',
      patternDataFileOffset: 1084,
      bytesPerCell: 4,
      rowsPerPattern: 64,
      numChannels: 4,
      numPatterns: 1,
      moduleSize: buffer.byteLength,
      encodeCell: encodeMODCell,
    } satisfies UADEPatternLayout,
  };
}
