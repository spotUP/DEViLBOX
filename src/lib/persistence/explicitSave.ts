/**
 * Explicit-save flag - whether the user has saved the current project
 * themselves (Ctrl+S / save button / restoring their own project or revision).
 *
 * Auto-save and revision creation are gated on it, so that:
 * - a song that was only loaded / played (not the user's own work) is never
 *   auto-saved,
 * - no revisions are created for other people's songs loaded from files,
 * - an externally loaded song never overwrites the user's saved project.
 *
 * This is a leaf module (no imports) on purpose. The song-load branches
 * (songBranches.ts) and the collaboration sync clear the flag; they used to
 * import it from hooks/useProjectPersistence, and that one edge closed an
 * import cycle stores -> TrackerReplayer -> ... -> DJ track loader -> openSong
 * -> songBranches -> useProjectPersistence -> snapshotSong -> stores. Under
 * concurrent module loads (a test whose import outlived its timeout) the
 * module runner handed snapshotSong a half-initialised useInstrumentStore.
 * See src/lib/song/__tests__/songPersistenceImportCycle.test.ts.
 */

let explicitlySaved = false;

/** Mark the current project as explicitly saved by the user. */
export function markExplicitlySaved(): void { explicitlySaved = true; }

/**
 * Clear the flag. Called when loading external songs / files, so auto-save
 * never overwrites the user's saved project with a song loaded for playback.
 */
export function clearExplicitlySaved(): void { explicitlySaved = false; }

/** Set the flag from a computed decision (e.g. postLoadFlags). */
export function setExplicitlySaved(saved: boolean): void { explicitlySaved = saved; }

/** Whether the current project has been explicitly saved at least once. */
export function isExplicitlySaved(): boolean { return explicitlySaved; }
