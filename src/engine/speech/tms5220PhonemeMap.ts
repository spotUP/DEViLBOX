/**
 * Maps SAM phoneme codes to TMS5220 LPC parameter frames.
 *
 * Each phoneme maps to K1-K10 coefficient indices, energy index, pitch index,
 * and voiced/unvoiced flag. These are fed to the existing setFormants()/setParameter()
 * methods on TMS5220Synth.
 *
 * K coefficient index ranges:
 * - K1: 0-31 (5-bit, controls F1 frequency)
 * - K2: 0-31 (5-bit, controls F2 frequency)
 * - K3: 0-15 (4-bit)
 * - K4-K7: 0-15 (4-bit each)
 * - K8-K10: 0-7 (3-bit each)
 *
 * Vowel presets expanded from the 8 in TMS5220Synth.cpp.
 * Consonant K-coefficients derived from IPA acoustic characteristics.
 */
export interface TMS5220Frame {
  k: number[];       // K1-K10 indices [10 values]
  energy: number;    // Energy index 0-15
  pitch: number;     // Pitch index 0-63 (0=unvoiced)
  unvoiced: boolean; // true = noise excitation
  durationMs: number;
}

/**
 * Map a SAM phoneme code to TMS5220 LPC parameters.
 * Returns null for unknown phonemes.
 */
