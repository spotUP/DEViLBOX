/**
 * X11 — referencing generated sounds to the programme material.
 *
 * Several dub moves do not process the music, they GENERATE sound: the siren,
 * the sonar ping, the toast, the sub swell, the radio riser, the oscillator
 * bass. Each of them picked an amplitude out of the air — `level = 0.8`, a
 * sine straight into the bus — which is a level relative to FULL SCALE, not
 * relative to the mix.
 *
 * A tracker module typically plays at 0.05 to 0.15 RMS. A 0.8-peak sine is
 * therefore fifteen to twenty decibels above the music, which is exactly what
 * it sounds like: reported 2026-09-18 as "some effects like the siren etc are
 * MUCH louder than the music".
 *
 * The fix is not a smaller constant. A constant is wrong for the next song
 * too, just differently — a quiet tune buries any fixed level and a loud one
 * swamps it. Generated sound has to be scaled against a MEASURED reference,
 * and the relative offsets (a siren is more present than a ping) stay as
 * musical intent on top of that reference.
 *
 * Pure. A reading and an intent in, a gain out.
 */

/** A measurement of the programme material — the music, not the effects. */
export interface ProgrammeLevel {
  /** Smoothed RMS of the programme, 0..1. */
  rms: number;
  /** Smoothed peak of the programme, 0..1. */
  peak: number;
  /** False when nothing is playing, so callers can tell quiet from absent. */
  valid: boolean;
}

/**
 * Peak level a generated sound should reach, as a fraction of the programme's
 * own peak.
 *
 * Not of full scale, and not of the programme's RMS: a listener judges "as
 * loud as the music" against what the music PEAKS at, and the crest factor of
 * a tracker mix (roughly 12 dB) means anything referenced to RMS lands about
 * four times too loud.
 */
export const GENERATED_PRESENCE: Readonly<Record<string, number>> = {
  /** Sits on top of the mix, unmistakably — but not over it. */
  siren: 0.75,
  /** A marker, not an event. */
  sonarPing: 0.45,
  /** A voice: present, conversational. */
  toast: 0.6,
  /** A shriek — the loudest thing here by design, still bounded. */
  tubbyScream: 0.8,
  /** Felt more than heard; the low end has the least headroom. */
  subSwell: 0.5,
  subHarmonic: 0.4,
  oscBass: 0.4,
  crushBass: 0.4,
  /** Rises into the mix rather than over it. */
  radioRiser: 0.55,
  noiseBurst: 0.5,
};

/**
 * Floor for the reference.
 *
 * When the programme is silent — an intro, a drop, the user auditioning a
 * move with nothing loaded — there is nothing to be relative TO. Scaling to
 * zero would make the move inaudible and scaling to full scale would make it
 * deafening, so the reference falls back to a modest fixed peak: audible on
 * its own, not painful.
 */
export const SILENT_PROGRAMME_PEAK = 0.25;

/** Programme quieter than this is treated as silence for referencing. */
const SILENCE_THRESHOLD = 0.005;

/**
 * Peak gain for a generated sound.
 *
 * `intent` is the caller's musical level, 0..1, where 1 means "as loud as this
 * kind of sound should ever be". It scales the presence factor rather than
 * replacing it, so a caller asking for half level gets half of something
 * sensible instead of half of full scale.
 */
export function generatedPeakFor(
  moveId: string,
  programme: ProgrammeLevel,
  intent = 1,
): number {
  const presence = GENERATED_PRESENCE[moveId] ?? 0.5;
  const reference = programme.valid && programme.peak > SILENCE_THRESHOLD
    ? programme.peak
    : SILENT_PROGRAMME_PEAK;
  const scaled = reference * presence * clamp01(intent);
  // Never silent enough to be a no-op, never loud enough to clip on its own.
  return Math.max(0.01, Math.min(0.95, scaled));
}

/**
 * Smooth a new reading into the previous reference.
 *
 * Programme level moves constantly — a kick lands, a bar rests — and a
 * reference that followed every frame would make one move quiet and the next
 * loud for reasons the listener cannot connect to anything. Slow attack, even
 * slower release: the reference should describe the tune, not the transient.
 */
export function smoothProgrammeLevel(
  previous: ProgrammeLevel | null,
  reading: { rms: number; peak: number },
): ProgrammeLevel {
  const valid = reading.peak > SILENCE_THRESHOLD || reading.rms > SILENCE_THRESHOLD;
  if (!previous || !previous.valid) {
    return { rms: reading.rms, peak: reading.peak, valid };
  }
  const rising = reading.peak > previous.peak;
  const alpha = rising ? 0.3 : 0.05;
  return {
    rms: previous.rms + (reading.rms - previous.rms) * alpha,
    peak: previous.peak + (reading.peak - previous.peak) * alpha,
    valid: valid || previous.valid,
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}
