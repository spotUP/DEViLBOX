/**
 * SoundPlayerParser.ts — Sound Player Amiga music format native parser
 *
 * Sound Player is a Wanted Team Amiga 4-channel music player. Files use
 * a structured header encoding voice counts and pattern repetition values
 * that enable detection without a magic string.
 *
 * Detection (from UADE SoundPlayer_v1.asm Check2 routine):
 *   byte[1] in range 0x0B–0xA0 (number of something, 11–160)
 *   byte[2] is 7 or 15 (voice count)
 *   byte[3] and byte[4] are 0
 *   byte[5] is non-zero (call it b5)
 *   word at offset 6 is 0
 *   byte[8] == b5, byte[9] == 0, byte[10] == 0
 *   byte[11] == b5
 *   word at offset 12 is 0
 *   when byte[2] == 15: byte[14] == b5
 *
 * File prefix: "SJS."
 * Actual audio playback is delegated to UADE.
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/SoundPlayer/SoundPlayer_v1.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeMODCell, decodeMODCell } from '@/engine/uade/encoders/MODEncoder';
import { createSamplerInstrument } from './AmigaUtils';

const MIN_FILE_SIZE = 15;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

/** Read a 4-character ASCII tag at offset. */
function tag4(buf: Uint8Array, off: number): string {
  return String.fromCharCode(buf[off], buf[off + 1], buf[off + 2], buf[off + 3]);
}

/**
 * Scan for IFF FORM chunks in buf starting at `start`, walking every 2 bytes.
 * Mirrors the InstallSamples routine from SoundPlayer_v1.asm.
 */
function scanIffForms(buf: Uint8Array, start: number): Array<{ formOff: number; formSize: number }> {
  const len = buf.length;
  const forms: Array<{ formOff: number; formSize: number }> = [];

  let off = start;
  while (off + 8 <= len) {
    if (off + 4 <= len && tag4(buf, off) === 'FORM') break;
    off += 2;
  }

  while (off + 8 <= len && tag4(buf, off) === 'FORM') {
    const formSize = u32BE(buf, off + 4);
    if (formSize === 0 || formSize > 0x1000000 || off + 8 + formSize > len + 4) break;
    forms.push({ formOff: off, formSize });
    off += 8 + formSize;
    if (off & 1) off++;
    // Cap at 38 samples (MI_MaxSamples in ASM)
    if (forms.length >= 38) break;
  }

  return forms;
}

/**
 * Within an IFF FORM chunk, find the BODY sub-chunk and return its PCM data.
 * Also extracts sample name from NAME chunk and loop info from VHDR.
 */
function extractIffSample(buf: Uint8Array, formOff: number, formSize: number): {
  pcm: Uint8Array; name: string; loopStart: number; loopEnd: number;
} | null {
  const dataStart = formOff + 12; // skip FORM + size + type tag
  const dataEnd = formOff + 8 + formSize;

  let pcm: Uint8Array | null = null;
  let name = '';
  let oneShotHiSamples = 0;
  let repeatHiSamples = 0;

  let pos = dataStart;
  while (pos + 8 <= dataEnd) {
    const chunkTag = tag4(buf, pos);
    const chunkSize = u32BE(buf, pos + 4);
    const chunkData = pos + 8;

    if (chunkTag === 'BODY') {
      const bodyLen = Math.min(chunkSize, dataEnd - chunkData);
      if (bodyLen > 0) pcm = buf.slice(chunkData, chunkData + bodyLen);
    } else if (chunkTag === 'NAME') {
      const nameLen = Math.min(chunkSize, 64, dataEnd - chunkData);
      if (nameLen > 0) {
        name = String.fromCharCode(...Array.from(buf.slice(chunkData, chunkData + nameLen)))
          .replace(/\0/g, '').trim();
      }
    } else if (chunkTag === 'VHDR') {
      if (chunkSize >= 8 && chunkData + 8 <= dataEnd) {
        oneShotHiSamples = u32BE(buf, chunkData);
        repeatHiSamples = u32BE(buf, chunkData + 4);
      }
    }

    let nextPos = chunkData + chunkSize;
    if (nextPos & 1) nextPos++;
    if (nextPos <= pos) break;
    pos = nextPos;
  }

  if (!pcm || pcm.length === 0) return null;

  let loopStart = 0;
  let loopEnd = 0;
  if (repeatHiSamples > 2) {
    loopStart = oneShotHiSamples;
    loopEnd = oneShotHiSamples + repeatHiSamples;
  }

  return { pcm, name, loopStart, loopEnd };
}

export function isSoundPlayerFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // byte[1]: must be in range 11–160 (exclusive of 0x0A, inclusive of 0x0B..0xA0)
  if (buf[1] <= 0x0A || buf[1] > 0xA0) return false;

  // byte[2]: voice count must be 7 or 15
  if (buf[2] !== 7 && buf[2] !== 15) return false;

  // bytes[3] and [4] must be zero
  if (buf[3] !== 0) return false;
  if (buf[4] !== 0) return false;

  // byte[5] must be non-zero — this is the key repetition/pattern value b5
  const b5 = buf[5];
  if (b5 === 0) return false;

  // word at offset 6 must be zero
  if (u16BE(buf, 6) !== 0) return false;

  // byte[8] must equal b5
  if (buf[8] !== b5) return false;

  // bytes[9] and [10] must be zero
  if (buf[9] !== 0) return false;
  if (buf[10] !== 0) return false;

  // byte[11] must equal b5
  if (buf[11] !== b5) return false;

  // word at offset 12 must be zero
  if (u16BE(buf, 12) !== 0) return false;

  // when voice count is 15, byte[14] must also equal b5
  if (buf[2] === 15 && buf[14] !== b5) return false;

  return true;
}

export function parseSoundPlayerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  const _base = filename.split('/').pop()?.toLowerCase() ?? '';
  if (!_base.startsWith('sjs.') && !_base.endsWith('.spl') && !isSoundPlayerFormat(buf)) throw new Error('Not a Sound Player module');

  const baseName = (filename.split('/').pop() ?? filename).split('\\').pop() ?? filename;
  const moduleName = baseName.replace(/^sjs\./i, '') || baseName;

  // ── Extract IFF FORM samples ─────────────────────────────────────────────
  // SoundPlayer stores IFF 8SVX FORM chunks within the file (after the pattern
  // data header). The ASM InstallSamples routine scans for 'FORM' on 2-byte
  // boundaries. We scan from offset 0; the FORM magic won't appear in the
  // short pattern header by coincidence.
  const instruments: InstrumentConfig[] = [];
  const forms = scanIffForms(buf, 0);

  for (let i = 0; i < forms.length; i++) {
    const { formOff, formSize } = forms[i];
    const sample = extractIffSample(buf, formOff, formSize);
    if (sample) {
      const sampleName = sample.name || `SJS Sample ${i + 1}`;
      instruments.push(createSamplerInstrument(
        i + 1, sampleName, sample.pcm, 64, 8287,
        sample.loopStart, sample.loopEnd,
      ));
    } else {
      instruments.push({
        id: i + 1, name: `SJS Sample ${i + 1}`, type: 'synth' as const,
        synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
      } as InstrumentConfig);
    }
  }

  // Fallback placeholder if no samples found
  if (instruments.length === 0) {
    instruments.push({
      id: 1, name: 'Sample 1', type: 'synth' as const,
      synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
    } as InstrumentConfig);
  }

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
      originalInstrumentCount: forms.length,
    },
  };

  return {
    name: `${moduleName} [Sound Player]`,
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
      formatId: 'soundPlayer',
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
