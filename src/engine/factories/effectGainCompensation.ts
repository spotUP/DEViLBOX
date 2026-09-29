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
  MultiChorus:      +3.1,   // was quiet, boost
  AutoSat:          -4.1,
  AutoWah:          -3.0,
  // FrequencyShifter: 0 - measured at unity (2026-09-29).
  // PitchShift: 0 - measured at unity (2026-09-29).
  // StereoWidener: 0 - measured at unity (2026-09-29).
  Phaser:           -3.0,
  Compressor:       -2.5,
  Vibrato:          -2.5,
  Reverb:           -2.6,
  X42Comp:          +2.4,   // was quiet, boost
  // Exciter: 0 - rebuilt 2026-09-29 to add only harmonics above its band (the
  // old one boosted the band itself); a static cut here took 2.2 dB off the
  // whole signal, lows included.
  Exciter:          0,
  Flanger:          +2.2,   // was quiet, boost
  RingMod:          +2.1,   // was quiet, boost
  AGC:              -2.1,
  Delay:            -2.0,
  FeedbackDelay:    -2.0,
  PingPongDelay:    -2.0,
  Tremolo:          -2.0,
  ToneArm:          -2.0,
  ReverseDelay:     +1.9,   // was quiet, boost
  Limiter:          0,      // ceiling device - see Maximizer
  JunoChorus:       +1.6,   // was quiet, boost
  GOTTComp:         -1.6,
  VintageDelay:     -1.5,
  ArtisticDelay:    -1.4,
  DubFilter:        -1.5,
  // EQ3: 0 - measured at unity (2026-09-29).
  Roomy:            +1.4,   // was quiet, boost
  CalfPhaser:       -1.4,
  ZamDelay:         -1.3,
  MultibandGate:    +1.1,   // was quiet, boost
  AutoPanner:       -1.0,
  BiPhase:          -1.0,
  Pulsator:         +1.0,   // was quiet, boost
  Della:            -0.9,
  Panda:            +0.8,   // was quiet, boost
  PhonoFilter:      +1.2,   // was quiet, boost
  MultibandEnhancer: +1.2,  // was quiet, boost

  // ── Measured very quiet — boost output ──
  MultibandLimiter:    0,  // ceiling device - see Maximizer
  SidechainLimiter:    0, // Dynamics processor — no static compensation
  SlapbackDelay:       +4.7,
  HaasEnhancer:        +4.8,
  MultiSpread:         +2.3,
  EarlyReflections:    +0.5,

  // ── Legacy calibrated (prior session) ──
  SpaceyDelayer:       +6.0,
  RETapeEcho:          +6.0,
  SidechainCompressor: 0, // Dynamics processor — no static compensation (output varies by design)
  AmbientDelay:        +5.0,
  Chorus:              +4.5,
  JCReverb:            +3.0,
  Chebyshev:        +8.0,

  // ── Migrated from old per-node wrapper table (EffectFactory) ──
  MVerb:               -1.0,
  SpringReverb:        -1.5,
  // ShimmerReverb: 0 - its output gain is set at source since 2026-09-29.
  Freeverb:            -1.5,
  SpaceEcho:           -2.0,
  Aelapse:             -1.5,
  SwedishChainsaw:  +4.3,   // 2026-09-29, headless pink -18 dBFS centre, defaults (source trim is set for a guitar DI)
  Leslie:              -1.0,
  WAMStonePhaser:      -0.5,
  VinylNoise:          -1.0,
  Filter:              +1.5,
  AutoFilter:          +1.5,
  MoogFilter:          +2.0,
  Neural:              -1.0,
  WAMBigMuff:       +9.5,
  WAMTS9:           +14.6,
  WAMDistoMachine:  +1.9,
  WAMQuadraFuzz:    -11.5,
  WAMVoxAmp:        -13.9,
};

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
