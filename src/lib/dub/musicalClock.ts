/**
 * MusicalClock — where are we musically?
 *
 * Plan item B1. Auto Dub asked `bar = floor(row / 16)`, which is only true for
 * a 4/4 song at speed 6. At speed 3 a bar is 32 rows, so every phrase rule,
 * persona arc and `bar % 16` decision drifted against the music.
 *
 * Two rules from the reviewer shape this file:
 *
 * 1. **It is a view of transport, never a second transport.** Nothing here
 *    counts time, schedules, or holds mutable playback state. Callers pass a
 *    row and the transport's ticks-per-row; every function is pure. Timing
 *    stays with the audio scheduler.
 * 2. **Metre is user-supplied metadata, never inferred.** No onset or accent
 *    detection, ever. And metre is not a single number: 7/8 and 7/4 share a
 *    numerator and are musically different, so `beatUnit` is modelled
 *    alongside `beatsPerBar` from the start rather than baking in four
 *    quarter-notes per bar.
 *
 * Defaults (4/4, speed 6, 16-bar phrase) reproduce today's arithmetic exactly:
 * 4 rows/beat, 16 rows/bar.
 */

/** Ticks per quarter note — the tracker convention `rowsPerBeat = 24 / speed`
 *  rests on. At speed 6 that is the familiar 4 rows per beat. */
export const TICKS_PER_QUARTER = 24;

/** ProTracker default speed, used when the transport reports nonsense. */
export const DEFAULT_TICKS_PER_ROW = 6;
export const DEFAULT_BEATS_PER_BAR = 4;
/** Denominator of the time signature: 4 = quarter, 8 = eighth. */
export const DEFAULT_BEAT_UNIT = 4;
/**
 * Default phrase length in bars. Reviewer's ruling: a user/song-level setting,
 * NOT inferred from pattern length or the order list. A 64-row 4-bar pattern
 * still sits inside a 16-bar phrase — firing phrase-end gestures every 4 bars
 * would be musically intrusive.
 */
export const DEFAULT_PHRASE_BARS = 16;
/** Offered in UI; arbitrary integers remain valid where they make sense. */
export const PHRASE_BAR_CHOICES = [4, 8, 12, 16, 24, 32] as const;

export interface MusicalMeter {
  /** Time-signature numerator. */
  beatsPerBar: number;
  /** Time-signature denominator: 4 = quarter-note beat, 8 = eighth. */
  beatUnit: number;
}

export interface MusicalClockSettings {
  meter: MusicalMeter;
  phraseBars: number;
}

export const DEFAULT_MUSICAL_CLOCK_SETTINGS: MusicalClockSettings = {
  meter: { beatsPerBar: DEFAULT_BEATS_PER_BAR, beatUnit: DEFAULT_BEAT_UNIT },
  phraseBars: DEFAULT_PHRASE_BARS,
};

export interface MusicalPosition {
  /** Bars elapsed since row 0. */
  bar: number;
  /** Beat index within the current bar, 0-based. */
  beat: number;
  /** Bar index within the current phrase, 0-based. */
  barInPhrase: number;
  /** Phrases elapsed since row 0. */
  phrase: number;
  /** Fractional position through the current beat, bar and phrase (0..1). */
  positionInBeat: number;
  positionInBar: number;
  positionInPhrase: number;
  /** Grid sizes actually in force, after metre and speed. */
  rowsPerBeat: number;
  rowsPerBar: number;
  rowsPerPhrase: number;
  /** Absolute rows of the next boundaries — what a PREPARE step schedules against. */
  nextBeatRow: number;
  nextBarRow: number;
  nextPhraseRow: number;
}

/**
 * Rows per beat for a given tracker speed and beat unit.
 *
 * `24 / ticksPerRow` is rows per QUARTER note; scaling by `4 / beatUnit`
 * converts that to the song's actual beat, so 6/8 counts eighth-note beats
 * rather than pretending they are quarters.
 *
 * Non-integer results are legitimate (speed 5 gives 4.8) and are NOT rounded —
 * rounding would put bar edges on rows the transport never lands on. Callers
 * compare with `floor`, which stays correct for fractional grids.
 */
export function rowsPerBeat(ticksPerRow: number, beatUnit = DEFAULT_BEAT_UNIT): number {
  const ticks = positiveOr(ticksPerRow, DEFAULT_TICKS_PER_ROW);
  const unit = positiveOr(beatUnit, DEFAULT_BEAT_UNIT);
  return (TICKS_PER_QUARTER / ticks) * (DEFAULT_BEAT_UNIT / unit);
}

/** Positive-finite or fall back — settings arrive from user input and songs. */
function positiveOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function sanitizeSettings(s: Partial<MusicalClockSettings> | undefined): MusicalClockSettings {
  return {
    meter: {
      beatsPerBar: positiveOr(s?.meter?.beatsPerBar, DEFAULT_BEATS_PER_BAR),
      beatUnit: positiveOr(s?.meter?.beatUnit, DEFAULT_BEAT_UNIT),
    },
    phraseBars: Math.floor(positiveOr(s?.phraseBars, DEFAULT_PHRASE_BARS)),
  };
}

/**
 * Resolve a row position into musical coordinates.
 *
 * `row` is a song-absolute row (the transport's global row). Fractional rows
 * are accepted so a smooth-scrolling caller keeps sub-row resolution.
 */
export function computeMusicalPosition(
  row: number,
  ticksPerRow: number,
  settings?: Partial<MusicalClockSettings>,
): MusicalPosition {
  const { meter, phraseBars } = sanitizeSettings(settings);
  const safeRow = Number.isFinite(row) && row > 0 ? row : 0;

  const rpBeat = rowsPerBeat(ticksPerRow, meter.beatUnit);
  const rpBar = rpBeat * meter.beatsPerBar;
  const rpPhrase = rpBar * phraseBars;

  const bar = Math.floor(safeRow / rpBar);
  const rowInBar = safeRow - bar * rpBar;
  const beat = Math.floor(rowInBar / rpBeat);
  const rowInBeat = rowInBar - beat * rpBeat;

  const phrase = Math.floor(safeRow / rpPhrase);
  const rowInPhrase = safeRow - phrase * rpPhrase;

  return {
    bar,
    beat,
    barInPhrase: bar % phraseBars,
    phrase,
    positionInBeat: rowInBeat / rpBeat,
    positionInBar: rowInBar / rpBar,
    positionInPhrase: rowInPhrase / rpPhrase,
    rowsPerBeat: rpBeat,
    rowsPerBar: rpBar,
    rowsPerPhrase: rpPhrase,
    nextBeatRow: (Math.floor(safeRow / rpBeat) + 1) * rpBeat,
    nextBarRow: (bar + 1) * rpBar,
    nextPhraseRow: (phrase + 1) * rpPhrase,
  };
}

/**
 * Musical position from elapsed beats rather than rows — the fallback for when
 * no row information exists yet (Auto Dub enabled before playback starts).
 * Kept here so both paths agree on what a bar is.
 */
export function computeMusicalPositionFromBeats(
  elapsedBeats: number,
  settings?: Partial<MusicalClockSettings>,
): Pick<MusicalPosition, 'bar' | 'positionInBar'> {
  const { meter } = sanitizeSettings(settings);
  const beats = Number.isFinite(elapsedBeats) && elapsedBeats > 0 ? elapsedBeats : 0;
  return {
    bar: Math.floor(beats / meter.beatsPerBar),
    positionInBar: (beats % meter.beatsPerBar) / meter.beatsPerBar,
  };
}
