/**
 * Per-effect output gain compensation (dB).
 *
 * The negative of each effect's measured level offset, so it lands close to
 * unity. Applied after the effect in the master chain (MasterEffectsChain).
 *
 * The drive / saturation / EQ / amp entries were recalibrated 2026-09-29 (see
 * below); the rest date from 2026-04-07 (440 Hz sine at -12 dBFS, wet 50 %,
 * tools/fx-audit-run.cjs).
 */

const EFFECT_GAIN_COMPENSATION_DB: Record<string, number> = {
  // ── Delays, reverbs, modulation: NO post gain (2026-09-30) ──
  // Their level is in the wet path now (WET_PATH_GAIN_DB below). The post
  // gains they had (+6 on RE-Tape Echo, +4.5 on Chorus, -3 on Phaser ...) moved
  // the dry signal with the wet and several pointed the wrong way: Chorus is at
  // unity and came out +4.2 dB.
  // Buzz machines ignore the app's wet %, so their output IS their wet path:
  FSMChorus:        -3.5,
  FSMChorus2:       +4.1,
  FSMPanzerDelay:   -2.6,
  // ── Recalibrated 2026-09-29: drive, saturation, EQ, amps, Buzz distortions ──
  // In-app, pink noise at -18 dBFS RMS (a mix's level), 20 Hz high-passed,
  // centre, wet 100 % (tools/master-fx-response-audit.ts --broadband). These
  // have a fixed level offset, so a static gain after them is right.
  // Delays, reverbs and modulation are NOT recalibrated here: this gain sits
  // after the effect's own dry/wet mix, so at a low wet a correction for the
  // wet signal would move the dry signal too - their level belongs in the
  // wet path.
  TapeSaturation:   +4.6,
  TapeDegradation:  +2.3,
  TubeAmp:          -2.5,
  ArguruDistortion: +6.1,
  JeskolaDistortion: -7.8,
  GeonikOverdrive:  -7.4,
  WhiteNoiseStereoDist: +10.3,
  OomekExciter:     -4.2,
  TapeSimulator:    -1.8,
  WAMPitchShifter:  +2.3,
  // ── Measured hot — reduce output ──
  // Dragonfly Hall / Plate / Room: 0 - their reverbs are level-neutral since
  // 2026-09-29 (true all-passes, decay-normalised combs, measured makeup).
  Driva:            -15.4,
  Saturator:        -13.4,
  Distortion:       -4.5,
  Overdrive:        -8.5,
  CabinetSim:       +2.3,
  BitCrusher:       -0.5,
  MultibandComp:    +3.5,   // was quiet, boost
  // Ceiling devices (Maximizer, Limiter, MultibandLimiter): NO static
  // compensation. They read 'quiet' in calibration only because they hold a
  // ceiling, and a boost after them defeats it - Maximizer at -1 dBFS came out
  // at +2.7 dBFS (2026-09-29). Same class as SidechainLimiter below.
  Maximizer:        0,
  AutoSat:          -4.1,
  AutoWah:          -3.0,
  // FrequencyShifter: 0 - measured at unity (2026-09-29).
  // PitchShift: 0 - measured at unity (2026-09-29).
  // StereoWidener: 0 - measured at unity (2026-09-29).
  Compressor:       -2.5,
  X42Comp:          +2.4,   // was quiet, boost
  // Exciter: 0 - rebuilt 2026-09-29 to add only harmonics above its band (the
  // old one boosted the band itself); a static cut here took 2.2 dB off the
  // whole signal, lows included.
  Exciter:          0,
  AGC:              -2.1,
  ToneArm:          -2.0,
  Limiter:          0,      // ceiling device - see Maximizer
  GOTTComp:         -1.6,
  DubFilter:        -1.5,
  // EQ3: 0 - measured at unity (2026-09-29).
  MultibandGate:    +1.1,   // was quiet, boost
  Panda:            +0.8,   // was quiet, boost
  PhonoFilter:      +1.2,   // was quiet, boost
  MultibandEnhancer: +1.2,  // was quiet, boost

  // ── Measured very quiet — boost output ──
  MultibandLimiter:    0,  // ceiling device - see Maximizer
  SidechainLimiter:    0, // Dynamics processor — no static compensation
  HaasEnhancer:        +4.8,
  MultiSpread:         +2.3,

  // ── Legacy calibrated (prior session) ──
  SidechainCompressor: 0, // Dynamics processor — no static compensation (output varies by design)
  Chebyshev:        +8.0,

  // ── Migrated from old per-node wrapper table (EffectFactory) ──
  // ShimmerReverb: 0 - its output gain is set at source since 2026-09-29.
  Freeverb:            -1.5,
  SwedishChainsaw:  +4.3,   // 2026-09-29, headless pink -18 dBFS centre, defaults (source trim is set for a guitar DI)
  VinylNoise:          -1.0,
  Filter:              +1.5,
  AutoFilter:          +1.5,
  MoogFilter:          +2.0,
  // Neural: 0 - each model's level is corrected at its output since 2026-09-30
  // (NEURAL_MODEL_OUTPUT_DB in guitarMLRegistry.ts).
  WAMBigMuff:       +9.5,
  WAMTS9:           +14.6,
  WAMDistoMachine:  +1.9,
  WAMQuadraFuzz:    -11.5,
  WAMVoxAmp:        -13.9,
};

