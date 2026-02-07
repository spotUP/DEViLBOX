/**
 * MAME Pitch Utilities
 *
 * Chip-specific pitch calculations for different MAME synth types.
 * Handles frequency-to-register conversions for various chip architectures.
 */

/**
 * Standard MIDI note to frequency conversion
 */
export function midiToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

/**
 * Frequency to MIDI note conversion
 */
export function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

/**
 * Note name to MIDI note number
 */
export function noteNameToMidi(note: string): number {
  const noteMap: Record<string, number> = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8,
    'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
  };

  // Parse note format: "C-4", "C#5", "Db3", etc.
  const match = note.match(/^([A-Ga-g][#b]?)[-]?(\d)$/);
  if (!match) return 60;  // Default to middle C

  const noteName = match[1].toUpperCase();
  const octave = parseInt(match[2]);
  const noteNum = noteMap[noteName];

  if (noteNum === undefined) return 60;

  return (octave + 1) * 12 + noteNum;
}

/**
 * Apply linear pitch offset (in frequency units) to a frequency
 */
export function applyPitchOffset(freq: number, offset: number): number {
  // Convert linear offset to frequency multiplier
  // Scale: 64 units = 1 semitone
  const semitones = offset / 64;
  return freq * Math.pow(2, semitones / 12);
}

/**
 * Apply cents offset to a frequency
 */
export function applyCentsOffset(freq: number, cents: number): number {
  return freq * Math.pow(2, cents / 1200);
}

/**
 * Calculate period value for Amiga/MOD-style period systems
 * Used by some older chips and tracker formats
 */
export function freqToAmigaPeriod(freq: number, clockRate: number = 7159090.5): number {
  if (freq <= 0) return 0;
  return Math.round(clockRate / (freq * 2));
}

/**
 * Convert Amiga period to frequency
 */
export function amigaPeriodToFreq(period: number, clockRate: number = 7159090.5): number {
  if (period <= 0) return 0;
  return clockRate / (period * 2);
}

// ============================================================================
// Chip-specific pitch calculations
// ============================================================================

/**
 * SCSP/AICA - Sega Saturn/Dreamcast
 *
 * OCT (3 bits) + FNS (10 bits)
 * Frequency = (FNS / 1024 + 1) * 2^(OCT-1) * base_rate
 */
export interface SCSPPitch {
  oct: number;   // -8 to 7
  fns: number;   // 0-1023
}

export function freqToSCSP(freq: number, sampleRate: number = 44100): SCSPPitch {
  // Calculate raw octave from frequency
  const baseFreq = sampleRate / 2;  // Nyquist
  const octRaw = Math.log2(freq / baseFreq);
  const oct = Math.floor(octRaw) + 1;

  // Calculate FNS
  const fns = Math.round(((freq / (baseFreq * Math.pow(2, oct - 1))) - 1) * 1024);

  return {
    oct: Math.max(-8, Math.min(7, oct)),
    fns: Math.max(0, Math.min(1023, fns)),
  };
}

/**
 * YMF271 (OPX) - Yamaha FM+PCM
 *
 * Block (3 bits) + Fnum (10 bits)
 * Similar to OPL but different multipliers
 */
export interface YMF271Pitch {
  block: number;  // 0-7
  fnum: number;   // 0-1023
}

export function freqToYMF271(freq: number, clockRate: number = 16384000): YMF271Pitch {
  // YMF271 formula: F = Fnum * clock / (1024 * 2^(20-block))
  // Solve for block first, then fnum

  let block = 0;
  let fnum = 0;

  // Find appropriate block
  for (block = 0; block < 8; block++) {
    fnum = Math.round((freq * 1024 * Math.pow(2, 20 - block)) / clockRate);
    if (fnum < 1024) break;
  }

  return {
    block: Math.min(7, block),
    fnum: Math.max(0, Math.min(1023, fnum)),
  };
}

/**
 * YMOPQ (YM3806) - Yamaha FM
 *
 * Similar to OPM but with different register layout
 */
export interface YMOPQPitch {
  kc: number;    // Key Code (note + octave)
  kf: number;    // Key Fraction (fine tune)
}

export function freqToYMOPQ(freq: number): YMOPQPitch {
  const midi = freqToMidi(freq);
  const note = Math.floor(midi);
  const frac = midi - note;

  // KC = note number (0-127 range, similar to MIDI)
  const kc = Math.max(0, Math.min(127, note));

  // KF = fraction (0-63)
  const kf = Math.round(frac * 64);

  return { kc, kf: Math.max(0, Math.min(63, kf)) };
}

/**
 * C352 - Namco arcade PCM
 *
 * 16-bit frequency register (linear)
 * Actual rate = register_value * base_rate / 65536
 */
export function freqToC352(freq: number, sampleRate: number = 44100): number {
  const baseRate = sampleRate;
  const regValue = Math.round((freq / baseRate) * 65536);
  return Math.max(0, Math.min(65535, regValue));
}

/**
 * ES5503 (DOC) - Ensoniq wavetable
 *
 * 17-bit accumulator rate
 * Frequency = acc_rate * osc_clock / 2^17
 */
export function freqToES5503(freq: number, oscClock: number = 894886): number {
  const accRate = Math.round((freq * Math.pow(2, 17)) / oscClock);
  return Math.max(0, Math.min(131071, accRate));  // 17-bit max
}

/**
 * K054539 - Konami arcade PCM
 *
 * 16-bit playback rate
 */
export function freqToK054539(freq: number, basePitch: number = 261.63): number {
  // Base pitch is typically C4 = 261.63 Hz
  const ratio = freq / basePitch;
  const regValue = Math.round(ratio * 0x1000);  // 12-bit base
  return Math.max(0, Math.min(0xFFFF, regValue));
}

/**
 * ICS2115 (WaveFront) - PCM
 *
 * 32-bit frequency control
 */
export function freqToICS2115(freq: number, sampleRate: number = 33075): number {
  const ratio = freq / sampleRate;
  return Math.round(ratio * 0x10000);  // 16.16 fixed point
}

/**
 * RF5C400 - Ricoh PCM
 *
 * 16-bit delta value
 */
export function freqToRF5C400(freq: number, sampleRate: number = 44100): number {
  const delta = Math.round((freq / sampleRate) * 65536);
  return Math.max(0, Math.min(65535, delta));
}

/**
 * SN76477 - TI Complex Sound Generator
 *
 * VCO frequency is controlled by external RC values
 * This returns a normalized 0-1 control value
 */
export function freqToSN76477VCO(freq: number, minFreq: number = 20, maxFreq: number = 5000): number {
  // Logarithmic mapping
  const logMin = Math.log2(minFreq);
  const logMax = Math.log2(maxFreq);
  const logFreq = Math.log2(Math.max(minFreq, Math.min(maxFreq, freq)));
  return (logFreq - logMin) / (logMax - logMin);
}

/**
 * TMS36XX - TI Electronic Organ
 *
 * Divider-based pitch, returns divider value
 */
export function freqToTMS36XX(freq: number, clockRate: number = 372000): number {
  if (freq <= 0) return 0;
  return Math.round(clockRate / (freq * 16));
}

/**
 * Astrocade - Bally custom sound
 *
 * 8-bit frequency register (inverted - higher = lower freq)
 */
export function freqToAstrocade(freq: number, clockRate: number = 1789772.5): number {
  if (freq <= 0) return 0;
  const period = Math.round(clockRate / (freq * 4));
  return Math.max(0, Math.min(255, period));
}

/**
 * UPD933 - NEC CZ-style Phase Distortion
 *
 * 16-bit frequency with detune
 */
export function freqToUPD933(freq: number, baseClock: number = 10000000): number {
  // Phase accumulator rate
  const rate = Math.round((freq / baseClock) * 65536 * 256);
  return Math.max(0, Math.min(0xFFFFFF, rate));  // 24-bit
}

/**
 * CEM3394 - Curtis analog voice
 *
 * VCO control voltage (0-5V mapped to 0-1)
 * 1V/octave scaling
 */
export function freqToCEM3394(freq: number, baseFreq: number = 32.7): number {
  // Calculate octaves above base frequency
  const octaves = Math.log2(freq / baseFreq);
  // Map to 0-1 range (typically 0-5 octaves)
  return Math.max(0, Math.min(1, octaves / 5));
}

/**
 * VASynth - Virtual Analog
 *
 * Direct frequency value (floating point)
 */
export function freqToVASynth(freq: number): number {
  return Math.max(20, Math.min(20000, freq));
}

/**
 * Generic 16-bit linear frequency
 *
 * Used by many simpler PCM chips
 */
export function freqToLinear16(freq: number, maxFreq: number = 22050): number {
  const ratio = freq / maxFreq;
  return Math.round(Math.max(0, Math.min(1, ratio)) * 65535);
}

/**
 * Generic 12-bit linear frequency
 */
export function freqToLinear12(freq: number, maxFreq: number = 22050): number {
  const ratio = freq / maxFreq;
  return Math.round(Math.max(0, Math.min(1, ratio)) * 4095);
}

// ============================================================================
// Velocity scaling
// ============================================================================

/**
 * Convert MIDI velocity (0-127) to FM Total Level attenuation
 *
 * TL = 0 is max volume, TL = 127 is silence
 * Velocity 127 = TL 0, Velocity 0 = TL 127
 */
export function velocityToTL(velocity: number, baseTL: number = 0): number {
  const velScale = 1 - (velocity / 127);
  const tlOffset = Math.round(velScale * 32);  // Max 32 TL units from velocity
  return Math.min(127, baseTL + tlOffset);
}

/**
 * Convert MIDI velocity (0-127) to linear volume (0-1)
 */
export function velocityToLinear(velocity: number): number {
  return velocity / 127;
}

/**
 * Convert MIDI velocity (0-127) to logarithmic volume (0-1)
 * Better matches human perception
 */
export function velocityToLog(velocity: number): number {
  if (velocity === 0) return 0;
  // Use a curve that's more perceptually linear
  const normalized = velocity / 127;
  return Math.pow(normalized, 2);  // Square curve
}

/**
 * Convert MIDI velocity (0-127) to dB attenuation
 */
export function velocityToDb(velocity: number, maxDb: number = 0, minDb: number = -60): number {
  if (velocity === 0) return minDb;
  const normalized = velocity / 127;
  return minDb + (maxDb - minDb) * normalized;
}

// ============================================================================
// Panning conversions
// ============================================================================

/**
 * Convert XM panning (0-255) to stereo coefficients
 */
export function panToStereo(pan: number): { left: number; right: number } {
  const normalized = (pan - 128) / 128;  // -1 to 1
  return {
    left: Math.cos((normalized + 1) * Math.PI / 4),
    right: Math.sin((normalized + 1) * Math.PI / 4),
  };
}

/**
 * Convert MIDI pan (0-127) to XM panning (0-255)
 */
export function midiPanToXM(midiPan: number): number {
  return Math.round((midiPan / 127) * 255);
}

/**
 * Convert XM panning to 4-bit (0-15) for chips with limited panning
 */
export function xmPanTo4bit(xmPan: number): number {
  return Math.round((xmPan / 255) * 15);
}
