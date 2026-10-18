/**
 * The silent boot restore, as a gate song loads wait on.
 *
 * Boot restores the last session without asking. A song load requested while
 * that restore is still running (an MCP load_file, a dropped file, a deep link)
 * must land AFTER it, or the restore would overwrite the song that was just
 * loaded. openSong awaits whenBootRestoreDone() next to whenStartupJingleDone().
 */

let pending = false;
let waiters: Array<() => void> = [];

/** Mark the restore as running. Call synchronously at boot, before any IO. */
export function beginBootRestore(): void {
  pending = true;
}

/** The restore has applied, found nothing, or failed. Releases every waiting load. */
export function endBootRestore(): void {
  pending = false;
  const release = waiters;
  waiters = [];
  for (const fn of release) fn();
}

/** Resolves at once when no restore is running, otherwise when it ends. */
export function whenBootRestoreDone(): Promise<void> {
  if (!pending) return Promise.resolve();
  return new Promise<void>((resolve) => { waiters.push(resolve); });
}

/** Test hook. */
export function resetBootRestoreForTest(): void {
  endBootRestore();
}
