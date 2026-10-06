/**
 * A song with an engine of its own is not also wired to UADE.
 *
 * withFallback held two hand-written "has a dedicated engine" lists that
 * copied WASM_ENGINES and disagreed with it and with each other (11 and 24
 * of 60-odd engines). Art Of Noise, Ben Daglish, Future Player, Music
 * Assembler and PumaTracker were on neither: their engines play the song
 * (the file data decides), yet the importer also turned every instrument
 * into a UADEEditableSynth and handed UADE the module. The question is now
 * asked of the registry (playsOnDedicatedEngine), which lives in a module of
 * its own: asking NativeEngineRouting cost a parse ~10 s of engine imports.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../../..');
const SONGS = join(ROOT, 'public/data/songs');

describe('the dedicated-engine question is the registry', { timeout: 60000 }, () => {
  it.each([
    ['art-of-noise/inside.blipp.aon', 'ArtOfNoise'],
    ['ben-daglish/motorhead-titleandingame.bd', 'BenDaglish'],
    ['future-player/imploder drums.fp', 'FuturePlayer'],
    ['pumatracker/liquid kids - lv1a.puma', 'PumaTracker'],
  ])('%s plays on its engine and is not wired to UADE', async (rel, key) => {
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const { playingEngineFor } = await import('@/engine/replayer/NativeEngineRouting');
    const b = readFileSync(join(SONGS, rel));
    const song = await parseModuleToSong(new File([b], rel.split('/').pop()!));
    expect(playingEngineFor(song)).toBe(key);
    expect(song.instruments.filter((i) => i.synthType === 'UADEEditableSynth').length).toBe(0);
  });

  it('the registry module loads no engine (the importer asks it while parsing)', () => {
    // Runtime imports are allowed only from leaf data modules: files that
    // themselves import nothing at runtime (formatFileDataFields' constant
    // list), so asking the registry can never pull an engine in.
    const runtimeImports = (file: string) => readFileSync(file, 'utf8').split('\n')
      .filter((l) => /^import\s/.test(l) && !/^import type\s/.test(l));
    const registry = join(ROOT, 'src/engine/replayer/wasmEngineRegistry.ts');
    const offenders: string[] = [];
    for (const line of runtimeImports(registry)) {
      const rel = line.match(/from '(\.\.?\/[^']+)'/)?.[1];
      if (!rel) { offenders.push(line); continue; }
      const dep = join(registry, '..', `${rel}.ts`);
      if (runtimeImports(dep).length > 0) offenders.push(line);
    }
    expect(offenders).toEqual([]);
  });

  it('withFallback keeps no copy of the engine list', () => {
    const src = readFileSync(join(ROOT, 'src/lib/import/parsers/withFallback.ts'), 'utf8');
    expect(src.match(/\.\w+FileData\s*\|\|/g) ?? []).toEqual([]);
  });
});
