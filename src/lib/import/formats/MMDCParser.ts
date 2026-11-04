/**
 * MMDCParser.ts — MMDC (MED Packer) Amiga music format native parser
 *
 * MMDC is an Amiga music packer format created by Antony "Ratt" Crowther.
 * It is also known as "MED Packer" and uses a 4-char magic identifier.
 *
 * Detection (from UADE MMDC_v3.asm, DTP_Check2 routine):
 *   1. bytes[0..3] == 'MMDC' (0x4D4D4443)
 *   2. u16BE(16) == 0 (reserved word must be zero)
 *   3. u16BE(18) != 0, positive (signed), even (bit 0 == 0)
 *   4. u16BE(u16BE(18)) == 0 (word at the offset stored in bytes[18..19] must be zero)
 *
 * The file is an OctaMED MMD0 module whose blocks are run-length packed (mmdcCodec.ts). The import unpacks it to an
 * MMD0 image and lets MEDParser decode the cells, so the grid shows the real notes. Playback stays with UADE on the
 * original bytes; the layout (id 'mmdc') addresses the unpacked image and MEDExporter.patchMmdcModule repacks.
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/MMDC/src/MMDC_v3.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import { parseMEDFile } from './MEDParser';
import { unpackMmdc } from './mmdcCodec';

// ── Constants ─────────────────────────────────────────────────────────────

/** Minimum file size to hold the MMDC header (at least 20 bytes). */
const MIN_FILE_SIZE = 20;

// ── Binary helpers ─────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is an MMDC (MED Packer) module.
 *
 * Detection mirrors DTP_Check2 from MMDC_v3.asm.
 */
export function isMMDCFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // bytes[0..3] == 'MMDC' (0x4D4D4443)
  if (
    buf[0] !== 0x4d ||
    buf[1] !== 0x4d ||
    buf[2] !== 0x44 ||
    buf[3] !== 0x43
  )
    return false;

  // u16BE(16) == 0
  if (u16BE(buf, 16) !== 0) return false;

  // u16BE(18): non-zero, positive (bit 15 clear), even (bit 0 clear)
  const offset = u16BE(buf, 18);
  if (offset === 0) return false;
  if (offset & 0x8000) return false; // sign bit set → negative
  if (offset & 0x0001) return false; // odd

  // word at that offset must be zero
  if (offset + 1 >= buf.length) return false;
  if (u16BE(buf, offset) !== 0) return false;

  return true;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse an MMDC module file into a TrackerSong with its real pattern grid.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export function parseMMDCFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isMMDCFormat(buf)) throw new Error('Not an MMDC module');

  const unpacked = unpackMmdc(buf);
  const med = parseMEDFile(unpacked.buffer.slice(unpacked.byteOffset, unpacked.byteOffset + unpacked.byteLength) as ArrayBuffer, filename);

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^mmdc\./i, '').replace(/\.mmdc$/i, '') || baseName;
  const nameSuffix = med.patterns.length > 0 ? ` (${med.patterns.length} patt)` : '';

  const { libopenmptFileData: _unused, ...rest } = med;
  void _unused;
  return {
    ...rest,
    name: `${moduleName} [MMDC]${nameSuffix}`,
    format: 'MOD' as TrackerFormat,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    uadePatternLayout: { ...med.uadePatternLayout!, formatId: 'mmdc', moduleSize: buffer.byteLength },
  };
}
