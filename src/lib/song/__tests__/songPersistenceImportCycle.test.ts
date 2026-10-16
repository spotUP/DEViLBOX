/**
 * The stores never statically import the code that snapshots them.
 *
 * snapshotSong reads every song store at call time. When a store's own static
 * import graph led back to snapshotSong, the two sat in one import cycle:
 *
 *   useInstrumentStore -> TrackerReplayer -> AutomationPlayer -> parameterRouter
 *   -> DJActions -> DJAutoDJ -> DJTrackLoader -> openSong -> songBranches
 *   -> useProjectPersistence -> snapshotSong -> useInstrumentStore
 *
 * The closing edge was songBranches importing clearExplicitlySaved from the
 * persistence hook (now lib/persistence/explicitSave.ts, a leaf). Inside a
 * cycle the module runner hands a concurrent importer the partial exports of a
 * module still evaluating, so a second load racing the first (a test whose
 * import outlived its timeout - savedProjectAfterAhx in the pre-push gate)
 * ran snapshotSong against an undefined useInstrumentStore.
 *
 * Counted from the TypeScript AST of the real sources (src/test/importGraph.ts):
 * static edges only; dynamic import() is a call-time edge and does not close a
 * static cycle.
 */
import { describe, it, expect } from 'vitest';
import { importChain } from '@/test/importGraph';

describe('the song stores and the code that snapshots them', () => {
  it('useInstrumentStore never statically imports snapshotSong or the project persistence', () => {
    // Sanity: the reverse edge is real, so a path back would be a cycle.
    expect(importChain('src/lib/song/snapshotSong.ts', 'src/stores/useInstrumentStore.ts')).not.toBeNull();

    expect(importChain('src/stores/useInstrumentStore.ts', 'src/lib/song/snapshotSong.ts')).toBeNull();
    expect(importChain('src/stores/useInstrumentStore.ts', 'src/hooks/useProjectPersistence.ts')).toBeNull();
  }, 60000);

  // The same cycle ran on through the DJ layer and the format engines:
  // parameterRouter -> DJActions -> DJAutoDJ -> DJTrackLoader -> openSong ->
  // songBranches -> songLifecycle, and ToneEngine -> InstrumentFactory -> the
  // synths -> UADEEngine / MaEngine -> ToneEngine. Under load the gate saw
  // `UADEEngine.prototype` / `MaEngine.prototype` of undefined and songLifecycle
  // in its TDZ at songBranches.ts:74. DJActions now reaches the Auto DJ through
  // dj/autoDJInstance.ts (and loads DJAutoDJ on demand), and the engines feed
  // the meters through ChannelMeterFeed.report() instead of importing ToneEngine.
  it('the store never statically reaches the song-open branches', () => {
    expect(importChain('src/lib/song/songBranches.ts', 'src/stores/useInstrumentStore.ts')).not.toBeNull();
    expect(importChain('src/stores/useInstrumentStore.ts', 'src/engine/dj/DJAutoDJ.ts')).toBeNull();
    expect(importChain('src/stores/useInstrumentStore.ts', 'src/lib/song/songBranches.ts')).toBeNull();
    expect(importChain('src/stores/useInstrumentStore.ts', 'src/lib/song/songLifecycle.ts')).toBeNull();
  }, 60000);

  it('no format engine shares an import cycle with the stores', () => {
    const STORE = 'src/stores/useInstrumentStore.ts';
    for (const engine of [
      'src/engine/uade/UADEEngine.ts', 'src/engine/ma/MaEngine.ts', 'src/engine/jamcracker/JamCrackerEngine.ts',
      'src/engine/sidmon1/SidMon1ReplayerEngine.ts', 'src/engine/pumatracker/PumaTrackerEngine.ts',
      'src/engine/futureplayer/FuturePlayerEngine.ts', 'src/engine/libopenmpt/LibopenmptEngine.ts',
      'src/engine/klystrack/KlysEngine.ts', 'src/engine/artofnoise/ArtOfNoiseEngine.ts',
      'src/engine/pretracker/PreTrackerEngine.ts', 'src/engine/steveturner/SteveTurnerEngine.ts',
    ]) {
      // A cycle is a path both ways; print the one back to the store when there is.
      const there = importChain(STORE, engine);
      expect(there && importChain(engine, STORE), engine).toBeNull();
    }
  }, 60000);
});
