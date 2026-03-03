/**
 * GoatTracker SNG format detection.
 *
 * GoatTracker .sng files have a 4-byte magic header:
 *   "GTS!" (v1), "GTS2" (v2), "GTS3" (v3), "GTS4" (v4), "GTS5" (v5)
 *
 * GTI files (instruments) have: "GTI!", "GTI2", "GTI3", "GTI4", "GTI5"
 */

const GT_SONG_MAGICS = ['GTS!', 'GTS2', 'GTS3', 'GTS4', 'GTS5'];
const GT_INSTR_MAGICS = ['GTI!', 'GTI2', 'GTI3', 'GTI4', 'GTI5'];

/**
 * Detect if a buffer is a GoatTracker song (.sng) file.
 */
export function isGoatTrackerSong(data: Uint8Array | ArrayBuffer): boolean {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  if (bytes.length < 4) return false;
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  return GT_SONG_MAGICS.includes(magic);
}

/**
 * Detect if a buffer is a GoatTracker instrument (.gti) file.
 */
export function isGoatTrackerInstrument(data: Uint8Array | ArrayBuffer): boolean {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  if (bytes.length < 4) return false;
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  return GT_INSTR_MAGICS.includes(magic);
}

/**
 * Get the GoatTracker format version from a buffer.
 * Returns null if not a GoatTracker file.
 */
export function getGoatTrackerVersion(data: Uint8Array | ArrayBuffer): number | null {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  if (bytes.length < 4) return null;
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);

  if (magic === 'GTS!' || magic === 'GTI!') return 1;
  if (magic === 'GTS2' || magic === 'GTI2') return 2;
  if (magic === 'GTS3' || magic === 'GTI3') return 3;
  if (magic === 'GTS4' || magic === 'GTI4') return 4;
  if (magic === 'GTS5' || magic === 'GTI5') return 5;
  return null;
}
