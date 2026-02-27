/**
 * ChipTrackerParser — detection for ChipTracker (Erik Oosterom, DOS).
 *
 * Magic: 'KRIS' (0x4B525349) at byte offset 952.
 * File size must be strictly > 2240 bytes.
 *
 * ChipTracker files are fully handled by libopenmpt; this module provides
 * format detection only. No native full-parse is implemented.
 */

export function isChipTrackerFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length <= 2240) return false;
  return (
    bytes[952] === 0x4B && // 'K'
    bytes[953] === 0x52 && // 'R'
    bytes[954] === 0x49 && // 'I'
    bytes[955] === 0x53    // 'S'
  );
}
