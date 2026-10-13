/**
 * NC-5: every table row with a recorded verdict plays on nuade the way its verdict says, measured now. Per row (and per
 * corpus song): the 30 s watchdog render is audible and error-free, it is compared with UADE's render of the same file
 * (20 ms envelope, best lag), the song ends where UADE's ends, and the verdict the rule gives on this live measurement is
 * the verdict the table holds (defaultEngine 'nuade' exactly when the rule passes; a held row's reason still fails).
 * Rows that are on nuade by default also prove the default load: parseModuleToSong -> playingEngineFor === 'Nuade'.
 * The recorded score must still be what the live render gives (the table is not stale).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { NUADE_FORMAT_LIST, type NuadeFormat } from '../nuade/nuadeFormats';
import { NuadeHeadless } from '../nuade/nuadeHeadless';
import { setNuadeProbe } from '../nuade/nuadeProbe';
import { compareSong } from '../../../tools/nuade/nuadeCompare';
import { replaceVerdict, dualDefault, mean, THRESHOLDS, type SongMeasure } from '../../../tools/nuade/verdictRules';
import { loadResults } from '../../../tools/nuade/batch';
import { RESULTS_PATH } from '../../../tools/nuade/compare-batch';
import { ROOT } from './workletHarness';
import { LIVE_EDIT } from '@/lib/import/gridProvenance';

// UADE's scan needs a browser; a format whose parser draws no grid hands the grid to it. Stand in for it with a song
// shaped as UADEParser's classic path builds it, so the route's retargeting is what is tested.
vi.mock('@lib/import/formats/UADEParser', () => ({
  parseUADEFile: vi.fn(async (buf: ArrayBuffer, name: string) => ({
    name, format: 'UADE',
    patterns: [{ id: 'p0', name: 'p0', length: 1, importMetadata: { sourceFormat: 'UADE', sourceFile: name, importedAt: '', originalChannelCount: 4, originalPatternCount: 1, originalInstrumentCount: 1 },
      channels: [{ id: 'c0', name: 'c0', rows: [{ note: 49, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }] }] }],
    instruments: [{ id: 1, name: 'UADE', type: 'synth', synthType: 'UADESynth', effects: [], volume: 0, pan: 0, uade: { type: 'uade', filename: name, fileData: buf, subsongCount: 1 } }],
    songPositions: [0], songLength: 1, restartPosition: 0, numChannels: 4, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    uadeEditableFileData: buf.slice(0), uadeEditableFileName: name,
  })),
}));

const SECONDS = 30;
const ROWS = NUADE_FORMAT_LIST.filter((f) => (f.role === 'replace' || f.defaultEngine === 'nuade') && f.uadeEnvelopeCorrelation !== null && f.corpus.length > 0);

/** The swap time is a timing measurement: it comes from the recorded batch row (headless, at the 120 s mark), not a live render. */
function recordedSwap(row: NuadeFormat): number | null {
  return loadResults(RESULTS_PATH).rows.find((r) => r.format === row.id && r.swapMs !== undefined)?.swapMs ?? null;
}

describe('the table has recorded verdicts to test', () => {
  it('at least the five wave-1 rows are measured', () => {
    expect(ROWS.map((r) => r.id)).toEqual(expect.arrayContaining(['mmdc', 'robhubbard', 'timfollin', 'earache', 'musicalenlightenment']));
  });
});

