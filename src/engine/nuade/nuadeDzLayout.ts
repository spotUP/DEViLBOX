/**
 * Darius Zendeh: the tables nuade finds in the replayer code (third-party/nuade/players/dariuszendeh/dz_locate.c),
 * read through the nw_dz_layout WASM entry. TypeScript only asks for the answer.
 */
import { heapBytes } from './nuadeModule';
import { nuadeImportModule } from './nuadeProbe';

export interface DzSongLayout {
  /** The list of (pattern, transpose) steps a two voice song starts from. */
  startList: number;
  /** The list a four voice song starts from, and every song continues with after its end. */
  loopList: number;
  /** File offset of pattern 0, the first record; its instrument byte 0xff ends the rows of every pattern. */
  patternBase: number;
  /** Bytes of one pattern. */
  recordSize: number;
  voices: number;
}

export interface DzLayout {
  /** 0 = 'S', 1 = '1', 2 = '2' (the eagleplayer's type character). */
  version: number;
  /** File offset of the period table: words, indexed by note + transpose. */
  periodTable: number;
  instrumentTable: number;
  wideInstruments: boolean;
  sampleBase: number;
  /** A note with bit 7 set slides from the last period. */
  slide: boolean;
  songs: DzSongLayout[];
}

const MAX_SONGS = 32;
const CAP = 7 + 5 * MAX_SONGS;

/** The layout of a Darius Zendeh module, or null when nuade does not load it. */
export async function dzLayout(bytes: Uint8Array): Promise<DzLayout | null> {
  const m = await nuadeImportModule();
  const data = heapBytes(m, bytes);
  const out = m._malloc(CAP * 4);
  try {
    const n = m._nw_dz_layout(data, bytes.length, out, CAP);
    if (n < 7) return null;
    const v = m.HEAP32.subarray(out >> 2, (out >> 2) + n);
    return {
      version: v[0],
      periodTable: v[2],
      instrumentTable: v[3],
      wideInstruments: v[4] === 1,
      sampleBase: v[5],
      slide: v[6] === 1,
      songs: Array.from({ length: v[1] }, (_, s) => {
        const o = 7 + 5 * s;
        return { startList: v[o], loopList: v[o + 1], patternBase: v[o + 2], recordSize: v[o + 3], voices: v[o + 4] };
      }),
    };
  } finally {
    m._free(out);
    m._free(data);
  }
}
