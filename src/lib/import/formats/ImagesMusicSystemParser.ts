/**
 * ImagesMusicSystemParser.ts — Images Music System Amiga format native parser
 *
 * Images Music System (IMS) is an Amiga music format identified by a
 * specific structural signature based on offset arithmetic in the header.
 *
 * Detection (from UADE Images Music System_v3.asm, DTP_Check2 routine):
 *   1. File size >= 1852 bytes
 *   2. u32BE(1080) = D1: must be >= 1084 (i.e., positive and large enough)
 *   3. (D1 - 1084) % 768 == 0 — pattern data size divisible by 768 bytes/pattern
 *   4. buf[950] < 0x80 — song length byte must not have bit 7 set
 *   5. buf.length >= D1 + 4 — file must extend to pattern data
 *
 * File prefix: IMS. (e.g. IMS.SomeSong)
 *
 * Single-file format. Actual audio playback is delegated to UADE.
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/ImagesMusicSystem/src/Images Music System_v3.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function readAmigaStr(buf: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len && off + i < buf.length; i++) {
    const c = buf[off + i];
    if (c === 0) break;
    if (c >= 0x20 && c <= 0x7e) s += String.fromCharCode(c);
  }
  return s.trim();
}

// ── Constants ─────────────────────────────────────────────────────────────

/** Minimum file size to contain the structural header. */
const MIN_FILE_SIZE = 1852;

/** Maximum samples supported by IMS. */
const MAX_SAMPLES = 31;

/** Maximum patterns supported by IMS. */
const MAX_PATTERNS = 64;

// ── Binary helpers ─────────────────────────────────────────────────────────

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is an Images Music System module.
 *
 * Detection mirrors DTP_Check2 from Images Music System_v3.asm.
 */
export function isImagesMusicSystemFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  const d1 = u32BE(buf, 1080);

  // D1 must be >= 1084 for the subtraction to be non-negative
  if (d1 < 1084) return false;

  // Pattern data size must divide evenly by 768 bytes per pattern
  if ((d1 - 1084) % 768 !== 0) return false;

  // Song length byte at offset 950 must have bit 7 clear (< 0x80)
  if (buf[950] >= 0x80) return false;

  // File must extend to contain the pattern data
  if (buf.length < d1 + 4) return false;

  return true;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse an Images Music System module file into a TrackerSong.
 *
 * Extracts pattern count from the binary header.
 * Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export function parseImagesMusicSystemFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isImagesMusicSystemFormat(buf)) {
    throw new Error('Not an Images Music System module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "IMS." prefix (case-insensitive) or ".ims" extension
  const moduleName =
    baseName.replace(/^ims\./i, '').replace(/\.ims$/i, '') || baseName;

  // ── Pattern count from header ─────────────────────────────────────────────

  const d1 = u32BE(buf, 1080);
  const patternCount = Math.min((d1 - 1084) / 768, MAX_PATTERNS);

  // ── Sample extraction from ProTracker-style header ──────────────────────
  // 31 sample descriptors at offset 20, 30 bytes each:
  //   +0: 22-byte name, +22: u16 length (words), +24: finetune, +25: volume,
  //   +26: u16 loop start (words), +28: u16 loop length (words)
  // IMS uses 768 bytes per pattern (3 bytes/cell × 4ch × 64 rows)
  const pcmStart = 1084 + patternCount * 768;

  const instruments: InstrumentConfig[] = [];
  let pcmPos = pcmStart;
  let smpCount = 0;

  for (let i = 0; i < MAX_SAMPLES; i++) {
    const descOff = 20 + i * 30;
    const name = readAmigaStr(buf, descOff, 22) || `IMS Sample ${i + 1}`;
    const lenWords = u16BE(buf, descOff + 22);
    const lenBytes = lenWords * 2;
    const loopStart = u16BE(buf, descOff + 26) * 2;
    const loopLen = u16BE(buf, descOff + 28) * 2;

    if (lenBytes > 0 && pcmPos + lenBytes <= buf.length) {
      const pcm = buf.slice(pcmPos, pcmPos + lenBytes);
      const loopEnd = loopLen > 2 ? loopStart + loopLen : 0;
      instruments.push(createSamplerInstrument(
        i + 1, name, pcm, 64, 8287, loopLen > 2 ? loopStart : 0, loopEnd,
      ));
      smpCount++;
    } else {
      instruments.push({
        id: i + 1, name, type: 'synth' as const, synthType: 'Synth' as const,
        effects: [], volume: 0, pan: 0,
      } as InstrumentConfig);
    }
    pcmPos += lenBytes;
  }

  // ── Empty pattern (placeholder — UADE handles actual audio) ──────────────

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0,
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
      originalPatternCount: patternCount || 1,
      originalInstrumentCount: 0,
    },
  };

  const nameSuffix = `(${patternCount} patt, ${smpCount} smp)`;

  return {
    name: `${moduleName} [IMS] ${nameSuffix}`,
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
  };
}
