/**
 * Mass encoder round-trip harness (Phase 1, Task 1.1).
 *
 * Every UADE cell codec claims a format is "editable": edit a cell -> encodeCell ->
 * write into chip RAM -> the replayer reads it back. That claim is only true if
 * encode is a faithful inverse of the parser's decode over REAL pattern bytes. Before
 * this harness only 3 formats (SynTracker, TomyTracker, Cinter4) had that proof; the
 * other ~90 codecs were unverified.
 *
 * This harness parses a real committed fixture for every layout formatId we could find
 * one for (src/engine/uade/__tests__/fixtures.map.ts, populated empirically), then:
 *   - fixed layouts  : for every pattern cell, encodeCell(decodeCell(bytes)) === bytes
 *                      (or encodeCell(parsedCell) === bytes when the layout has no
 *                      decodeCell), byte-for-byte. matchPct = exact cells / total cells.
 *   - variable layouts: encoder.encodePattern(decodedRows, ch) === the original pattern
 *                      block bytes. matchPct = exact blocks / total blocks.
 *
 * The measured state is locked in encoderRoundtrip.ratchet.json. The test asserts NO
 * REGRESSION: a byte-exact format must stay byte-exact; a lossy format's matchPct may
 * only hold or improve; the set of unexercised registered encoders may only shrink. It
 * NEVER fixes a lossy codec (that is Phase 3) — it just measures and locks.
 *
 * Regenerate the ratchet after a legitimate improvement:
 *   DEVILBOX_GEN_RATCHET=1 npx vitest run --config vite.config.ts \
 *     src/engine/uade/__tests__/encoderRoundtrip.harness.test.ts
 * then review the diff (matchPct must not drop, unexercised must not grow) and commit it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { TrackerCell } from '@/types';
import { detectFormat } from '@/lib/import/FormatRegistry';
import {
  getCellFileOffset,
  encodeVariableBlock,
  listPatternEncoderFormatIds,
  listVariableEncoderFormatIds,
  type UADEPatternLayout,
  type UADEVariablePatternLayout,
} from '../UADEPatternEncoder';
// Side-effect import: populate both encoder registries so the unexercised-coverage
// accounting below sees every registered codec, not only the ones a parser pulled in.
import '../encoders';
import { ENCODER_FIXTURES, type EncoderFixture } from './fixtures.map';

const ROOT = process.cwd();
const RATCHET_PATH = join(ROOT, 'src/engine/uade/__tests__/encoderRoundtrip.ratchet.json');

type Status = 'byte-exact' | 'lossy' | 'no-cells' | 'no-layout' | 'error';
// How the round-trip was measured, so the report is honest about what each row proves:
//   decode-encode  : encodeCell(decodeCell(bytes)) === bytes — a PURE codec test.
//   encode-parsed  : layout has no decodeCell; encodeCell(parsedCell) === bytes — this
//                    also folds in parser normalization, so a sub-100% is not proof the
//                    codec is lossy (the parser may drop info the cell can't hold).
//   encode-pattern : variable layout; encoder.encodePattern(rows, ch) === original block.
type Method = 'decode-encode' | 'encode-parsed' | 'encode-pattern';

interface FormatResult {
  formatId: string;
  fixture: string;
  kind: 'fixed' | 'variable';
  method: Method;
  status: Status;
  cells: number;
  byteExact: boolean;
  matchPct: number; // 0..1, 4 decimals
  error?: string;
}

interface Ratchet {
  results: Record<string, { kind: 'fixed' | 'variable'; method: Method; status: Status; byteExact: boolean; matchPct: number; cells: number }>;
  /** Registered encoder formatIds with no fixture that exercises them. May only shrink. */
  unexercisedRegistered: string[];
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function readFixture(rel: string): Uint8Array {
  const b = readFileSync(join(ROOT, rel));
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
}

/** Parse a fixture through the app's FormatRegistry detection + native parser.
 *  An explicit `override` (fixtures.map `parser` field) names the real dispatcher
 *  parser for sub-formats whose extension resolves to a different registry entry. */
