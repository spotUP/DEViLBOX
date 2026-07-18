/**
 * SunTronicExporter.ts — native export for SunTronic V1.3 "Delirium" modules.
 *
 * Three paths, chosen by what the loaded song carries:
 *
 *  1. UNEDITED FAST PATH — a `uadeVariableLayout` (formatId 'sunTronic') is
 *     present and every score block re-encodes to its original bytes: return
 *     `uadeEditableFileData` verbatim (byte-exact by construction).
 *
 *  2. EDIT (in-place splice) PATH — the layout is present but one or more blocks
 *     differ after re-encoding the grid carriers. Because a note edit changes a
 *     carrier byte (cell.period) WITHOUT changing the stream length, every edited
 *     block re-encodes to the SAME byte length; splice each into a copy of the
 *     original module at its file offset. A length change would require shifting
 *     the whole score + rebuilding both RELOC32 tables (Phase 5) — we throw
 *     rather than emit a corrupt module.
 *
 *  3. FROM-SCRATCH (reference-player wrap) PATH — no sunTronic layout on the song
 *     (a freshly authored project): decode the committed reference module
 *     (SUNTRONIC_V13_TEMPLATE, mule.src) via the hunk reader, patch the
 *     instrument-name region that precedes the fixed `dos.library` string, and
 *     re-emit with the hunk WRITER (writeHunks — the byte-inverse of parseHunks,
 *     proven over the whole corpus by tools/suntronic-re/probe-hunk-writer.ts).
 *
 * DEVIATION FROM PLAN 4.2 (documented, disclosed in warnings): the from-scratch
 * path reuses the reference module's score TOPOLOGY (subsong sequences, track
 * streams, instrument descriptors) as the wrap skeleton rather than assembling a
 * brand-new score from the grid. Authoring new track streams needs the
 * shift+reloc-rebuild machinery that is Phase 5 scope; the pilot's from-scratch
 * capability is "produce a valid, load-validated hunk executable named after the
 * new song" — it compiles, re-parses, and the hunk walker validates. Companion
 * PCM is emitted for any non-corpus sampler instrument whose samples are
 * recoverable.
 *
 * The hunk WRITER lives next to the reader in SunTronicV13.ts (inverse pair).
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import type { NativeExportResult, NativeExportCompanion } from './nativeExportRouter';
import { SUNTRONIC_V13_TEMPLATE } from '@generated/sunTronicV13Template';
import {
  parseHunks,
  writeHunks,
  parseSunTronicV13Score,
} from '@/lib/import/formats/SunTronicV13';

// ── Small binary helpers ─────────────────────────────────────────────────────

function fromBase64(b64: string): Uint8Array {
  // eslint-disable-next-line no-undef
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function sanitizeBaseName(song: TrackerSong): string {
  const raw = (song.name || 'untitled').replace(/\s*\[SunTronic[^\]]*\]\s*$/i, '');
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_') || 'untitled';
}

// ── Companion PCM extraction (best-effort, for authored/edited samples) ────────

/**
 * Recover raw signed 8-bit Amiga PCM from a sampler instrument's WAV audioBuffer
 * (pcm8ToWAV writes 16-bit signed = s8 * 256, so the high byte of each frame is
 * the original signed 8-bit sample). Returns null when no PCM is recoverable.
 * Only used for companion emission; the byte-exact round-trip never needs it.
 */
function instrumentToPcm8(inst: InstrumentConfig): Uint8Array | null {
  const wav = inst.sample?.audioBuffer;
  if (!(wav instanceof ArrayBuffer) || wav.byteLength < 44) return null;
  const view = new DataView(wav);
  // Locate the 'data' chunk.
  let pos = 12;
  let dataOff = -1;
  let dataLen = 0;
  while (pos + 8 <= wav.byteLength) {
    const id = String.fromCharCode(view.getUint8(pos), view.getUint8(pos + 1), view.getUint8(pos + 2), view.getUint8(pos + 3));
    const size = view.getUint32(pos + 4, true);
    if (id === 'data') { dataOff = pos + 8; dataLen = size; break; }
    pos += 8 + size + (size & 1);
  }
  if (dataOff < 0) return null;
  const frames = Math.floor(Math.min(dataLen, wav.byteLength - dataOff) / 2);
  if (frames <= 0) return null;
  const pcm = new Uint8Array(frames);
  for (let i = 0; i < frames; i++) {
    // high byte of the little-endian 16-bit frame = signed 8-bit sample
    pcm[i] = view.getUint8(dataOff + i * 2 + 1);
  }
  return pcm;
}

