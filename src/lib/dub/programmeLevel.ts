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
   *  level — present and unmistakable, not dominating.
   *  1.15 → 1.25 on the 2026-09-21 listening pass: "siren is a little too
   *  silent". Deliberately a small step — it was the mildest of the five
   *  verdicts, and this one sustains, so it climbs in perceived loudness
   *  faster than a transient does.
   *  1.35 was tried first and landed EXACTLY on the bound that
   *  `programmeLevel.test.ts` keeps against the 2026-09-18 regression, where
   *  the siren was referenced to programme PEAK and came out "MUCH louder than
   *  the music". That guard is worth more than the extra 0.1, so the value
   *  moved rather than the test. */
  siren: 1.6,   // 1.25 -> 1.6 (+2 dB), 2026-09-30: owner "crack, siren, radio -> louder".
                // Less than the transients' step: a sustained tone reads louder,
                // and 2.0 sat 2.6 dB from the level of the 2026-09-18 "MUCH louder
                // than the music" regression.
  /** A marker, not an event. */
  sonarPing: 0.45,
  /** A shriek — the loudest thing here by design, still bounded.
   *  0.8 → 0.6: "scream is too loud" (2026-09-21), measured at twice the
   *  programme's RMS. Trimmed HERE rather than at the move's `feedbackAmount`,
   *  which sets how hard the filter rings — that is the scream's character,
   *  and detuning it to fix a level would have changed what the move is. */
  tubbyScream: 0.6,
  /** Felt more than heard; the low end has the least headroom.
   *  0.5 → 0.75: "sub is not loud enough" (2026-09-21). Measured at peak 0.162
   *  against a 0.492 programme baseline — it sat UNDER the mix, so "felt more
   *  than heard" had become "not heard". It swells and decays like a hit, so
   *  it references the programme's PEAK rather than its RMS; 0.75 keeps it
   *  under the mix's own peak, which is the headroom the original note is
   *  about. */
  subSwell: 0.75,
  /** Sustained low end — referenced to RMS, and kept under it: the low end
   *  has the least headroom and is felt as much as heard. */
  subHarmonic: 0.8,
  oscBass: 0.8,
  crushBass: 0.8,
  /**
   * The two SPRING strikes — slam and kick.
   *
   * Both generate their own excitation (a sub thump plus filtered noise for
   * slam, a short impulse for kick) but used absolute multipliers, so they were
   * the only moves whose level ignored the music: relatively louder on a quiet
   * tune, quieter on a loud one. That is why the same `amount: 1.0` was heard
   * on 2026-09-21 as "slam is too loud" AND "kick is not loud enough" — the
   * numbers had been tuned against one song.
   *
   * Transients, so referenced to the programme's PEAK. Slam sits under kick
   * because it already carries a direct sub thump; kick reaches the output only
   * through the spring and needs the headroom.
   */
  springSlam: 0.8,
  springKick: 0.95,
  /** Rises into the mix rather than over it. */
  radioRiser: 0.9,   // 0.55 -> 0.9 (+4 dB), 2026-09-30: owner "louder".
  /**
   * The CAPTURED moves — reverse echo and backward reverb.
   *
   * These are not generated, but they need the same referencing for a
   * different reason: what they capture is one channel's SEND, not the mix, so
   * the material arrives at roughly a quarter of programme level before
   * anything is done to it. Played back at a fixed gain it lands under the
   * music and reads as nothing happening (2026-09-21: "i hear nothing when i
   * click"). Referencing the playback to the programme puts the reverse where
   * a listener can hear it whatever the capture level happened to be.
   */
  reverseEcho: 0.85,
  backwardReverb: 0.9,
  /** The snare crack. 0.5 → 0.9 on the 2026-09-21 listening pass: "i can
   *  hardly hear crack". Measured at peak 0.363 against a 0.385 programme
   *  baseline — under the music, which for a percussive accent means gone.
   *  A crack has to read as a HIT landing with the drums, so it is referenced
   *  near the programme's own peak rather than under it. The move already
   *  asks for full intent (`snareCrack` level 1.0), so this table was the only
   *  lever left. */
  noiseBurst: 1.45,  // 0.9 -> 1.45 (+4 dB), 2026-09-30: owner "crack, siren, radio -> louder";
                     // above the programme's peak on purpose - an accent over the drums
                     // (the 0.95 ceiling still holds it on a loud tune).
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

/** Headroom kept free below full scale, so the boost never lands on the limiter. */
const MASTER_HEADROOM_DB = 1;

