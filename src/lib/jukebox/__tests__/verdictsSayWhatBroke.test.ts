import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  loadVerdicts, verdictLabels, isGoodVerdict, verdictOf, LOAD_FAILED, JUKEBOX_OK,
} from '../faultReports';

/**
 * "in the jukebox list i cant see how the songs marked broken are broken"
 * (2026-09-24).
 *
 * Seven distinct faults all rendered as a single "!", and the verdicts read
 * back from the tracker were flattened to the strings 'ok' | 'fault' on the
 * way in — so the information was thrown away before the list ever saw it.
 * Coming back to a swept row and reading WHAT it carries is the entire point
 * of sweeping.
 */
describe('a verdict says which fault it is', () => {
  afterEach(() => vi.unstubAllGlobals());

  const serve = (data: unknown) =>
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => data,
    } as unknown as Response));

  it('keeps the tracker fields instead of flattening them', async () => {
    serve({
      'maniacs-of-noise': { status: 'silent', patternQuality: 'frozen', notes: 'from the sweep' },
    });

    const v = await loadVerdicts();
    expect(v['maniacs-of-noise']).toEqual({
      status: 'silent', patternQuality: 'frozen', notes: 'from the sweep',
    });
  });

  it('names both faults when a row carries both', () => {
    expect(verdictLabels({ status: 'silent', patternQuality: 'frozen' }))
      .toEqual(['Silent', 'Frozen Patterns']);
  });

  it('prints full English words, never a bare code', () => {
    expect(verdictLabels({ status: 'crashes' })).toEqual(['Load Failed']);
    expect(verdictLabels({ patternQuality: 'out-of-sync' })).toEqual(['Out Of Sync']);
  });

  it('falls back to the raw value for a verdict the dashboard wrote', () => {
    // The tracker has its own vocabulary; an unrecognised value must still say
    // something rather than vanish.
    expect(verdictLabels({ status: 'needs-research' })).toEqual(['needs-research']);
  });

  it('shows a good row as good, and only that', () => {
    const good = verdictOf(JUKEBOX_OK);
    expect(isGoodVerdict(good)).toBe(true);
    expect(verdictLabels(good)).toEqual(['Good']);
    expect(isGoodVerdict({ status: 'silent' })).toBe(false);
  });

  it('skips rows the tracker holds nothing for', async () => {
    serve({ untouched: {}, judged: { status: 'silent' } });
    const v = await loadVerdicts();
    expect(Object.keys(v)).toEqual(['judged']);
  });

  it('survives the tracker being down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    expect(await loadVerdicts()).toEqual({});
  });
});

describe('a refused load files itself', () => {
  it('has a fault to file it under', () => {
    // The load path reports THIS rather than inventing a parallel one.
    expect(LOAD_FAILED.id).toBe('load-failed');
    expect(LOAD_FAILED.status).toBe('crashes');
    expect(verdictLabels(verdictOf(LOAD_FAILED))).toEqual(['Load Failed']);
  });
});
