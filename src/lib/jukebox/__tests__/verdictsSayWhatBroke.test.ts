import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  loadVerdicts, verdictLabels, isGoodVerdict, verdictOf, LOAD_FAILED, JUKEBOX_OK,
  JUKEBOX_FAULTS, reportFault,
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

describe('a fault can be taken back off a row', () => {
  afterEach(() => vi.unstubAllGlobals());

  const capture = () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  const bodyOf = (fetchMock: ReturnType<typeof vi.fn>) =>
    JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as
      Record<string, { status?: string; patternQuality?: string; notes?: string }>;

  it('writes the fault when it is switched on', async () => {
    const f = capture();
    await reportFault(LOAD_FAILED, { format: 'maniacs-of-noise', file: 'x.mon' });
    expect(bodyOf(f)['maniacs-of-noise'].status).toBe('crashes');
  });

  it('writes the field EMPTY when it is switched off', async () => {
    // The server merges shallowly, so an empty string is what removes this
    // fault and only this fault. A mis-keyed verdict used to stick until a
    // reload (2026-09-24).
    const f = capture();
    await reportFault(LOAD_FAILED, { format: 'maniacs-of-noise', file: 'x.mon' }, true);
    const body = bodyOf(f)['maniacs-of-noise'];
    expect(body.status).toBe('');
    expect(body.notes).toContain('cleared');
  });

  it('clears only the field the fault owns', async () => {
    // Frozen Patterns is a patternQuality fault; clearing it must not touch
    // `status`, or taking back a grid verdict would also un-say "silent".
    const frozen = JUKEBOX_FAULTS.find((x) => x.id === 'frozen-grid')!;
    const f = capture();
    await reportFault(frozen, { format: 'sonix', file: 'a.smus' }, true);
    const body = bodyOf(f)['sonix'];
    expect(body.patternQuality).toBe('');
    expect(body.status).toBeUndefined();
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