/**
 * How much of a low-shelf boost shows up in broadband level.
 *
 * `lowShare` is the fraction of energy the shelf is lifting, so that fraction
 * of the boost lands in the overall level. The floor keeps the cost from
 * disappearing on a thin mix; the ceiling keeps it from swallowing the tune on
 * a bass-only passage.
 */
function shelfCostDb(shelfGainDb: number, programme: ProgrammeLevel): number {
  const share = programme.valid ? clamp01(programme.lowShare) : DEFAULT_LOW_SHARE;
  return shelfGainDb * Math.max(0.15, Math.min(0.7, share));
}

/**
 * How far to turn the mix DOWN to pay for a low-shelf boost.
 *
 * Only what will not fit. The trim used to charge the full cost of the boost
 * whatever the programme was doing, which on a tracker module — they run at
 * 0.05 to 0.15 peak, twenty decibels below full scale — meant the mix got
 * quieter by several dB to protect headroom that was never in danger. With the
 * BASS control at its top that is -7.2 dB of broadband level bought for
 * nothing, and it is what the control FEELS like: reported 2026-09-22 as "when
 * i slide the bass slider to the right the music gets quieter but no more
 * bass", and "a dub producer needs to have HEAVY bass".
 *
 * So the boost spends the headroom that is actually there first, and only the
 * excess is charged to the mix. A hot master still pays in full — that is the
 * 2026-09-18 "dub bus clipping and disting most of the time" regression, and
 * the arithmetic below still reproduces it for a 0.9-peak programme.
 *
 * With nothing playing there is no measurement to spend, so the cost is
 * charged in full rather than assumed free.
 */
export function shelfTrimDb(shelfGainDb: number, programme: ProgrammeLevel): number {
  if (shelfGainDb <= 0) return 0;
  const cost = shelfCostDb(shelfGainDb, programme);
  if (!programme.valid) return -cost;
  const peak = clamp01(programme.peak);
  if (peak <= 0) return -cost;
  const headroomDb = Math.max(0, -20 * Math.log10(peak) - MASTER_HEADROOM_DB);
  return -Math.max(0, cost - headroomDb);
}

/** Typical share of energy below the bass/mid split for programme material. */
const DEFAULT_LOW_SHARE = 0.4;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}

/** Bass/mid split used for `lowShare` — matches the AudioDataBus band edge (~258 Hz). */
export const LOW_SPLIT_HZ = 258;

/**
 * Share of spectral power below `splitHz`, from an analyser's
 * `getFloatFrequencyData` output (dB per bin).
 *
 * Power, not the peak/average blend the VJ bands use: this feeds a level
 * decision (how much of the mix a low shelf actually lifts), and power is the
 * quantity that adds.
 */
export function lowShareFromSpectrum(db: Float32Array, binHz: number, splitHz = LOW_SPLIT_HZ): number {
  let low = 0;
  let total = 0;
  for (let i = 0; i < db.length; i++) {
    const v = db[i];
    if (!Number.isFinite(v)) continue;
    const mag = Math.pow(10, v / 20);
    const power = mag * mag;
    total += power;
    if (i * binHz < splitHz) low += power;
  }
  return total > 0 ? low / total : DEFAULT_LOW_SHARE;
}

/** The subset of AnalyserNode this reads — a fake in tests, the real node in the app. */
export interface ProgrammeAnalyser {
  fftSize: number;
  frequencyBinCount: number;
  context: { sampleRate: number };
  getFloatTimeDomainData(array: Float32Array): void;
  getFloatFrequencyData(array: Float32Array): void;
}

/**
 * One programme reading from an analyser: peak and RMS from the time-domain
 * buffer, low share from the spectrum.
 *
 * Exists so the master-insert trim can meter the mix BEFORE the insert.
 * `getProgrammeLevel` reads `AudioDataBus`, which meters the master after it,
 * so every slider step measured its own boost and the trim ratcheted up faster
 * than the shelf — reported 2026-09-22 as "at 90% it sounds heavier than at
 * 100%".
 */
export function readProgrammeFromAnalyser(
  analyser: ProgrammeAnalyser,
): { rms: number; peak: number; lowShare: number } {
  const time = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(time);
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < time.length; i++) {
    const v = time[i];
    sum += v * v;
    const a = Math.abs(v);
    if (a > peak) peak = a;
  }
  const spectrum = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(spectrum);
  const binHz = analyser.context.sampleRate / analyser.fftSize;
  return {
    rms: time.length > 0 ? Math.sqrt(sum / time.length) : 0,
    peak,
    lowShare: lowShareFromSpectrum(spectrum, binHz),
  };
}
