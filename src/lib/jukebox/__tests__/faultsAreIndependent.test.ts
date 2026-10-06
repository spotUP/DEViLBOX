import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  JUKEBOX_FAULTS, reportFaults, reportGood, loadVerdicts, setFault, faultsOf,
  verdictLabels, isGoodVerdict, verdictFromFaults, deriveFields,
} from '../faultReports';

const fault = (id: string) => JUKEBOX_FAULTS.find((f) => f.id === id)!;

/**
 * "i am not sure i can set more than one switch active" (2026-10-06).
 *
 * Faults shared the server's `status` and `patternQuality`, so a second fault
 * overwrote the first. A row now carries a set.
 */
describe('faults are independent', () => {
  it('two faults on one song both stay on', () => {
    let set: string[] = [];
    set = setFault(set, 'load-failed', true);
    set = setFault(set, 'silent', true);
    expect(set).toEqual(['load-failed', 'silent']);
    // Both live in `status`, which holds one value: the set, not the field,
    // is the truth.
    expect(faultsOf(verdictFromFaults(set))).toEqual(['load-failed', 'silent']);
    expect(verdictLabels(verdictFromFaults(set))).toEqual(['Load Failed', 'Silent']);
  });

  it('two grid faults on one song both stay on', () => {
    const v = verdictFromFaults(['frozen-grid', 'out-of-sync']);
    expect(verdictLabels(v)).toEqual(['Frozen Patterns', 'Out Of Sync']);
  });

  it('turning one fault off keeps the other', () => {
    const both = setFault(setFault([], 'out-of-sync', true), 'frozen-grid', true);
    const after = setFault(both, 'frozen-grid', false);
    expect(after).toEqual(['out-of-sync']);
    expect(deriveFields(after)).toEqual({ status: '', patternQuality: 'out-of-sync' });
  });

  it('every combination of the seven faults survives a store and read back', () => {
    for (let mask = 0; mask < 1 << JUKEBOX_FAULTS.length; mask++) {
      const ids = JUKEBOX_FAULTS.filter((_, i) => mask & (1 << i)).map((f) => f.id);
      const v = verdictFromFaults(ids);
      expect(faultsOf(v)).toEqual(ids);
    }
  });

  it('keeps the shared fields meaningful for the dashboard', () => {
    expect(deriveFields(['silent', 'wrong-sound'])).toEqual({ status: 'silent', patternQuality: '' });
    expect(deriveFields(['empty-patterns', 'frozen-grid']).patternQuality).toBe('empty');
  });

  it('reads a row written before the set existed', () => {
    expect(faultsOf({ status: 'silent', patternQuality: 'frozen' })).toEqual(['silent', 'frozen-grid']);
  });

  it('lets a dashboard edit of status win over a stale set', () => {
    expect(faultsOf({ faults: ['silent'], status: 'works', patternQuality: '' })).toEqual([]);
    expect(isGoodVerdict({ faults: ['silent'], status: 'works' })).toBe(true);
  });

  it('a faulty row is not good', () => {
    expect(isGoodVerdict(verdictFromFaults(['wrong-sound']))).toBe(false);
  });
});

/**
 * Round trip against the REAL server handlers (tools/format-server.ts on a
 * scratch port and scratch state file): switch -> POST -> stored -> /get-data
 * -> the switches read back.
 */
describe('reporting round trip', () => {
  const PORT = 4590 + Math.floor(Math.random() * 100);
  let child: ChildProcess;
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jukebox-report-'));
    const state = join(dir, 'state.json');
    writeFileSync(state, JSON.stringify({ sonix: { status: 'works', patternQuality: 'full', editability: 'full' } }));
    child = spawn('npx', ['tsx', 'tools/format-server.ts', `--port=${PORT}`, `--state=${state}`], { stdio: 'pipe' });
    for (let i = 0; i < 100; i++) {
      try { if ((await realFetch(`http://localhost:${PORT}/get-data`)).ok) break; } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 100));
    }
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) =>
      realFetch(url.replace(':4444', `:${PORT}`), init));
  }, 20000);

  afterAll(() => { vi.unstubAllGlobals(); child?.kill(); });
  afterEach(() => undefined);

  const ctx = { format: 'sonix', file: 'a.smus' };

  it('two faults set through the reporter both come back after a reload', async () => {
    let set = setFault([], 'load-failed', true);
    expect(await reportFaults(set, fault('load-failed'), true, ctx)).toBe(true);
    set = setFault(set, 'silent', true);
    set = setFault(set, 'frozen-grid', true);
    expect(await reportFaults(set, fault('frozen-grid'), true, ctx)).toBe(true);

    const back = (await loadVerdicts()).sonix;
    expect(faultsOf(back)).toEqual(['load-failed', 'silent', 'frozen-grid']);
    // fields other tools read stay sensible, and unrelated data is untouched
    expect(back.status).toBe('crashes');
    expect(back.patternQuality).toBe('frozen');
    const raw = await (await realFetch(`http://localhost:${PORT}/get-data`)).json() as Record<string, Record<string, unknown>>;
    expect(raw.sonix.editability).toBe('full');
  });

  it('switching one off over the wire leaves the others on', async () => {
    const set = setFault(['load-failed', 'silent', 'frozen-grid'], 'silent', false);
    await reportFaults(set, fault('silent'), false, ctx);
    expect(faultsOf((await loadVerdicts()).sonix)).toEqual(['load-failed', 'frozen-grid']);
  });

  it('Good clears every fault and a later fault takes Good off', async () => {
    await reportGood(ctx);
    const good = (await loadVerdicts()).sonix;
    expect(isGoodVerdict(good)).toBe(true);
    expect(faultsOf(good)).toEqual([]);
    await reportFaults(['wrong-sound'], fault('wrong-sound'), true, ctx);
    const after = (await loadVerdicts()).sonix;
    expect(isGoodVerdict(after)).toBe(false);
    expect(verdictLabels(after)).toEqual(['Wrong Sound']);
  });

  it('switching the last fault off leaves a row with no verdict', async () => {
    await reportFaults([], fault('wrong-sound'), false, ctx);
    expect((await loadVerdicts()).sonix).toBeUndefined();
  });
});
