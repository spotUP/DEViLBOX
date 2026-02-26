/**
 * TronicParser.ts — Tronic / dp / tro Amiga format detector
 *
 * Tronic is an Amiga tracker by Stefan Hartmann (the same author as PumaTracker).
 * It shares structural DNA with PumaTracker but with different file header layout.
 * Files use the extensions .trc, .dp, and .tro; UADE supports all three under
 * the "Tronic" eagleplayer entry (prefixes=dp,trc,tro,tronic).
 *
 * No OpenMPT loader exists for this format. UADE provides authentic Amiga playback
 * via the original 68k player binary from Stefan Hartmann.
 *
 * Because no reliable format specification is publicly available for this format,
 * detection falls back to extension-only (handled by the routing layer).
 * A UADE fallback is always used for playback.
 *
 * Reference: UADE eagleplayer.conf (Tronic entry)
 *            PumaTrackerParser.ts (structural cousin format)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Minimal Tronic format detection. Since no reliable magic bytes or format
 * specification are available, this returns true for any non-empty file.
 * The routing layer already filters by extension (.trc, .dp, .tro).
 */
export function isTronicFormat(buffer: ArrayBuffer): boolean {
  return buffer.byteLength > 0;
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Tronic has no publicly available format specification and no OpenMPT loader.
 * Playback is always delegated to UADE (Tronic eagleplayer).
 */
export async function parseTronicFile(
  _buffer: ArrayBuffer,
  _filename: string,
): Promise<TrackerSong> {
  throw new Error('[TronicParser] Delegating to UADE for Tronic format playback');
}
