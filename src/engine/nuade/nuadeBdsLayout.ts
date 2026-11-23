/**
 * Ben Daglish SID: the tables nuade's loader finds in the driver code (third-party/nuade/players/bendaglishsid/
 * bds_module.c), read through the nw_bds_layout WASM entry. TypeScript only asks for the answer.
 */
import { heapBytes } from './nuadeModule';
import { nuadeImportModule } from './nuadeProbe';

export const BDS_VOICES = 3;

export interface BdsLayout {
  late: boolean;
  subsongs: number;
  /** Hunk offset of the track table: one long (a hunk offset) per track number. */
  tracks: number;
  /** File offset of hunk offset 0. */
  hunkStart: number;
  /** orderLists[subsong][voice]: hunk offset of the voice's order list. */
  orderLists: number[][];
}

const CAP = 4 + 3 * 256;

/** The layout of a Ben Daglish SID module, or null when nuade does not load it. */
export async function bdsLayout(bytes: Uint8Array): Promise<BdsLayout | null> {
  const m = await nuadeImportModule();
  const data = heapBytes(m, bytes);
  const out = m._malloc(CAP * 4);
  try {
    const n = m._nw_bds_layout(data, bytes.length, out, CAP);
    if (n < 4) return null;
    const v = m.HEAP32.subarray(out >> 2, (out >> 2) + n);
    const subsongs = v[1];
    return {
      late: v[0] === 1,
      subsongs,
      tracks: v[2],
      hunkStart: v[3],
      orderLists: Array.from({ length: subsongs }, (_, s) => Array.from(v.subarray(4 + 3 * s, 7 + 3 * s))),
    };
  } finally {
    m._free(out);
    m._free(data);
  }
}
