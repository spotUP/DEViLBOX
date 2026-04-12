/**
 * KrisHatlelidParser.ts — Kris Hatlelid Amiga music format
 *
 * UADE prefix: KH.*
 *
 * Detection based on Kris Hatlelid_v1.asm (line 51):
 * - Multiple fixed-offset big-endian word/longword checks
 * - Supports single-file and two-file variants distinguished at offset 44
 */
import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

const MIN_FILE_SIZE = 68;

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

/** Read a 4-character ASCII tag at offset. */
function tag4(buf: Uint8Array, off: number): string {
  return String.fromCharCode(buf[off], buf[off + 1], buf[off + 2], buf[off + 3]);
}

/**
 * Scan for IFF FORM chunks in buf starting at `start`, walking every 2 bytes.
 * Returns an array of { formOff, formSize } for each FORM found.
 *
 * Mirrors the FindSamp / FindNext pattern from Kris Hatlelid_v1.asm:
 *   scan for 'FORM' on 2-byte boundaries, then skip over the FORM chunk.
 */
function scanIffForms(buf: Uint8Array, start: number): Array<{ formOff: number; formSize: number }> {
  const len = buf.length;
  const forms: Array<{ formOff: number; formSize: number }> = [];

  // First: scan forward from start to find the first FORM (step 2)
  let off = start;
  while (off + 8 <= len) {
    if (tag4(buf, off) === 'FORM') break;
    off += 2;
  }

  // Walk consecutive FORM chunks
  while (off + 8 <= len && tag4(buf, off) === 'FORM') {
    const formSize = u32BE(buf, off + 4);
    if (formSize === 0 || formSize > 0x1000000 || off + 8 + formSize > len + 4) break;
    forms.push({ formOff: off, formSize });
    // Advance past this FORM: skip 'FORM' (4) + size (4) + data (formSize)
    off += 8 + formSize;
    // Align to even boundary if needed
    if (off & 1) off++;
  }

  return forms;
}

/**
 * Within an IFF FORM chunk, find the BODY sub-chunk and return its PCM data.
 * Also extracts the sample name from NAME chunk and loop info from VHDR if present.
 */
function extractIffSample(buf: Uint8Array, formOff: number, formSize: number): {
  pcm: Uint8Array; name: string; loopStart: number; loopEnd: number;
} | null {
  // FORM header: 'FORM' (4) + size (4) + type (4, e.g. '8SVX')
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
      if (bodyLen > 0) {
        pcm = buf.slice(chunkData, chunkData + bodyLen);
      }
    } else if (chunkTag === 'NAME') {
      const nameLen = Math.min(chunkSize, 64, dataEnd - chunkData);
      if (nameLen > 0) {
        const nameBytes = buf.slice(chunkData, chunkData + nameLen);
        name = String.fromCharCode(...Array.from(nameBytes)).replace(/\0/g, '').trim();
      }
    } else if (chunkTag === 'VHDR') {
      // Voice8Header: oneShotHiSamples (4), repeatHiSamples (4), ...
      if (chunkSize >= 8 && chunkData + 8 <= dataEnd) {
        oneShotHiSamples = u32BE(buf, chunkData);
        repeatHiSamples = u32BE(buf, chunkData + 4);
      }
    }

    // Advance to next chunk (align to even)
    let nextPos = chunkData + chunkSize;
    if (nextPos & 1) nextPos++;
    if (nextPos <= pos) break; // safety
    pos = nextPos;
  }

  if (!pcm || pcm.length === 0) return null;

  // Loop info from VHDR: if repeatHiSamples > 2, loop spans [oneShotHiSamples, oneShotHiSamples + repeatHiSamples]
  let loopStart = 0;
  let loopEnd = 0;
  if (repeatHiSamples > 2) {
    loopStart = oneShotHiSamples;
    loopEnd = oneShotHiSamples + repeatHiSamples;
  }

  return { pcm, name, loopStart, loopEnd };
}

export function isKrisHatlelidFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // Fixed-offset longword checks
  if (u32BE(buf, 0) !== 0x000003F3) return false;
  if (u32BE(buf, 4) !== 0x00000000) return false;
  if (u32BE(buf, 8) !== 0x00000003) return false;
  if (u32BE(buf, 12) !== 0x00000000) return false;
  if (u32BE(buf, 16) !== 0x00000002) return false;

  // Read D1, clear bit 30 (bclr #30,D1)
  const d1 = u32BE(buf, 20) & ~0x40000000;

  // Single byte check at offset 24
  if (buf[24] !== 0x40) return false;

  if (u32BE(buf, 28) !== 0x00000001) return false;
  if (u32BE(buf, 32) !== 0x000003E9) return false;

  // D1 cross-check at offset 36
  if (u32BE(buf, 36) !== d1) return false;

  if (u32BE(buf, 40) !== 0x60000016) return false;

  // At this point in the ASM, A0=44 after the post-increment read of offset 40.
  // The next check reads (A0)+ which is offset 44, leaving A0=48.
  // All subsequent indexed checks use 16(A0)=offset 64 and 20(A0)=offset 68.
  if (u32BE(buf, 44) !== 0x0000ABCD) return false;

  // After (A0)+ for the ABCD check, A0=48.
  // Two-file: cmp.l #$B07C0000, 16(A0) → buf[64]
  if (u32BE(buf, 64) === 0xB07C0000) return true;

  // Dwa: cmp.l #$41F90000,16(A0); cmp.l #$00004E75,20(A0)
  // 16(A0)=offset 64, 20(A0)=offset 68
  return u32BE(buf, 64) === 0x41F90000 && u32BE(buf, 68) === 0x00004E75;
}

export function parseKrisHatlelidFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  const _base = filename.split('/').pop()?.toLowerCase() ?? '';
  if (!_base.startsWith('kh.') && !_base.endsWith('.kh') && !isKrisHatlelidFormat(buf)) throw new Error('Not a Kris Hatlelid module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^KH\./i, '') || baseName;

  // ── Extract IFF FORM samples ─────────────────────────────────────────────
  // KrisHatlelid stores IFF 8SVX FORM chunks within the file.
  // The ASM InitPlayer scans from the start of the file data for 'FORM' on
  // 2-byte boundaries, then walks consecutive FORMs.
  const instruments: InstrumentConfig[] = [];
  const forms = scanIffForms(buf, 0);

  for (let i = 0; i < forms.length; i++) {
    const { formOff, formSize } = forms[i];
    const sample = extractIffSample(buf, formOff, formSize);
    if (sample) {
      const sampleName = sample.name || `KH Sample ${i + 1}`;
      instruments.push(createSamplerInstrument(
        i + 1, sampleName, sample.pcm, 64, 8287,
        sample.loopStart, sample.loopEnd,
      ));
    } else {
      instruments.push({
        id: i + 1, name: `KH Sample ${i + 1}`, type: 'synth' as const,
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
      originalInstrumentCount: forms.length,
    },
  };

  return {
    name: `${moduleName} [Kris Hatlelid]`,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments,
    songPositions: [0], songLength: 1, restartPosition: 0,
    numChannels: 4, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  };
}