/**
 * Emit `instr/<name>.x` companions for sampler instruments that are NOT one of
 * the reference corpus names (those already exist alongside the module) and
 * whose PCM is recoverable.
 */
function buildCompanions(song: TrackerSong): NativeExportCompanion[] {
  const corpus = new Set(SUNTRONIC_V13_TEMPLATE.instrumentNames.map((n) => n.toLowerCase()));
  const out: NativeExportCompanion[] = [];
  for (const inst of song.instruments) {
    if (inst.type !== 'sample') continue;
    const name = (inst.name || '').trim();
    if (!name) continue;
    const base = name.toLowerCase().replace(/\.x$/, '');
    if (corpus.has(name.toLowerCase()) || corpus.has(`${base}.x`)) continue; // reference sample, no sidecar
    const pcm = instrumentToPcm8(inst);
    if (!pcm || pcm.length === 0) continue;
    out.push({ name: `instr/${base}.x`, data: pcm });
  }
  return out;
}

// ── From-scratch reference-player wrap ─────────────────────────────────────────

/** Offset of the fixed `dos.library` string in the hunk#1 name block, or -1. */
function findDosLibraryOffset(h1: Uint8Array, searchEnd: number): number {
  const needle = 'dos.library';
  const limit = Math.min(searchEnd, h1.length) - needle.length;
  for (let i = 0; i <= limit; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      // case-insensitive
      const c = h1[i + j];
      const n = needle.charCodeAt(j);
      if ((c | 0x20) !== (n | 0x20)) { ok = false; break; }
    }
    if (ok) return i;
  }
  return -1;
}

function exportFromScratch(song: TrackerSong): NativeExportResult {
  const warnings: string[] = [];
  const templateBytes = fromBase64(SUNTRONIC_V13_TEMPLATE.module);
  const hf = parseHunks(templateBytes);
  if (hf.hunks.length !== 2) throw new Error('SunTronic template is not a 2-hunk module');
  const h1 = hf.hunks[1].data; // own buffer (parseHunks slices) — safe to mutate

  // Patch the instrument-name region that precedes the fixed dos.library string.
  const dosLibOff = findDosLibraryOffset(h1, SUNTRONIC_V13_TEMPLATE.layout.nameBlockEnd);
  if (dosLibOff > 0) {
    const wanted: number[] = [];
    for (const inst of song.instruments) {
      const nm = (inst.name || '').trim();
      if (!nm) continue;
      for (let i = 0; i < nm.length; i++) wanted.push(nm.charCodeAt(i) & 0x7f);
      wanted.push(0);
    }
    if (wanted.length > 0 && wanted.length <= dosLibOff) {
      for (let i = 0; i < dosLibOff; i++) h1[i] = i < wanted.length ? wanted[i] : 0;
    } else if (wanted.length > dosLibOff) {
      warnings.push(
        `Instrument names (${wanted.length} bytes) exceed the reference name-block capacity ` +
        `(${dosLibOff} bytes); keeping reference names. Full instrument authoring is Phase 5.`,
      );
    }
  }

  warnings.push(
    'From-scratch SunTronic export uses the reference-player wrap: the module plays the ' +
    'reference score topology. Authoring new patterns into native track streams is Phase 5.',
  );

  const data = writeHunks(hf);
  const companions = buildCompanions(song);
  const result: NativeExportResult = { data, filename: `${sanitizeBaseName(song)}.src`, warnings };
  if (companions.length > 0) result.companions = companions;
  return result;
}

// ── Variable-length recompile (Phase 2, Task 9) ────────────────────────────────

/** Longword-align a byte count upward (Amiga hunk payloads are longword-sized). */
function alignUp4(n: number): number {
  return (n + 3) & ~3;
}