async function parseFixture(rel: string, raw: Uint8Array, override?: { module: string; parseFn: string }): Promise<TrackerSong> {
  const name = rel.split('/').pop() ?? rel;
  let moduleId: string, parseFnName: string;
  if (override) {
    moduleId = override.module;
    parseFnName = override.parseFn;
  } else {
    const fmt = detectFormat(name);
    if (!fmt?.nativeParser?.parseFn) throw new Error(`no native parser for ${name}`);
    moduleId = fmt.nativeParser.module;
    parseFnName = fmt.nativeParser.parseFn;
  }
  const mod = (await import(/* @vite-ignore */ moduleId)) as Record<string, unknown>;
  const fn = mod[parseFnName];
  if (typeof fn !== 'function') throw new Error(`parseFn ${parseFnName} missing`);
  const parse = fn as (b: ArrayBuffer | Uint8Array, n: string) => TrackerSong | Promise<TrackerSong>;
  const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  // Some native parsers accept only an ArrayBuffer (e.g. they `new DataView(buf)`),
  // others accept only a Uint8Array, and several *return null* (rather than throwing)
  // when handed the shape they don't want. Try the ArrayBuffer first, then fall back to
  // the Uint8Array on EITHER a throw OR a null/undefined result, so a fixture whose
  // parser is Uint8Array-only still gets exercised instead of silently unmeasured.
  let parsed: TrackerSong | null | undefined;
  try {
    parsed = await Promise.resolve(parse(ab, name));
  } catch {
    parsed = null;
  }
  if (!parsed) {
    parsed = await Promise.resolve(parse(raw, name));
  }
  return parsed as TrackerSong;
}

function roundTripFixed(raw: Uint8Array, layout: UADEPatternLayout, song: TrackerSong): { cells: number; exact: number } {
  let cells = 0;
  let exact = 0;
  const { numPatterns, rowsPerPattern, numChannels, bytesPerCell, decodeCell, encodeCell } = layout;
  for (let p = 0; p < numPatterns; p++) {
    for (let r = 0; r < rowsPerPattern; r++) {
      for (let c = 0; c < numChannels; c++) {
        const off = getCellFileOffset(layout, p, r, c);
        if (off < 0 || off + bytesPerCell > raw.length) continue;
        const orig = raw.subarray(off, off + bytesPerCell);
        let cell: TrackerCell | undefined;
        if (decodeCell) {
          cell = decodeCell(orig);
        } else {
          cell = song.patterns[p]?.channels[c]?.rows[r];
        }
        if (!cell) continue;
        cells++;
        if (bytesEqual(encodeCell(cell), orig)) exact++;
      }
    }
  }
  return { cells, exact };
}

function roundTripVariable(raw: Uint8Array, layout: UADEVariablePatternLayout, song: TrackerSong): { cells: number; exact: number } {
  const { filePatternAddrs, filePatternSizes, trackMap } = layout;
  let blocks = 0;
  let exact = 0;
  for (let fp = 0; fp < filePatternAddrs.length; fp++) {
    // Prefer the layout's canonical per-block carrier rows when present: formats
    // whose display grid is a shared tick timeline (e.g. Rob Hubbard) decouple the
    // carriers from the display cells because a block straddles pattern boundaries,
    // so the byte-exact truth lives on `blockRows[fp]`, not in one pattern's rows.
    let rows: TrackerCell[] | undefined;
    let ch = 0;
    if (layout.blockRows) {
      rows = layout.blockRows[fp];
    } else {
      let mapped: { tp: number; ch: number } | null = null;
      for (let tp = 0; tp < trackMap.length && !mapped; tp++) {
        const row = trackMap[tp];
        if (!row) continue;
        for (let c = 0; c < row.length; c++) {
          if (row[c] === fp) { mapped = { tp, ch: c }; break; }
        }
      }
      if (!mapped) continue;
      rows = song.patterns[mapped.tp]?.channels[mapped.ch]?.rows;
      ch = mapped.ch;
    }
    if (!rows) continue;
    const addr = filePatternAddrs[fp];
    const size = filePatternSizes[fp];
    if (addr < 0 || size <= 0 || addr + size > raw.length) continue;
    const orig = raw.subarray(addr, addr + size);
    blocks++;
    // Route through encodeVariableBlock so the harness measures the SAME path the
    // live chip-RAM rewrite uses: an unedited block prefers its raw-byte carrier
    // (byte-exact), an edited block falls back to the format's packer.
    const re = encodeVariableBlock(layout, fp, rows, ch);
    if (bytesEqual(re, orig)) exact++;
  }
  return { cells: blocks, exact };
}

