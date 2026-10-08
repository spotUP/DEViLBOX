/**
 * sidmon1Edits.ts - put a pattern row INTO a SidMon 1.0 module (G5: a note on a grid cell no module row covers).
 *
 * A row lasts `speed + 1` global rows, so a grid cell inside a long row has no row of its own. The note goes
 * on by splitting the covering row: it keeps the first k global rows (speed k - 1) and a new row, inserted
 * straight after it, carries the note for the rest (speed s - k). The player walks rows one after the other,
 * so every later cell plays what it played before.
 *
 * The module is a header of u32 section offsets (relative to the 'position' marker) in front of its sections;
 * the pattern rows are 5-byte records followed by the pattern start table and the sample table:
 *   position-12 : pattern rows start     position-8 : pattern rows end = start of the pattern start table
 *   position-4  : sample table start
 * The pattern start table holds each pattern's first row as a BYTE offset into the rows (row * 5). Inserting
 * a row moves everything behind it: the two header offsets and every pattern start behind the new row move
 * by the same amount. The row area stays an even length (the player reads long words behind it).
 */

const u32 = (b: Uint8Array, o: number): number => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const put32 = (b: Uint8Array, o: number, v: number): void => { b[o] = v >>> 24; b[o + 1] = (v >>> 16) & 0xff; b[o + 2] = (v >>> 8) & 0xff; b[o + 3] = v & 0xff; };

/** `module` with the 5-byte `row` inserted at index `at` of the pattern rows (rows from `at` on move one place). */
export function sidmon1InsertRow(module: Uint8Array, position: number, at: number, row: Uint8Array): Uint8Array {
  const patStart = u32(module, position - 12);
  const patEnd = u32(module, position - 8);
  const sampleStart = u32(module, position - 4);
  const rowsBase = position + patStart;
  const oldLen = patEnd - patStart;
  const numRows = Math.floor(oldLen / 5);
  if (at < 0 || at > numRows) throw new RangeError(`row ${at} is outside the ${numRows} pattern rows`);

  // The spare bytes behind the last row (padding to an even length) stay, adjusted so the area stays even.
  const spare = module.slice(rowsBase + numRows * 5, position + patEnd);
  let tail: Uint8Array = spare;
  if ((((numRows + 1) * 5 + spare.length) & 1) !== 0) tail = spare.length > 0 ? spare.slice(0, spare.length - 1) : new Uint8Array(1);
  const newLen = (numRows + 1) * 5 + tail.length;
  const delta = newLen - oldLen;

  const head = module.slice(0, rowsBase + at * 5);
  const rest = module.slice(rowsBase + at * 5, rowsBase + numRows * 5);
  const after = module.slice(position + patEnd);
  const out = new Uint8Array(head.length + 5 + rest.length + tail.length + after.length);
  let o = 0;
  for (const part of [head, row, rest, tail, after]) { out.set(part, o); o += part.length; }

  put32(out, position - 8, patEnd + delta);
  put32(out, position - 4, sampleStart + delta);
  // The pattern start table (the first word is the player-skipped empty entry; the list ends at the first zero).
  const table = position + patEnd + delta;
  const end = position + sampleStart + delta;
  for (let p = table + 4; p + 4 <= end; p += 4) {
    const v = u32(out, p);
    if (v === 0) break;
    if (v >= at * 5) put32(out, p, v + 5);
  }
  return out;
}