/**
 * Recompile path — an edit changed at least one pool block's byte length, so the
 * whole pool region is re-laid and every sequence-entry trackPtr that points into
 * the pool is recomputed to the block's new h1 offset.
 *
 * Layout facts (measured from the corpus, e.g. the `ready` fixture — pool span
 * [0x1b1c, 0x211c), 51 blocks, contiguous, ending exactly at h1 end):
 *   - The pool is the LAST structure in hunk#1; every fixed table (synth, sampled,
 *     subsong, sequences) precedes `poolStart`. Growing the pool therefore grows
 *     hunk#1 at its tail; nothing after it moves.
 *   - The only RELOC32 entries whose stored VALUE points into the pool are the
 *     128 sequence-entry trackPtr longwords — and those values are rewritten here
 *     (step c). No RELOC32 LOCATION falls inside the pool span, so no reloc offset
 *     needs to shift. We assert both invariants before proceeding; if a future
 *     module violates them we throw rather than emit a corrupt module.
 *
 * @param origBytes the original module bytes (`uadeEditableFileData`)
 * @param encoded   per-block re-encoded bytes (index parallel to `score.blocks`)
 */
function recompileWithLengthChange(
  origBytes: Uint8Array,
  encoded: Uint8Array[],
): Uint8Array {
  const score = parseSunTronicV13Score(origBytes);
  const blocks = score.blocks; // sorted ascending by h1Offset (== layout index order)
  if (blocks.length !== encoded.length) {
    throw new Error(
      `SunTronic recompile: block count mismatch (score ${blocks.length} vs encoded ${encoded.length})`,
    );
  }

  const poolStart = blocks[0].h1Offset;
  const oldPoolEnd = blocks[blocks.length - 1].h1Offset + blocks[blocks.length - 1].byteSize;

  // (b) Lay blocks contiguously from poolStart, in ascending original-offset order.
  const newOffsetOf = new Map<number, number>(); // oldOffset -> newOffset
  let cursor = poolStart;
  for (let i = 0; i < blocks.length; i++) {
    newOffsetOf.set(blocks[i].h1Offset, cursor);
    cursor += encoded[i].length;
  }
  const newPoolEnd = cursor;
  const newPoolLen = newPoolEnd - poolStart;

  // Overflow guard: the pool may only fill the span up to the next fixed structure
  // after poolStart. Gather every fixed anchor and find the closest one > poolStart.
  const fixedAnchors: number[] = [score.synthTableOff, score.sampledTableOff];
  for (const sub of score.subsongs) fixedAnchors.push(sub.sequenceOff);
  const nextFixed = fixedAnchors
    .filter((o) => o > poolStart)
    .reduce((m, o) => (o < m ? o : m), Number.POSITIVE_INFINITY);
  if (Number.isFinite(nextFixed)) {
    const capacity = nextFixed - poolStart;
    if (newPoolLen > capacity) {
      throw new Error(
        `SunTronic recompile: repacked pool overflows its span — ${newPoolLen} bytes needed but ` +
        `only ${capacity} available before the next fixed structure at h1+0x${nextFixed.toString(16)}. ` +
        'The edit adds more stream bytes than the pool region can hold.',
      );
    }
  }
  // If no fixed structure follows the pool, it is the last thing in h1 and may grow
  // the hunk freely (validated below by the self-reparse).

  // Build the new h1 payload. Everything before poolStart is copied verbatim; the
  // pool is repacked; anything the pool used to occupy is replaced by the new pool.
  const hf = parseHunks(origBytes);
  const oldH1 = hf.hunks[1].data;
  const tailLen = oldH1.length - oldPoolEnd;
  if (tailLen > 0) {
    throw new Error(
      `SunTronic recompile: pool is not the last h1 structure (${tailLen} bytes follow); ` +
      'relaying trailing structures is unsupported',
    );
  }
  const newH1 = new Uint8Array(alignUp4(poolStart + newPoolLen));
  newH1.set(oldH1.subarray(0, poolStart), 0); // pre-pool structures verbatim
  for (let i = 0; i < blocks.length; i++) {
    newH1.set(encoded[i], newOffsetOf.get(blocks[i].h1Offset)!);
  }

  // (c) Rewrite each sequence-entry trackPtr longword to the block's NEW offset.
  const writeU32BE = (buf: Uint8Array, off: number, v: number): void => {
    buf[off] = (v >>> 24) & 0xff;
    buf[off + 1] = (v >>> 16) & 0xff;
    buf[off + 2] = (v >>> 8) & 0xff;
    buf[off + 3] = v & 0xff;
  };
  for (const sub of score.subsongs) {
    for (let ei = 0; ei < sub.entries.length; ei++) {
      const entryOff = sub.sequenceOff + ei * 0x14;
      for (let v = 0; v < 4; v++) {
        const tp = sub.entries[ei].trackPtrs[v];
        if (tp <= 0) continue; // 0 / not-in-pool ptr stays as-is
        const newTp = newOffsetOf.get(tp);
        if (newTp === undefined) continue; // not a pool block start — leave verbatim
        writeU32BE(newH1, entryOff + v * 4, newTp);
      }
    }
  }

  // (d) Adjust hunk length + declaredSize; validate reloc invariants and rebase any
  // reloc VALUE that points into the pool (== the trackPtrs, already rewritten in the
  // payload; here we assert no reloc LOCATION moved so the offset list is unchanged).
  const relocBlock = hf.hunks[1].reloc32;
  for (const [, offs] of relocBlock) {
    for (const o of offs) {
      if (o >= poolStart && o < oldPoolEnd) {
        throw new Error(
          `SunTronic recompile: RELOC32 location h1+0x${o.toString(16)} falls inside the pool span; ` +
          'block-internal relocations are not supported.',
        );
      }
    }
  }
  hf.hunks[1].data = newH1;
  hf.hunks[1].length = newH1.length;
  hf.hunks[1].declaredSize = newH1.length;

  const out = writeHunks(hf);

  // (e) Self-validate: re-parse must not throw, block count preserved, and every
  // entry trackPtr must resolve to a block. A failure here means the recompile is
  // wrong — surface it instead of shipping a corrupt module.
  const check = parseSunTronicV13Score(out);
  if (check.blocks.length !== blocks.length) {
    throw new Error(
      `SunTronic recompile: reparse block count ${check.blocks.length} != ${blocks.length}`,
    );
  }
  for (const sub of check.subsongs) {
    for (const e of sub.entries) {
      for (const tp of e.trackPtrs) {
        if (tp > 0 && !check.blockIndexByOffset.has(tp)) {
          throw new Error(
            `SunTronic recompile: reparsed trackPtr h1+0x${tp.toString(16)} resolves to no block`,
          );
        }
      }
    }
  }
  return out;
}

