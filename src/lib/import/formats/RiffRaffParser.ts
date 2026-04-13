/**
 * RiffRaffParser.ts — Riff Raff Amiga music format
 *
 * Wanted Team standardized header with magic 'RIFFRAFF'.
 *
 * Header layout (from Standard.header):
 *   +0: security stub (0x70FF4E75)
 *   +4: 'RIFFRAFF' (8 bytes)
 *   +12: dc.l Play, InitSong, subsong_count, Audio,
 *         ModuleName, AuthorName, SpecialInfo,
 *         SampleInfo, EndSampleInfo,
 *         file_size, module_size, sample_size, songdata_size, private
 *
 * UADE eagleplayer.conf: RiffRaff  prefixes=riff
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';
import { findHunkCodeSection, matchWTMagic, readString, u32BE, scanForMagic } from './WantedTeamUtils';

const MAGIC = 'RIFFRAFF';

export function isRiffRaffFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 80) return false;
  const code = findHunkCodeSection(buf);
  if (code && matchWTMagic(buf, code.offset, MAGIC)) return true;
  return scanForMagic(buf, MAGIC) >= 0;
}

export function parseRiffRaffFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  let codeStart = 0;
  let codeSize = buf.length;
  const code = findHunkCodeSection(buf);
  if (code) { codeStart = code.offset; codeSize = code.size; }

  if (!matchWTMagic(buf, codeStart, MAGIC)) {
    const off = scanForMagic(buf, MAGIC);
    if (off < 0) throw new Error('Not a Riff Raff module');
    codeStart = off;
  }

  // Header: stub(4) + magic(8) + pointer table
  const hdr = codeStart + 12;
  // Play(+0), InitSong(+4), subsongs(+8), Audio(+12) — skip
  const moduleNamePtr   = u32BE(buf, hdr + 16);
  const authorNamePtr   = u32BE(buf, hdr + 20);
  // SpecialInfo(+24) — skip
  const sampleInfoPtr   = u32BE(buf, hdr + 28);
  const endSampleInfoPtr = u32BE(buf, hdr + 32);
  // fileSize(+36), moduleSize(+40) — skip
  const sampleSize      = u32BE(buf, hdr + 44);

  const moduleName = readString(buf, codeStart, moduleNamePtr) ||
    (filename.split('/').pop() ?? filename).replace(/^riff\./i, '');
  const authorName = readString(buf, codeStart, authorNamePtr);

  const instruments: InstrumentConfig[] = [];

  // Extract samples from SampleInfo
  if (sampleInfoPtr > 0 && endSampleInfoPtr > sampleInfoPtr) {
    const siStart = codeStart + sampleInfoPtr;
    const siEnd = codeStart + endSampleInfoPtr;
    const siSize = siEnd - siStart;
    const entrySize = siSize >= 12 && siSize % 12 === 0 ? 12 : 8;
    const numSamples = Math.min(Math.floor(siSize / entrySize), 32);
    const sampleDataStart = codeStart + codeSize - sampleSize;

    for (let i = 0; i < numSamples; i++) {
      const entryOff = siStart + i * entrySize;
      if (entryOff + entrySize > buf.length) break;
      const smpOffset = u32BE(buf, entryOff);
      const smpLength = u32BE(buf, entryOff + 4);

      if (smpLength > 0 && smpLength < 0x100000) {
        let pcmOff = sampleDataStart + smpOffset;
        if (pcmOff + smpLength > buf.length) pcmOff = codeStart + smpOffset;
        if (pcmOff >= 0 && pcmOff + smpLength <= buf.length) {
          instruments.push(createSamplerInstrument(i + 1, `Riff ${i + 1}`, buf.slice(pcmOff, pcmOff + smpLength), 64, 8287, 0, 0));
          continue;
        }
      }
      instruments.push({ id: i + 1, name: `Riff ${i + 1}`, type: 'synth' as const, synthType: 'Synth' as const, effects: [], volume: 0, pan: 0 } as InstrumentConfig);
    }
  }

  if (instruments.length === 0 && sampleSize > 0) {
    const sampleDataStart = codeStart + codeSize - sampleSize;
    if (sampleDataStart >= 0 && sampleDataStart + sampleSize <= buf.length) {
      instruments.push(createSamplerInstrument(1, 'Riff Sample', buf.slice(sampleDataStart, sampleDataStart + sampleSize), 64, 8287, 0, 0));
    }
  }

  if (instruments.length === 0) {
    instruments.push({ id: 1, name: 'Riff Sample', type: 'synth' as const, synthType: 'Synth' as const, effects: [], volume: 0, pan: 0 } as InstrumentConfig);
  }

  const displayName = authorName ? `${moduleName} — ${authorName} [RiffRaff]` : `${moduleName} [RiffRaff]`;

  return {
    name: displayName,
    format: 'MOD' as TrackerFormat,
    patterns: [{ id: 'pattern-0', name: 'Pattern 0', length: 64, channels: Array.from({ length: 4 }, (_, ch) => ({ id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false, solo: false, collapsed: false, volume: 100, pan: ch === 0 || ch === 3 ? -50 : 50, instrumentId: null, color: null, rows: Array.from({ length: 64 }, () => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 })) })) }],
    instruments, songPositions: [0], songLength: 1, restartPosition: 0,
    numChannels: 4, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer, uadeEditableFileName: filename,
  };
}
