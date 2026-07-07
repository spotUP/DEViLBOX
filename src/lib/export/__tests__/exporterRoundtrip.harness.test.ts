/**
 * Mass EXPORTER round-trip harness (Phase 1, Task 1.2).
 *
 * ~55 dedicated exporters in src/lib/export/*Exporter.ts (enumerated from the dispatch
 * tables in src/lib/export/nativeExportRouter.ts: the LAYOUT_EXPORTERS map + the
 * named-format branches) claim to serialize an edited song back to its native format. That
 * claim was unverified for all but SynTracker + a couple of note-match tests. This harness
 * parses a real committed fixture for each exporter, calls the exporter fn DIRECTLY (the
 * SynTracker/export-roundtrip reference model — measuring the serializer itself, not the
 * router's headless routing), then measures how faithfully the bytes round-trip, and locks
 * the result behind a committed ratchet.
 *
 * Why direct-call, not exportNativeSong: the router dispatches on song.format / layout tags
 * and, for chip-RAM formats, needs a LIVE UADE engine (readEditedModule) that does not exist
 * in a headless test. Driving the router headlessly would record "router did not route" as
 * if the exporter were broken. Calling the exporter fn directly attributes each measurement
 * to one serializer.
 *
 * Two honest tiers, chosen automatically per format and recorded:
 *   - byte-exact  : the exported bytes are identical to the original fixture bytes. This is
 *                   the exit bar for deterministic 1:1 serializers (SynTracker model).
 *   - pattern-data: not byte-identical (a bake / re-serialization) — re-parse the exported
 *                   bytes and compare pattern cells (note/instrument/effTyp/eff) to the
 *                   original song's cells. matchPct = matched cells / comparable cells.
 *
 * The harness NEVER fixes a lossy exporter (that is Phase 3). It measures and locks:
 * exporterRoundtrip.ratchet.json asserts no regression — a byte-exact format stays
 * byte-exact, a matchPct may only improve, an error may only heal, and the missing-fixture
 * set may only shrink.
 *
 * Regenerate the ratchet after a legitimate improvement (review the diff before committing):
 *   DEVILBOX_GEN_RATCHET=1 npx vitest run --config vite.config.ts \
 *     src/lib/export/__tests__/exporterRoundtrip.harness.test.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { TrackerSong } from '@engine/TrackerReplayer';
import type { TrackerCell } from '@/types';
import { detectFormat } from '@lib/import/FormatRegistry';
import { LAYOUT_EXPORTERS } from '../nativeExportRouter';
import { LAYOUT_FIXTURES, NAMED_EXPORTERS, type NamedExporterTarget } from './exporterFixtures.map';

const ROOT = process.cwd();
const RATCHET_PATH = join(ROOT, 'src/lib/export/__tests__/exporterRoundtrip.ratchet.json');

type Tier = 'byte-exact' | 'pattern-data';
type Status =
  | 'byte-exact' // bytes identical to the fixture
  | 'pattern-match' // re-parsed cells compared (matchPct)
  | 'reparse-error' // export produced bytes but they would not re-parse
  | 'export-error' // exporter threw / returned null
  | 'parse-error' // the fixture itself would not parse (harness cannot feed the exporter)
  | 'store-dependent' // exporter reads live stores/engine, not the passed song — NOT
  //                     headless-measurable (works in-app). Documented, not an error.
  | 'missing-fixture'; // no committed fixture for this exporter

interface ExporterTarget {
  /** Stable ratchet key. */
  id: string;
  /** layout = LAYOUT_EXPORTERS map; named = a named-format router branch. */
  kind: 'layout' | 'named';
  /** Which exporter / router branch this row exercises. */
  exporter: string;
  /** Committed fixture path, or undefined => missing-fixture. */
  fixture?: string;
  /** Store-dependent exporter (reads live zustand stores, not the passed song). */
  storeDependent?: boolean;
}

interface FormatResult {
  id: string;
  exporter: string;
  fixture: string;
  tier: Tier;
  status: Status;
  /** cells compared (pattern-data) or bytes (byte-exact). */
  cells: number;
  bytes: number;
  matchPct: number; // 0..1, 4 decimals
  error?: string;
}

