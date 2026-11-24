/**
 * Edit round-trip over every byte-exact exporter row of exporterRoundtrip.ratchet.json:
 * parse the fixture, edit one cell (note, else instrument), export through the same direct
 * entry the ratchet harness uses, reparse, and assert the edit reads back. Also records
 * whether any byte outside the cell's file slot changed (slotClean, informational).
 *
 * Verdicts live in exporterEditRoundtrip.ratchet.json: pass | fail | no-edit-path.
 * The test fails only when a recorded pass row regresses. Regenerate:
 * Single rows: ROW=id1,id2 (module-level measure, -t does not filter).
 *   DEVILBOX_GEN_RATCHET=1 npx vitest run src/lib/export/__tests__/exporterEditRoundtrip.test.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { TrackerSong } from '@engine/TrackerReplayer';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';
import { sharedCellEdits } from '@/lib/song/sharedCellEdits';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';
import { useFormatStore } from '@/stores/useFormatStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { editHivelyCell } from '@/components/hively/hivelyEdit';
import { LAYOUT_EXPORTERS } from '../nativeExportRouter';
import { installWasmNodeFetches } from '@lib/import/__tests__/helpers/dwNodeFetch';
import { readFixture, parseAs, invokeLayoutExport, invokeNamedExport } from './exporterHarness.shared';
import { LAYOUT_FIXTURES, NAMED_EXPORTERS } from './exporterFixtures.map';

const DIR = join(process.cwd(), 'src/lib/export/__tests__');
const OWN_RATCHET = join(DIR, 'exporterEditRoundtrip.ratchet.json');

type Verdict = 'pass' | 'fail' | 'no-edit-path';
interface Row { verdict: Verdict; edited: 'note' | 'instrument' | 'none'; slotClean: boolean | null; detail: string }

const base = JSON.parse(readFileSync(join(DIR, 'exporterRoundtrip.ratchet.json'), 'utf8')) as {
  results: Record<string, { status: string }>;
};
const ids = Object.entries(base.results).filter(([, v]) => v.status === 'byte-exact').map(([k]) => k).filter((k) => !process.env.ROW || process.env.ROW.split(',').includes(k)).sort();
const fixtureOf = (id: string): string | undefined =>
  id in LAYOUT_EXPORTERS ? LAYOUT_FIXTURES[id] : NAMED_EXPORTERS.find((n) => n.id === id)?.fixture;

/** Grid notes 1..96 are pitches; 97 is note-off. */
const isPitch = (n: number): boolean => n >= 1 && n <= 96;

function pickCell(song: TrackerSong): [number, number, number] | undefined {
  const layout = song.uadePatternLayout;
  let fallback: [number, number, number] | undefined;
  for (let p = 0; p < song.patterns.length; p++)
    for (let c = 0; c < song.patterns[p].channels.length; c++)
      for (let r = 0; r < song.patterns[p].channels[c].rows.length; r++) {
        if (!layout) return [p, r, c];
        const off = getCellFileOffset(layout, p, r, c);
        if (off >= 0) {
          if (song.patterns[p].channels[c].rows[r].note === 0) return [p, r, c];
          fallback ??= [p, r, c];
        }
      }
  return fallback;
}

