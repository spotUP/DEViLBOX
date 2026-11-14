/** Reload the page shortly after the bridge reply is sent; flag skips the production leave-site prompt. */
export function scheduleHardReload(
  win: { location: { reload: () => void }; setTimeout: (fn: () => void, ms: number) => unknown },
  delayMs = 150,
): { ok: true; message: string } {
  (win as { __devilboxHardReload?: boolean }).__devilboxHardReload = true;
  win.setTimeout(() => win.location.reload(), delayMs);
  return { ok: true, message: `Reloading in ${delayMs}ms` };
}