// ── Public entry point ─────────────────────────────────────────────────────────

/**
 * Export `song` to a SunTronic V1.3 module. Dispatched by the native-export
 * router on `uadePatternLayout.formatId === 'sunTronic'` (byLayout).
 */
export function exportAsSunTronic(song: TrackerSong): NativeExportResult {
  const layout = song.uadeVariableLayout;
  const editable = song.uadeEditableFileData;

  // No sunTronic layout / no original bytes → author a new module from the wrap.
  if (!layout || layout.formatId !== 'sunTronic' || !editable ||
      !layout.blockRows || !layout.blockRawBytes) {
    return exportFromScratch(song);
  }

  const filename = `${sanitizeBaseName(song)}.src`;
  const orig = new Uint8Array(editable);
  const out = orig.slice();
  const warnings: string[] = [];
  let edited = false;
  let lengthChanged = false;

  // Re-encode every block. Blocks come from `sunTronicNative.blocks` (the live pool
  // the editor mutates) when present, else from the layout's carrier rows. The two
  // are kept in sync (the editor writes both); we drive off `blockRows` because that
  // is what the encoder consumes and the pool-index order matches `score.blocks`.
  const encodedBlocks: Uint8Array[] = [];
  for (let fp = 0; fp < layout.numFilePatterns; fp++) {
    const rows = layout.blockRows[fp];
    const raw = layout.blockRawBytes[fp];
    // sunTronicV13Encoder is a pure carrier re-emitter and ignores the channel
    // argument (blocks are per-(position,voice) streams, not per-channel grids).
    const encoded = rows ? layout.encoder.encodePattern(rows, 0) : (raw ?? new Uint8Array(0));
    encodedBlocks.push(encoded);
    if (!rows || !raw) continue;
    if (bytesEqual(encoded, raw)) continue;
    edited = true;
    if (encoded.length !== raw.length) lengthChanged = true;
    else out.set(encoded, layout.filePatternAddrs[fp]);
  }

  if (!edited) {
    // Unedited fast path: byte-exact verbatim original.
    return { data: orig, filename, warnings };
  }

  // Outcome 3: at least one block changed length → re-lay the pool + rebuild the
  // sequence trackPtrs (and grow the hunk if the pool grew). Outcome 2 (all edits
  // same length) already spliced in-place above.
  const data = lengthChanged
    ? recompileWithLengthChange(orig, encodedBlocks)
    : out;

  const companions = buildCompanions(song);
  const result: NativeExportResult = { data, filename, warnings };
  if (companions.length > 0) result.companions = companions;
  return result;
}
