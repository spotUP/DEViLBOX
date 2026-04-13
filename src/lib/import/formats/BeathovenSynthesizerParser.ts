/**
 * BeathovenSynthesizerParser.ts — Beathoven Synthesizer Amiga music format
 *
 * Created by Thomas Lopatic (Dr.Nobody/HQC) in 1987. Used in Rainbow Arts &
 * Tristar products 1987-88. "Very similar to EaglePlayer's Dave Lowe format."
 *
 * Modules are AmigaOS HUNK executables with a Wanted Team standardized header:
 *   [4B security stub: 0x70FF4E75]
 *   [Magic: 'BEATHOVEN100' | 'BEATHOVEN109' | 'BEATHOVENNEW']
 *   [Pointer table: Play, InitSong, subsong count, EndSound, InitPlayer,
 *    ModuleName, AuthorName, SpecialInfo, SampleInfo, EndSampleInfo,
 *    file_size, module_size, sample_size, songdata_size, timer/samples_ptr]
 *
 * UADE eagleplayer.conf: BeathovenSynthesizer  prefixes=bss
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';
import { findHunkCodeSection, matchWTMagic, readString, u32BE, scanForMagic } from './WantedTeamUtils';

const MAGICS = ['BEATHOVEN109', 'BEATHOVEN100', 'BEATHOVENNEW'];

export function isBeathovenSynthesizerFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 100) return false;

  // Try HUNK format first
  const code = findHunkCodeSection(buf);
  if (code) {
    for (const magic of MAGICS) {
      if (matchWTMagic(buf, code.offset, magic)) return true;
    }
  }
  // Fallback: scan raw file for magic
  for (const magic of MAGICS) {
    if (scanForMagic(buf, magic) >= 0) return true;
  }
  return false;
}

export function parseBeathovenSynthesizerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  // Find the code section and magic
  let codeStart = 0;
  let codeSize = buf.length;
  let detectedMagic = '';

  const code = findHunkCodeSection(buf);
  if (code) {
    codeStart = code.offset;
    codeSize = code.size;
  }

  for (const magic of MAGICS) {
    if (matchWTMagic(buf, codeStart, magic)) {
      detectedMagic = magic;
      break;
    }
  }
  if (!detectedMagic) {
    // Fallback: scan
    for (const magic of MAGICS) {
      const off = scanForMagic(buf, magic);
      if (off >= 0) { codeStart = off; detectedMagic = magic; break; }
    }
  }
  if (!detectedMagic) throw new Error('Not a Beathoven Synthesizer module');

  // Header pointer table starts after security stub (4B) + magic (12B)
  const hdrStart = codeStart + 4 + detectedMagic.length;

  // Read header fields (longwords)
  // Play(+0), InitSong(+4), subsongs(+8), EndSound(+12), InitPlayer(+16) — skip
  const moduleNamePtr  = u32BE(buf, hdrStart + 20);
  const authorNamePtr  = u32BE(buf, hdrStart + 24);
  // SpecialInfo(+28) — skip
  const sampleInfoPtr  = u32BE(buf, hdrStart + 32);
  const endSampleInfoPtr = u32BE(buf, hdrStart + 36);
  // fileSize(+40), moduleSize(+44) — skip
  const sampleSize     = u32BE(buf, hdrStart + 48);
  // songdataSize(+52) — skip

  // Extract strings
  const moduleName = readString(buf, codeStart, moduleNamePtr) ||
    (filename.split('/').pop() ?? filename).replace(/^bss\./i, '');
  const authorName = readString(buf, codeStart, authorNamePtr);

  // Extract sample info: each entry is typically 8 bytes (offset u32 + length u16 + loop info)
  const instruments: InstrumentConfig[] = [];

  if (sampleInfoPtr > 0 && endSampleInfoPtr > sampleInfoPtr) {
    const siStart = codeStart + sampleInfoPtr;
    const siEnd = codeStart + endSampleInfoPtr;
    const siSize = siEnd - siStart;

    // SampleInfo entries vary by format version. Try 8-byte and 12-byte entries.
    const entrySize = siSize >= 12 && siSize % 12 === 0 ? 12 : 8;
    const numSamples = Math.min(Math.floor(siSize / entrySize), 32);

    // PCM sample data is at the end of the code section
    const sampleDataStart = codeStart + codeSize - sampleSize;

    for (let i = 0; i < numSamples; i++) {
      const entryOff = siStart + i * entrySize;
      if (entryOff + entrySize > buf.length) break;

      const smpOffset = u32BE(buf, entryOff);
      const smpLength = entrySize >= 8 ? u32BE(buf, entryOff + 4) : 0;

      if (smpLength > 0 && smpLength < 0x100000) {
        // Try to locate the sample: either relative to sampleDataStart or as file offset
        let pcmOff = sampleDataStart + smpOffset;
        if (pcmOff + smpLength > buf.length) pcmOff = codeStart + smpOffset;
        if (pcmOff >= 0 && pcmOff + smpLength <= buf.length) {
          const pcm = buf.slice(pcmOff, pcmOff + smpLength);
          instruments.push(createSamplerInstrument(
            i + 1, `BSS ${i + 1}`, pcm, 64, 8287, 0, 0,
          ));
          continue;
        }
      }
      instruments.push({
        id: i + 1, name: `BSS ${i + 1}`,
        type: 'synth' as const, synthType: 'Synth' as const,
        effects: [], volume: 0, pan: 0,
      } as InstrumentConfig);
    }
  }

  // Fallback: extract raw PCM from sample area if SampleInfo failed
  if (instruments.length === 0 && sampleSize > 0) {
    const sampleDataStart = codeStart + codeSize - sampleSize;
    if (sampleDataStart >= 0 && sampleDataStart + sampleSize <= buf.length) {
      const pcm = buf.slice(sampleDataStart, sampleDataStart + sampleSize);
      instruments.push(createSamplerInstrument(1, 'BSS Sample', pcm, 64, 8287, 0, 0));
    }
  }

  if (instruments.length === 0) {
    instruments.push({
      id: 1, name: 'BSS Sample',
      type: 'synth' as const, synthType: 'Synth' as const,
      effects: [], volume: 0, pan: 0,
    } as InstrumentConfig);
  }

  const displayName = authorName
    ? `${moduleName} — ${authorName} [Beathoven]`
    : `${moduleName} [Beathoven]`;

  return {
    name: displayName,
    format: 'MOD' as TrackerFormat,
    patterns: [{
      id: 'pattern-0', name: 'Pattern 0', length: 64,
      channels: Array.from({ length: 4 }, (_, ch) => ({
        id: `channel-${ch}`, name: `Channel ${ch + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100, pan: ch === 0 || ch === 3 ? -50 : 50,
        instrumentId: null, color: null,
        rows: Array.from({ length: 64 }, () => ({
          note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        })),
      })),
    }],
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
  };
}
