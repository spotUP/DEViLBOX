/**
 * Tracker tempo for a format whose rows last a fixed wall-clock time.
 *
 * TrackerReplayer runs a row in `speed * 2.5 / bpm` seconds; a whole-song
 * engine that plays the file itself needs the grid to scroll at the same
 * pace. Picks the smallest speed that keeps the BPM within 32..255.
 */
export function tempoForRowMs(rowMs: number): { speed: number; bpm: number } {
  const ms = Math.max(1, rowMs);
  const speed = Math.max(1, Math.ceil(32 * ms / 2500));
  const bpm = Math.max(32, Math.min(255, Math.round(2500 * speed / ms)));
  return { speed, bpm };
}

/** The BPM that gives `rowMs` per row at an already chosen `speed`. */
export function bpmForRowMs(rowMs: number, speed: number): number {
  return Math.max(32, Math.min(255, Math.round(2500 * speed / Math.max(1, rowMs))));
}
