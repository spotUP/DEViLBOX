/**
 * One way in, one way out: no new hand-written song load or save.
 *
 * Owner, 2026-09-29: "i have asked a million time for all load/save/exports
 * to use a single source of truth". The audit that day found 25 places
 * applying a whole song by hand and three separate serializers, each dropping
 * something different (a MOD after an AHX opened the AHX editor; tabs, .dbx
 * and collaboration sync each lost part of the song). Every song now enters
 * through applySong and leaves through snapshotSong (saves) or
 * liveTrackerSong (encoders).
 *
 * This scans src/ for the store setters that replace a song. A caller outside
 * the canonical files must be a PARTIAL update named here with its reason; a
 * new load path fails CI until it goes through applySong.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const SRC = resolve(__dirname, '../../..');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      sourceFiles(path, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

/** Calls, not comments: strip line comments first. */
function calls(file: string, pattern: RegExp): number {
  const code = readFileSync(file, 'utf8').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  return (code.match(pattern) ?? []).length;
}

// The setters that replace the song. \b keeps preloadInstruments out.
const SONG_SETTERS = /\b(loadPatterns|loadInstruments|applyEditorMode|setOriginalModuleData)\(/g;

/** Where each setter may be called, and why. */
const ALLOWED: Record<string, string> = {
  'lib/song/applySong.ts': 'THE load path',
  'stores/useTrackerStore.ts': 'defines loadPatterns',
  'stores/useInstrumentStore.ts': 'defines loadInstruments',
  'stores/useFormatStore.ts': 'defines applyEditorMode / setOriginalModuleData',
  'engine/SequencerEngine.ts': 'its own loadPatterns method (acid sequencer JSON), not the tracker store',
  'components/tracker/SubsongSelector.tsx': 'partial: switches subsong within the loaded song',
  'components/tfmx/TFMXView.tsx': 'partial: re-reads the loaded TFMX module\'s patterns after an edit',
  'engine/uade/UADEChipRAMPatternReader.ts': 'partial: live pattern read-back from the playing UADE engine',
  'engine/uade/UADEEngine.ts': 'partial: patterns reconstructed from the loaded UADE song',
  'engine/gtultra/useGTUltraEngineInit.ts': 'partial: GoatTracker engine owns its song; mirrors its instruments',
  'lib/file/UnifiedFileLoader.ts': 'partial: TD-3 pattern import (replace/append), DB303 pattern append, GoatTracker editor mode (its engine holds the song)',
};

// Each case walks every source file with synchronous reads: 1-2 s alone on a
// quiet machine, 20 s with the dev stack and a vitest gate competing for the
// disk (2026-10-04, three pushes blocked). Time is not what the contract tests.
const SCAN_TIMEOUT = 60_000;

describe('single load path (contract)', () => {
  it('only applySong and the named partial updates call the song-replacing setters', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file);
      if (ALLOWED[rel]) continue;
      const n = calls(file, SONG_SETTERS);
      if (n > 0) offenders.push(`${rel} (${n}) - route the song through applySong, or name the partial update in ALLOWED`);
    }
    expect(offenders).toEqual([]);
  }, SCAN_TIMEOUT);

  it('the loader keeps its partial updates to the three it names', () => {
    // Guards the loader itself, which hosts most song loads.
    expect(calls(join(SRC, 'lib/file/UnifiedFileLoader.ts'), SONG_SETTERS)).toBeLessThanOrEqual(3);
  });
});

describe('single save path (contract)', () => {
  // Assembling a saved song means reading the native engine data for export;
  // only snapshotSong does that. buildSavedProject, exportSong, tabs and
  // collaboration sync each built their own snapshot before.
  const SERIALIZE = /\b(getNativeEngineDataForExport|getNativeEngineMetaForExport|getNativeCompanionFilesForExport)\(/g;

  it('only snapshotSong reads the native engine data to save a song', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file);
      if (rel === 'lib/song/snapshotSong.ts' || rel === 'lib/export/exporters.ts') continue; // exporters defines them
      if (calls(file, SERIALIZE) > 0) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  }, SCAN_TIMEOUT);
});