async function measure(id: string): Promise<Row> {
  const fx = fixtureOf(id);
  const none = (verdict: Verdict, detail: string): Row => ({ verdict, edited: 'none', slotClean: null, detail });
  if (!fx) return none('no-edit-path', 'no fixture');
  let raw: Uint8Array, song: TrackerSong;
  try { raw = readFixture(fx); song = await parseAs(fx, raw); } catch (e) { return none('fail', `parse: ${(e as Error).message}`); }
  setGridBaseline(baselineOf(song.patterns));
  const pos = pickCell(song);
  if (!pos) return none('no-edit-path', 'no cell with a file offset');
  let last: Row = none('fail', '');
  // The first cell is often an empty row of a voice that holds no instrument yet, which cannot take a note;
  // the first row that already has a note is tried too.
  // Cells that already hold a note are tried too (up to 40, spread over the song): a stream byte shared by several cells or an
  // instrument with a narrow note range rejects a single probe, and one storable cell is enough to show the edit path works.
  const noted = ((): [number, number, number][] => {
    const all: [number, number, number][] = [];
    for (let p = 0; p < song.patterns.length; p++) for (let c = 0; c < song.patterns[p].channels.length; c++)
      for (let r = 0; r < song.patterns[p].channels[c].rows.length; r++)
        if (isPitch(song.patterns[p].channels[c].rows[r].note) && (!song.uadePatternLayout || getCellFileOffset(song.uadePatternLayout, p, r, c) >= 0)) all.push([p, r, c]);
    const step = Math.max(1, Math.floor(all.length / 40));
    return all.filter((_, i) => i % step === 0).slice(0, 40);
  })();
  for (const [p, r, c] of [pos, ...noted]) {
    const layout = song.uadePatternLayout;
    const off = layout ? getCellFileOffset(layout, p, r, c) : -1;
    const slot = layout?.bytesPerCell ?? 0;
    // Each format's note table covers a different range (ProTracker 13..48, TCB 52..87), so several probe notes follow.
    // A note one step off the stored one is the likeliest to stay inside a format's table, so the neighbours follow.
    const here = isPitch(song.patterns[p].channels[c].rows[r].note) ? song.patterns[p].channels[c].rows[r].note : 0;
    const tries: (readonly ['note' | 'instrument', number])[] = [['note', 49], ['note', 25], ['note', 61], ...(here ? [['note', here + 1], ['note', here - 1]] as const : []), ['instrument', 3]];
    for (const [field, probe] of tries) {
      const fresh = await parseAs(fx, raw);
      setGridBaseline(baselineOf(fresh.patterns));
      const orig = fresh.patterns[p].channels[c].rows[r];
      const nv = orig[field] === probe ? probe + 1 : probe;
      if (fresh.hivelyNative) {
        // Hively keeps a native store the exporter reads; the app edits it through editHivelyCell, so the probe does too.
        useFormatStore.setState({ hivelyNative: structuredClone(fresh.hivelyNative) });
        useTrackerStore.setState({ patterns: structuredClone(fresh.patterns), currentPatternIndex: 0 });
        editHivelyCell(p, c, r, field, nv);
        fresh.hivelyNative = useFormatStore.getState().hivelyNative!;
      } else {
        const before = structuredClone(fresh.patterns[p]);
        fresh.patterns[p].channels[c].rows[r] = { ...orig, [field]: nv };
        // The editor moves every cell that plays one stored cell together (propagateSharedCells); the probe does the same.
        const vl = fresh.uadeVariableLayout;
        if (vl) for (const e of sharedCellEdits(vl, p, before, fresh.patterns[p], fresh.patterns)) Object.assign(fresh.patterns[e.pattern].channels[e.channel].rows[e.row], e.values);
      }
      let out: Uint8Array;
      try { out = id in LAYOUT_EXPORTERS ? await invokeLayoutExport(id, fresh) : await invokeNamedExport(id, fresh); }
      catch (e) { last = { verdict: 'fail', edited: field, slotClean: null, detail: `export: ${(e as Error).message}` }; continue; }
      let slotClean: boolean | null = null;
      if (off >= 0 && out.length === raw.length) {
        slotClean = true;
        for (let i = 0; i < raw.length; i++) if (raw[i] !== out[i] && (i < off || i >= off + slot)) { slotClean = false; break; }
      }
      try {
        const re = await parseAs(fx, out);
        const got = re.patterns[p]?.channels[c]?.rows[r];
        if (got && got[field] === nv) return { verdict: 'pass', edited: field, slotClean, detail: '' };
        last = { verdict: 'fail', edited: field, slotClean, detail: `${field} read back ${got?.[field]} want ${nv}${out.length === raw.length && out.every((b, i) => b === raw[i]) ? ' (bytes unchanged)' : ''}` };
      } catch (e) { last = { verdict: 'fail', edited: field, slotClean, detail: `reparse: ${(e as Error).message}` }; }
    }
  }
  return last;
}

const results: Record<string, Row> = {};
// benDaglish and davidWhittaker draw their grid from a WASM walk at import; without these bundles the parse falls back to an empty scope view.
installWasmNodeFetches([['bd', 'Bd'], ['davidwhittaker', 'DavidWhittaker']]);
const runAll = (async () => { for (const id of ids) results[id] = await measure(id); })();

describe('exporter edit round-trip (byte-exact rows)', () => {
  it('measures every byte-exact row', async () => {
    await runAll;
    if (process.env.DEVILBOX_GEN_RATCHET === '1') writeFileSync(OWN_RATCHET, JSON.stringify({ results }, null, 2) + '\n');
    const n = (v: Verdict) => Object.values(results).filter((r) => r.verdict === v).length;
    console.log(`edit-roundtrip pass=${n('pass')} fail=${n('fail')} no-edit-path=${n('no-edit-path')} total=${ids.length}`);
    expect(ids.length).toBeGreaterThan(0);
  }, 900000);

  it('no pass row regresses', async () => {
    await runAll;
    const rec = JSON.parse(readFileSync(OWN_RATCHET, 'utf8')) as { results: Record<string, Row> };
    const reg = Object.entries(rec.results).filter(([id, r]) => r.verdict === 'pass' && results[id]?.verdict !== 'pass').map(([id]) => `${id}: ${results[id]?.detail}`);
    expect(reg).toEqual([]);
  }, 900000);
});
