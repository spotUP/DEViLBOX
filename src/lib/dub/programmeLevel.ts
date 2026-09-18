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
  /**
   * Share of the programme's energy below the bass/mid split, 0..1.
   *
   * What a low shelf actually costs in broadband level: boosting 80 Hz by
   * 9 dB does NOT make the mix 9 dB louder, it makes it louder in proportion
   * to how much of the music lives down there. Trimming by the full shelf gain
   * therefore overcorrects badly — reported 2026-09-18 as "the volume
   * difference between dub bus on/off is huge".
   */
  lowShare: number;
  /** False when nothing is playing, so callers can tell quiet from absent. */
  valid: boolean;
}

/**
 * How loud a generated sound should be, relative to the programme.
 *
 * WHICH reference depends on whether the sound is a transient or sustained,
 * and getting that wrong is audible: a first pass referenced everything to the
 * programme's PEAK, and the sonar ping came out right while the siren was
 * still reported as "at least twice as loud as everything else".
 *
 * The ping is right because a transient is judged against peaks — it lands in
 * the same instant as a hit, and the ear compares it with that hit. A siren is
 * a continuous tone, and loudness for anything continuous follows RMS: a drone
 * held at 0.75 of the programme's PEAK sits three or four times above the
 * level the mix actually averages, which is precisely what it sounded like.
 *
 * So sustained sources reference the programme's RMS and transient ones its
 * peak. The numbers below are relative presence within whichever reference
 * applies, not across the two.
 */
/**
 * Generated sources that HOLD. These reference the programme's RMS.
 *
 * The test is whether the sound is still going a second later, not whether the
 * move is a `hold` kind: a `subSwell` is a hold that swells and decays like a
 * hit, while the siren simply keeps sounding.
 */
/**
 * NOT here, deliberately: `toast`. It routes a live MICROPHONE rather than
 * generating a tone, and it ducks the music while it plays — so referencing it
 * to a programme level that its own ducking is pushing down would be a
 * feedback loop, with the mic fading as the duck deepened. Mic gain stays the
 * user's to set.
 */
export const SUSTAINED_SOURCES: ReadonlySet<string> = new Set([
  'siren',
  'oscBass',
  'subHarmonic',
  'crushBass',
]);

export const GENERATED_PRESENCE: Readonly<Record<string, number>> = {
  /** Sustained: relative to programme RMS. Just above the mix's own average
   *  level — present and unmistakable, not dominating. */
  siren: 1.15,
  /** A marker, not an event. */
  sonarPing: 0.45,
  /** A shriek — the loudest thing here by design, still bounded. */
  tubbyScream: 0.8,
  /** Felt more than heard; the low end has the least headroom. */
  subSwell: 0.5,
  /** Sustained low end — referenced to RMS, and kept under it: the low end
   *  has the least headroom and is felt as much as heard. */
  subHarmonic: 0.8,
  oscBass: 0.8,
  crushBass: 0.8,
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
 * RMS as a fraction of peak for typical programme material — about -12 dB.
 *
 * Only used for the silent fallback, so a sustained source with nothing to
 * reference is quiet in the same proportion it would be against real music.
 */
const TYPICAL_CREST_RATIO = 0.25;

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
  const sustained = SUSTAINED_SOURCES.has(moveId);
  const measured = sustained ? programme.rms : programme.peak;
  const fallback = sustained
    ? SILENT_PROGRAMME_PEAK * TYPICAL_CREST_RATIO
    : SILENT_PROGRAMME_PEAK;
  const reference = programme.valid && measured > SILENCE_THRESHOLD ? measured : fallback;
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
  reading: { rms: number; peak: number; lowShare?: number },
): ProgrammeLevel {
  const valid = reading.peak > SILENCE_THRESHOLD || reading.rms > SILENCE_THRESHOLD;
  const lowShare = clamp01(reading.lowShare ?? previous?.lowShare ?? DEFAULT_LOW_SHARE);
  if (!previous || !previous.valid) {
    return { rms: reading.rms, peak: reading.peak, lowShare, valid };
  }
  const rising = reading.peak > previous.peak;
  const alpha = rising ? 0.3 : 0.05;
  return {
    rms: previous.rms + (reading.rms - previous.rms) * alpha,
    peak: previous.peak + (reading.peak - previous.peak) * alpha,
    // The spectral balance of a tune moves slowly; follow it slowly.
    lowShare: previous.lowShare + (lowShare - previous.lowShare) * 0.05,
    valid: valid || previous.valid,
  };
}

/**
 * How much of a low-shelf boost shows up in broadband level.
 *
 * `lowShare` is the fraction of energy the shelf is lifting, so that fraction
 * of the boost lands in the overall level. The floor keeps the trim from
 * disappearing on a thin mix; the ceiling keeps it from swallowing the tune on
 * a bass-only passage.
 */
export function shelfTrimDb(shelfGainDb: number, programme: ProgrammeLevel): number {
  if (shelfGainDb <= 0) return 0;
  const share = programme.valid ? clamp01(programme.lowShare) : DEFAULT_LOW_SHARE;
  return -shelfGainDb * Math.max(0.15, Math.min(0.7, share));
}

/** Typical share of energy below the bass/mid split for programme material. */
const DEFAULT_LOW_SHARE = 0.4;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}