interface RatchetEntry {
  exporter: string;
  tier: Tier;
  status: Status;
  matchPct: number;
  cells: number;
  bytes: number;
}
interface Ratchet {
  results: Record<string, RatchetEntry>;
  /** Exporter ids with no committed fixture. May only shrink. */
  missingFixture: string[];
}

// Ordered rank so the ratchet can assert a status never regresses to a worse one.
const STATUS_RANK: Record<Status, number> = {
  'byte-exact': 5,
  'pattern-match': 4,
  'reparse-error': 3,
  'export-error': 2,
  // store-dependent is a terminal "not-measurable, documented" state, not an error to
  // heal past. Ranked alongside export-error so flipping export-error -> store-dependent
  // (once we recognise the exporter is engine-coupled, not broken) is not a regression.
  'store-dependent': 2,
  'parse-error': 1,
  'missing-fixture': 0,
};

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function readFixture(rel: string): Uint8Array {
  const b = readFileSync(join(ROOT, rel));
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
}

/**
 * Direct parsers for prefix-detected UADE formats whose extension FormatRegistry does not
 * map to a nativeParser (they route through the UADE `<prefix>.` matcher at runtime). Keyed
 * by the fixture's file extension. Each is a real TS parser under src/lib/import/formats.
 */
const PARSE_FALLBACK: Record<string, { module: string; fn: string }> = {
  ast: { module: '@lib/import/formats/ActionamicsParser', fn: 'parseActionamicsFile' },
  digi: { module: '@lib/import/formats/DigiBoosterParser', fn: 'parseDigiBoosterFile' },
  is: { module: '@lib/import/formats/InStereo1Parser', fn: 'parseInStereo1File' },
  mmd0: { module: '@lib/import/formats/MEDParser', fn: 'parseMEDFile' },
  okta: { module: '@lib/import/formats/OktalyzerParser', fn: 'parseOktalyzerFile' },
  prt: { module: '@lib/import/formats/PreTrackerParser', fn: 'parsePreTrackerFile' },
  synmod: { module: '@lib/import/formats/SynTrackerParser', fn: 'parseSynTrackerFile' },
};

/** Parse a fixture (or exported bytes under the fixture's name). */
async function parseAs(rel: string, raw: Uint8Array): Promise<TrackerSong> {
  const name = rel.split('/').pop() ?? rel;
  const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  const fmt = detectFormat(name);
  let module: string | undefined;
  let parseFn: string | undefined;
  if (fmt?.nativeParser?.parseFn) {
    module = fmt.nativeParser.module;
    parseFn = fmt.nativeParser.parseFn;
  } else {
    const ext = (name.split('.').pop() ?? '').toLowerCase();
    const fb = PARSE_FALLBACK[ext];
    if (!fb) throw new Error(`no native parser for ${name}`);
    module = fb.module;
    parseFn = fb.fn;
  }
  const mod = (await import(/* @vite-ignore */ module)) as Record<string, unknown>;
  const fn = mod[parseFn];
  if (typeof fn !== 'function') throw new Error(`parseFn ${parseFn} missing`);
  const parse = fn as (b: ArrayBuffer | Uint8Array, n: string) => TrackerSong | null | Promise<TrackerSong | null>;
  // Parsers disagree on arg type: some want ArrayBuffer, some Uint8Array. A parser handed
  // the wrong one often returns null (not throw), so try BOTH forms and take the first
  // non-null result rather than stopping at the first null.
  let song: TrackerSong | null = null;
  for (const arg of [ab, raw]) {
    try {
      song = await Promise.resolve(parse(arg, name));
    } catch {
      song = null;
    }
    if (song) break;
  }
  if (!song) throw new Error(`parser ${parseFn} returned null for ${name}`);
  return song;
}

// ── Direct exporter invocation ─────────────────────────────────────────────────

type ExportOut = Uint8Array | ArrayBuffer | Blob | { data: Uint8Array | ArrayBuffer | Blob } | { blob: Blob };

async function normalizeExport(raw: ExportOut): Promise<Uint8Array> {
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (raw instanceof Blob) return new Uint8Array(await raw.arrayBuffer());
  if ('data' in raw) return normalizeExport(raw.data);
  if ('blob' in raw) return normalizeExport(raw.blob);
  throw new Error('unrecognized exporter output shape');
}

