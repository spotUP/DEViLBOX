/**
 * Instrument names that are really a picture.
 *
 * Tracker musicians have spelled ASCII art down the instrument list since the
 * Amiga: the "names" are rows of a drawing, and only the last few carry the
 * greeting and the email address. Rendering them as ordinary names destroys
 * them — runs of spaces collapse, long rows are truncated with an ellipsis, and
 * the type badges sit in the middle of the drawing.
 *
 * This decides whether a list is a picture, so the list can switch rendering
 * mode rather than mangling every song to suit one case. Reported 2026-09-21
 * with a screenshot of jennipha / daddytwang.
 *
 * Pure: names in, verdict out. No DOM, no store.
 */

/** Characters that make a drawing rather than a word. */
const ART_CHARS = /[\\/|_\-()[\]{}<>~^`'".,:;!*+=#$%&@?]/;

/**
 * How art-like one name is, 0..1.
 *
 * The ratio of drawing characters to visible characters. A word scores near 0;
 * a row like `\_( \\( _` scores near 1. Spaces are excluded from both sides —
 * they are the canvas, not the ink, and counting them would make a sparse row
 * look like prose.
 */
export function artScore(name: string): number {
  const visible = name.replace(/\s/g, '');
  if (visible.length === 0) return 0;
  let art = 0;
  for (const ch of visible) if (ART_CHARS.test(ch)) art++;
  return art / visible.length;
}

/** A single name that reads as a row of a drawing rather than a label. */
export function isArtLine(name: string): boolean {
  // Two independent signals, either sufficient:
  //   - mostly drawing characters, or
  //   - an interior run of spaces, which is how a drawing holds its shape and
  //     which no ordinary instrument name needs.
  return artScore(name) >= 0.5 || /\S {2,}\S/.test(name);
}

/** Consecutive art-like names needed before a list counts as a picture. */
export const ART_RUN_THRESHOLD = 3;

/**
 * Does this list of instrument names contain a drawing?
 *
 * Requires a RUN of art-like lines rather than a count: a single instrument
 * called `--->` is not a picture, and a song whose every name is `.` should not
 * flip the whole list into art mode. A drawing is by nature several rows that
 * sit together.
 */
export function namesContainArt(names: readonly string[]): boolean {
  let run = 0;
  for (const name of names) {
    if (isArtLine(name)) {
      run++;
      if (run >= ART_RUN_THRESHOLD) return true;
    } else {
      run = 0;
    }
  }
  return false;
}
