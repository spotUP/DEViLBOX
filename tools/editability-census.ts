// Census: which corpus songs are truly editable (grid edit reaches export)?
// DOM-bound rows (it/s3m/xm/psm, soundMon/hippelCoSo via Tone): `CENSUS_ONLY=it,s3m nice -n 19 npx vitest run src/lib/export/__tests__/editabilityCensusRows.test.ts --maxWorkers=2` (same env as the exporter tests).
// Usage: nice -n 19 npx tsx --tsconfig tsconfig.app.json tools/editability-census.ts [--only <substr>] [--all] [--failed]
// Default = one song per extension/prefix key (--all = every file, recursive). Results: test-data/editability-census.json (resumable; recorded rows skipped).
// Row: formatId (songFormatId) | registered (EditableFormatRegistry) | exporter route | nonEmpty cells | roundtrip (byte-exact / differs / no-exporter / export-error / parse-error).
// Reuses parseAs + exporters from the exporter round-trip harness. LIMIT: roundtrip is the unedited export; an edit-reaches-export check stays in the per-format *Editable tests.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = 'public/data/songs';
const OUT = path.join(ROOT, 'test-data/editability-census.json');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : process.env.CENSUS_ONLY;
const ALL = args.includes('--all');
const FAILED = args.includes('--failed');

interface Row { file: string; formatId: string; registered: boolean; route: string; cells: number; roundtrip: string; error?: string; diff?: string }

const walk = (d: string): string[] => readdirSync(path.join(ROOT, d)).flatMap((n) => {
  const rel = `${d}/${n}`;
  return statSync(path.join(ROOT, rel)).isDirectory() ? walk(rel) : [rel];
});
// Key: extension, or the Amiga prefix (text before the first dot) when that is a known short prefix.
const keyOf = (rel: string): string => {
  const n = path.basename(rel).toLowerCase();
  const pre = n.split('.')[0];
  return n.includes('.') && pre.length <= 5 ? `${pre}.` : n.split('.').pop() ?? n;
};

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

export async function measure(rel: string): Promise<Row> {
  const { parseAs, readFixture, runDescriptorExporter, invokeLayoutExport, normalizeExport } = await import('../src/lib/export/__tests__/exporterHarness.shared');
  const { songFormatId, getEditableFormat } = await import('../src/lib/formats/EditableFormatRegistry');
  await import('../src/lib/formats/EditableFormatRegistry.builtins');
  const { LAYOUT_EXPORTERS } = await import('../src/lib/export/nativeExportRouter');
  const base: Row = { file: rel, formatId: '', registered: false, route: 'none', cells: 0, roundtrip: 'parse-error' };
  let raw: Uint8Array;
  let song;
  try { raw = readFixture(rel); song = await parseAs(rel, raw); } catch (e) { return { ...base, error: String((e as Error).message).slice(0, 120) }; }
  const formatId = songFormatId(song);
  const d = formatId ? getEditableFormat(formatId) : undefined;
  const cells = song.patterns.reduce((n, p) => n + p.channels.reduce((m, c) => m + c.rows.filter((r) => r.note || r.instrument || r.effTyp || r.eff).length, 0), 0);
  const row: Row = { ...base, formatId, registered: !!d, cells, roundtrip: 'no-exporter' };
  try {
    let out: Uint8Array | undefined;
    if (d?.exporter) { row.route = 'descriptor'; out = await runDescriptorExporter(d, song); }
    else if (formatId && LAYOUT_EXPORTERS[formatId]) { row.route = 'layout'; out = await invokeLayoutExport(formatId, song); }
    else {
      const { exportNativeSong } = await import('../src/lib/export/nativeExportRouter'); // the app's own dispatch (Hively, FC, MED ...)
      const r = await exportNativeSong(song);
      if (r) { row.route = 'native'; out = await normalizeExport(r); }
    }
    if (out) {
      if (process.env.CENSUS_DUMP) writeFileSync(path.join(process.env.CENSUS_DUMP, `${path.basename(rel)}.export`), out);
      row.roundtrip = same(out, raw) ? 'byte-exact' : 'differs';
      if (row.roundtrip === 'differs') { let i = 0; while (i < out.length && i < raw.length && out[i] === raw[i]) i++; row.diff = `first diff at 0x${i.toString(16)} (export ${out.length} B, original ${raw.length} B)`; }
    }
  } catch (e) { row.roundtrip = 'export-error'; row.error = String((e as Error).message).slice(0, 120); }
  return row;
}

export async function main() {
  const rows: Record<string, Row> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
  let files = walk(DIR).sort();
  if (!ALL) { const seen = new Set<string>(); files = files.filter((f) => { const k = keyOf(f); if (seen.has(k)) return false; seen.add(k); return true; }); }
  if (only) files = files.filter((f) => only.split(',').some((o) => f.includes(o)));
  if (FAILED) files = files.filter((f) => rows[f] && !['byte-exact'].includes(rows[f].roundtrip));
  console.log(`${files.length} songs (${ALL ? 'all' : 'one per key'})`);
  mkdirSync(path.dirname(OUT), { recursive: true });
  for (const f of files) {
    if (rows[f] && !only && !FAILED) continue;
    rows[f] = await measure(f);
    writeFileSync(OUT, JSON.stringify(rows, null, 1));
  }
  const v = Object.values(rows);
  const c = (k: string) => v.filter((r) => r.roundtrip === k).length;
  console.log(`rows ${v.length}: byte-exact ${c('byte-exact')}, differs ${c('differs')}, no-exporter ${c('no-exporter')}, export-error ${c('export-error')}, parse-error ${c('parse-error')}`);
}
// Under vitest (CENSUS_VITEST=1) the importing test runs main() inside the app's happy-dom env; DOM/Tone exporters need it.
if (!process.env.VITEST) main().then(() => process.exit(0));
