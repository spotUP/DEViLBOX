/**
 * Serato Crate Parser
 *
 * Parses .crate files from ~/Music/_Serato_/Subcrates/.
 *
 * Crate file structure:
 *   - Header: "vrsn" TLV (version info, UTF-16 BE)
 *   - Track entries: sequence of "otrk" TLVs
 *     - Each "otrk" contains a "ptrk" child with the file path (UTF-16 BE)
 *
 * Crate names come from the filename (e.g. "My Crate.crate" → "My Crate").
 * Subcrates use %% as a folder separator (e.g. "Genre%%House.crate" → "Genre/House").
 */

import {
  parseTLVStream,
  parseNestedTLV,
  decodeUTF16BE,
} from './seratoParser';

// ============================================================================
// TYPES
// ============================================================================

export interface SeratoCrate {
  name: string;            // display name (from filename, subcrate path decoded)
  fileName: string;        // original .crate filename
  tracks: string[];        // file paths of tracks in this crate
}

// ============================================================================
// PARSER
// ============================================================================

/**
 * Parse a single .crate file into a SeratoCrate.
 *
 * @param buffer - The raw .crate file contents
 * @param crateFileName - The .crate filename (e.g. "My Crate.crate")
 */
export function parseSeratoCrate(buffer: ArrayBuffer, crateFileName: string): SeratoCrate {
  const entries = parseTLVStream(buffer);
  const tracks: string[] = [];

  for (const entry of entries) {
    if (entry.tag !== 'otrk') continue;

    const children = parseNestedTLV(entry.data);
    for (const child of children) {
      if (child.tag === 'ptrk') {
        const path = decodeUTF16BE(child.data);
        if (path) tracks.push(path);
      }
    }
  }

  return {
    name: decodeCrateName(crateFileName),
    fileName: crateFileName,
    tracks,
  };
}

/**
 * Decode a crate filename to a display name.
 * - Strips .crate extension
 * - Converts %% subcrate separators to /
 */
function decodeCrateName(fileName: string): string {
  return fileName
    .replace(/\.crate$/, '')
    .replace(/%%/g, ' / ');
}
