/**
 * Per-effect output gain compensation (dB).
 *
 * Measured with a steady 440 Hz sine at -12 dBFS routed through each effect
 * at default parameters and wet = 50 %.  The compensation value is the negative
 * of the measured offset so that every effect lands close to unity (0 dB delta).
 *
 * Effects within ±0.5 dB of baseline are omitted (effectively 0 dB compensation).
 *
 * Last calibrated: 2026-04-07 using tools/fx-audit-run.cjs
 */

const EFFECT_GAIN_COMPENSATION_DB: Record<string, number> = {
  // ── Measured hot — reduce output ──
  DragonflyHall:    -6.0,
  Driva:            -10.0,
  Saturator:        -9.3,
  Distortion:       -4.5,
  TapeSaturation:   -5.0,
  TapeDegradation:  -5.0,
  DragonflyPlate:   -4.5,
  Overdrive:        -4.4,
  CabinetSim:       +4.6,   // was quiet, boost
  BitCrusher:       -3.5,
  MultibandComp:    +3.5,   // was quiet, boost
  Maximizer:        +3.7,   // was quiet, boost
  MultiChorus:      +3.1,   // was quiet, boost
  AutoSat:          -2.9,
  AutoWah:          -3.0,
  FrequencyShifter: -3.0,
  PitchShift:       -3.0,
  StereoWidener:    -3.0,
  Phaser:           -3.0,
  Compressor:       -2.5,
  Vibrato:          -2.5,
  Reverb:           -2.6,
  X42Comp:          +2.4,   // was quiet, boost
  Exciter:          -2.2,
  Flanger:          +2.2,   // was quiet, boost
  RingMod:          +2.1,   // was quiet, boost
  AGC:              -2.1,
  Delay:            -2.0,
  FeedbackDelay:    -2.0,
  PingPongDelay:    -2.0,
  Tremolo:          -2.0,
  ToneArm:          -2.0,
  ReverseDelay:     +1.9,   // was quiet, boost
  Limiter:          +1.8,   // was quiet, boost
  JunoChorus:       +1.6,   // was quiet, boost
  GOTTComp:         -1.6,
  VintageDelay:     -1.5,
  ArtisticDelay:    -1.4,
  DubFilter:        -1.5,
  EQ3:              -1.5,
  Roomy:            +1.4,   // was quiet, boost
  CalfPhaser:       -1.4,
  ZamDelay:         -1.3,
  DragonflyRoom:    -3.0,
  MultibandGate:    +1.1,   // was quiet, boost
  AutoPanner:       -1.0,
  BiPhase:          -1.0,
  Pulsator:         +1.0,   // was quiet, boost
  Della:            -0.9,
  Panda:            +0.8,   // was quiet, boost
  PhonoFilter:      +1.2,   // was quiet, boost
  MultibandEnhancer: +1.2,  // was quiet, boost

  // ── Measured very quiet — boost output ──
  MultibandLimiter:    +12.7,
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
  Chebyshev:           +2.0,

  // ── Migrated from old per-node wrapper table (EffectFactory) ──
  MVerb:               -1.0,
  SpringReverb:        -1.5,
  ShimmerReverb:       -2.0,
  Freeverb:            -1.5,
  SpaceEcho:           -2.0,
  Aelapse:             -1.5,
  SwedishChainsaw:     -3.0,
  Leslie:              -1.0,
  WAMStonePhaser:      -0.5,
  VinylNoise:          -1.0,
  Filter:              +1.5,
  AutoFilter:          +1.5,
  MoogFilter:          +2.0,
  Neural:              -1.0,
  WAMBigMuff:          -3.0,
  WAMTS9:              -2.0,
  WAMDistoMachine:     -2.5,
  WAMQuadraFuzz:       -2.5,
  WAMVoxAmp:           -2.0,
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