/** Invoke the LAYOUT_EXPORTERS serializer for a layout-keyed format. */
async function invokeLayoutExport(id: string, song: TrackerSong): Promise<Uint8Array> {
  const entry = LAYOUT_EXPORTERS[id];
  const mod = (await import(/* @vite-ignore */ `../${entry.module}`)) as Record<string, unknown>;
  const fn = mod[entry.fn];
  if (typeof fn !== 'function') throw new Error(`exporter ${entry.module}.${entry.fn} missing`);
  return normalizeExport((await (fn as (s: TrackerSong) => ExportOut | Promise<ExportOut>)(song)) as ExportOut);
}

/** Invoke a named-format serializer with its real call signature. */
async function invokeNamedExport(id: string, song: TrackerSong): Promise<Uint8Array> {
  switch (id) {
    case 'jamCracker': {
      const { exportAsJamCracker } = await import('../JamCrackerExporter');
      return normalizeExport(await exportAsJamCracker(song));
    }
    case 'soundMon': {
      const { exportAsSoundMon } = await import('../SoundMonExporter');
      return normalizeExport(await exportAsSoundMon(song));
    }
    case 'synTracker': {
      const { exportSynTrackerFile } = await import('../SynTrackerExporter');
      return normalizeExport(exportSynTrackerFile(song));
    }
    case 'mod': {
      const { exportSongToMOD } = await import('../modExport');
      return normalizeExport(await exportSongToMOD(song, { bakeSynths: true }));
    }
    case 'fc': {
      const { exportFC } = await import('../FCExporter');
      return normalizeExport(exportFC(song));
    }
    case 'sidMon2': {
      const { exportSidMon2File } = await import('../SidMon2Exporter');
      return normalizeExport(await exportSidMon2File(song));
    }
    case 'pumaTracker': {
      const { exportPumaTrackerFile } = await import('../PumaTrackerExporter');
      return normalizeExport(exportPumaTrackerFile(song));
    }
    case 'octaMED': {
      const { exportMED } = await import('../MEDExporter');
      return normalizeExport(exportMED(song));
    }
    case 'hivelyHVL': {
      const { exportAsHively } = await import('../HivelyExporter');
      return normalizeExport(exportAsHively(song, { format: 'hvl', nativeOverride: song.hivelyNative ?? undefined }));
    }
    case 'hivelyAHX': {
      const { exportAsHively } = await import('../HivelyExporter');
      return normalizeExport(exportAsHively(song, { format: 'ahx', nativeOverride: song.hivelyNative ?? undefined }));
    }
    case 'digiBooster': {
      const { exportDigiBooster } = await import('../DigiBoosterExporter');
      return normalizeExport(exportDigiBooster(song));
    }
    case 'oktalyzer': {
      const { exportOktalyzer } = await import('../OktalyzerExporter');
      return normalizeExport(exportOktalyzer(song));
    }
    case 'klystrack': {
      const { exportAsKlystrack } = await import('../KlysExporter');
      return normalizeExport(await exportAsKlystrack(song));
    }
    case 'inStereo1': {
      const { exportInStereo1 } = await import('../InStereo1Exporter');
      return normalizeExport(await exportInStereo1(song));
    }
    case 'symphoniePro': {
      const { exportSymphonieProFile } = await import('../SymphonieProExporter');
      return normalizeExport(exportSymphonieProFile(song));
    }
    case 'preTracker':
      // exportAsPreTracker(baseName) serializes from live zustand stores, not the passed
      // song — not measurable in a headless parse->export harness. Recorded honestly.
      throw new Error('store-dependent exporter (reads live stores, not the parsed song)');
    default:
      throw new Error(`no invocation mapping for named exporter '${id}'`);
  }
}

/** Whole-cell (note/instrument/effTyp/eff) match over the overlap of two songs. */
function comparePatternCells(a: TrackerSong, b: TrackerSong): { cells: number; matched: number } {
  let cells = 0;
  let matched = 0;
  const pN = Math.min(a.patterns.length, b.patterns.length);
  for (let p = 0; p < pN; p++) {
    const ap = a.patterns[p];
    const bp = b.patterns[p];
    if (!ap || !bp) continue;
    const cN = Math.min(ap.channels.length, bp.channels.length);
    for (let c = 0; c < cN; c++) {
      const ar = ap.channels[c]?.rows ?? [];
      const br = bp.channels[c]?.rows ?? [];
      const rN = Math.min(ar.length, br.length);
      for (let r = 0; r < rN; r++) {
        const x = ar[r] as TrackerCell | undefined;
        const y = br[r] as TrackerCell | undefined;
        if (!x || !y) continue;
        cells++;
        if (x.note === y.note && x.instrument === y.instrument && x.effTyp === y.effTyp && x.eff === y.eff) {
          matched++;
        }
      }
    }
  }
  return { cells, matched };
}

