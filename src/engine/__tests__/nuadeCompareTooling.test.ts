/**
 * NC-1..NC-4: the comparison tooling (tools/nuade/). The pass rule (D8), the dual rule (DN-1), the resumable batch, the
 * instrument check against the two songs whose answer is known, and the verdicts written for the table.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  THRESHOLDS, endAgrees, songFailures, replaceVerdict, dualDefault, type SongMeasure,
} from '../../../tools/nuade/verdictRules';
import { runBatch, pendingJobs, loadResults, emptyResults, type Job, type ResultsFile, type ResultRow } from '../../../tools/nuade/batch';
import { bestLagCorrelation, envelope20, songEndOf, compareSong, renderNuade } from '../../../tools/nuade/nuadeCompare';
import { computeVerdicts, render } from '../../../tools/nuade/apply-verdicts';
import { rolledOutRows } from '../../../tools/nuade/rollout';
import { instrumentCheck, wasmSha, RESULTS_PATH } from '../../../tools/nuade/compare-batch';
import { NuadeHeadless } from '../nuade/nuadeHeadless';
import { NUADE_FORMATS } from '../nuade/nuadeFormats';

const song = (over: Partial<SongMeasure> = {}): SongMeasure => ({
  song: 'public/data/songs/formats/a.x', peak: 0.5, rms: 0.1, correlation: 0.98, lagMs: -20, uadeEndAt: -1, nuadeEndAt: -1, ...over,
});

describe('NC-4 the replace pass rule (D8)', () => {
  it('passes a song that is audible, correlates, and plays on where UADE plays on', () => {
    expect(songFailures(song())).toEqual([]);
    expect(replaceVerdict({ songs: [song(), song({ correlation: 0.96 })], liveEditToday: false, swapMs: null })).toMatchObject({ pass: true, endAgrees: true });
  });

  it('(a) a silent or erroring render fails', () => {
    expect(songFailures(song({ peak: 0.04 })).join()).toContain('peak');
    expect(songFailures(song({ rms: 0.01 })).join()).toContain('RMS');
    expect(songFailures(song({ error: 'nuade open failed (-2)' })).join()).toContain('nuade open failed');
  });

  it('(b) the mean must reach 0.95 and no song may fall under 0.90', () => {
    expect(replaceVerdict({ songs: [song({ correlation: 0.94 }), song({ correlation: 0.95 })], liveEditToday: false, swapMs: null }).heldBecause).toContain('mean correlation 0.945');
    const v = replaceVerdict({ songs: [song({ correlation: 0.89 }), song({ correlation: 1 })], liveEditToday: false, swapMs: null });
    expect(v.pass).toBe(false);
    expect(v.heldBecause).toContain('correlation 0.890 < 0.9');
  });

  it('(c) end agreement: UADE ends -> nuade ends within 1.0 s; UADE plays on -> nuade plays on', () => {
    expect(endAgrees(11.4, 11.8)).toBe(true);
    expect(endAgrees(11.4, 12.5)).toBe(false);
    expect(endAgrees(8.5, 4.2)).toBe(false);   // apb.dw
    expect(endAgrees(3.7, -1)).toBe(false);    // nuade runs on after UADE stopped
    expect(endAgrees(-1, 11.8)).toBe(false);   // nuade ended where UADE plays on
    expect(endAgrees(-1, -1)).toBe(true);
    expect(songFailures(song({ uadeEndAt: 3.7 })).join()).toContain('UADE ends at 3.7 s, nuade plays on');
  });

  it('a lag above 100 ms fails even when the correlation is high (the lag search cannot hide a timing error)', () => {
    expect(songFailures(song({ lagMs: 200 })).join()).toContain('lag 200 ms');
  });

  it('(d) a format whose live edit works today keeps an edit path: the swap to the 120 s mark must take <= 100 ms', () => {
    const base = { songs: [song()], liveEditToday: true };
    expect(replaceVerdict({ ...base, swapMs: 88 }).pass).toBe(true);
    expect(replaceVerdict({ ...base, swapMs: 143 }).heldBecause).toContain('swap to the 120 s mark takes 143 ms');
    expect(replaceVerdict({ ...base, swapMs: null }).heldBecause).toContain('edit path not measured');
    expect(replaceVerdict({ songs: [song()], liveEditToday: false, swapMs: 5000 }).pass).toBe(true);
  });

  it('a format with no measured song is not passed', () => {
    expect(replaceVerdict({ songs: [], liveEditToday: false, swapMs: null }).pass).toBe(false);
  });
});

describe('NC-4 the dual rule (DN-1, owner decision b)', () => {
  const pair = (nuade: number, own: number): SongMeasure => song({ correlation: nuade, own });
  it('nuade is the default only when its mean beats ours by >= 0.01 and no song is worse than ours by more than 0.01', () => {
    expect(dualDefault([pair(0.987, 0.949)])?.defaultEngine).toBe('nuade');   // SoundMon, today's single-song numbers
    expect(dualDefault([pair(0.99, 0.985)])?.defaultEngine).toBe('native');   // a tie keeps the live edit API
  });
  it('the floor: nuade must itself reach 0.95 against UADE (two far-off engines say nothing about which is right)', () => {
    expect(dualDefault([pair(0.31, 0.03)])?.defaultEngine).toBe('native');
    expect(dualDefault([pair(0.949, 0.90)])?.defaultEngine).toBe('native');
    expect(dualDefault([pair(0.951, 0.90)])?.defaultEngine).toBe('nuade');
  });
  it('the end must agree too: a nuade that ends where UADE plays on does not become the default', () => {
    expect(dualDefault([{ ...pair(0.99, 0.9), uadeEndAt: 5.7, nuadeEndAt: -1 }])?.defaultEngine).toBe('native');
  });
  it('one song worse than ours by more than 0.01 keeps ours even when the mean wins', () => {
    expect(dualDefault([pair(1, 0.9), pair(0.9, 0.95)])?.defaultEngine).toBe('native');
  });
  it('is undecided until every song has both numbers', () => {
    expect(dualDefault([pair(0.99, 0.9), song({ correlation: 0.99 })])).toBeNull();
  });
});

describe('NC-1 the metric', () => {
  const click = (frames: number, at: number[]): Float32Array => {
    const out = new Float32Array(frames * 2);
    for (const a of at) for (let i = 0; i < 4800; i++) { out[2 * (a + i)] = 0.5; out[2 * (a + i) + 1] = 0.5; }
    return out;
  };
  it('finds a constant offset of 20 ms between two renders and scores them as equal', () => {
    const at = [9600, 48000, 96000, 144000, 240000, 288000, 336000, 400000, 480000, 560000, 640000, 700000, 800000, 900000, 1000000, 1100000];
    const a = click(1_200_000, at.map((x) => x + 960)); // 20 ms later
    const b = click(1_200_000, at);
    const lag0 = bestLagCorrelation(envelope20(a, 48000), envelope20(b, 48000), 1000);
    expect(lag0.correlation).toBeGreaterThan(0.99);
    expect(lag0.lagWindows).toBe(1);
  });
  it('a different pattern does not score as equal at any lag', () => {
    const a = click(1_200_000, [48000, 144000, 240000, 336000, 480000, 640000, 800000, 1000000]);
    const b = click(1_200_000, [96000, 192000, 288000, 400000, 560000, 700000, 900000, 1100000]);
    expect(bestLagCorrelation(envelope20(a, 48000), envelope20(b, 48000), 1000).correlation).toBeLessThan(0.5);
  });
  it('songEndOf: a flagged end, a render that stopped early, or a silent tail of 2 s or more', () => {
    const play = new Float32Array(48000 * 10 * 2).fill(0.2);
    expect(songEndOf(5.5, play, 48000, 10)).toBe(5.5);
    expect(songEndOf(-1, play, 48000, 10)).toBe(-1);
    expect(songEndOf(-1, play.subarray(0, 48000 * 4 * 2), 48000, 10)).toBe(4);
    const tail = new Float32Array(48000 * 10 * 2).fill(0.2);
    tail.fill(0, 48000 * 6 * 2);
    expect(songEndOf(-1, tail, 48000, 10)).toBeCloseTo(6, 2);
    const shortTail = new Float32Array(48000 * 10 * 2).fill(0.2);
    shortTail.fill(0, 48000 * 9 * 2);
    expect(songEndOf(-1, shortTail, 48000, 10)).toBe(-1);
  });
});

describe('NC-2 the resumable batch', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nuade-batch-'));
  const jobs: Job[] = ['a', 'b', 'c'].map((format, i) => ({ format, song: `songs/${format}.x`, first: true, sha: `s${i}` }));
  const measure = (calls: string[], fail: string[] = []) => async (job: Job) => {
    calls.push(job.format);
    return { peak: 0.5, rms: 0.1, correlation: fail.includes(job.format) ? 0.5 : 0.99, lagMs: 0, uadeEndAt: -1, nuadeEndAt: -1, windowSecs: 30, voices: 4, player: job.format };
  };

  it('writes each row the moment it completes, so an interrupted run resumes where it stopped', async () => {
    const path = join(dir, 'resume.json');
    const file = emptyResults();
    const first: string[] = [];
    await expect(runBatch({ jobs, file, path, selection: {}, measure: measure(first), afterRow: (r) => { if (r.format === 'b') throw new Error('killed'); } })).rejects.toThrow('killed');
    expect(first).toEqual(['a', 'b']);
    expect(loadResults(path).rows.map((r) => r.format)).toEqual(['a', 'b']);   // both rows were on disk before the kill
    const second: string[] = [];
    const res = await runBatch({ jobs, file: loadResults(path), path, selection: {}, measure: measure(second) });
    expect(second).toEqual(['c']);                                             // only what was missing ran
    expect(res).toEqual({ ran: 1, skipped: 2 });
  });

  it('--only runs the named formats, --failed only the rows that fail, --fresh forgets one format', async () => {
    const path = join(dir, 'sel.json');
    const file: ResultsFile = emptyResults();
    await runBatch({ jobs, file, path, selection: {}, measure: measure([], ['b']) });
    const rows = (f: ResultsFile) => Object.fromEntries(f.rows.map((r) => [r.format, r.songPass]));
    expect(rows(file)).toEqual({ a: true, b: false, c: true });
    const failedRun: string[] = [];
    await runBatch({ jobs, file, path, selection: { failedOnly: true }, measure: measure(failedRun) });
    expect(failedRun).toEqual(['b']);
    expect(rows(file).b).toBe(true);
    const onlyRun: string[] = [];
    await runBatch({ jobs, file, path, selection: { only: ['c'] }, measure: measure(onlyRun) });
    expect(onlyRun).toEqual([]);                                               // recorded and unchanged: skipped
    const freshRun: string[] = [];
    await runBatch({ jobs, file, path, selection: { fresh: 'c' }, measure: measure(freshRun) });
    expect(freshRun).toEqual(['c']);
  });

  it('a row measured against a different song or Nuade.wasm (sha) is stale and runs again', () => {
    const rec = { format: 'a', song: 'songs/a.x', sha: 'old' } as ResultRow;
    const file: ResultsFile = { ...emptyResults(), rows: [rec] };
    expect(pendingJobs(jobs.slice(0, 1), file, {}).map((j) => j.format)).toEqual(['a']);
  });

  it('a measure that throws becomes a failing row, not a crash', async () => {
    const path = join(dir, 'throw.json');
    const file = emptyResults();
    await runBatch({ jobs: jobs.slice(0, 1), file, path, selection: {}, measure: async () => { throw new Error('wasm trapped'); } });
    expect(file.rows[0]).toMatchObject({ format: 'a', songPass: false, error: 'wasm trapped' });
  });
});

describe('NC-4 verdicts for the table', () => {
  const rec = (format: string, songName: string, over: Partial<ResultRow> = {}): ResultRow => ({
    format, song: songName, peak: 0.5, rms: 0.1, correlation: 0.98, lagMs: -20, uadeEndAt: -1, nuadeEndAt: -1, windowSecs: 30, voices: 4, player: format,
    songPass: true, ms: 1, sha: 'x', ...over,
  });
  const forRow = (id: string, over: Partial<ResultRow> = {}): ResultRow[] => NUADE_FORMATS[id]!.corpus.map((s) => rec(id, s, over));

  it('a passing replace row moves to nuade with its score; a failing one stays on its legacy engine with the measured reason', () => {
    const file: ResultsFile = { ...emptyResults(), rows: [...forRow('earache'), ...forRow('mmdc', { correlation: 0.8 })] };
    const v = computeVerdicts(file);
    expect(v.earache).toMatchObject({ defaultEngine: 'nuade', uadeEnvelopeCorrelation: 0.98, endAgrees: true });
    expect(v.earache!.heldBecause).toBeUndefined();
    expect(v.mmdc).toMatchObject({ defaultEngine: NUADE_FORMATS.mmdc!.legacyEngine });
    expect(v.mmdc!.heldBecause).toContain('mean correlation 0.800 < 0.95');
  });

  it('a row with songs missing from the results gets no verdict, and rows sharing a key move together', () => {
    const partial = computeVerdicts({ ...emptyResults(), rows: [forRow('mmdc')[0]!] });
    expect(NUADE_FORMATS.mmdc!.corpus.length).toBeGreaterThan(1);
    expect(partial.mmdc).toBeUndefined();
    const pair = computeVerdicts({ ...emptyResults(), rows: forRow('markcooksey') });
    expect(NUADE_FORMATS.markcooksey!.prefKey).toBe(NUADE_FORMATS.markcooksey_old!.prefKey);
    expect(pair.markcooksey).toMatchObject({ defaultEngine: NUADE_FORMATS.markcooksey!.legacyEngine });
    expect(pair.markcooksey!.heldBecause).toContain('markcooksey_old');
  });

  it('a dual row gets only its nuade score until our engine is measured, and the generated file is valid TypeScript data', () => {
    const v = computeVerdicts({ ...emptyResults(), rows: forRow('soundmon') });
    expect(v.soundmon).toMatchObject({ defaultEngine: 'native', uadeEnvelopeCorrelation: 0.98 });
    expect(v.soundmon!.ownEnvelopeCorrelation).toBeUndefined();
    const text = render(v);
    expect(text).toContain('GENERATED by tools/nuade/apply-verdicts.ts');
    expect(text).toContain('soundmon: {"uadeEnvelopeCorrelation":0.98');
  });

  it('the committed verdict file is exactly what the committed results give (nobody edits the table by hand)', () => {
    const file = loadResults(RESULTS_PATH);
    const text = readFileSync(join(__dirname, '../nuade/nuadeVerdicts.ts'), 'utf8');
    expect(text).toBe(render(computeVerdicts(file, rolledOutRows())));
  });
});

describe('NAB-1 our own engine rendered headless', () => {
  it('renders a dual row\'s song through its real worklet, audibly; a row without a headless engine is null', async () => {
    const { renderOwn, OWN_ENGINES } = await import('../../../tools/nuade/ownRender');
    const r = await renderOwn('soundmon', 'public/data/songs/formats/antidust.bp3', 5);
    expect(r?.error).toBeUndefined();
    expect(r!.peak).toBeGreaterThan(0.05);
    expect(r!.rms).toBeGreaterThan(0.02);
    expect(await renderOwn('hippel', 'public/data/songs/formats/prehistoric_tale.hipc', 2)).toBeNull();
    expect(Object.keys(OWN_ENGINES).every((id) => NUADE_FORMATS[id]?.role === 'dual')).toBe(true);
  }, 60_000);

  it('compareSong on a dual row measures both engines against UADE with the same metric', async () => {
    const nu = await NuadeHeadless.create();
    const c = await compareSong(nu, NUADE_FORMATS.soundmon!, 'public/data/songs/formats/antidust.bp3', 10);
    expect(c.correlation).toBeGreaterThan(0.9);
    expect(c.own).toBeGreaterThan(0.85);
    const d = await compareSong(nu, NUADE_FORMATS.mmdc!, NUADE_FORMATS.mmdc!.corpus[0]!, 5);
    expect(d.own).toBeUndefined();
  }, 60_000);
});

describe('NC-3 the instrument check (real Nuade.wasm and UADE.wasm)', () => {
  it('reproduces the two known answers: antidust.bp3 passes, apb.dw does not', async () => {
    const nu = await NuadeHeadless.create();
    const ic = await instrumentCheck(nu, 30);
    expect(ic.known_good.pass, `antidust.bp3 correlation ${ic.known_good.correlation.toFixed(3)}`).toBe(true);
    expect(ic.known_good.correlation).toBeGreaterThanOrEqual(THRESHOLDS.meanCorrelation);
    expect(ic.known_bad.pass, `apb.dw correlation ${ic.known_bad.correlation.toFixed(3)}`).toBe(false);
    expect(ic.known_bad.correlation).toBeLessThan(THRESHOLDS.meanCorrelation);
    expect(ic.ok).toBe(true);
  }, 120_000);

  it('the committed results carry an instrument check that passed for the committed Nuade.wasm', () => {
    const file = loadResults(RESULTS_PATH);
    expect(existsSync(RESULTS_PATH)).toBe(true);
    expect(file.instrument?.ok).toBe(true);
    expect(file.instrument?.wasm).toBe(wasmSha());
  });

  it('a render of a module the player refuses is an error row, not a throw', async () => {
    const nu = await NuadeHeadless.create();
    const r = await renderNuade(nu, new Uint8Array(64), 'x.rh', 'robhubbard', 2);
    expect(r.error).toBeTruthy();
    const c = await compareSong(nu, NUADE_FORMATS.mmdc!, NUADE_FORMATS.mmdc!.corpus[0]!, 5);
    expect(c.player).toBe('mmdc');
    expect(c.correlation).toBeGreaterThan(0.95);
  }, 60_000);
});
