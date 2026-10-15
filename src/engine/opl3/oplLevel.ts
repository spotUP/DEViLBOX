/**
 * The OPL operator level convention, in one place. The chip's total level (TL, register 0x40) is an ATTENUATION: 0 is
 * full volume, 63 is -47.25 dB. The instrument config (`opl3.op1Level` / `op2Level`) and the editor's LEVEL knob run the
 * other way, 63 = loudest, like every other level in the app. Every crossing between the two goes through these two
 * functions: the synth packs registers with `levelToTotalLevel`, the register-level importers and exporters (RAD,
 * AdPlug extraction) use both. A crossing without them gives the bug this file exists for: a loud carrier (TL 0) read as
 * level 0 and packed as TL 63, a silent instrument.
 */
export const OPL_MAX_LEVEL = 63;

const clampLevel = (v: number): number => Math.max(0, Math.min(OPL_MAX_LEVEL, Math.round(v)));

/** Config level (63 = loud) to the chip's total level register value (0 = loud). */
export function levelToTotalLevel(level: number): number {
  return OPL_MAX_LEVEL - clampLevel(level);
}

/** The chip's total level register value (0 = loud) to a config level (63 = loud). Its own inverse. */
export function totalLevelToLevel(totalLevel: number): number {
  return OPL_MAX_LEVEL - clampLevel(totalLevel);
}

/**
 * The gain the WASM bridge puts between the chip's int16 output and the float stream (kOutputGainDb in
 * juce-wasm/opl3/opl3_bridge.cpp: keep the two equal; opl3CurveModels.test.ts measures the rendered amplitude against the
 * chip model plus this gain, so a mismatch fails there). 11 dB lifts a held note from -18 to about -7 dBFS, next to the
 * CZ-101's -6.5.
 */
export const OPL_OUTPUT_GAIN_DB = 11;