async function measure(entry: EncoderFixture): Promise<FormatResult> {
  const base: FormatResult = {
    formatId: entry.formatId, fixture: entry.fixture, kind: entry.kind,
    method: entry.kind === 'variable' ? 'encode-pattern' : 'decode-encode',
    status: 'error', cells: 0, byteExact: false, matchPct: 0,
  };
  let raw: Uint8Array;
  let song: TrackerSong;
  try {
    raw = readFixture(entry.fixture);
    song = await parseFixture(entry.fixture, raw, entry.parser);
  } catch (e) {
    return { ...base, status: 'error', error: (e as Error).message };
  }
  let counts: { cells: number; exact: number };
  let method: Method = base.method;
  if (entry.kind === 'fixed') {
    const layout = song.uadePatternLayout;
    if (!layout || layout.formatId !== entry.formatId) {
      return { ...base, status: 'no-layout', error: `expected fixed layout ${entry.formatId}, got ${layout?.formatId ?? 'none'}` };
    }
    method = layout.decodeCell ? 'decode-encode' : 'encode-parsed';
    counts = roundTripFixed(raw, layout, song);
  } else {
    const layout = song.uadeVariableLayout;
    if (!layout || layout.formatId !== entry.formatId) {
      return { ...base, status: 'no-layout', error: `expected variable layout ${entry.formatId}, got ${layout?.formatId ?? 'none'}` };
    }
    counts = roundTripVariable(raw, layout, song);
  }
  base.method = method;
  if (counts.cells === 0) return { ...base, status: 'no-cells' };
  const matchPct = Math.round((counts.exact / counts.cells) * 1e4) / 1e4;
  const byteExact = counts.exact === counts.cells;
  return {
    ...base,
    status: byteExact ? 'byte-exact' : 'lossy',
    cells: counts.cells,
    byteExact,
    matchPct,
  };
}

// ── Run all fixtures once, synchronously before the assertions ────────────────
const results: FormatResult[] = [];
// Formats exercised (their codec was actually round-tripped, case-insensitive).
const exercised = new Set<string>();

const runAll = (async () => {
  for (const entry of ENCODER_FIXTURES) {
    const r = await measure(entry);
    results.push(r);
    if (r.status === 'byte-exact' || r.status === 'lossy') exercised.add(r.formatId.toLowerCase());
  }
})();

function computeUnexercised(): string[] {
  const registered = [...listPatternEncoderFormatIds(), ...listVariableEncoderFormatIds()];
  return registered.filter((id) => !exercised.has(id.toLowerCase())).sort();
}

function readRatchet(): Ratchet {
  return JSON.parse(readFileSync(RATCHET_PATH, 'utf8')) as Ratchet;
}

