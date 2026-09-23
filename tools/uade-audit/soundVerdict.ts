/**
 * soundVerdict.ts — the rules the corpus sweep judges a song by.
 *
 * Kept pure and separate from the sweep so the measurement rules can be tested
 * without a WASM instance, and so changing "what counts as silent" is one edit
 * in one place. Tested by src/__tests__/ci/soundVerdict.test.ts.
 */

/** What one file did. */
export type Verdict =
  /** Rendered a full stretch of audible audio. */
  | 'PLAYS'
  /** Rendered, but nothing that survives a 16-bit DAC. */
  | 'SILENT'
  /** The player signalled the end before a single frame came out — an empty subsong. */
  | 'INSTANT-END'
  /** Audible, but the song ended well before the requested length. */
  | 'SHORT'
  /** No eagleplayer accepted the file. */
  | 'REFUSED'
  /** A player took it and then asked for a file that is not in the corpus. */
  | 'MISSING-COMPANION'
  /** The WASM died taking the process with it. */
  | 'CRASHED'
  /** Still rendering when the deadline passed. */
  | 'TIMEOUT'
  /** Not a song: it is the sample/instrument half of a two-file format. */
  | 'COMPANION'
  /** A song, but DEViLBOX hands this format to another engine — not judged here. */
  | 'NOT-UADE'
  /** Not music (readme, artwork, a rendered wav). */
  | 'SKIPPED';

/** Verdicts that mean "a human should listen to this one". */
export const BAD_VERDICTS: readonly Verdict[] = [
  'SILENT', 'INSTANT-END', 'SHORT', 'MISSING-COMPANION', 'REFUSED', 'CRASHED', 'TIMEOUT',
];

/**
 * One 16-bit LSB. Below this the module is producing numbers, not sound: the
 * quantiser in front of any real output turns them into zeros. A relative
 * threshold ("quieter than the corpus average") would flag every quiet tune,
 * which is a taste question and not this tool's business.
 */
export const SILENCE_PEAK = 1 / 32768;

/** A song that ends before this fraction of the requested length ended early. */
export const SHORT_FRACTION = 0.5;

/** File extensions that are never a song, whatever the registry says. */
const NON_MUSIC = /\.(txt|nfo|diz|md|json|png|jpe?g|gif|webp|pdf|zip|lha|lzx|wav|mp3|flac|ogg|aiff?)$/i;

export function isNonMusic(name: string): boolean {
  return NON_MUSIC.test(name);
}

export interface RenderFacts {
  /** Frames UADE actually produced. */
  frames: number;
  /** Frames asked for. */
  requestedFrames: number;
  /** Largest absolute sample value in the render. */
  peak: number;
}

/**
 * Judge a successful render.
 *
 * Order matters and is the same order the Up Rough host check settled on:
 * nothing-at-all beats silence beats early-end. A module that produced zero
 * frames is not "silent" — it is an empty subsong, and the fix is different
 * (pick another subsong, rather than hunt a missing sample).
 */
export function classifyRender(f: RenderFacts): Verdict {
  if (f.frames === 0) return 'INSTANT-END';
  if (f.peak < SILENCE_PEAK) return 'SILENT';
  if (f.frames < f.requestedFrames * SHORT_FRACTION) return 'SHORT';
  return 'PLAYS';
}

/**
 * Whether DEViLBOX would give this file to UADE at all.
 *
 * `null` means the FormatRegistry does not know the name. That is NOT a reason
 * to skip it: UADE content-detects, several corpus files have no extension at
 * all (`play`, `Lightforce`, `routine`), and a file the registry cannot name
 * but UADE can play is itself worth seeing in the table.
 */
export function routesToUADE(
  fmt: { family: string; uadeFallback?: boolean; nativeOnly?: boolean } | null,
): boolean {
  if (!fmt) return true;
  if (fmt.family === 'uade-only' || fmt.family === 'amiga-native') return true;
  return fmt.uadeFallback === true;
}

/**
 * The file a player asked the host for and did not get.
 *
 * This is the single most useful thing UADE says. A two-file format whose
 * sidecar is absent fails identically to a format nobody supports, and only
 * this line tells them apart — it names the sample file, spelling and all, so
 * the answer is "put that file in the corpus", not "debug the player".
 */
export function missingCompanion(lines: readonly string[]): string | null {
  for (const l of lines) {
    const m = /file not found '\/uade\/([^']+)'/.exec(l);
    if (m) return m[1];
  }
  return null;
}

/** The first line in UADE's own output that says why it refused. */
export function refusalReason(lines: readonly string[]): string {
  const said = lines.find((l) => /not found|no such|cannot|can not|unsupported|error/i.test(l));
  return (said ?? lines[0] ?? '').trim().slice(0, 160);
}