describe.each(ROWS)('$label on nuade', (row) => {
  const live: SongMeasure[] = [];
  beforeAll(async () => {
    const nu = await NuadeHeadless.create();
    for (const s of row.corpus) {
      try {
        live.push({ song: s, ...(await compareSong(nu, row, s, SECONDS)) });
      } catch (e) {
        // UADE, the reference, could not render the file (module check failed, companion missing): an error row, as in the batch.
        live.push({ song: s, error: e instanceof Error ? e.message : String(e), peak: 0, rms: 0, correlation: NaN, lagMs: 0, uadeEndAt: -1, nuadeEndAt: -1 });
      }
    }
  }, 180_000);

  it.runIf(row.defaultEngine === 'nuade')(`the 30 s watchdog render of ${row.corpus.length} song(s) is audible and error-free`, () => {
    for (const m of live) {
      expect(m.error, basename(m.song)).toBeUndefined();
      expect(m.peak, `${basename(m.song)} peak`).toBeGreaterThan(THRESHOLDS.peak);
      expect(m.rms, `${basename(m.song)} rms`).toBeGreaterThan(THRESHOLDS.rms);
    }
  });

  it.runIf(row.defaultEngine === 'nuade')('the recorded score is what the live render gives', () => {
    const good = live.filter((m) => Number.isFinite(m.correlation));
    expect(Math.abs(mean(good.map((m) => m.correlation)) - row.uadeEnvelopeCorrelation!)).toBeLessThan(0.002);
  });

  it('the verdict the rule gives on the live measurement is the one the table holds', () => {
    if (row.role === 'dual') {
      // DN-1: the dual rule over the live numbers of both engines.
      const dd = dualDefault(live);
      expect(dd?.defaultEngine, `${row.label}: nuade ${dd?.nuadeMean.toFixed(3)} vs ours ${dd?.ownMean.toFixed(3)}`).toBe('nuade');
      return;
    }
    const v = replaceVerdict({ songs: live, liveEditToday: row.registryKeys.some((k) => LIVE_EDIT[k] === 'pass'), swapMs: recordedSwap(row) });
    if (row.defaultEngine === 'nuade') {
      expect(v.heldBecause, `${row.label} is on nuade but fails: ${v.heldBecause}`).toBe('');
      expect(row.heldBecause).toBeUndefined();
    } else {
      expect(row.heldBecause, 'a held row says why').toBeTruthy();
      // A row held only because a sibling of its preference key is held passes on its own.
      expect(v.pass, `${row.label} is held (${row.heldBecause}) but passes now`).toBe(row.heldBecause!.startsWith('sibling '));
    }
  });

  it.runIf(row.defaultEngine === 'nuade')('end agreement: it ends where UADE ends (or both play on)', () => {
    for (const m of live) {
      const ok = m.uadeEndAt > 0 ? m.nuadeEndAt > 0 && Math.abs(m.nuadeEndAt - m.uadeEndAt) <= THRESHOLDS.endToleranceSecs : m.nuadeEndAt <= 0;
      expect(ok, `${basename(m.song)}: UADE ${m.uadeEndAt}, nuade ${m.nuadeEndAt}`).toBe(true);
    }
  });
});

describe('the default load plays on nuade for every row that is on nuade by default', () => {
  const ON_NUADE = ROWS.filter((r) => r.defaultEngine === 'nuade');
  beforeAll(async () => {
    const nu = await NuadeHeadless.create();
    setNuadeProbe(async (id, bytes, name) => nu.probeWith(id, bytes, name));
    await import('@/lib/import/parseModuleToSong');
  }, 240_000);

  it.each(ON_NUADE.map((r) => [r.label, r] as const))('%s: parseModuleToSong carries the module as nuade file data and the router picks Nuade', async (_label, row) => {
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const { playingEngineFor } = await import('../replayer/NativeEngineRouting');
    const path = row.corpus[0]!;
    const bytes = readFileSync(resolve(ROOT, path));
    const companions = row.companions?.[path];
    const song = await parseModuleToSong(
      new File([new Uint8Array(bytes)], basename(path)), 0, undefined, undefined,
      companions?.length ? new Map(companions.map((c) => [basename(c), new Uint8Array(readFileSync(resolve(ROOT, c))).buffer as ArrayBuffer])) : undefined,
    );
    expect(song.nuadePlayerId).toBe(row.id);
    expect(song.nuadeFileData?.byteLength).toBe(bytes.length);
    expect(song.uadeEditableFileData, 'UADE does not play it').toBeUndefined();
    expect(playingEngineFor(song)).toBe('Nuade');
  }, 60_000);

  it('a row that is held stays on UADE: the same load does not reach Nuade', async () => {
    const held = ROWS.find((r) => r.defaultEngine !== 'nuade');
    if (!held) return; // nothing held yet
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const { playingEngineFor } = await import('../replayer/NativeEngineRouting');
    const path = held.corpus[0]!;
    const song = await parseModuleToSong(new File([new Uint8Array(readFileSync(resolve(ROOT, path)))], basename(path)), 0);
    expect(playingEngineFor(song)).not.toBe('Nuade');
  }, 60_000);

  it('the table agrees with the verdict rule for every measured row: 34 rows or more are on nuade, each with its score', () => {
    expect(ON_NUADE.length).toBeGreaterThanOrEqual(30);
    for (const r of ON_NUADE) expect(r.uadeEnvelopeCorrelation, r.id).toBeGreaterThanOrEqual(THRESHOLDS.meanCorrelation);
  });
});