describe('UADE encoder round-trip harness (real fixtures)', () => {
  // 30s timeout: this harness scans every real fixture — the default 5s trips under
  // full-suite CPU contention even though it runs in <2s isolated.
  it('runs every fixture and prints the result table', async () => {
    await runAll;
    const rows = [...results].sort((a, b) => a.formatId.localeCompare(b.formatId));
    const byteExact = rows.filter((r) => r.status === 'byte-exact').length;
    const lossy = rows.filter((r) => r.status === 'lossy');
    const errored = rows.filter((r) => r.status === 'error' || r.status === 'no-layout' || r.status === 'no-cells');
    const unexercised = computeUnexercised();
    const lines: string[] = [];
    lines.push('');
    lines.push('=== UADE encoder round-trip harness ===');
    for (const r of rows) {
      const pct = (r.matchPct * 100).toFixed(2).padStart(6);
      lines.push(
        `  ${r.status.padEnd(10)} ${pct}%  ${r.method.padEnd(14)} ${r.formatId.padEnd(22)} cells=${String(r.cells).padStart(5)}  ${r.fixture}${r.error ? '  !! ' + r.error : ''}`,
      );
    }
    lines.push('');
    lines.push(`  byte-exact: ${byteExact}   lossy: ${lossy.length}   error/no-layout/no-cells: ${errored.length}   total fixtures: ${rows.length}`);
    lines.push(`  unexercised registered encoders (no fixture): ${unexercised.length}`);
    lines.push(`    ${unexercised.join(', ')}`);
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));

    // Optional ratchet (re)generation.
    if (process.env.DEVILBOX_GEN_RATCHET === '1') {
      const ratchet: Ratchet = { results: {}, unexercisedRegistered: unexercised };
      for (const r of rows) {
        ratchet.results[r.formatId] = {
          kind: r.kind, method: r.method, status: r.status, byteExact: r.byteExact, matchPct: r.matchPct, cells: r.cells,
        };
      }
      writeFileSync(RATCHET_PATH, JSON.stringify(ratchet, null, 2) + '\n');
      // eslint-disable-next-line no-console
      console.log(`[ratchet] wrote ${RATCHET_PATH}`);
    }

    expect(rows.length).toBeGreaterThan(0);
    expect(existsSync(RATCHET_PATH), 'ratchet file must be committed').toBe(true);
  }, 30000);

  it('every fixtures.map entry has a ratchet baseline (no undocumented format)', async () => {
    await runAll;
    const ratchet = readRatchet();
    const missing = results.map((r) => r.formatId).filter((id) => !(id in ratchet.results));
    expect(missing, `add these to the ratchet (regenerate with DEVILBOX_GEN_RATCHET=1): ${missing.join(', ')}`).toEqual([]);
  }, 30000);

  it('no round-trip regression vs the ratchet (byte-exact stays, matchPct only improves)', async () => {
    await runAll;
    const ratchet = readRatchet();
    const regressions: string[] = [];
    for (const r of results) {
      const base = ratchet.results[r.formatId];
      if (!base) continue; // covered by the completeness test above
      if (base.byteExact && !r.byteExact) {
        regressions.push(`${r.formatId}: was byte-exact, now ${r.status} (${(r.matchPct * 100).toFixed(2)}%)`);
        continue;
      }
      // Allow a tiny float tolerance so re-rounding never trips the ratchet.
      if (r.matchPct + 1e-6 < base.matchPct) {
        regressions.push(`${r.formatId}: matchPct dropped ${(base.matchPct * 100).toFixed(2)}% -> ${(r.matchPct * 100).toFixed(2)}%`);
      }
      if ((base.status === 'byte-exact' || base.status === 'lossy') && (r.status === 'error' || r.status === 'no-layout' || r.status === 'no-cells')) {
        regressions.push(`${r.formatId}: was ${base.status}, now ${r.status}`);
      }
    }
    expect(regressions, `round-trip regressions:\n  ${regressions.join('\n  ')}`).toEqual([]);
  }, 30000);

  it('the set of unexercised registered encoders only shrinks', async () => {
    await runAll;
    const ratchet = readRatchet();
    const baseline = new Set(ratchet.unexercisedRegistered);
    const current = computeUnexercised();
    // A NEW unexercised formatId means a codec was registered without a fixture, or a
    // fixture stopped exercising one. Either way, add a fixture or fix wiring.
    const added = current.filter((id) => !baseline.has(id));
    expect(added, `newly-unexercised registered encoders (add a real fixture to fixtures.map.ts): ${added.join(', ')}`).toEqual([]);
  }, 30000);
});
