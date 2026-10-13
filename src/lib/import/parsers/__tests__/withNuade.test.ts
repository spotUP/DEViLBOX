/**
 * NS-5 / NS-6: the choice resolver and withNuade. A song whose format choice is 'nuade' leaves the import route playing
 * on the Nuade descriptor with the module, player id and name on it, and nothing of UADE's playback or of an engine
 * that outranks nuade; a format left on its default is not touched.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';
import { playingEngineFor } from '@/engine/replayer/NativeEngineRouting';
import { applyNuadeChoice, playOnNuade } from '../withNuade';
import {
  effectiveFormatEngine, resolvedFormatEngines, nuadePlayerFor, nuadeRowFor, engineChoicesFor, storedChoiceFor, displayChoiceFor, NUADE_PREF_KEYS,
} from '@/engine/nuade/nuadeRouting';
import { NUADE_FORMATS } from '@/engine/nuade/nuadeFormats';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { NuadeHeadless } from '@/engine/nuade/nuadeHeadless';
import { setNuadeProbe } from '@/engine/nuade/nuadeProbe';

const ROOT = join(__dirname, '../../../../..');
const RH = 'public/data/songs/formats/centurion_battle.rh';
const fileOf = (path: string) => {
  const b = readFileSync(join(ROOT, path));
  return new File([b], path.split('/').pop()!);
};

describe('NS-5 choice resolver', () => {
  it('an explicit choice wins, else the table default; a key the table does not own has none', () => {
    expect(effectiveFormatEngine({}, 'mmdc')).toBe('uade');          // legacy default of MMDC
    expect(effectiveFormatEngine({}, 'soundmon')).toBe('native');    // dual row, ours
    expect(effectiveFormatEngine({ mmdc: 'nuade' }, 'mmdc')).toBe('nuade');
    expect(effectiveFormatEngine({}, 'mod')).toBeUndefined();
  });

  it('ignores a stored value the row cannot honour: never effective, never the default (a replace row has no engine of ours)', () => {
    expect(effectiveFormatEngine({ mmdc: 'native' } as never, 'mmdc')).toBe('uade');   // mmdc plays on UADE or nuade only
    expect(effectiveFormatEngine({ earAche: 'uade' } as never, 'earAche')).toBe('native'); // its UADE option is stored as its legacy 'native'
    expect(effectiveFormatEngine({ earAche: 'nuade' } as never, 'earAche')).toBe('nuade');
    expect(effectiveFormatEngine({ soundmon: 'uade' } as never, 'soundmon')).toBe('uade'); // a dual row honours all three
  });

  it('shows the routes plain native/uade for every key of the table: nuade reads as native (our parser draws the grid)', () => {
    const resolved = resolvedFormatEngines({ mmdc: 'nuade', soundmon: 'uade' } as never) as unknown as Record<string, string>;
    expect(resolved.mmdc).toBe('native');
    expect(resolved.soundmon).toBe('uade');
    for (const key of NUADE_PREF_KEYS) expect(resolved[key], key).toMatch(/^(native|uade)$/);
  });

  it('offers replace rows uade|nuade and dual rows all three; a replace row\'s uade is stored as its legacy engine', () => {
    expect(engineChoicesFor(NUADE_FORMATS.mmdc!)).toEqual(['uade', 'nuade']);
    expect(engineChoicesFor(NUADE_FORMATS.soundmon!)).toEqual(['native', 'uade', 'nuade']);
    const earache = NUADE_FORMATS.earache!;
    expect(earache.legacyEngine).toBe('native');
    expect(storedChoiceFor(earache, 'uade')).toBe('native');
    expect(displayChoiceFor(earache, 'native')).toBe('uade');
    expect(storedChoiceFor(NUADE_FORMATS.soundmon!, 'uade')).toBe('uade');
  });
});

describe('NS-6 playOnNuade / applyNuadeChoice', () => {
  const song = (extra: Partial<TrackerSong> = {}): TrackerSong => ({
    name: 'x', format: 'UADE', patterns: [{ importMetadata: { sourceFormat: 'UADE' } }], instruments: [{ synthType: 'UADEEditableSynth', uade: {} }, { synthType: 'Sampler' }],
    uadeEditableFileData: new ArrayBuffer(4), uadeEditableFileName: 'a', uadeEditableSubsongs: [1],
    ...extra,
  } as unknown as TrackerSong);

  it('puts the module, player and name on the song and takes UADE\'s playback fields and outranking engines off it', () => {
    const s = playOnNuade(song({ hivelyFileData: new ArrayBuffer(2) } as never), 'mmdc', new ArrayBuffer(8), 'cp.mmdc');
    expect(s.nuadeFileData?.byteLength).toBe(8);
    expect(s.nuadePlayerId).toBe('mmdc');
    expect(s.nuadeFileName).toBe('cp.mmdc');
    expect(s.uadeEditableFileData).toBeUndefined();
    expect(s.uadeEditableFileName).toBeUndefined();
    expect((s as never as Record<string, unknown>).uadeEditableSubsongs).toBeUndefined();
    expect((s as never as Record<string, unknown>).hivelyFileData).toBeUndefined();
    expect(s.instruments.map((i) => i.synthType)).toEqual(['Sampler', 'Sampler']);
    expect(s.format).toBe('MOD');
    expect(playingEngineFor(s)).toBe('Nuade');
  });

  it('refuses a player that is not in the table', () => {
    expect(() => playOnNuade(song(), 'nope', new ArrayBuffer(1), 'x')).toThrow('unknown player');
  });

  it('applies only when the format\'s choice is nuade and the player recognises the bytes', async () => {
    const probed: string[] = [];
    const probe = async (id: string) => { probed.push(id); return id === 'mmdc' ? 0 : 1; };
    const ctx = { registryKey: 'mmdc', buffer: new ArrayBuffer(8), fileName: 'cp.mmdc', probe };
    expect((await applyNuadeChoice(song(), { ...ctx, prefs: {} })).nuadeFileData).toBeUndefined();
    expect(probed).toEqual([]);                     // nothing chose nuade: nothing is probed
    expect((await applyNuadeChoice(song(), { ...ctx, prefs: { mmdc: 'nuade' } })).nuadePlayerId).toBe('mmdc');
    expect((await applyNuadeChoice(song(), { ...ctx, fileName: 'other.xyz', registryKey: 'mod', prefs: { mmdc: 'nuade' } })).nuadeFileData).toBeUndefined();
    // The player says no: the song stays as routed.
    expect((await applyNuadeChoice(song(), { ...ctx, probe: async () => 1, prefs: { mmdc: 'nuade' } })).nuadeFileData).toBeUndefined();
  });

  it('tells two players that share an extension apart by their own probe (ems / emsv6)', async () => {
    const probe = async (id: string) => (id === 'emsv6' ? 0 : 1);
    const row = await nuadeRowFor('song.ems', new Uint8Array(4), { ems: 'nuade', emsv6: 'nuade' }, null, probe);
    expect(row?.id).toBe('emsv6');
  });
});

// ONE reachability test: the real song-load entry point, the real settings store.
describe('withNuade reachability: parseModuleToSong -> Nuade descriptor', () => {
  beforeEach(async () => {
    useSettingsStore.setState((s) => { delete (s.formatEngine as unknown as Record<string, unknown>).robHubbard; });
    // nuade's own probe, from the Node loader (the app loads Nuade.wasm on the main thread).
    const nu = await NuadeHeadless.create();
    setNuadeProbe(async (id, bytes, name) => nu.probeWith(id, bytes, name));
  });
  it('a Rob Hubbard file loads on nuade when its choice is nuade', async () => {
    useSettingsStore.getState().setFormatEngine('robHubbard', 'nuade');
    const bytes = new Uint8Array(readFileSync(join(ROOT, RH)));
    expect(await nuadePlayerFor('centurion_battle.rh', bytes, useSettingsStore.getState().formatEngine, 'robHubbard')).toBe('robhubbard');
    const song = await parseModuleToSong(fileOf(RH));
    expect(song.nuadePlayerId).toBe('robhubbard');
    expect(song.nuadeFileData?.byteLength).toBe(bytes.length);
    expect(song.nuadeFileName).toBe('centurion_battle.rh');
    expect(song.uadeEditableFileData).toBeUndefined();
    expect(playingEngineFor(song)).toBe('Nuade');
  });
});
