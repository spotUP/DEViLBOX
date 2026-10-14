/**
 * The toast text for a WASM engine that could not start a song, or null when
 * nothing should be shown.
 *
 * A load the app cancelled itself (a newer song replaced it) is an AbortError
 * and stays quiet. Any other failure is a song the user asked for that will
 * not sound, and must not look like it is playing (RJP-SNG-INS-SILENT: UADE
 * rejected the module, the transport showed "playing" over silence).
 * Engine messages carry diagnostics after " | " (stderr tail, directory
 * listing); the toast keeps the part before it, the console keeps the rest.
 */
export function engineStartFailureMessage(engineKey: string, err: unknown): string | null {
  if (err instanceof Error && err.name === 'AbortError') return null;
  const raw = err instanceof Error ? err.message : String(err);
  const head = raw.split(' | ')[0].trim();
  return `${engineKey} could not start this song${head ? `: ${head}` : ''}`;
}
