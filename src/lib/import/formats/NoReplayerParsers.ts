/**
 * Formats DEViLBOX recognises and cannot play yet. Each parser throws the
 * reason, so the user reads the format's name and what is missing instead of
 * "Unsupported file format" (2026-10-05 broken-formats sweep, B18). Their
 * registry entries are the place to point a replayer at when one is ported.
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';

const ascii = (bytes: Uint8Array, at: number, text: string): boolean => {
  if (bytes.length < at + text.length) return false;
  for (let i = 0; i < text.length; i++) if (bytes[at + i] !== text.charCodeAt(i)) return false;
  return true;
};

/** StoneTracker (Amiga): 'SPM' magic. */
export function isStoneTrackerFormat(bytes: Uint8Array): boolean { return ascii(bytes, 0, 'SPM'); }
export function parseStoneTrackerFile(_bytes: Uint8Array, filename = ''): TrackerSong {
  throw new Error(`${filename}: StoneTracker (.spm) has no replayer in DEViLBOX yet`);
}
