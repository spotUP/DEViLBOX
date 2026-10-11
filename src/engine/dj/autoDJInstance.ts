/**
 * The running Auto DJ, if one has been created - a leaf module (no imports).
 *
 * DJActions controls the Auto DJ, and DJAutoDJ drives the decks through
 * DJActions. DJActions used to import DJAutoDJ statically for its singleton;
 * that edge pulled the Auto DJ, its track loader and the whole song-open stack
 * (openSong -> songBranches -> songLifecycle -> the format engines) into the
 * static import graph of every store that reaches DJActions (via
 * parameterRouter), closing a ~120-module cycle with useInstrumentStore. Inside
 * a cycle the module runner hands a racing load half-initialised modules
 * (MaEngine / UADEEngine undefined, songLifecycle in its TDZ).
 *
 * Now DJAutoDJ registers its instance here when it is created; DJActions reads
 * it for the synchronous controls (no instance = no Auto DJ running = nothing
 * to pause) and loads DJAutoDJ on demand for the ones that start it.
 * See src/lib/song/__tests__/songPersistenceImportCycle.test.ts.
 */

/** What DJActions drives on the Auto DJ. */
export interface AutoDJControl {
  enable(startIndex?: number): Promise<string | null>;
  disable(): void;
  pause(): void;
  resume(): void;
  skip(): Promise<void>;
  playFromIndex(index: number): Promise<void>;
}

let running: AutoDJControl | null = null;

/** Called by DJAutoDJ's getAutoDJ when it creates the singleton. */
export function registerAutoDJ(autoDJ: AutoDJControl): void { running = autoDJ; }

/** The Auto DJ if it has been created, else null (then nothing is running). */
export function existingAutoDJ(): AutoDJControl | null { return running; }
