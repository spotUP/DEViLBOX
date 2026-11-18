/**
 * Edit round-trip over every byte-exact exporter row of exporterRoundtrip.ratchet.json:
 * parse the fixture, edit one cell (note, else instrument), export through the same direct
 * entry the ratchet harness uses, reparse, and assert the edit reads back. Also records
 * whether any byte outside the cell's file slot changed (slotClean, informational).
 *
 * Verdicts live in exporterEditRoundtrip.ratchet.json: pass | fail | no-edit-path.
 * The test fails only when a recorded pass row regresses. Regenerate:
 *   DEVILBOX_GEN_RATCHET=1 npx vitest run src/lib/export/__tests__/exporterEditRoundtrip.test.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { TrackerSong } from '@engine/TrackerReplayer';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';
import { LAYOUT_EXPORTERS } from '../nativeExportRouter';
import { readFixture, parseAs, invokeLayoutExport, invokeNamedExport } from './exporterHarness.shared';
import { LAYOUT_FIXTURES, NAMED_EXPORTERS } from './exporterFixtures.map';

const DIR = join(process.cwd(), 'src/lib/export/__tests__');
const OWN_RATCHET = join(DIR, 'exporterEditRoundtrip.ratchet.json');

type Verdict = 'pass' | 'fail' | 'no-edit-path';
interface Row { verdict: Verdict; edited: 'note' | 'instrument' | 'none'; slotClean: boolean | null; detail: string }

const base = JSON.parse(readFileSync(join(DIR, 'exporterRoundtrip.ratchet.json'), 'utf8')) as {
  results: Record<string, { status: string }>;
};
const ids = Object.entries(base.results).filter(([, v]) => v.status === 'byte-exact').map(([k]) => k).sort();
const fixtureOf = (id: string): string | undefined =>
  id in LAYOUT_EXPORTERS ? LAYOUT_FIXTURES[id] : NAMED_EXPORTERS.find((n) => n.id === id)?.fixture;

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
  const [p, r, c] = pos;
  const layout = song.uadePatternLayout;
  const off = layout ? getCellFileOffset(layout, p, r, c) : -1;
  const slot = layout?.bytesPerCell ?? 0;
  const cell = song.patterns[p].channels[c].rows[r];
  let last: Row = none('fail', '');
  for (const field of ['note', 'instrument'] as const) {
    const fresh = await parseAs(fx, raw);
    setGridBaseline(baselineOf(fresh.patterns));
    const orig = fresh.patterns[p].channels[c].rows[r];
    const nv = field === 'note' ? (orig.note === 49 ? 50 : 49) : (orig.instrument === 3 ? 4 : 3);
    fresh.patterns[p].channels[c].rows[r] = { ...orig, [field]: nv };
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
  void cell;
  return last;
}

const results: Record<string, Row> = {};
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
