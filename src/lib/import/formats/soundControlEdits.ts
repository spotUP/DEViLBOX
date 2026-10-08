/**
 * soundControlEdits.ts - put a note event INTO a Sound Control track (G5: a note on a row that is part of a wait).
 *
 * A track is a 16-byte name, then events until 0xFF 0xFF: a wait is [0x00, ticks] (2 bytes), a note [note, sample, 0, volume]
 * (4 bytes). The grid draws a wait of n ticks as n empty rows, so a note typed on the k-th of them splits the wait:
 *   [wait n]   ->   [wait k][note][wait n-k-1]        (a part of 0 ticks is left out)
 * the grid then shows the note on that row and every other row where it was. The track grows by an even number of bytes (2, 4 or 6).
 *
 * The tracks section is a table of 256 u16 (offset of each track, relative to 0x40, 0 = none) followed by the tracks, and its length
 * is in the header (u32 at 0x10); the samples, position list and instruments follow it and are found from the lengths. The bytes are
 * inserted in place: the header length and the table entries of every track that lies behind the insertion move by the growth.
 */

const HEADER = 0x40;
const u16 = (b: Uint8Array, o: number): number => (b[o] << 8) | b[o + 1];
const u32 = (b: Uint8Array, o: number): number => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

/** `module` with `removed` bytes at `at` replaced by `replacement` (an even growth), the tracks section's length and table kept true. */
function spliceTrack(module: Uint8Array, at: number, removed: number, replacement: number[]): Uint8Array {
  const grown = replacement.length - removed;
  const out = new Uint8Array(module.length + grown);
  out.set(module.subarray(0, at));
  out.set(replacement, at);
  out.set(module.subarray(at + removed), at + replacement.length);
  // The tracks section: its length, and the table entries of the tracks behind the insertion.
  const tracksLen = u32(out, 0x10);
  const put32 = (o: number, v: number): void => { out[o] = v >>> 24; out[o + 1] = (v >>> 16) & 0xff; out[o + 2] = (v >>> 8) & 0xff; out[o + 3] = v & 0xff; };
  put32(0x10, tracksLen + grown);
  for (let t = 0; t < 256; t++) {
    const rel = u16(out, HEADER + t * 2);
    if (rel !== 0 && HEADER + rel > at) {
      const moved = rel + grown;
      out[HEADER + t * 2] = moved >> 8;
      out[HEADER + t * 2 + 1] = moved & 0xff;
    }
  }
  return out;
}

const wait = (ticks: number): number[] => (ticks > 0 ? [0, ticks] : []);

/**
 * `module` with the wait event at file offset `waitAt` (which waits `n` ticks) split around its `k`-th tick (0-based) by
 * `note` (the 4 bytes of the note event). Throws when `waitAt` is not a wait of n ticks.
 */
export function soundControlSplitWait(module: Uint8Array, waitAt: number, k: number, n: number, note: Uint8Array): Uint8Array {
  if (module[waitAt] !== 0 || module[waitAt + 1] !== n) throw new RangeError(`no wait of ${n} ticks at ${waitAt}`);
  if (k < 0 || k >= n) throw new RangeError(`tick ${k} is outside the wait of ${n}`);
  return spliceTrack(module, waitAt, 2, [...wait(k), ...note, ...wait(n - k - 1)]);
}

/**
 * `module` with a note put on a row past the end of a track: [wait gap][note] goes in front of the track's end marker (at file
 * offset `endAt`), `gap` being the blank rows between the track's last row and the typed one. Throws when `endAt` is not an end marker.
 */
export function soundControlAppendNote(module: Uint8Array, endAt: number, gap: number, note: Uint8Array): Uint8Array {
  if (module[endAt] !== 0xff) throw new RangeError(`no track end at ${endAt}`);
  if (gap < 0 || gap > 255) throw new RangeError(`a gap of ${gap} rows does not fit one wait`);
  return spliceTrack(module, endAt, 0, [...wait(gap), ...note]);
}
