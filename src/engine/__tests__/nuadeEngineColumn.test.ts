/**
 * NR-0: the "engine today" column of the replace rows, re-verified from the router (plan, Rollout order): each replace
 * row's corpus song goes through parseModuleToSong with default settings and playingEngineFor names the engine that
 * plays it. A replace row is a format that plays through UADE (or the TypeScript scheduler over UADE's samples); one that
 * lands on an engine of ours or on EaglePlayer is a dual row (or an EaglePlayer row) and must move out of the replace list.
 * Audit 2026-10-13 of the 57 replace rows with a corpus song: 54 play on UADE (UADEEditable); hippelhip on the Hippel engine,
 * fcbsi on the TypeScript scheduler, gmc on libopenmpt (cannot load in node): AB31-AB33.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { NUADE_FORMAT_LIST } from '../nuade/nuadeFormats';
import { ROOT } from './workletHarness';
import engineColumn from './nuadeEngineColumn.json';

vi.mock('@lib/import/formats/UADEParser', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  parseUADEFile: vi.fn(async (buf: ArrayBuffer, name: string) => ({
    name, format: 'UADE',
    patterns: [{ id: 'p0', name: 'p0', length: 1, importMetadata: { sourceFormat: 'UADE', sourceFile: name, importedAt: '', originalChannelCount: 4, originalPatternCount: 1, originalInstrumentCount: 1 },
      channels: [{ id: 'c0', name: 'c0', rows: [{ note: 49, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }] }] }],
    instruments: [{ id: 1, name: 'UADE', type: 'synth', synthType: 'UADESynth', effects: [], volume: 0, pan: 0, uade: { type: 'uade', filename: name, fileData: buf, subsongCount: 1 } }],
    songPositions: [0], songLength: 1, restartPosition: 0, numChannels: 4, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    uadeEditableFileData: buf.slice(0), uadeEditableFileName: name,
  })),
}));

/** Engines that mean "UADE plays it" (the replace rows' engine today). */
const UADE_FAMILY = new Set(['UADEEditable', 'UADE classic']);

/** Rows whose default load cannot run in node, with why (the engine is named from the route's source instead). */
const NOT_LOADABLE_IN_NODE: Record<string, string> = {
  gmc: 'Game Music Creator is parsed by libopenmpt (OpenMPTSoundlib.js is a browser script): it plays on the TypeScript scheduler, not UADE',
};
const ROWS = NUADE_FORMAT_LIST.filter((f) => f.corpus.length > 0 && !(f.id in NOT_LOADABLE_IN_NODE) && (f.role === 'replace' || engineColumn.moved.includes(f.id)));

describe('NR-0 engine column of the replace rows', () => {
  beforeAll(async () => { await import('@/lib/import/parseModuleToSong'); }, 240_000);

  it('the rows that cannot load in node are exactly the ones named, and each is recorded as moved out of the replace list', () => {
    for (const id of Object.keys(NOT_LOADABLE_IN_NODE)) {
      expect(engineColumn.moved, id).toContain(id);
      expect(NUADE_FORMAT_LIST.find((f) => f.id === id)?.role, id).toBe('dual');
    }
  });

  it('every row recorded as moved is a dual row of the table (engine of ours, not UADE)', () => {
    for (const id of engineColumn.moved) expect(NUADE_FORMAT_LIST.find((f) => f.id === id)?.role, id).toBe('dual');
  });

  it.each(ROWS.map((r) => [r.id, r] as const))('%s: the default load of its corpus song is played by the engine recorded for it (UADE for a replace row)', async (_id, row) => {
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const { playingEngineFor } = await import('../replayer/NativeEngineRouting');
    // The audit asks what played before nuade: pin the row to its legacy engine (a row on nuade by default would answer 'Nuade').
    const { useSettingsStore } = await import('@/stores/useSettingsStore');
    useSettingsStore.getState().setFormatEngine(row.prefKey, row.legacyEngine);
    const path = row.corpus[0]!;
    const companions = row.companions?.[path];
    const song = await parseModuleToSong(
      new File([new Uint8Array(readFileSync(resolve(ROOT, path)))], basename(path)), 0, undefined, undefined,
      companions?.length ? new Map(companions.map((c) => [basename(c), new Uint8Array(readFileSync(resolve(ROOT, c))).buffer as ArrayBuffer])) : undefined,
    );
    const engine = playingEngineFor(song);
    const recorded = (engineColumn.engines as Record<string, string>)[row.id];
    // The recorded value is what the router said on the day of the audit; a row that left the UADE family is listed in `moved`.
    expect(engine, `${row.id}: recorded ${recorded}`).toBe(recorded);
    if (!UADE_FAMILY.has(engine)) expect(engineColumn.moved, `${row.id} is on ${engine}`).toContain(row.id);
    else expect(engineColumn.moved, `${row.id} plays on UADE again`).not.toContain(row.id);
  }, 60_000);
});
