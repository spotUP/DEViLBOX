/**
 * Sean Conran: the build nuade picks for a module (by the hash of its 68000 code), read through the
 * nw_scr_layout WASM entry. The 14-build table lives once, in third-party/nuade/players/seanconran/sc_code.c;
 * TypeScript only asks for the answer.
 */
import { heapBytes } from './nuadeModule';
import { nuadeImportModule } from './nuadeProbe';

export const SCR_VOICES = 4;
export const SCR_COMMAND_SLOTS = 15;
/** The slot of the command that ends a stream and reads the next entry of the track list. */
export const SCR_COMMAND_SLOT_NEXT = 13;

export interface ScrLayout {
  /** The build's code hash, as 16 hex digits. */
  hash: string;
  subsongs: number;
  /** A track list byte is the entry number times 2. */
  entriesDoubled: boolean;
  /** A length L lasts L ticks (0 lasts 256); else L + 1 ticks. */
  lengthEndsAtZero: boolean;
  /** The entry a marker jumps back to may be a marker again. */
  markerRechecked: boolean;
  /** The pitch bias is a byte offset into the period table (else a word index). */
  pitchIndexBytes: boolean;
  trackTables: number[];
  /** Per voice, the command letter of each of the 15 slots (see ScrCommand in sc_module.h). */
  commands: string[];
  /** trackLists[subsong][voice]: where the voice's track list starts. */
  trackLists: number[][];
}

const CAP = 68 + 4 * 64;

/** The layout of a Sean Conran module, or null when no known build matches its code. */
export async function scrLayout(bytes: Uint8Array): Promise<ScrLayout | null> {
  const m = await nuadeImportModule();
  const data = heapBytes(m, bytes);
  const out = m._malloc(CAP * 4);
  try {
    const n = m._nw_scr_layout(data, bytes.length, out, CAP);
    if (n < 68) return null;
    const v = m.HEAP32.subarray(out >> 2, (out >> 2) + n);
    const subsongs = v[2];
    const hex = (x: number): string => (x >>> 0).toString(16).toUpperCase().padStart(8, '0');
    return {
      hash: hex(v[1]) + hex(v[0]),
      subsongs,
      entriesDoubled: (v[3] & 1) !== 0,
      lengthEndsAtZero: (v[3] & 2) !== 0,
      markerRechecked: (v[3] & 4) !== 0,
      pitchIndexBytes: (v[3] & 8) !== 0,
      trackTables: Array.from(v.subarray(4, 8)),
      commands: Array.from({ length: SCR_VOICES }, (_, voice) =>
        String.fromCharCode(...v.subarray(8 + voice * SCR_COMMAND_SLOTS, 8 + (voice + 1) * SCR_COMMAND_SLOTS))),
      trackLists: Array.from({ length: subsongs }, (_, s) => Array.from(v.subarray(68 + 4 * s, 72 + 4 * s))),
    };
  } finally {
    m._free(out);
    m._free(data);
  }
}
