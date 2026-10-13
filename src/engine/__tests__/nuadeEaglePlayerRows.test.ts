/**
 * NUADE-EAGLEPLAYER-7 (owner 2026-10-14: nuade's C players are the future, more editable): the seven EaglePlayer formats
 * (andersoland, beathoven, bendaglishsid, coredesign, davelowe, scottjohnston, wallybeben) are dual rows. Their legacy
 * engine is the EaglePlayer runner (UADE's own eagleplayer on the Musashi host), measured against nuade and UADE by the
 * same batch as the other dual rows.
 *
 * ONE reachability test per row, through the product's entry point (parseModuleToSong): the stored choice 'native' plays
 * on EaglePlayer, 'nuade' plays on Nuade with the module under the nuade fields; the live headless render of both
 * engines gives the scores the table holds and the rule (DN-1) gives the default the table holds. The data this pins is
 * the choice, set here explicitly (the table's default is rollout data).
 *
 * Owner decision 2026-10-14: all seven default to nuade ("nuade for all. emoon said this is a beta and he will fix them and
 * we should update"), whatever the scores say. It is a rule (verdictRules.OWNER_PREFERS_NUADE), applied by apply-verdicts.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { NUADE_FORMAT_LIST, NUADE_FORMATS } from '../nuade/nuadeFormats';
import { NuadeHeadless } from '../nuade/nuadeHeadless';
import { setNuadeProbe } from '../nuade/nuadeProbe';
import { effectiveFormatEngine, engineChoicesFor, explicitFormatEngine, nuadePlayerFor } from '../nuade/nuadeRouting';
import { engineOptionsFor } from '../nuade/nuadeSelectOptions';
import { compareSong } from '../../../tools/nuade/nuadeCompare';
import { dualDefault, mean, OWNER_PREFERS_NUADE, type SongMeasure } from '../../../tools/nuade/verdictRules';
import { computeVerdicts } from '../../../tools/nuade/apply-verdicts';
import { loadResults, type ResultRow } from '../../../tools/nuade/batch';
import { engineNote } from '../nuade/nuadeSelectOptions';
import { ROOT } from './workletHarness';

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

const IDS = ['andersoland', 'beathoven', 'bendaglishsid', 'coredesign', 'davelowe', 'scottjohnston', 'wallybeben'];
const ROWS = IDS.map((id) => NUADE_FORMATS[id]!);
const SECONDS = 30;

describe('the seven EaglePlayer rows are in the table', () => {
  it('the owner set forces nuade for exactly these seven rows and nothing else; their measured scores stay and the reason is shown', () => {
    expect(Object.keys(OWNER_PREFERS_NUADE).sort()).toEqual([...IDS].sort());
    expect(NUADE_FORMAT_LIST.filter((f) => f.ownerDecision).map((f) => f.id).sort()).toEqual([...IDS].sort());
    const file = loadResults(resolve(ROOT, 'tools/nuade/nuade-compare.json'));
    const verdicts = computeVerdicts(file);
    for (const id of IDS) {
      const recs = file.rows.filter((r: ResultRow) => r.format === id);
      // the measurement alone would have kept the EaglePlayer runner: it is the decision that moves the row
      expect(dualDefault(recs)?.defaultEngine, `${id}: the rule without the decision`).toBe('native');
      expect(verdicts[id]!.defaultEngine, id).toBe('nuade');
      expect(NUADE_FORMATS[id]!.defaultEngine, id).toBe('nuade');
      expect(NUADE_FORMATS[id]!.ownerDecision, id).toMatch(/owner 2026-10-14/);
      expect(NUADE_FORMATS[id]!.ownEnvelopeCorrelation, `${id}: EaglePlayer score still shown`).not.toBeNull();
      expect(engineNote(NUADE_FORMATS[id]!), id).toMatch(/Default by decision: owner 2026-10-14.*our engine [01]\./);
    }
    // nothing else is forced: every other row's default follows the rule
    for (const f of NUADE_FORMAT_LIST) if (!IDS.includes(f.id)) expect(f.ownerDecision, f.id).toBeUndefined();
  });

  it('are exactly the rows flagged eagleRunner, dual, with the EaglePlayer runner as the legacy engine and a measured verdict', () => {
    expect(NUADE_FORMAT_LIST.filter((f) => f.eagleRunner).map((f) => f.id).sort()).toEqual([...IDS].sort());
    for (const r of ROWS) {
      expect(r.role, r.id).toBe('dual');
      expect(r.legacyEngine, r.id).toBe('native');
      expect(r.uadeEnvelopeCorrelation, `${r.id}: nuade measured`).not.toBeNull();
      expect(r.ownEnvelopeCorrelation, `${r.id}: EaglePlayer measured`).not.toBeNull();
      expect(r.corpus.length, r.id).toBeGreaterThan(0);
    }
  });

  it('offer Our Engine and nuade only: their routes never hand playback to UADE, so a UADE option would do nothing', () => {
    for (const r of ROWS) {
      expect(engineChoicesFor(r), r.id).toEqual(['native', 'nuade']);
      expect(engineOptionsFor(r).map((o) => o.value), r.id).toEqual(['native', 'nuade']);
    }
    // an old stored default ('uade') is not a choice of these rows: the table default applies
    expect(explicitFormatEngine({ daveLowe: 'uade' }, 'daveLowe')).toBeUndefined();
    expect(effectiveFormatEngine({ daveLowe: 'uade' }, 'daveLowe')).toBe('nuade');
    // a stored 'native' is a real choice and is honoured; the v15 migration removes the ones written before the decision (useSettingsStore.migration.test.ts)
    expect(effectiveFormatEngine({ daveLowe: 'native' }, 'daveLowe')).toBe('native');
  });
});

describe.each(ROWS)('$label: EaglePlayer or nuade, by the stored choice', (row) => {
  let nu: NuadeHeadless;
  beforeAll(async () => {
    nu = await NuadeHeadless.create();
    setNuadeProbe(async (id, bytes, name) => nu.probeWith(id, bytes, name));
    await import('@/lib/import/parseModuleToSong');
  }, 240_000);
  afterEach(async () => {
    const { useSettingsStore } = await import('@/stores/useSettingsStore');
    useSettingsStore.getState().resetFormatEngine(row.prefKey as never);
  });

  const load = async (path: string) => {
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const bytes = readFileSync(resolve(ROOT, path));
    const companions = row.companions?.[path];
    const song = await parseModuleToSong(
      new File([new Uint8Array(bytes)], basename(path)), 0, undefined, undefined,
      companions?.length ? new Map(companions.map((c) => [basename(c), new Uint8Array(readFileSync(resolve(ROOT, c))).buffer as ArrayBuffer])) : undefined,
    );
    return { song, bytes };
  };

  it('with no stored choice a fresh user gets nuade (the owner decision), through parseModuleToSong', async () => {
    const { useSettingsStore } = await import('@/stores/useSettingsStore');
    const { playingEngineFor } = await import('../replayer/NativeEngineRouting');
    expect((useSettingsStore.getState().formatEngine as unknown as Record<string, unknown>)[row.prefKey]).toBeUndefined();
    const { song } = await load(row.corpus[0]!);
    expect(song.nuadePlayerId).toBe(row.id);
    expect(playingEngineFor(song)).toBe('Nuade');
  }, 60_000);

  it("'native' plays every corpus song on EaglePlayer, 'nuade' plays it on Nuade (the module under the nuade fields), through parseModuleToSong", async () => {
    const { useSettingsStore } = await import('@/stores/useSettingsStore');
    const { playingEngineFor } = await import('../replayer/NativeEngineRouting');
    for (const path of row.corpus) {
      useSettingsStore.getState().setFormatEngine(row.prefKey as never, 'native');
      const own = await load(path);
      expect(playingEngineFor(own.song), `${basename(path)} on our engine`).toBe('EaglePlayer');
      expect(own.song.nuadeFileData, basename(path)).toBeUndefined();

      useSettingsStore.getState().setFormatEngine(row.prefKey as never, 'nuade');
      const { song, bytes } = await load(path);
      expect(song.nuadePlayerId, basename(path)).toBe(row.id);
      expect(song.nuadeFileData?.byteLength).toBe(bytes.length);
      expect(song.eaglePlayerFileData, 'EaglePlayer does not play it').toBeUndefined();
      expect(song.uadeEditableFileData, 'UADE does not play it').toBeUndefined();
      expect(playingEngineFor(song), `${basename(path)} on nuade`).toBe('Nuade');
      // the DJ pipeline asks this resolver for the same answer (djRenderEngine.resolveRenderPlayer)
      expect(await nuadePlayerFor(basename(path), new Uint8Array(bytes), useSettingsStore.getState().formatEngine)).toBe(row.id);
    }
  }, 120_000);

  it('the live render of both engines gives the recorded scores, and the rule gives the default the table holds', async () => {
    const live: SongMeasure[] = [];
    for (const s of row.corpus) live.push({ song: s, ...(await compareSong(nu, row, s, SECONDS)) });
    for (const m of live) {
      expect(m.error, basename(m.song)).toBeUndefined();
      expect(m.peak, `${basename(m.song)} nuade is audible`).toBeGreaterThan(0.05);
    }
    expect(Math.abs(mean(live.map((m) => m.correlation)) - row.uadeEnvelopeCorrelation!), 'nuade score').toBeLessThan(0.002);
    expect(Math.abs(mean(live.map((m) => m.own as number)) - row.ownEnvelopeCorrelation!), 'EaglePlayer score').toBeLessThan(0.002);
    const dd = dualDefault(live);
    // 'native' from the rule means ours stays; the owner decision overrides it for these seven.
    const expected = row.id in OWNER_PREFERS_NUADE || dd?.defaultEngine === 'nuade' ? 'nuade' : row.legacyEngine;
    expect(row.defaultEngine, `${row.label}: nuade ${dd?.nuadeMean.toFixed(3)} vs EaglePlayer ${dd?.ownMean.toFixed(3)}`).toBe(expected);
  }, 180_000);
});