async function measure(t: ExporterTarget): Promise<FormatResult> {
  const base: FormatResult = {
    id: t.id, exporter: t.exporter, fixture: t.fixture ?? '(none)',
    tier: 'pattern-data', status: 'export-error', cells: 0, bytes: 0, matchPct: 0,
  };
  if (!t.fixture) return { ...base, status: 'missing-fixture', tier: 'pattern-data' };
  // Store/engine-dependent exporters read live zustand stores or a running WASM engine,
  // not the passed song, so a headless parse->export harness cannot exercise them. Record
  // that honestly rather than as an export-error (they work in-app).
  if (t.storeDependent) return { ...base, status: 'store-dependent', tier: 'pattern-data' };

  let raw: Uint8Array;
  let song: TrackerSong;
  try {
    raw = readFixture(t.fixture);
    song = await parseAs(t.fixture, raw);
  } catch (e) {
    return { ...base, status: 'parse-error', error: `parse: ${(e as Error).message}` };
  }

  let exported: Uint8Array;
  try {
    exported = t.kind === 'layout' ? await invokeLayoutExport(t.id, song) : await invokeNamedExport(t.id, song);
  } catch (e) {
    return { ...base, status: 'export-error', error: `export: ${(e as Error).message}` };
  }

  // Tier 1: byte-exact vs the original file.
  if (bytesEqual(exported, raw)) {
    return { ...base, tier: 'byte-exact', status: 'byte-exact', bytes: exported.length, cells: exported.length, matchPct: 1 };
  }

  // Tier 2: re-parse the exported bytes and compare pattern cells to the original song.
  let reparsed: TrackerSong;
  try {
    reparsed = await parseAs(t.fixture, exported);
  } catch (e) {
    return { ...base, tier: 'pattern-data', status: 'reparse-error', bytes: exported.length, error: `reparse: ${(e as Error).message}` };
  }
  const { cells, matched } = comparePatternCells(song, reparsed);
  if (cells === 0) {
    return { ...base, tier: 'pattern-data', status: 'reparse-error', bytes: exported.length, error: 'no comparable cells after reparse' };
  }
  const matchPct = Math.round((matched / cells) * 1e4) / 1e4;
  return { ...base, tier: 'pattern-data', status: 'pattern-match', bytes: exported.length, cells, matchPct };
}

// ── Build the exporter target list from the router (single source of truth) ────
function buildTargets(): ExporterTarget[] {
  const targets: ExporterTarget[] = [];
  // 1) LAYOUT_EXPORTERS map — every layoutFormatId-keyed dedicated exporter.
  for (const [id, entry] of Object.entries(LAYOUT_EXPORTERS)) {
    targets.push({ id, kind: 'layout', exporter: `${entry.module}.${entry.fn}`, fixture: LAYOUT_FIXTURES[id] });
  }
  // 2) Named-format router branches.
  for (const n of NAMED_EXPORTERS as NamedExporterTarget[]) {
    targets.push({ id: n.id, kind: 'named', exporter: n.label, fixture: n.fixture, storeDependent: n.storeDependent });
  }
  return targets;
}

// ── Run everything once before the assertions ──────────────────────────────────
const targets = buildTargets();
const results: FormatResult[] = [];
const runAll = (async () => {
  for (const t of targets) results.push(await measure(t));
})();

function computeMissingFixture(): string[] {
  return results.filter((r) => r.status === 'missing-fixture').map((r) => r.id).sort();
}

function readRatchet(): Ratchet {
  return JSON.parse(readFileSync(RATCHET_PATH, 'utf8')) as Ratchet;
}

