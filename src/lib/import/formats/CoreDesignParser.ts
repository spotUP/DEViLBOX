/**
 * CoreDesignParser.ts — Core Design Amiga music format native parser
 *
 * Core Design is a proprietary 4-channel Amiga music format used in games
 * developed by Core Design (e.g. Chuck Rock, Jaguar XJ220, Heimdall). The
 * module is a compiled 68k executable combining player code and music data
 * into a single self-contained file.
 *
 * Detection (from UADE Core Design.asm Check3 routine, big-endian reads):
 *   u32BE(buf, 0)  === 0x000003F3   (68k HUNK_HEADER magic)
 *   buf[20] !== 0                   (non-zero byte at offset 20)
 *   u32BE(buf, 32) === 0x70FF4E75   (68k MOVEQ #-1,D0 + RTS opcodes)
 *   u32BE(buf, 36) === 0x532E5048   (ASCII 'S.PH')
 *   u32BE(buf, 40) === 0x49505053   (ASCII 'IPPS')
 *   u32BE(buf, 44) !== 0            (Interrupt pointer)
 *   u32BE(buf, 48) !== 0            (Audio Interrupt pointer)
 *   u32BE(buf, 52) !== 0            (InitSong pointer)
 *   u32BE(buf, 56) !== 0            (EndSong pointer)
 *   u32BE(buf, 60) !== 0            (Subsongs pointer)
 *
 * File prefix: "CORE." (e.g. "CORE.songname")
 * Single-file format: music data binary.
 * Actual audio playback is delegated to UADE.
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/CoreDesign/...
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

const MIN_FILE_SIZE = 64;

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

export function isCoreDesignFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // 68k HUNK_HEADER magic
  if (u32BE(buf, 0) !== 0x000003F3) return false;

  // Byte at offset 20 must be non-zero
  if (buf[20] === 0) return false;

  // 68k MOVEQ #-1,D0 + RTS opcode pair
  if (u32BE(buf, 32) !== 0x70FF4E75) return false;

  // ASCII 'S.PH'
  if (u32BE(buf, 36) !== 0x532E5048) return false;

  // ASCII 'IPPS'
  if (u32BE(buf, 40) !== 0x49505053) return false;

  // Interrupt pointer
  if (u32BE(buf, 44) === 0) return false;

  // Audio Interrupt pointer
  if (u32BE(buf, 48) === 0) return false;

  // InitSong pointer
  if (u32BE(buf, 52) === 0) return false;

  // EndSong pointer
  if (u32BE(buf, 56) === 0) return false;

  // Subsongs pointer
  if (u32BE(buf, 60) === 0) return false;

  return true;
}

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

/**
 * Read a null-terminated ASCII string from buf starting at off, up to maxLen bytes.
 */
function readCString(buf: Uint8Array, off: number, maxLen: number): string {
  let s = '';
  for (let i = 0; i < maxLen && off + i < buf.length; i++) {
    const ch = buf[off + i];
    if (ch === 0) break;
    if (ch >= 0x20 && ch < 0x7f) s += String.fromCharCode(ch);
  }
  return s;
}

export function parseCoreDesignFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isCoreDesignFormat(buf)) throw new Error('Not a Core Design module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^core\./i, '') || baseName;

  // ── Extract pointers from the module header ─────────────────────────────
  //
  // The HUNK-format module header has known pointer slots after the signature:
  //   +44: Interrupt pointer
  //   +48: AudioInterrupt pointer
  //   +52: InitSong pointer
  //   +56: EndSong pointer
  //   +60: Subsongs pointer
  //   +64: SampleInfoPtr (if present)
  //   +68: EndSampleInfoPtr (if present)
  //
  // Sample info entries are 14 bytes each:
  //   u16 offsetHi, u32 offsetLo (6 bytes offset), u8 type, u8 flags,
  //   u16 reserved, u16 lengthWords, u16 volume

  // ── Sample extraction ──────────────────────────────────────────────────

  const instruments: InstrumentConfig[] = [];
  let sampleCount = 0;
  let songName = '';
  let authorName = '';

  try {
    // Scan for sample-like 14-byte entries in the region after the header.
    // A valid sample entry has: non-zero length (u16 at +10), volume 0-64 (u16 at +12)
    const SAMPLE_ENTRY_SIZE = 14;
    const scanStart = 64;
    const scanEnd = Math.min(buf.length, 2048);

    // Try to find a contiguous run of valid 14-byte sample entries
    for (let base = scanStart; base < scanEnd; base += 2) {
      const candidates: Array<{ length: number; volume: number }> = [];
      let off = base;

      for (let i = 0; i < 64 && off + SAMPLE_ENTRY_SIZE <= buf.length; i++) {
        const lenWords = u16BE(buf, off + 10);
        const vol = u16BE(buf, off + 12);
        if (lenWords === 0 || lenWords > 0x8000) break;
        if (vol > 64) break;
        candidates.push({ length: lenWords * 2, volume: vol });
        off += SAMPLE_ENTRY_SIZE;
      }

      if (candidates.length >= 2) {
        for (let i = 0; i < candidates.length; i++) {
          instruments.push({
            id: i + 1,
            name: `Sample ${i + 1} (${candidates[i].length} bytes)`,
            type: 'synth' as const,
            synthType: 'Synth' as const,
            effects: [],
            volume: 0,
            pan: 0,
          } as InstrumentConfig);
        }
        sampleCount = candidates.length;
        break;
      }
    }

    // Try extracting ASCII strings from the region around offset 64-200
    // for song/author names (some Core Design modules embed these)
    for (let off = 64; off < Math.min(buf.length - 32, 512); off++) {
      const test = readCString(buf, off, 32);
      if (test.length >= 4 && !songName) {
        // Heuristic: first printable string of 4+ chars could be the title
        songName = test;
      } else if (test.length >= 4 && songName && !authorName && test !== songName) {
        authorName = test;
        break;
      }
    }
  } catch {
    // Binary scan failed — fall back to defaults
  }

  // Fallback: single placeholder instrument
  if (instruments.length === 0) {
    instruments.push({
      id: 1, name: 'Sample 1', type: 'synth' as const,
      synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
    } as InstrumentConfig);
    sampleCount = 1;
  }

  // ── Empty pattern (placeholder — UADE handles actual audio) ───────────

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
    },
  };

  // ── Display name ─────────────────────────────────────────────────────

  let displayName = songName || moduleName;
  if (authorName) displayName += ` by ${authorName}`;
  displayName += ' [Core Design]';

  return {
    name: displayName,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments,
    songPositions: [0], songLength: 1, restartPosition: 0,
    numChannels: 4, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  };
}