/**
 * Wet-path level calibration (dB) for delays, reverbs and modulation.
 *
 * The negative of each effect's own level at its defaults, wet 100 %, measured
 * 2026-09-30 in the app (MCP measure_master_effect: stereo centre pink noise
 * into the master effects input, energy of both channels;
 * tools/master-fx-wet-calibration.ts). Applied by the effect factory to the
 * WET signal only - Tone.js effects through `effectReturn`, the wrappers
 * through `setWetPathGain` - so the dry signal stays at unity at any wet %.
 * Within 1 dB: no entry. Tremolo, AutoPanner and Pulsator are exempt: their
 * peaks already equal the input and the lower average is the effect.
 * The dub bus builds its echo, spring and plate itself and keeps its own
 * calibration (its parameters are not these defaults).
 */
const WET_PATH_GAIN_DB: Record<string, number> = {
  // Tone.js (effectReturn)
  Reverb: +2.0, JCReverb: +3.8, Delay: -3.9, FeedbackDelay: -3.9, PingPongDelay: -2.5,
  // Delays
  SpaceyDelayer: +3.9, RETapeEcho: +2.2, RE201: -3.6, AnotherDelay: -6.7, AmbientDelay: -1.2,
  ArtisticDelay: +2.7, Della: +4.1, ReverseDelay: +2.1, SlapbackDelay: +2.8, VintageDelay: +3.2,
  ZamDelay: +2.4, TapeDelay: -1.6, WAMPingPongDelay: -1.8, WAMFaustDelay: -5.4,
  // Reverbs
  MVerb: +1.2, MadProfessorPlate: +2.6, DattorroPlate: -1.2, SpringReverb: +4.5, Aelapse: +1.9,
  DragonflyHall: -2.7, DragonflyPlate: -3.3, DragonflyRoom: -4.9, EarlyReflections: +2.6, Roomy: +3.1,
  // Modulation
  BiPhase: -5.3, Leslie: +7.1, CalfPhaser: -1.3, Flanger: +2.3, JunoChorus: +3.1, MultiChorus: +4.5,
  RingMod: +4.3,
};
// TapeDelay keeps its dry signal at 1 at every wet (additive); it read +3.9 dB
// with the dry in, so its wet alone is +1.6 dB.

/** Linear wet-path gain for the effect type (1 when it has no entry). */
export function getWetPathGain(type: string): number {
  const db = WET_PATH_GAIN_DB[type] ?? 0;
  return db === 0 ? 1 : Math.pow(10, db / 20);
}

/** The types with a wet-path calibration. */
export function wetPathCalibratedTypes(): string[] {
  return Object.keys(WET_PATH_GAIN_DB);
}

/**
 * Return the gain compensation in dB for the given effect type.
 * Returns 0 for effects that are already near unity.
 */
export function getEffectGainCompensationDb(type: string): number {
  return EFFECT_GAIN_COMPENSATION_DB[type] ?? 0;
}

/**
 * Return the gain compensation as a linear multiplier.
 */
export function getEffectGainCompensation(type: string): number {
  const db = getEffectGainCompensationDb(type);
  return db === 0 ? 1 : Math.pow(10, db / 20);
}