describe('UADE exporter round-trip harness (real fixtures)', () => {
  it('runs every exporter and prints the result table', async () => {
    await runAll;
    const rows = [...results].sort((a, b) => a.id.localeCompare(b.id));
    const byteExact = rows.filter((r) => r.status === 'byte-exact').length;
    const patternMatch = rows.filter((r) => r.status === 'pattern-match');
    const errored = rows.filter((r) => r.status === 'reparse-error' || r.status === 'export-error' || r.status === 'parse-error');
    const missing = rows.filter((r) => r.status === 'missing-fixture');
    const lines: string[] = [''];
    lines.push('=== UADE exporter round-trip harness ===');
    for (const r of rows) {
      const pct = (r.matchPct * 100).toFixed(2).padStart(6);
      lines.push(
        `  ${r.status.padEnd(15)} ${pct}%  ${r.tier.padEnd(12)} ${r.id.padEnd(18)} cells=${String(r.cells).padStart(6)} bytes=${String(r.bytes).padStart(7)}  ${r.exporter}${r.error ? '  !! ' + r.error : ''}`,
      );
    }
    lines.push('');
    lines.push(`  byte-exact: ${byteExact}   pattern-match: ${patternMatch.length}   error: ${errored.length}   missing-fixture: ${missing.length}   total: ${rows.length}`);
    if (missing.length) lines.push(`  missing-fixture ids: ${missing.map((r) => r.id).join(', ')}`);
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));

    if (process.env.DEVILBOX_GEN_RATCHET === '1') {
      const ratchet: Ratchet = { results: {}, missingFixture: computeMissingFixture() };
      for (const r of rows) {
        ratchet.results[r.id] = {
          exporter: r.exporter, tier: r.tier, status: r.status, matchPct: r.matchPct, cells: r.cells, bytes: r.bytes,
        };
      }
      writeFileSync(RATCHET_PATH, JSON.stringify(ratchet, null, 2) + '\n');
      // eslint-disable-next-line no-console
      console.log(`[ratchet] wrote ${RATCHET_PATH}`);
    }

    expect(rows.length).toBeGreaterThan(0);
    expect(existsSync(RATCHET_PATH), 'ratchet file must be committed').toBe(true);
  }, 120000);

  it('every target has a ratchet baseline (no undocumented exporter)', async () => {
    await runAll;
    const ratchet = readRatchet();
    const missing = results.map((r) => r.id).filter((id) => !(id in ratchet.results));
    expect(missing, `add these to the ratchet (regenerate with DEVILBOX_GEN_RATCHET=1): ${missing.join(', ')}`).toEqual([]);
  }, 120000);

  it('no round-trip regression vs the ratchet (byte-exact stays, matchPct only improves)', async () => {
    await runAll;
    const ratchet = readRatchet();
    const regressions: string[] = [];
    for (const r of results) {
      const base = ratchet.results[r.id];
      if (!base) continue; // covered by the completeness test above
      if (base.status === 'byte-exact' && r.status !== 'byte-exact') {
        regressions.push(`${r.id}: was byte-exact, now ${r.status} (${(r.matchPct * 100).toFixed(2)}%)`);
        continue;
      }
      if (STATUS_RANK[r.status] < STATUS_RANK[base.status]) {
        regressions.push(`${r.id}: status regressed ${base.status} -> ${r.status}`);
        continue;
      }
      // Only enforce matchPct within the same tier (byte-exact has no partial pct).
      if (base.tier === 'pattern-data' && r.tier === 'pattern-data' && base.status === 'pattern-match' && r.status === 'pattern-match') {
        if (r.matchPct + 1e-6 < base.matchPct) {
          regressions.push(`${r.id}: matchPct dropped ${(base.matchPct * 100).toFixed(2)}% -> ${(r.matchPct * 100).toFixed(2)}%`);
        }
      }
    }
    expect(regressions, `exporter round-trip regressions:\n  ${regressions.join('\n  ')}`).toEqual([]);
  }, 120000);

  it('the set of missing-fixture exporters only shrinks', async () => {
    await runAll;
    const ratchet = readRatchet();
    const baseline = new Set(ratchet.missingFixture);
    const current = computeMissingFixture();
    const added = current.filter((id) => !baseline.has(id));
    expect(added, `newly-missing exporter fixtures (add a committed real fixture): ${added.join(', ')}`).toEqual([]);
  }, 120000);
});
