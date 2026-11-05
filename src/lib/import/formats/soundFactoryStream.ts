/**
 * soundFactoryStream.ts - the Sound Factory opcode region as a list of byte-exact tokens, and the one writer that
 * puts a token list back into a .psf.
 *
 * The region from the end of the 276-byte header to the module length is a linear run of opcodes. Each token
 * keeps its own bytes, so a song nobody edited serializes to the same bytes (the carrier of
 * docs/FORMAT_COMMAND_STREAM_GRID.md: what the grid does not show - Request, Nop, WaitForRequest, enable bytes,
 * instrument definitions - rides in the token, not in the cell). The offsets the format stores are never carried:
 * GoSub / Goto operands are relative and the header holds absolute voice start offsets, so the writer recomputes
 * all of them from the new token positions, and rewrites the module length.
 */
import { sfDecodeOperands, SF_EFFECT_OPCODES } from './soundFactoryEffects';

export const SF_HEADER_SIZE = 276;
const EFFECT_OPS = new Set(SF_EFFECT_OPCODES);
const OP_GOSUB = 0x86;
const OP_GOTO = 0x87;
const OP_DEFINE = 0x84;
const FIXED_SIZE: Record<number, number> = {
  0x80: 3, 0x83: 2, 0x85: 1, 0x86: 5, 0x87: 5, 0x88: 2, 0x89: 1, 0x8b: 1, 0x8c: 1, 0x8d: 1, 0x8e: 1, 0x99: 3, 0x9b: 2,
};

export interface SfToken {
  /** File offset in the source. */
  start: number;
  opcode: number;
  bytes: Uint8Array;
}

export interface SfStream {
  tokens: SfToken[];
  /** Per source byte of the region (index = offset - header size): the token that holds it. */
  tokenAt: Int32Array;
  moduleLength: number;
}

const u32 = (b: Uint8Array, o: number): number => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const s32 = (b: Uint8Array, o: number): number => (u32(b, o) | 0);
const put32 = (b: Uint8Array, o: number, v: number): void => { b[o] = (v >>> 24) & 255; b[o + 1] = (v >>> 16) & 255; b[o + 2] = (v >>> 8) & 255; b[o + 3] = v & 255; };

function tokenSize(src: Uint8Array, at: number, end: number): number {
  const op = src[at];
  if (op < 0x80) return 3;
  if (op === OP_DEFINE) return 4 + Math.max(0, ((src[at + 2] << 8) | src[at + 3]) * 2 - 4);
  if (EFFECT_OPS.has(op)) {
    const ops = sfDecodeOperands(op, (i) => (at + 1 + i < end ? src[at + 1 + i] : undefined));
    return ops ? 1 + (op === 0x91 || op === 0x92 ? 0 : ops.length) : end - at;
  }
  return FIXED_SIZE[op] ?? 1;
}

/** Split the opcode region of `src` into tokens. Returns null when a token overruns the module. */
export function tokenizeSoundFactory(src: Uint8Array): SfStream | null {
  if (src.length < SF_HEADER_SIZE) return null;
  const moduleLength = u32(src, 0);
  if (moduleLength < SF_HEADER_SIZE || moduleLength > src.length) return null;
  const tokens: SfToken[] = [];
  const tokenAt = new Int32Array(moduleLength - SF_HEADER_SIZE);
  for (let at = SF_HEADER_SIZE; at < moduleLength;) {
    const size = tokenSize(src, at, moduleLength);
    if (at + size > moduleLength) return null;
    tokenAt.fill(tokens.length, at - SF_HEADER_SIZE, at + size - SF_HEADER_SIZE);
    tokens.push({ start: at, opcode: src[at], bytes: src.slice(at, at + size) });
    at += size;
  }
  return { tokens, tokenAt, moduleLength };
}

/** A token edit: bytes inserted before token `index`, and tokens dropped. */
export interface SfStreamEdit {
  before: Map<number, Uint8Array[]>;
  dropped: Set<number>;
}

/**
 * Serialize the stream with `edit` applied: header, tokens (with insertions and drops), the bytes after the module.
 * Every header voice offset and every GoSub / Goto target is mapped from its source position to the position of the
 * token it named (a dropped token maps to whatever now stands in its place).
 */
export function writeSoundFactoryStream(src: Uint8Array, stream: SfStream, edit: SfStreamEdit, warnings: string[]): Uint8Array {
  const { tokens, moduleLength } = stream;
  const newStart = new Map<number, number>(); // source token start -> new offset
  const tokenNew: number[] = [];               // new offset of each kept token (-1 dropped)
  const chunks: Uint8Array[] = [];
  let cursor = SF_HEADER_SIZE;
  tokens.forEach((t, i) => {
    newStart.set(t.start, cursor);
    for (const b of edit.before.get(i) ?? []) { chunks.push(b); cursor += b.length; }
    if (edit.dropped.has(i)) { tokenNew.push(-1); return; }
    tokenNew.push(cursor);
    chunks.push(t.bytes);
    cursor += t.bytes.length;
  });
  newStart.set(moduleLength, cursor);
  const newLength = cursor;

  // Relative branch operands, recomputed from the new positions.
  tokens.forEach((t, i) => {
    if (tokenNew[i] < 0 || (t.opcode !== OP_GOSUB && t.opcode !== OP_GOTO)) return;
    const oldTarget = t.start + 5 + s32(t.bytes, 1);
    const target = newStart.get(oldTarget);
    if (target === undefined) { warnings.push(`branch at ${t.start.toString(16)} targets ${oldTarget.toString(16)}, not a command start; left as is`); return; }
    const fixed = t.bytes.slice();
    put32(fixed, 1, (target - (tokenNew[i] + 5)) | 0);
    const k = chunks.indexOf(t.bytes);
    chunks[k] = fixed;
  });

  const out = new Uint8Array(newLength + (src.length - moduleLength));
  out.set(src.subarray(0, SF_HEADER_SIZE));
  put32(out, 0, newLength);
  for (let o = 20; o + 4 <= SF_HEADER_SIZE; o += 4) {
    const v = u32(src, o);
    const mapped = v >= SF_HEADER_SIZE ? newStart.get(v) : undefined;
    if (mapped !== undefined) put32(out, o, mapped);
  }
  let at = SF_HEADER_SIZE;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  out.set(src.subarray(moduleLength), newLength);
  return out;
}
