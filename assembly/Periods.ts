/**
 * Periods - High-speed pitch and period calculations for DEViLBOX
 */

// Constants for Amiga/Tracker math
const AMIGA_CLOCK: f64 = 3546895.0; // PAL
const SEMITONE_RATIO: f64 = 1.059463094359; // 2^(1/12)

/**
 * Convert Amiga Period to Frequency (Hz)
 */
export function periodToHz(period: f32): f32 {
  if (period <= 0) return 0;
  return f32(AMIGA_CLOCK / (<f64>period * 2.0));
}

/**
 * Convert Hz to Amiga Period
 */
export function hzToPeriod(hz: f32): f32 {
  if (hz <= 0) return 65535;
  return f32(AMIGA_CLOCK / (<f64>hz * 2.0));
}

/**
 * Calculate linear slide (XM/IT style)
 * @param startPeriod Current period
 * @param cents Amount to slide in cents
 */
export function calculateLinearSlide(startPeriod: f32, cents: f32): f32 {
  // period = start * 2^(-cents/1200)
  return f32(<f64>startPeriod * Math.pow(2.0, -<f64>cents / 1200.0));
}

/**
 * Fast MIDI to Hz conversion
 */
export function midiToHz(note: i32): f32 {
  // 440 * 2^((note-69)/12)
  return f32(440.0 * Math.pow(2.0, (<f64>note - 69.0) / 12.0));
}