export function samToTMS5220(samCode: string): TMS5220Frame | null {
  const map: Record<string, TMS5220Frame> = {
    // === Vowels (voiced, from existing presets and expanded) ===
    //                            K1  K2  K3  K4  K5  K6  K7  K8  K9  K10
    'IY': { k: [12, 28, 10,  8,  8,  8,  8,  4,  4,  4], energy: 10, pitch: 32, unvoiced: false, durationMs: 100 },
    'IH': { k: [16, 24,  9,  8,  8,  8,  8,  4,  4,  4], energy: 10, pitch: 30, unvoiced: false, durationMs: 80 },
    'EH': { k: [20, 22, 10,  8,  8,  8,  8,  4,  4,  4], energy: 10, pitch: 30, unvoiced: false, durationMs: 80 },
    'AE': { k: [24, 18, 10,  8,  8,  8,  8,  4,  4,  4], energy: 10, pitch: 30, unvoiced: false, durationMs: 90 },
    'AA': { k: [22, 12,  8,  8,  8,  8,  8,  4,  4,  4], energy: 10, pitch: 30, unvoiced: false, durationMs: 100 },
    'AH': { k: [20, 10,  8,  8,  8,  8,  8,  4,  4,  4], energy: 10, pitch: 30, unvoiced: false, durationMs: 80 },
    'AO': { k: [18,  8,  8,  8,  8,  8,  8,  4,  4,  4], energy: 10, pitch: 28, unvoiced: false, durationMs: 100 },
    'UH': { k: [18, 14,  8,  8,  8,  8,  8,  4,  4,  4], energy: 10, pitch: 28, unvoiced: false, durationMs: 80 },
    'AX': { k: [18, 14,  8,  8,  8,  8,  8,  4,  4,  4], energy:  8, pitch: 28, unvoiced: false, durationMs: 60 },
    'IX': { k: [14, 22,  9,  8,  8,  8,  8,  4,  4,  4], energy:  8, pitch: 30, unvoiced: false, durationMs: 60 },
    'ER': { k: [18, 16,  9,  8,  8,  8,  8,  4,  4,  4], energy: 10, pitch: 30, unvoiced: false, durationMs: 100 },
    'UX': { k: [14,  6,  7,  8,  8,  8,  8,  4,  4,  4], energy: 10, pitch: 26, unvoiced: false, durationMs: 80 },
    'OH': { k: [18,  8,  8,  8,  8,  8,  8,  4,  4,  4], energy: 10, pitch: 28, unvoiced: false, durationMs: 100 },

    // === Diphthongs (use starting vowel position, let sequencer handle transition) ===
    'EY': { k: [20, 22, 10,  8,  8,  8,  8,  4,  4,  4], energy: 10, pitch: 30, unvoiced: false, durationMs: 130 },
    'AY': { k: [22, 12,  8,  8,  8,  8,  8,  4,  4,  4], energy: 10, pitch: 30, unvoiced: false, durationMs: 140 },
    'OY': { k: [18,  8,  8,  8,  8,  8,  8,  4,  4,  4], energy: 10, pitch: 28, unvoiced: false, durationMs: 140 },
    'AW': { k: [22, 12,  8,  8,  8,  8,  8,  4,  4,  4], energy: 10, pitch: 30, unvoiced: false, durationMs: 130 },
    'OW': { k: [18,  8,  8,  8,  8,  8,  8,  4,  4,  4], energy: 10, pitch: 28, unvoiced: false, durationMs: 130 },
    'UW': { k: [14,  6,  7,  8,  8,  8,  8,  4,  4,  4], energy: 10, pitch: 26, unvoiced: false, durationMs: 100 },

    // === Glides / Liquids (voiced, transitional) ===
    'R*': { k: [16, 16,  9,  8,  8,  8,  8,  4,  4,  4], energy:  8, pitch: 28, unvoiced: false, durationMs: 70 },
    'RX': { k: [16, 16,  9,  8,  8,  8,  8,  4,  4,  4], energy:  8, pitch: 28, unvoiced: false, durationMs: 70 },
    'L*': { k: [16, 20,  8,  8,  8,  8,  8,  4,  4,  4], energy:  8, pitch: 28, unvoiced: false, durationMs: 70 },
    'LX': { k: [16, 20,  8,  8,  8,  8,  8,  4,  4,  4], energy:  8, pitch: 28, unvoiced: false, durationMs: 70 },
    'W*': { k: [14,  6,  7,  8,  8,  8,  8,  4,  4,  4], energy:  7, pitch: 26, unvoiced: false, durationMs: 60 },
    'WX': { k: [14,  6,  7,  8,  8,  8,  8,  4,  4,  4], energy:  7, pitch: 26, unvoiced: false, durationMs: 60 },
    'WH': { k: [14,  6,  7,  8,  8,  8,  8,  4,  4,  4], energy:  5, pitch:  0, unvoiced: true,  durationMs: 60 },
    'Y*': { k: [12, 28, 10,  8,  8,  8,  8,  4,  4,  4], energy:  7, pitch: 30, unvoiced: false, durationMs: 60 },
    'YX': { k: [12, 28, 10,  8,  8,  8,  8,  4,  4,  4], energy:  7, pitch: 30, unvoiced: false, durationMs: 60 },

    // === Nasals (voiced, low energy, nasal resonance) ===
    'M*': { k: [20, 10,  8, 12,  8,  8,  8,  4,  4,  4], energy:  7, pitch: 28, unvoiced: false, durationMs: 80 },
    'N*': { k: [18, 18,  8, 12,  8,  8,  8,  4,  4,  4], energy:  7, pitch: 28, unvoiced: false, durationMs: 70 },
    'NX': { k: [16, 12,  8, 12,  8,  8,  8,  4,  4,  4], energy:  7, pitch: 28, unvoiced: false, durationMs: 80 },

    // === Fricatives (mostly unvoiced, noise excitation) ===
    'S*': { k: [16, 24, 12, 10,  8,  8,  8,  4,  4,  4], energy:  6, pitch:  0, unvoiced: true,  durationMs: 90 },
    'SH': { k: [16, 20, 12, 10,  8,  8,  8,  4,  4,  4], energy:  8, pitch:  0, unvoiced: true,  durationMs: 90 },
    'F*': { k: [14, 18, 10,  8,  8,  8,  8,  4,  4,  4], energy:  5, pitch:  0, unvoiced: true,  durationMs: 80 },
    'TH': { k: [14, 22, 10,  8,  8,  8,  8,  4,  4,  4], energy:  4, pitch:  0, unvoiced: true,  durationMs: 80 },
    '/H': { k: [18, 14,  8,  8,  8,  8,  8,  4,  4,  4], energy:  4, pitch:  0, unvoiced: true,  durationMs: 60 },
    '/X': { k: [18, 14,  8,  8,  8,  8,  8,  4,  4,  4], energy:  4, pitch:  0, unvoiced: true,  durationMs: 60 },
    'Z*': { k: [16, 24, 12, 10,  8,  8,  8,  4,  4,  4], energy:  7, pitch: 28, unvoiced: false, durationMs: 90 },
    'ZH': { k: [16, 20, 12, 10,  8,  8,  8,  4,  4,  4], energy:  7, pitch: 28, unvoiced: false, durationMs: 80 },
    'V*': { k: [14, 18, 10,  8,  8,  8,  8,  4,  4,  4], energy:  7, pitch: 28, unvoiced: false, durationMs: 70 },
    'DH': { k: [14, 22, 10,  8,  8,  8,  8,  4,  4,  4], energy:  6, pitch: 28, unvoiced: false, durationMs: 60 },

    // === Affricates ===
    'CH': { k: [16, 22, 12, 10,  8,  8,  8,  4,  4,  4], energy:  6, pitch:  0, unvoiced: true,  durationMs: 80 },
    'J*': { k: [16, 22, 12, 10,  8,  8,  8,  4,  4,  4], energy:  7, pitch: 28, unvoiced: false, durationMs: 80 },

    // === Stops (brief burst then silence) ===
    'B*': { k: [20, 10,  8,  8,  8,  8,  8,  4,  4,  4], energy:  5, pitch: 28, unvoiced: false, durationMs: 40 },
    'D*': { k: [18, 20,  8,  8,  8,  8,  8,  4,  4,  4], energy:  5, pitch: 28, unvoiced: false, durationMs: 40 },
    'G*': { k: [16, 14,  8,  8,  8,  8,  8,  4,  4,  4], energy:  5, pitch: 28, unvoiced: false, durationMs: 40 },
    'GX': { k: [16, 14,  8,  8,  8,  8,  8,  4,  4,  4], energy:  5, pitch: 28, unvoiced: false, durationMs: 40 },
    'P*': { k: [20, 10,  8,  8,  8,  8,  8,  4,  4,  4], energy:  4, pitch:  0, unvoiced: true,  durationMs: 40 },
    'T*': { k: [18, 20,  8,  8,  8,  8,  8,  4,  4,  4], energy:  4, pitch:  0, unvoiced: true,  durationMs: 40 },
    'K*': { k: [16, 14,  8,  8,  8,  8,  8,  4,  4,  4], energy:  4, pitch:  0, unvoiced: true,  durationMs: 40 },
    'KX': { k: [16, 14,  8,  8,  8,  8,  8,  4,  4,  4], energy:  4, pitch:  0, unvoiced: true,  durationMs: 40 },

    // === Other ===
    'DX': { k: [18, 20,  8,  8,  8,  8,  8,  4,  4,  4], energy:  5, pitch: 28, unvoiced: false, durationMs: 30 },
    'Q*': { k: [ 8,  8,  8,  8,  8,  8,  8,  4,  4,  4], energy:  0, pitch:  0, unvoiced: false, durationMs: 10 },

    // === Pause ===
    ' ':  { k: [ 8,  8,  8,  8,  8,  8,  8,  4,  4,  4], energy:  0, pitch:  0, unvoiced: false, durationMs: 80 },
  };

  return map[samCode] ?? null;
}

/**
 * Convert SAM PhonemeTokens to TMS5220 frames.
 */
export function phonemesToTMS5220Frames(
  tokens: Array<{ code: string; stress: number }>
): TMS5220Frame[] {
  const frames: TMS5220Frame[] = [];
  for (const token of tokens) {
    const frame = samToTMS5220(token.code);
    if (frame) {
      // Boost energy for stressed phonemes
      const energyBoost = token.stress >= 4 ? 2 : 0;
      frames.push({
        ...frame,
        energy: Math.min(14, frame.energy + energyBoost),
      });
    }
  }
  return frames;
}
