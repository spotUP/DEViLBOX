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
import { parseHunks, writeHunks } from '@/lib/import/formats/SunTronicV13';

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

  for (let fp = 0; fp < layout.numFilePatterns; fp++) {
    const rows = layout.blockRows[fp];
    const raw = layout.blockRawBytes[fp];
    if (!rows || !raw) continue;
    // sunTronicV13Encoder is a pure carrier re-emitter and ignores the channel
    // argument (blocks are per-(position,voice) streams, not per-channel grids).
    const encoded = layout.encoder.encodePattern(rows, 0);
    if (bytesEqual(encoded, raw)) continue;
    if (encoded.length !== raw.length) {
      throw new Error(
        `SunTronic export: block ${fp} changed length (${raw.length} -> ${encoded.length}); ` +
        'row insert/delete needs score shift + RELOC32 rebuild (Phase 5). Note-only edits are supported.',
      );
    }
    out.set(encoded, layout.filePatternAddrs[fp]);
    edited = true;
  }

  if (!edited) {
    // Unedited fast path: byte-exact verbatim original.
    return { data: orig, filename, warnings };
  }

  const companions = buildCompanions(song);
  const result: NativeExportResult = { data: out, filename, warnings };
  if (companions.length > 0) result.companions = companions;
  return result;
}
